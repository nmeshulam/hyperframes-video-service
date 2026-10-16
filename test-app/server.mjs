import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const CONTAINER_URL = 'http://127.0.0.1:8080';
const HOST_CALLBACK_URL = 'http://host.containers.internal:3000';
const AUDIO_DIR = path.resolve(__dirname, '../assets/audio');

fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Active jobs state store
const jobs = new Map();
// SSE connected clients
const sseClients = new Set();

function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

function updatePhaseTimes(job, step, progress) {
  const now = Date.now();
  const phases = job.phases;

  // Add step to log
  job.logs.push({
    timestamp: new Date().toLocaleTimeString(),
    progress,
    step
  });

  job.currentStep = step;
  job.progress = progress;

  // 1. Transcription Phase
  if (step.includes('transcrib') || step.includes('fetching audio')) {
    if (!phases.transcription.start) {
      phases.transcription.start = now;
      phases.transcription.status = 'running';
    }
  }
  if (step.includes('transcription complete') || step.includes('transcription loaded')) {
    if (!phases.transcription.end) {
      phases.transcription.end = now;
      phases.transcription.durationSec = ((phases.transcription.end - (phases.transcription.start || now)) / 1000).toFixed(2);
      phases.transcription.status = 'completed';
    }
  }

  // 2. Images & Segmentation Phase
  if (step.includes('planning 3-scene') || step.includes('generating 3 consistent') || step.includes('separating foreground') || step.includes('reused cached scene')) {
    if (!phases.transcription.end && phases.transcription.start) {
      phases.transcription.end = now;
      phases.transcription.durationSec = ((phases.transcription.end - phases.transcription.start) / 1000).toFixed(2);
      phases.transcription.status = 'completed';
    }
    if (!phases.images.start) {
      phases.images.start = now;
      phases.images.status = 'running';
    }
  }

  // 3. Claude Composition Phase
  if (step.includes('assembling dynamic kinetic')) {
    if (!phases.images.end && phases.images.start) {
      phases.images.end = now;
      phases.images.durationSec = ((phases.images.end - phases.images.start) / 1000).toFixed(2);
      phases.images.status = 'completed';
    }
    if (!phases.composition.start) {
      phases.composition.start = now;
      phases.composition.status = 'running';
    }
  }

  // 4. Render Phase
  if (step.includes('rendering frames') || step.includes('rendering video')) {
    if (!phases.composition.end && phases.composition.start) {
      phases.composition.end = now;
      phases.composition.durationSec = ((phases.composition.end - phases.composition.start) / 1000).toFixed(2);
      phases.composition.status = 'completed';
    }
    if (!phases.render.start) {
      phases.render.start = now;
      phases.render.status = 'running';
    }
  }

  
  // Handle Failure
  if (step.startsWith('failed') || progress === 0 && step.includes('fail')) {
    job.status = 'failed';
    job.endTime = now;
    job.totalDurationSec = ((now - job.startTime) / 1000).toFixed(2);
    for (const p of Object.values(phases)) {
      if (p.status === 'running') {
        p.status = 'failed';
        p.end = now;
        p.durationSec = ((now - p.start) / 1000).toFixed(2);
      }
    }
  }

  // Final Complete
  if (step === 'completed' || progress >= 100) {
    if (!phases.render.end && phases.render.start) {
      phases.render.end = now;
      phases.render.durationSec = ((phases.render.end - phases.render.start) / 1000).toFixed(2);
      phases.render.status = 'completed';
    }
    job.endTime = now;
    job.totalDurationSec = ((job.endTime - job.startTime) / 1000).toFixed(2);
    job.status = 'completed';
  }

  broadcast({ type: 'job_update', job });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve static HTML UI
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(htmlPath).pipe(res);
      return;
    }
  }

  // SSE stream for real-time progress & timing
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 2000\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Upload MP3 and start rendering job
  if (req.method === 'POST' && pathname === '/api/upload-and-run') {
    const trackName = urlObj.searchParams.get('trackName') || 'Untitled Track';
    const aspectRatio = urlObj.searchParams.get('aspectRatio') || '9:16';
    const reuseTranscript = urlObj.searchParams.get('reuseTranscript') !== 'false';
    const reuseImages = urlObj.searchParams.get('reuseImages') === 'true';
    const uploadToStorage = urlObj.searchParams.get('uploadToStorage') === 'true';
    const workflow = urlObj.searchParams.get('workflow') || 'motion_graphics';
    const motionStyle = urlObj.searchParams.get('motionStyle') || 'abstract_kinetic';
    const rawFilename = urlObj.searchParams.get('filename') || 'audio.mp3';

    const safeFilename = path.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const localAudioPath = path.join(AUDIO_DIR, safeFilename);

    console.log(`[TestApp] Receiving audio upload: ${safeFilename} (${trackName})`);

    const fileStream = fs.createWriteStream(localAudioPath);
    req.pipe(fileStream);

    fileStream.on('finish', async () => {
      console.log(`[TestApp] Audio saved to ${localAudioPath} (${fs.statSync(localAudioPath).size} bytes)`);

      const jobId = `test_${Date.now()}`;
      const now = Date.now();

      const newJob = {
        jobId,
        trackName,
        aspectRatio,
        audioFile: safeFilename,
        startTime: now,
        endTime: null,
        totalDurationSec: null,
        status: 'processing',
        progress: 0,
        currentStep: 'Sending job to HyperFrames container...',
        phases: {
          transcription: { name: 'ElevenLabs Speech-to-Text', start: null, end: null, durationSec: null, status: 'pending' },
          images: {
            name: workflow === 'motion_graphics' ? 'Story Director & Vector Symbols (No Images)' : 'Story Planning & Scene Images (Gemini + rembg)',
            start: null,
            end: null,
            durationSec: workflow === 'motion_graphics' ? '0.00' : null,
            status: workflow === 'motion_graphics' ? 'completed' : 'pending'
          },
          composition: {
            name: workflow === 'motion_graphics'
              ? `Claude Sonnet 5.5 Motion Graphics (${motionStyle === 'abstract_kinetic' ? 'Abstract' : 'Narrative'})`
              : 'Claude Sonnet 5.5 WOW Composition',
            start: null,
            end: null,
            durationSec: null,
            status: 'pending'
          },
          render: { name: 'HyperFrames Frame Capture & MP4 Encode', start: null, end: null, durationSec: null, status: 'pending' }
        },
        logs: [{
          timestamp: new Date().toLocaleTimeString(),
          progress: 0,
          step: 'Job initialized on test harness'
        }],
        videoUrl: null
      };

      jobs.set(jobId, newJob);
      broadcast({ type: 'job_started', job: newJob });

      // Call the container
      try {
        const payload = {
          job_id: jobId,
          audio_url: `assets/audio/${safeFilename}`,
          backend_url: HOST_CALLBACK_URL,
          aspect_ratio: aspectRatio,
          track_name: trackName,
          reuse_existing_transcript: reuseTranscript,
          reuse_existing_images: reuseImages,
          upload_to_storage: uploadToStorage,
          video_workflow: workflow,
          motion_style: motionStyle
        };

        console.log(`[TestApp] Dispatching POST ${CONTAINER_URL}/render-video with payload:`, payload);

        const fetchRes = await fetch(`${CONTAINER_URL}/render-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const respData = await fetchRes.json();
        console.log(`[TestApp] Container response:`, respData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, jobId, message: 'Job dispatched to container' }));
      } catch (err) {
        console.error(`[TestApp] Error calling container:`, err);
        newJob.status = 'failed';
        newJob.currentStep = `Failed to contact container: ${err.message}`;
        broadcast({ type: 'job_update', job: newJob });

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });

    fileStream.on('error', (err) => {
      console.error(`[TestApp] File upload error:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Progress callback endpoint from container: PUT /api/v1/jobs/:job_id/progress
  const progressMatch = pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/progress$/);
  if (req.method === 'PUT' && progressMatch) {
    const jobId = progressMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const job = jobs.get(jobId);
        if (job) {
          updatePhaseTimes(job, payload.step || '', payload.progress || 0);
          console.log(`[TestApp Callback] Job ${jobId}: ${payload.progress}% - ${payload.step}`);
        } else {
          console.warn(`[TestApp Callback] Progress for unknown job ${jobId}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Complete callback endpoint from container: POST /api/v1/jobs/:job_id/complete
  const completeMatch = pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const jobId = completeMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const job = jobs.get(jobId);
        if (job) {
          const now = Date.now();
          job.status = payload.success ? 'completed' : 'failed';
          job.endTime = now;
          job.totalDurationSec = ((now - job.startTime) / 1000).toFixed(2);
          job.videoUrl = `http://127.0.0.1:8080/renders/rendered_${jobId}.mp4`;

          if (job.phases.render.start && !job.phases.render.end) {
            job.phases.render.end = now;
            job.phases.render.durationSec = ((now - job.phases.render.start) / 1000).toFixed(2);
            job.phases.render.status = 'completed';
          }

          console.log(`\n======================================================`);
          console.log(`🏁 [TestApp] JOB ${jobId} COMPLETE in ${job.totalDurationSec}s!`);
          console.log(`- ElevenLabs: ${job.phases.transcription.durationSec}s`);
          console.log(`- Images/Rembg: ${job.phases.images.durationSec}s`);
          console.log(`- Claude 5.5: ${job.phases.composition.durationSec}s`);
          console.log(`- HyperFrames Render: ${job.phases.render.durationSec}s`);
          console.log(`- Video URL: ${job.videoUrl}`);
          console.log(`======================================================\n`);

          broadcast({ type: 'job_complete', job });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Get job status JSON
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    const jobId = jobMatch[1];
    const job = jobs.get(jobId);
    if (job) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 [TestApp] HyperFrames Video Test App Running!`);
  console.log(`🌐 Local Web UI: http://localhost:${PORT}`);
  console.log(`🎯 Container Callback URL: ${HOST_CALLBACK_URL}`);
  console.log(`======================================================\n`);
});
