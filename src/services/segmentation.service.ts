import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export class SegmentationService {
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.resolve(process.cwd(), 'scripts/remove_bg.py');
  }

  /**
   * Separates foreground (RGBA PNG) and background (JPEG)
   */
  public async separateLayers(
    inputImagePath: string,
    outputFgPath: string,
    outputBgPath?: string
  ): Promise<{ fgPath: string; bgPath?: string }> {
    if (!fs.existsSync(inputImagePath)) {
      throw new Error(`[SegmentationService] Input image does not exist: ${inputImagePath}`);
    }

    fs.mkdirSync(path.dirname(outputFgPath), { recursive: true });
    if (outputBgPath) {
      fs.mkdirSync(path.dirname(outputBgPath), { recursive: true });
    }

    const args = ['--input', inputImagePath, '--fg', outputFgPath];
    if (outputBgPath) {
      args.push('--bg', outputBgPath);
    }

    console.log(`[SegmentationService] Spawning Python rembg: python3 ${this.scriptPath} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const proc = spawn('python3', [this.scriptPath, ...args]);

      let stderr = '';
      let stdout = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFgPath)) {
          console.log('[SegmentationService] Layer separation completed successfully.');
          resolve({ fgPath: outputFgPath, bgPath: outputBgPath });
        } else {
          console.warn(`[SegmentationService] Python rembg exited with code ${code}. Error: ${stderr}. Falling back to original image.`);
          // Fallback: Copy original as both foreground and background
          fs.copyFileSync(inputImagePath, outputFgPath);
          if (outputBgPath) {
            fs.copyFileSync(inputImagePath, outputBgPath);
          }
          resolve({ fgPath: outputFgPath, bgPath: outputBgPath });
        }
      });

      proc.on('error', (err) => {
        console.warn(`[SegmentationService] Could not spawn python3: ${err.message}. Using fallback.`);
        fs.copyFileSync(inputImagePath, outputFgPath);
        if (outputBgPath) {
          fs.copyFileSync(inputImagePath, outputBgPath);
        }
        resolve({ fgPath: outputFgPath, bgPath: outputBgPath });
      });
    });
  }
}

export const segmentationService = new SegmentationService();
