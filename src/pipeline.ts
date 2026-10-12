import fs from 'fs';
import path from 'path';
import { VideoJobPayload, FullTranscript, TranscriptWord } from './types.js';
import { storageService } from './services/storage.service.js';
import { transcriptionService } from './services/transcription.service.js';
import { storyService, StoryPlan } from './services/story.service.js';
import { imageService, GeneratedSceneImage } from './services/image.service.js';
import { segmentationService } from './services/segmentation.service.js';
import { compositionService, SceneLayer } from './services/composition.service.js';
import { renderService } from './services/render.service.js';
import { notificationService } from './services/notification.service.js';
import { config } from './config.js';

/**
 * Normalizes transcripts from Google Speech-to-Text, ElevenLabs, Whisper, or raw JSON
 */
export function normalizeTranscript(raw: any): FullTranscript {
  // Google Speech-to-Text format
  if (raw && raw.results && Array.isArray(raw.results)) {
    const wordsRaw = raw.results[0]?.alternatives?.[0]?.words || [];
    const words: TranscriptWord[] = wordsRaw.map((w: any, idx: number) => ({
      id: `w${idx}`,
      word: w.word || '',
      start: typeof w.startOffset === 'string'
        ? parseFloat(w.startOffset.replace('s', ''))
        : Number(w.startOffset || w.start || 0),
      end: typeof w.endOffset === 'string'
        ? parseFloat(w.endOffset.replace('s', ''))
        : Number(w.endOffset || w.end || 0)
    }));

    const duration = words.length > 0 ? Math.ceil(words[words.length - 1].end + 2) : 50;
    return {
      words,
      fullText: words.map(w => w.word).join(' '),
      duration
    };
  }

  // ElevenLabs or Whisper standard word array format
  if (raw && Array.isArray(raw.words)) {
    const words: TranscriptWord[] = raw.words.map((w: any, idx: number) => ({
      id: w.id || `w${idx}`,
      word: w.word || w.text || '',
      start: Number(w.start || 0),
      end: Number(w.end || 0)
    }));

    const duration = Number(raw.duration || (words.length > 0 ? Math.ceil(words[words.length - 1].end + 2) : 50));
    return {
      words,
      fullText: raw.fullText || words.map(w => w.word).join(' '),
      duration
    };
  }

  return { words: [], fullText: '', duration: 50 };
}

