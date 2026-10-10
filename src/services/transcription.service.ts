import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config.js';
import { FullTranscript, TranscriptWord } from '../types.js';

export class TranscriptionService {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = config.elevenLabsApiKey;
    this.model = config.elevenLabsModel || 'scribe_v2';
  }

  public async transcribeAudio(localAudioPath: string, languageCode?: string): Promise<FullTranscript> {
    if (!this.apiKey) {
      throw new Error('[TranscriptionService] ELEVENLABS_API_KEY is not configured.');
    }

    if (!fs.existsSync(localAudioPath)) {
      throw new Error(`[TranscriptionService] Local audio file not found: ${localAudioPath}`);
    }

    console.log(`[TranscriptionService] Sending audio to ElevenLabs STT (${this.model})...`);

    const form = new FormData();
    form.append('file', fs.createReadStream(localAudioPath));
    form.append('model_id', this.model);
    if (languageCode) {
      form.append('language_code', languageCode);
    }
    form.append('tag_audio_events', 'true');
    form.append('timestamps_granularity', 'word');

    const response = await axios.post('https://api.elevenlabs.io/v1/speech-to-text', form, {
      headers: {
        'xi-api-key': this.apiKey,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 180000 // 3 min timeout for longer songs
    });

    const data = response.data;
    const rawWords = data.words || [];

    const words: TranscriptWord[] = rawWords
      .filter((w: any) => w.type === 'word' || (!w.type && w.text))
      .map((w: any, idx: number) => ({
        id: `w${idx}`,
        word: (w.text || w.word || '').trim(),
        text: (w.text || w.word || '').trim(),
        start: typeof w.start === 'number' ? w.start : (w.start_time || 0),
        end: typeof w.end === 'number' ? w.end : (w.end_time || 0)
      }));

    console.log(`[TranscriptionService] ElevenLabs STT complete: ${words.length} words identified.`);

    return {
      text: data.text || '',
      words,
      language_code: data.language_code || languageCode || 'en'
    };
  }
}

export const transcriptionService = new TranscriptionService();
