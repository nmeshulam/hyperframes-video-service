export interface VideoJobPayload {
  job_id: string;
  audio_url?: string;
  input_gcs_uri?: string;
  input_path?: string;
  existing_transcription_path?: string;
  transcriptions_bucket?: string;
  output_bucket?: string;
  output_path?: string;
  preset?: string; // 'auto' | 'kinetic' | 'kinetic_aggressive' | 'drop_squash' etc.
  backend_url?: string;
  app_id: string;
  aspect_ratio?: string; // default "16:9"
  track_name?: string;
  artist_name?: string;
  user_images?: string[];
  style?: string; // e.g. "kinetic"
}

export interface TranscriptWord {
  id: string;
  word: string;
  text?: string;
  start: number; // in seconds
  end: number;   // in seconds
  confidence?: number;
}

export interface FullTranscript {
  words: TranscriptWord[];
  text?: string;
  fullText?: string;
  duration?: number;
  language_code?: string;
}

export interface ProgressPayload {
  progress: number;
  step: string;
  status: 'processing' | 'completed' | 'failed';
  has_transcription?: boolean;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface JobCompletePayload {
  success: boolean;
  assets?: Record<string, any>;
  error?: string;
  errors?: any[];
}