export async function executeVideoPipeline(payload: VideoJobPayload): Promise<void> {
  const {
    job_id,
    audio_url,
    input_gcs_uri,
    input_path,
    existing_transcription_path,
    transcriptions_bucket,
    output_bucket,
    output_path,
    preset = 'auto',
    backend_url,
    app_id = 'default',
    aspect_ratio = '16:9',
    track_name = 'Cinematic Story'
  } = payload;

  const audioSource = audio_url || input_gcs_uri || input_path;
  if (!audioSource) {
    throw new Error(`[Pipeline] No audio source provided for job: ${job_id}`);
  }

  // Create isolated scratch job directory
  const jobDir = path.join(config.tempDir, job_id);
  const audioDir = path.join(jobDir, 'assets', 'audio');
  const imageDir = path.join(jobDir, 'assets', 'images');

  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });

  const audioExt = path.extname(audioSource).split('?')[0] || '.mp3';
  const localAudioFilename = `soundtrack${audioExt}`;
  const localAudioPath = path.join(audioDir, localAudioFilename);

  console.log(`[Pipeline] ===== Starting Pipeline for Job: ${job_id} =====`);
  console.log(`[Pipeline] Track: "${track_name}" | Aspect Ratio: ${aspect_ratio}`);

  try {
    // 1. Audio Download (5%)
    await notificationService.sendProgress(backend_url, job_id, 'fetching audio', 5, 'processing');
    console.log(`[Pipeline] Downloading/Resolving audio: ${audioSource}`);
    await storageService.downloadFile(audioSource, localAudioPath);

    // 2. Transcript Acquisition (20%)
    let transcript: FullTranscript;

    if (existing_transcription_path) {
      console.log(`[Pipeline] Using existing transcription: ${existing_transcription_path}`);
      const localTranscriptPath = storageService.resolveLocalPath(existing_transcription_path);
      let rawJson: any;

      if (localTranscriptPath) {
        rawJson = await storageService.downloadJson<any>(localTranscriptPath);
      } else {
        const tBucket = transcriptions_bucket || storageService.getBucketForApp(app_id);
        const transcriptUri = existing_transcription_path.startsWith('gs://')
          ? existing_transcription_path
          : `gs://${tBucket}/${existing_transcription_path}`;

        rawJson = await storageService.downloadJson<any>(transcriptUri);
      }

      transcript = normalizeTranscript(rawJson);
      console.log(`[Pipeline] Transcript loaded successfully: ${transcript.words.length} words detected (${transcript.duration}s duration).`);

      await notificationService.sendProgress(backend_url, job_id, 'transcription loaded', 20, 'processing', {
        has_transcription: true
      });
    } else {
      console.log(`[Pipeline] Transcribing audio via ElevenLabs...`);
      await notificationService.sendProgress(backend_url, job_id, 'transcribing audio with ElevenLabs', 10, 'processing');

      transcript = await transcriptionService.transcribeAudio(localAudioPath);

      const tBucket = transcriptions_bucket || storageService.getBucketForApp(app_id);
      const destinationBlob = `transcripts/${job_id}.json`;
      console.log(`[Pipeline] Uploading new transcript to gs://${tBucket}/${destinationBlob}`);
      await storageService.uploadJson(transcript, destinationBlob, tBucket);

      await notificationService.sendProgress(backend_url, job_id, 'transcription complete', 25, 'processing', {
        has_transcription: true,
        data: { has_transcription: true, transcript_path: destinationBlob }
      });
    }

    // --- Fast Iteration / Testing Cache Logic ---
    const songKey = (track_name || path.basename(audioSource, audioExt))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const songCacheDir = path.join(config.cacheDir, 'songs', songKey);
    fs.mkdirSync(songCacheDir, { recursive: true });

    const hasCachedLayers =
      fs.existsSync(path.join(songCacheDir, 'scene1_fg.png')) &&
      fs.existsSync(path.join(songCacheDir, 'scene1_bg.jpg')) &&
      fs.existsSync(path.join(songCacheDir, 'scene2_fg.png')) &&
      fs.existsSync(path.join(songCacheDir, 'scene2_bg.jpg')) &&
      fs.existsSync(path.join(songCacheDir, 'scene3_fg.png')) &&
      fs.existsSync(path.join(songCacheDir, 'scene3_bg.jpg'));

    const shouldReuseImages = payload.reuse_existing_images !== false &&
      (payload.reuse_existing_images === true || process.env.CACHE_STORY_IMAGES === 'true' || hasCachedLayers);

    let storyPlan: StoryPlan;
    const scenes: SceneLayer[] = [];

    if (shouldReuseImages && hasCachedLayers) {
      console.log(`\n======================================================`);
      console.log(`⚡ [Pipeline] TESTING MODE: REUSING CACHED ASSETS FOR "${songKey}"`);
      console.log(`📁 Cache Directory: ${songCacheDir}`);
      console.log(`⏩ Skipped 3x Gemini image generations and Python rembg segmentation!`);
      console.log(`⏱ Saved ~30-40 seconds & $0 image generation API cost.`);
      console.log(`======================================================\n`);

      // 1. Copy cached images and layers to job directory
      for (let idx = 1; idx <= 3; idx++) {
        const cachedRaw = path.join(songCacheDir, `scene_${idx}.jpg`);
        if (fs.existsSync(cachedRaw)) {
          fs.copyFileSync(cachedRaw, path.join(imageDir, `scene_${idx}.jpg`));
        }
        fs.copyFileSync(path.join(songCacheDir, `scene${idx}_fg.png`), path.join(imageDir, `scene${idx}_fg.png`));
        fs.copyFileSync(path.join(songCacheDir, `scene${idx}_bg.jpg`), path.join(imageDir, `scene${idx}_bg.jpg`));
      }

      // 2. Load cached story plan or plan story
      const cachedStoryPlanPath = path.join(songCacheDir, 'story_plan.json');
      if (fs.existsSync(cachedStoryPlanPath)) {
        storyPlan = JSON.parse(fs.readFileSync(cachedStoryPlanPath, 'utf-8'));
        console.log(`[Pipeline] Reused cached story plan: ${storyPlan.scenes.length} scenes (style: ${storyPlan.artStyle})`);
      } else {
        storyPlan = await storyService.planStory(transcript, track_name, aspect_ratio);
        fs.writeFileSync(cachedStoryPlanPath, JSON.stringify(storyPlan, null, 2), 'utf-8');
      }

      // 3. Assemble scenes
      for (let idx = 1; idx <= 3; idx++) {
        const storyScene = storyPlan.scenes[idx - 1];
        scenes.push({
          bgPath: `assets/images/scene${idx}_bg.jpg`,
          fgPath: `assets/images/scene${idx}_fg.png`,
          startTime: storyScene?.startTime ?? (idx - 1) * 15,
          endTime: storyScene?.endTime ?? idx * 15,
          title: storyScene?.title ?? `Scene ${idx}`,
          colorTheme: storyScene?.colorTheme ?? 'cyan',
          wordIds: storyScene?.wordIds ?? []
        });
      }

      await notificationService.sendProgress(backend_url, job_id, 'reused cached scene images and layers', 55, 'processing');
    } else {
      // 3. Step 1: Story Planning with LLM (30%)
      await notificationService.sendProgress(backend_url, job_id, 'analyzing lyrics and planning 3-scene story', 30, 'processing');
      storyPlan = await storyService.planStory(transcript, track_name, aspect_ratio);
      fs.writeFileSync(path.join(songCacheDir, 'story_plan.json'), JSON.stringify(storyPlan, null, 2), 'utf-8');

      // 4. Step 2: Sequential Image Generation with Reference Linking (45%)
      await notificationService.sendProgress(backend_url, job_id, 'generating 3 consistent photorealistic scene images', 45, 'processing');
      const generatedImages: GeneratedSceneImage[] = await imageService.generateSceneImages(storyPlan, imageDir, aspect_ratio);

      // 5. Step 3: Layer Segmentation via AI Background Removal (55%)
      await notificationService.sendProgress(backend_url, job_id, 'separating foreground subjects and backgrounds', 55, 'processing');

      for (const img of generatedImages) {
        const idx = img.sceneIndex;
        const fgLocal = path.join(imageDir, `scene${idx}_fg.png`);
        const bgLocal = path.join(imageDir, `scene${idx}_bg.jpg`);

        await segmentationService.separateLayers(img.imagePath, fgLocal, bgLocal);

        // Copy to persistent cache for future test runs
        fs.copyFileSync(img.imagePath, path.join(songCacheDir, `scene_${idx}.jpg`));
        fs.copyFileSync(fgLocal, path.join(songCacheDir, `scene${idx}_fg.png`));
        fs.copyFileSync(bgLocal, path.join(songCacheDir, `scene${idx}_bg.jpg`));

        const storyScene = storyPlan.scenes[idx - 1];
        scenes.push({
          bgPath: `assets/images/scene${idx}_bg.jpg`,
          fgPath: `assets/images/scene${idx}_fg.png`,
          startTime: storyScene?.startTime ?? (idx - 1) * 15,
          endTime: storyScene?.endTime ?? idx * 15,
          title: storyScene?.title ?? `Scene ${idx}`,
          colorTheme: storyScene?.colorTheme ?? 'cyan',
          wordIds: storyScene?.wordIds ?? []
        });
      }
    }

    // 6. Step 4: Kinetic & Depth Composition Building (65%)
    await notificationService.sendProgress(backend_url, job_id, 'assembling dynamic kinetic typography composition', 65, 'processing');
    const compositionHtml = await compositionService.generateCompositionHtml(
      transcript,
      localAudioFilename,
      storyPlan,
      scenes,
      preset,
      track_name,
      aspect_ratio
    );

    fs.writeFileSync(path.join(jobDir, 'index.html'), compositionHtml, 'utf-8');

    const hyperframesConfig = {
      name: `job-${job_id}`,
      version: '0.8',
      main: 'index.html'
    };
    fs.writeFileSync(path.join(jobDir, 'hyperframes.json'), JSON.stringify(hyperframesConfig, null, 2), 'utf-8');

    // 7. Step 5: Render Video via HyperFrames with 3 Chrome Workers (70% -> 95%)
    await notificationService.sendProgress(backend_url, job_id, 'rendering frames with HyperFrames', 70, 'processing');
    const outputMp4Local = path.join(jobDir, `rendered_${job_id}.mp4`);
    let lastReportedPct = 70;

    await renderService.renderVideo({
      jobDir,
      outputMp4Path: outputMp4Local,
      workerCount: config.workerCount,
      onProgress: (renderPct) => {
        const overallPct = 70 + Math.round((renderPct / 100) * 25);
        if (overallPct > lastReportedPct + 3) {
          lastReportedPct = overallPct;
          notificationService.sendProgress(backend_url, job_id, `rendering video (${renderPct}%)`, overallPct, 'processing');
        }
      }
    });

    // Save persistent copy in renders directory
    const rendersDir = path.resolve(process.cwd(), 'renders');
    fs.mkdirSync(rendersDir, { recursive: true });
    const localSavedMp4 = path.join(rendersDir, `rendered_${job_id}.mp4`);
    fs.copyFileSync(outputMp4Local, localSavedMp4);
    console.log(`[Pipeline] Saved local copy to: ${localSavedMp4}`);

    // 8. Upload Rendered MP4 to GCS (97%)
    await notificationService.sendProgress(backend_url, job_id, 'uploading video to storage', 97, 'processing');
    const destBucket = output_bucket || storageService.getBucketForApp(app_id);
    const destBlob = output_path || `videos/${job_id}/${job_id}.mp4`;

    const uploadRes = await storageService.uploadFile(outputMp4Local, destBlob, destBucket, app_id);
    console.log(`[Pipeline] Video available at: ${uploadRes.gcsUri}`);

    // 9. Complete Callback (100%)
    const assets = {
      video_path: destBlob,
      video_gcs_uri: uploadRes.gcsUri,
      local_file: `renders/rendered_${job_id}.mp4`,
      download_url: `/renders/rendered_${job_id}.mp4`,
      bucket: uploadRes.bucket,
      track_name,
      aspect_ratio
    };

    await notificationService.sendProgress(backend_url, job_id, 'completed', 100, 'completed', { assets });
    await notificationService.sendComplete(backend_url, job_id, true, assets);

    console.log(`[Pipeline] ===== Job ${job_id} Completed Successfully! =====`);

  } catch (error: any) {
    console.error(`[Pipeline] Job ${job_id} FAILED:`, error);
    await notificationService.sendProgress(backend_url, job_id, `failed: ${error.message}`, 0, 'failed', { error: error.message });
    await notificationService.sendComplete(backend_url, job_id, false, undefined, error.message, [error.stack]);
    throw error;
  } finally {
    setTimeout(() => {
      try {
        if (fs.existsSync(jobDir)) {
          fs.rmSync(jobDir, { recursive: true, force: true });
          console.log(`[Pipeline] Cleaned up temporary directory: ${jobDir}`);
        }
      } catch (e) {
        console.warn(`[Pipeline] Cleanup error:`, e);
      }
    }, 15000);
  }
}
