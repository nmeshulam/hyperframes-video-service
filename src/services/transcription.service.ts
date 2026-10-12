import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { config } from "../config.js";
import { FullTranscript, TranscriptWord } from "../types.js";

export class TranscriptionService {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = config.elevenLabsApiKey;
    this.model = config.elevenLabsModel || "scribe_v2";
  }

  public async transcribeAudio(localAudioPath: string, languageCode?: string): Promise<FullTranscript> {
    if (!this.apiKey) {
      throw new Error("[TranscriptionService] ELEVENLABS_API_KEY is not configured in .env.");
    }

    if (!fs.existsSync(localAudioPath)) {
      throw new Error(`[TranscriptionService] Local audio file not found: ${localAudioPath}`);
    }

    console.log(`[TranscriptionService] Starting ElevenLabs STT for ${localAudioPath} (model: ${this.model})...`);

    const form = new FormData();
    form.append("file", fs.createReadStream(localAudioPath));
    form.append("model_id", this.model);

    if (languageCode && languageCode.toLowerCase() !== "en-us") {
      const lang = languageCode.toLowerCase().includes("en") ? "eng" : languageCode.slice(0, 2).toLowerCase();
      form.append("language_code", lang);
    }

    const response = await axios.post("https://api.elevenlabs.io/v1/speech-to-text", form, {
      headers: {
        "xi-api-key": this.apiKey,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 180000 // 3 min timeout for music tracks
    });

    const transcription = response.data;
    let rawWords = transcription.words || [];

    if (!rawWords || rawWords.length === 0) {
      for (const seg of (transcription.segments || [])) {
        if (seg.words) {
          rawWords.push(...seg.words);
        }
      }
    }

    const words: TranscriptWord[] = [];

    for (const w of rawWords) {
      if (w.type && w.type !== "word") continue;
      const text = (w.text || w.word || "").trim();
      if (!text) continue;

      const start = parseFloat(String(w.start_time ?? w.start ?? 0));
      const end = parseFloat(String(w.end_time ?? w.end ?? 0));

      words.push({
        id: "",
        word: text,
        text: text,
        start,
        end
      });
    }

    // Sort chronologically
    words.sort((a, b) => a.start - b.start);

    // Enforce non-overlapping boundaries (mirroring python_transcription_service.py)
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].end > words[i + 1].start) {
        words[i].end = words[i + 1].start;
      }
    }

    // Assign sequential IDs
    words.forEach((w, idx) => {
      w.id = `w${idx}`;
    });

    const detectedLang = transcription.language_code || languageCode || "eng";
    console.log(`[TranscriptionService] ElevenLabs STT complete: ${words.length} words identified (lang: ${detectedLang}).`);

    return {
      text: transcription.text || words.map(w => w.word).join(" "),
      words,
      language_code: detectedLang,
      duration: words.length > 0 ? words[words.length - 1].end : 0
    };
  }
}

export const transcriptionService = new TranscriptionService();
