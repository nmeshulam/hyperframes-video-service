import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

export interface RenderOptions {
  jobDir: string;
  outputMp4Path: string;
  workerCount?: number;
  onProgress?: (percent: number, frame: number, totalFrames: number) => void;
}

export class RenderService {
  /**
   * Renders the HyperFrames composition into an MP4 file
   */
  public async renderVideo(options: RenderOptions): Promise<string> {
    const { jobDir, outputMp4Path, workerCount = config.workerCount, onProgress } = options;

    if (!fs.existsSync(path.join(jobDir, 'index.html'))) {
      throw new Error(`[RenderService] index.html not found in job directory: ${jobDir}`);
    }

    fs.mkdirSync(path.dirname(outputMp4Path), { recursive: true });

    // HyperFrames render command
    const args = [
      '--yes',
      'hyperframes@0.8.143',
      'render',
      '-o', outputMp4Path,
      '-w', workerCount.toString()
    ];

    console.log(`[RenderService] Starting render in ${jobDir}: npx ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', args, {
        cwd: jobDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PUPPETEER_DISABLE_HEADLESS_WARNING: 'true'
        }
      });

      let stdoutOutput = '';
      let stderrOutput = '';

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutOutput += text;

        // Parse progress e.g. "Encoding frame 450/1500" or "45%"
        const frameMatch = text.match(/Encoding frame\s+(\d+)\/(\d+)/i);
        if (frameMatch && onProgress) {
          const current = parseInt(frameMatch[1], 10);
          const total = parseInt(frameMatch[2], 10);
          const pct = Math.round((current / total) * 100);
          onProgress(pct, current, total);
        } else {
          const pctMatch = text.match(/(\d+)%\s+Encoding frame/i);
          if (pctMatch && onProgress) {
            const pct = parseInt(pctMatch[1], 10);
            onProgress(pct, 0, 100);
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputMp4Path) && fs.statSync(outputMp4Path).size > 1000) {
          const sizeMb = (fs.statSync(outputMp4Path).size / (1024 * 1024)).toFixed(2);
          console.log(`[RenderService] Render completed successfully! Output: ${outputMp4Path} (${sizeMb} MB)`);
          resolve(outputMp4Path);
        } else {
          console.error(`[RenderService] Render failed with exit code ${code}.`);
          console.error(`[RenderService] STDERR:\n${stderrOutput.slice(-2000)}`);
          reject(new Error(`HyperFrames render exited with code ${code}: ${stderrOutput.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        console.error(`[RenderService] Process spawn error: ${err.message}`);
        reject(err);
      });
    });
  }
}

export const renderService = new RenderService();
