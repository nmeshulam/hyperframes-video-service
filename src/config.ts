import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Look for .env in current directory or parent directory
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../New-video-generator/.env'),
  path.resolve(process.cwd(), '.env.staging')
];

// Load base env from New-video-generator first, then override with hyperframes-video-service/.env
const baseEnv = path.resolve(process.cwd(), '../New-video-generator/.env');
if (fs.existsSync(baseEnv)) {
  dotenv.config({ path: baseEnv });
}
const localEnv = path.resolve(process.cwd(), '.env');
if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv, override: true });
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || 'musictovideo-prod',
  appBucketConfig: JSON.parse(process.env.APP_BUCKET_CONFIG || '{"default": {"bucket": "lyricvue_prod_free"}}'),
  defaultOutputBucket: process.env.DEFAULT_OUTPUT_BUCKET || 'lyricvue_prod_free',
  defaultTranscriptionsBucket: process.env.TRANSCRIPTIONS_BUCKET_NAME || 'lyricvue_prod_free',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  elevenLabsModel: process.env.ELEVENLABS_STT_MODEL || 'scribe_v2',
  anthropicApiKey: process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterStoryModel: process.env.OPENROUTER_STORY_MODEL || 'google/gemini-2.5-flash-lite',
  openrouterImageModel: (() => {
    const m = process.env.OPENROUTER_IMAGE_MODEL || '';
    if (!m || m.includes('gpt-image')) {
      return 'google/gemini-3.1-flash-lite-image';
    }
    return m;
  })(),
  workerCount: parseInt(process.env.HYPERFRAMES_WORKER_COUNT || '3', 10),
  tempDir: process.env.TEMP_DIR || '/tmp/hyperframes-jobs',
  cacheDir: process.env.CACHE_DIR || '/app/cache'
};
