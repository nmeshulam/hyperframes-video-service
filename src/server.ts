import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { VideoJobPayload } from './types.js';
import { executeVideoPipeline } from './pipeline.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const fastify = Fastify({
  logger: {
    level: 'info'
  }
});

await fastify.register(cors, {
  origin: '*'
});

// Health check endpoint for Cloud Run
fastify.get('/health', async () => {
  return {
    status: 'ok',
    service: 'hyperframes-video-service',
    timestamp: new Date().toISOString()
  };
});

// Serve rendered videos directly over HTTP for local testing & preview
fastify.get('/renders/:filename', async (request, reply) => {
  const { filename } = request.params as { filename: string };
  const safeFilename = path.basename(filename);
  const filePath = path.resolve(process.cwd(), 'renders', safeFilename);

  if (!fs.existsSync(filePath)) {
    reply.status(404);
    return { error: `Rendered file not found: ${safeFilename}` };
  }

  const stat = fs.statSync(filePath);
  reply.header('Content-Type', 'video/mp4');
  reply.header('Content-Length', stat.size);
  reply.header('Accept-Ranges', 'bytes');
  return reply.send(fs.createReadStream(filePath));
});

// Render video endpoint (Fastify microservice wrapper)
fastify.post('/render-video', async (request, reply) => {
  const body = request.body as any;

  const jobId = body.job_id || body.jobId || `hf-${randomUUID()}`;
  const audioSource = body.audioUrl || body.audio_url || body.input_gcs_uri || body.input_path;

  if (!audioSource) {
    reply.status(400);
    return {
      error: 'Missing required field: audioUrl, audio_url, input_gcs_uri, or input_path'
    };
  }

  const payload: VideoJobPayload = {
    job_id: jobId,
    audio_url: audioSource,
    input_gcs_uri: body.input_gcs_uri,
    input_path: body.input_path,
    existing_transcription_path: body.existing_transcription_path || body.existingTranscriptionPath,
    transcriptions_bucket: body.transcriptions_bucket || body.transcriptionsBucket,
    output_bucket: body.output_bucket || body.outputBucket,
    output_path: body.output_path || body.outputPath,
    preset: body.preset || body.style || 'auto',
    backend_url: body.backend_url || body.backendUrl,
    app_id: body.app_id || body.appId || 'default',
    aspect_ratio: body.aspect_ratio || body.aspectRatio || body.ratio || '16:9',
    track_name: body.track_name || body.trackName || 'Cinematic Story',
    artist_name: body.artist_name || body.artistName,
    user_images: body.user_images || body.userImages || [],
    reuse_existing_transcript: body.reuse_existing_transcript ?? body.reuseExistingTranscript ?? true,
    reuse_existing_images: body.reuse_existing_images ?? body.reuseExistingImages,
    upload_to_storage: body.upload_to_storage ?? body.uploadToStorage ?? false,
    video_workflow: body.video_workflow || body.videoWorkflow || (body.preset?.startsWith('motion_graphics') ? 'motion_graphics' : 'image_storyboard'),
    motion_style: body.motion_style || body.motionStyle || 'abstract_kinetic'
  };

  fastify.log.info(`[Server] Received render request for job ${jobId}`);

  // Execute pipeline in background
  executeVideoPipeline(payload).catch((err) => {
    fastify.log.error(`[Server] Unhandled error in pipeline for job ${jobId}: ${err.message}`);
  });

  reply.status(202);
  return {
    status: 'accepted',
    job_id: jobId,
    message: 'HyperFrames kinetic video rendering job accepted and running.',
    preset: payload.preset,
    aspect_ratio: payload.aspect_ratio,
    download_url: `/renders/rendered_${jobId}.mp4`
  };
});

// Alias for drop-in compatibility with new-video-generator
fastify.post('/generate', async (request, reply) => {
  return fastify.inject({
    method: 'POST',
    url: '/render-video',
    payload: request.body as any
  }).then(res => {
    reply.status(res.statusCode);
    return JSON.parse(res.body);
  });
});

fastify.post('/jobs', async (request, reply) => {
  return fastify.inject({
    method: 'POST',
    url: '/render-video',
    payload: request.body as any
  }).then(res => {
    reply.status(res.statusCode);
    return JSON.parse(res.body);
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`[Server] HyperFrames Video Service listening on http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
