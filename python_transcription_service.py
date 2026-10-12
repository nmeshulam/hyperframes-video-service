import os
import logging
import json
import time
import requests
from dataclasses import dataclass
from typing import List, Optional
try:
    import google.auth
    from google.auth.transport.requests import Request as AuthRequest
except ImportError:
    google = None
    AuthRequest = None

from src.circuit_breaker import circuit_breaker

logger = logging.getLogger(__name__)

@dataclass
class Word:
    text: str
    start_time: float # seconds
    end_time: float   # seconds

class TranscriptionService:
    def __init__(self):
        self.eleven_api_key = os.getenv("ELEVENLABS_API_KEY")
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.last_error = None
        self.eleven_model = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
        self.google_model = os.getenv("GOOGLE_SPEECH_MODEL", "chirp_3")
        
        if not self.project_id:
             logger.warning("GOOGLE_CLOUD_PROJECT env var not set. Google transcription might fail.")
        
        # We no longer initialize heavy SDK clients here. 
        # This makes container startup nearly instantaneous.
        logger.info("TranscriptionService initialized in Lightweight REST Mode.")

    def get_last_error(self):
        err = self.last_error
        self.last_error = None
        return err

    def _get_google_token(self):
        """Retrieves a fresh OAuth2 token using google-auth."""
        try:
            credentials, _ = google.auth.default(
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            auth_req = AuthRequest()
            credentials.refresh(auth_req)
            return credentials.token
        except Exception as e:
            logger.error(f"Failed to get Google Auth Token: {e}")
            return None

    def transcribe_audio(self, gcs_uri: str, language_code: str = None, job_id: str = None, service: str = "google", local_audio_path: str = None) -> tuple[List[Word], str, str]:
        google_model = self.google_model
        if service == "elevenlabs":
            if circuit_breaker.should_skip("transcript", "elevenlabs"):
                logger.warning("[Transcription] ElevenLabs circuit breaker is OPEN. Skipping ElevenLabs and falling back to Google Speech V2 directly (0s wasted).")
                self.last_error = {
                    "service": "transcript",
                    "provider": "elevenlabs",
                    "error_code": "CIRCUIT_OPEN",
                    "error_message": "ElevenLabs circuit breaker is OPEN due to repeated recent failures."
                }
                return self._transcribe_gcp(gcs_uri, language_code, model=google_model, job_id=job_id)

            success, words, raw_json, detected_lang = self._transcribe_elevenlabs(local_audio_path, language_code, job_id)
            if success:
                return words, raw_json, detected_lang
            else:
                logger.warning(f"[Transcription] ElevenLabs API failed. Falling back to Google Speech V2 ({google_model})...")
                return self._transcribe_gcp(gcs_uri, language_code, model=google_model, job_id=job_id)
        else:
            return self._transcribe_gcp(gcs_uri, language_code, model=google_model, job_id=job_id)

    def _transcribe_gcp(self, gcs_uri: str, language_code: str = "en-US", model: str = None, job_id: str = None) -> tuple[List[Word], str, str]:
        model = model or self.google_model
        if not self.project_id:
             logger.error("Project ID is required for Speech V2 REST.")
             return [], "", language_code

        logger.info(f"Starting REST-based transcription for {gcs_uri} using model {model}")
        try:
            return self._transcribe_batch_rest(gcs_uri, language_code, model, job_id)
        except Exception as e:
            logger.error(f"REST Transcription failed: {e}")
            return [], "", language_code

    def _get_or_create_recognizer_rest(self, token: str, location: str, model: str, language_code: str) -> str:
        # Sanitize model name for ID (no underscores allowed)
        safe_model = model.replace("_", "-")
        recognizer_id = f"video-gen-{safe_model}-{language_code.lower().replace('-', '')}"
        parent = f"projects/{self.project_id}/locations/{location}"
        recognizer_name = f"{parent}/recognizers/{recognizer_id}"
        
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        # Check if exists
        check_url = f"https://speech.googleapis.com/v2/{recognizer_name}"
        resp = requests.get(check_url, headers=headers)
        if resp.status_code == 200:
            return recognizer_name
            
        # Create new
        logger.info(f"Creating new recognizer via REST: {recognizer_id}")
        create_url = f"https://speech.googleapis.com/v2/{parent}/recognizers?recognizerId={recognizer_id}"
        payload = {
            "defaultRecognitionConfig": {
                "languageCodes": [language_code],
                "model": model,
                "features": {
                    "enableWordTimeOffsets": True,
                    "enableAutomaticPunctuation": True
                }
            }
        }
        resp = requests.post(create_url, headers=headers, json=payload)
        if resp.status_code == 200:
            # Operation returned, but for recognizers it's often small enough to wait or use directly
            data = resp.json()
            # If it returns an LRO, we should wait, but usually recognizers are fast
            if "name" in data and "recognizers" in data["name"]:
                return data["name"]
            # If it's an operation
            if "name" in data and "operations" in data["name"]:
                # Simple poll
                op_name = data["name"]
                for _ in range(10):
                    time.sleep(1)
                    op_resp = requests.get(f"https://speech.googleapis.com/v2/{op_name}", headers=headers).json()
                    if op_resp.get("done"):
                        return op_resp["response"]["name"]
        
        return recognizer_name

    def _transcribe_batch_rest(self, gcs_uri: str, language_code: str, model: str, job_id: str = None) -> tuple[List[Word], str, str]:
        import uuid
        token = self._get_google_token()
        if not token: return [], "", language_code
        
        location = "us"
        recognizer_name = self._get_or_create_recognizer_rest(token, location, model, language_code)
        
        # Parse GCS for output
        try:
            parts = gcs_uri.replace("gs://", "").split("/")
            bucket_name = parts[0]
            filename = parts[-1] 
            run_id = str(uuid.uuid4())[:8]
            temp_prefix = f"temp_transcripts/{run_id}/"
            temp_output_uri = f"gs://{bucket_name}/{temp_prefix}"
            
            base_name = job_id if job_id else os.path.splitext(filename)[0]
            final_dest_blob_name = f"transcripts/{base_name}.json"
        except:
            return [], "", language_code

        # Submit Batch Job
        url = f"https://speech.googleapis.com/v2/{recognizer_name}:batchRecognize"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {
            "config": {
                "languageCodes": [language_code],
                "model": model,
                "features": {
                    "enableWordTimeOffsets": True,
                    "enableAutomaticPunctuation": True
                }
            },
            "files": [{"uri": gcs_uri}],
            "recognitionOutputConfig": {
                "gcsOutputConfig": {"uri": temp_output_uri}
            }
        }
        
        resp = requests.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            logger.error(f"Batch Submit Failed: {resp.text}")
            return [], "", language_code
            
        operation = resp.json()
        op_name = operation["name"]
        logger.info(f"Batch job started. Operation: {op_name}")
        
        # Polling Loop
        max_retries = 60 # 5 minutes
        for i in range(max_retries):
            time.sleep(5)
            op_resp = requests.get(f"https://speech.googleapis.com/v2/{op_name}", headers=headers).json()
            if op_resp.get("done"):
                if "error" in op_resp:
                    logger.error(f"Transcription LRO error: {op_resp['error']}")
                    return [], "", language_code
                logger.info("Transcription LRO complete.")
                break
            if i % 10 == 0:
                logger.info(f"Polling transcription... ({i*5}s)")
        else:
            logger.error("Batch transcription timed out.")
            return [], "", language_code

        return self._fetch_results_from_gcs(bucket_name, temp_prefix, final_dest_blob_name)

    def _fetch_results_from_gcs(self, bucket_name: str, prefix: str, final_dest: str = None) -> tuple[List[Word], str, str]:
        # Still using storage SDK as it is lightweight and already in the project
        from google.cloud import storage
        logger.info(f"Fetching result from gs://{bucket_name}/{prefix}")
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blobs = list(bucket.list_blobs(prefix=prefix))
        
        words = []
        json_content = ""
        detected_lang = "en-US"
        
        for blob in blobs:
            if blob.name.endswith(".json"):
                try:
                    json_content = blob.download_as_text()
                    new_words, lang = self._parse_json_response(json_content)
                    words.extend(new_words)
                    if lang: detected_lang = lang
                except Exception as e:
                    logger.error(f"Error parsing JSON from {blob.name}: {e}")
                    
        if json_content and final_dest:
            try:
                bucket.blob(final_dest).upload_from_string(json_content)
                if blobs: bucket.delete_blobs(blobs)
            except Exception as e:
                logger.error(f"Cleanup failed: {e}")
                            
        return words, json_content, detected_lang

    def _parse_json_response(self, content: str) -> tuple[List[Word], str]:
        data = json.loads(content)
        words = []
        detected_lang = data.get("language_code")
        
        for result in data.get("results", []):
            if result.get("languageCode"):
                detected_lang = result.get("languageCode")
            
            for alt in result.get("alternatives", []):
                w_list = alt.get("words", [])
                for w in w_list:
                    text = w.get("word", "")
                    start_str = w.get("startOffset") or w.get("start_offset") or "0s"
                    end_str = w.get("endOffset") or w.get("end_offset") or "0s"
                    
                    def parse_time(ts):
                        if isinstance(ts, str): return float(ts.rstrip("s"))
                        return float(ts)
                    
                    words.append(Word(text, parse_time(start_str), parse_time(end_str)))
        return words, detected_lang

    def download_transcription(self, bucket_name: str, blob_path: str) -> tuple[List[Word], str, str]:
        from google.cloud import storage
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            content = blob.download_as_text()
            words, lang = self._parse_json_response(content)
            return words, content, lang
        except Exception as e:
            logger.error(f"Download failed: {e}")
            return [], "", "en-US"

    def _transcribe_elevenlabs(self, local_audio_path: str, language_code: str = None, job_id: str = None) -> tuple[bool, List[Word], str, str]:
        if not self.eleven_api_key:
            logger.error("ELEVENLABS_API_KEY missing.")
            self.last_error = {
                "service": "transcript",
                "provider": "elevenlabs",
                "error_code": "API_KEY_MISSING",
                "error_message": "ELEVENLABS_API_KEY environment variable not set."
            }
            return False, [], "", language_code or "eng"
            
        if not local_audio_path or not os.path.exists(local_audio_path):
             logger.error(f"Local audio path missing for ElevenLabs: {local_audio_path}")
             self.last_error = {
                 "service": "transcript",
                 "provider": "elevenlabs",
                 "error_code": "FILE_NOT_FOUND",
                 "error_message": f"Local audio path missing: {local_audio_path}"
             }
             return False, [], "", language_code or "eng"

        logger.info(f"Starting ElevenLabs REST transcription for {local_audio_path} (Requested Lang: {language_code})")
        try:
            url = "https://api.elevenlabs.io/v1/speech-to-text"
            headers = {"xi-api-key": self.eleven_api_key}
            
            with open(local_audio_path, "rb") as f:
                files = {"file": f}
                data = {"model_id": self.eleven_model}
                
                # Use provided language_code if it is not None or "en-US" (default/autodetect signal)
                if language_code and language_code.lower() != "en-us":
                    lang = "eng" if "en" in language_code.lower() else language_code[:2].lower()
                    data["language_code"] = lang
                
                resp = requests.post(url, headers=headers, files=files, data=data)
                
            if resp.status_code != 200:
                logger.error(f"ElevenLabs REST Failed: status={resp.status_code}, text={resp.text}")
                circuit_breaker.record_failure("transcript", "elevenlabs")
                self.last_error = {
                    "service": "transcript",
                    "provider": "elevenlabs",
                    "error_code": str(resp.status_code),
                    "error_message": f"ElevenLabs API returned {resp.status_code}: {resp.text[:300]}"
                }
                return False, [], "", language_code or "eng"
                
            transcription = resp.json()
            words = []
            
            # Extract detected language from response, or fallback to requested code, or safe "eng"
            detected_lang = transcription.get("language_code", language_code or "eng")
            raw_words = transcription.get("words", [])
            if not raw_words:
                for seg in transcription.get("segments", []):
                    raw_words.extend(seg.get("words", []))

            for w in raw_words:
                if w.get("type", "word") != "word": continue
                text = w.get("text", "").strip()
                if not text: continue
                start = float(w.get("start_time", w.get("start", 0)))
                end = float(w.get("end_time", w.get("end", 0)))
                words.append(Word(text=text, start_time=start, end_time=end))
                     
            words.sort(key=lambda x: x.start_time)
            
            # Enforce non-overlapping boundaries (libass fix)
            for i in range(len(words) - 1):
                if words[i].end_time > words[i+1].start_time:
                    words[i].end_time = words[i+1].start_time
            
            words_list = [{"word": w.text, "startOffset": f"{w.start_time}s", "endOffset": f"{w.end_time}s"} for w in words]
            mock_payload = {
                "results": [{"alternatives": [{"words": words_list}]}],
                "language_code": detected_lang
            }
            # Record success in circuit breaker
            circuit_breaker.record_success("transcript", "elevenlabs")
            # Return success = True because API call completed (even if 0 words for instrumental track)
            return True, words, json.dumps(mock_payload), detected_lang
             
        except Exception as e:
            logger.error(f"ElevenLabs REST Exception: {e}")
            circuit_breaker.record_failure("transcript", "elevenlabs")
            self.last_error = {
                "service": "transcript",
                "provider": "elevenlabs",
                "error_code": "500",
                "error_message": f"ElevenLabs REST exception: {str(e)}"
            }
            return False, [], "", language_code or "eng"
