import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from '../config.js';

export class StorageService {
  private client: Storage | null = null;

  constructor() {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && !fs.existsSync(credPath)) {
      console.warn(`[StorageService] GOOGLE_APPLICATION_CREDENTIALS points to missing file: ${credPath}. Disabling GCS client.`);
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      this.client = null;
      return;
    }

    try {
      this.client = new Storage({
        projectId: config.googleCloudProject
      });
      console.log('[StorageService] Google Cloud Storage client initialized successfully.');
    } catch (err) {
      console.warn('[StorageService] Could not initialize GCS client directly (offline/local mode):', err);
      this.client = null;
    }
  }

  public getBucketForApp(appId?: string): string {
    if (!appId || !config.appBucketConfig[appId]) {
      return config.appBucketConfig['default']?.bucket || config.defaultOutputBucket;
    }
    return config.appBucketConfig[appId].bucket;
  }

  public parseGcsUri(uri: string): { bucket: string; path: string } | null {
    if (uri.startsWith('gs://')) {
      const parts = uri.replace('gs://', '').split('/');
      const bucket = parts[0];
      const filePath = parts.slice(1).join('/');
      return { bucket, path: filePath };
    }
    if (uri.includes('storage.googleapis.com/')) {
      const after = uri.split('storage.googleapis.com/')[1];
      const parts = after.split('/');
      const bucket = parts[0];
      const filePath = parts.slice(1).join('/');
      return { bucket, path: filePath };
    }
    return null;
  }

  /**
   * Resolves a local path candidate across common testing folders
   */
  public resolveLocalPath(source: string): string | null {
    const candidates = [
      source,
      path.resolve(process.cwd(), source),
      path.resolve(process.cwd(), source.replace(/^\//, '')),
      path.resolve(process.cwd(), 'assets/audio', path.basename(source)),
      path.resolve(process.cwd(), 'assets/transcript', path.basename(source)),
      path.resolve(process.cwd(), 'assets/images', path.basename(source)),
      path.resolve('/data', path.basename(source)),
      path.resolve('/app/assets/audio', path.basename(source)),
      path.resolve('/app/data', path.basename(source))
    ];

    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return c;
      }
    }
    return null;
  }

  public async downloadFile(sourceUriOrUrl: string, destinationLocalPath: string): Promise<string> {
    fs.mkdirSync(path.dirname(destinationLocalPath), { recursive: true });

    // 1. Check local file candidates first (allows "/local_audio.mp3" or "assets/audio/song.mp3")
    const localFound = this.resolveLocalPath(sourceUriOrUrl);
    if (localFound) {
      console.log(`[StorageService] Using local file: ${localFound} -> ${destinationLocalPath}`);
      if (localFound !== destinationLocalPath) {
        fs.copyFileSync(localFound, destinationLocalPath);
      }
      return destinationLocalPath;
    }

    // 2. GCS download
    const gcsParsed = this.parseGcsUri(sourceUriOrUrl);
    if (gcsParsed && this.client) {
      console.log(`[StorageService] Downloading from GCS: gs://${gcsParsed.bucket}/${gcsParsed.path} -> ${destinationLocalPath}`);
      const bucket = this.client.bucket(gcsParsed.bucket);
      const file = bucket.file(gcsParsed.path);
      await file.download({ destination: destinationLocalPath });
      return destinationLocalPath;
    }

    // 3. Direct HTTP/HTTPS download
    if (sourceUriOrUrl.startsWith('http://') || sourceUriOrUrl.startsWith('https://')) {
      console.log(`[StorageService] Downloading from HTTP: ${sourceUriOrUrl} -> ${destinationLocalPath}`);
      const response = await axios({
        method: 'GET',
        url: sourceUriOrUrl,
        responseType: 'stream'
      });
      const writer = fs.createWriteStream(destinationLocalPath);
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', (err) => reject(err));
      });
      return destinationLocalPath;
    }

    throw new Error(`[StorageService] Cannot find or download file from: ${sourceUriOrUrl}`);
  }

  public async downloadJson<T = any>(sourceUriOrUrl: string): Promise<T> {
    // Check local JSON files first
    const localFound = this.resolveLocalPath(sourceUriOrUrl);
    if (localFound) {
      console.log(`[StorageService] Reading local JSON file: ${localFound}`);
      const content = fs.readFileSync(localFound, 'utf-8');
      return JSON.parse(content) as T;
    }

    const tempFile = path.join('/tmp', `temp-${Date.now()}.json`);
    try {
      await this.downloadFile(sourceUriOrUrl, tempFile);
      const content = fs.readFileSync(tempFile, 'utf-8');
      return JSON.parse(content) as T;
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }

  public async uploadFile(
    localPath: string,
    destinationBlobName: string,
    bucketName?: string,
    appId?: string
  ): Promise<{ gcsUri: string; bucket: string; destinationBlob: string }> {
    if (!this.client) {
      console.warn('[StorageService] GCS client not initialized. Saving to local renders/ folder.');
      const localDest = path.resolve(process.cwd(), 'renders', path.basename(destinationBlobName));
      fs.mkdirSync(path.dirname(localDest), { recursive: true });
      fs.copyFileSync(localPath, localDest);
      return {
        gcsUri: `file://${localDest}`,
        bucket: 'local-storage',
        destinationBlob: destinationBlobName
      };
    }

    try {
      const targetBucket = bucketName || this.getBucketForApp(appId);
      console.log(`[StorageService] Uploading ${localPath} to gs://${targetBucket}/${destinationBlobName}`);

      const bucket = this.client.bucket(targetBucket);
      await bucket.upload(localPath, {
        destination: destinationBlobName,
        resumable: true
      });

      return {
        gcsUri: `gs://${targetBucket}/${destinationBlobName}`,
        bucket: targetBucket,
        destinationBlob: destinationBlobName
      };
    } catch (err: any) {
      console.warn(`[StorageService] GCS upload failed (${err.message}). Saving to local renders/ folder.`);
      const localDest = path.resolve(process.cwd(), 'renders', path.basename(destinationBlobName));
      fs.mkdirSync(path.dirname(localDest), { recursive: true });
      fs.copyFileSync(localPath, localDest);
      return {
        gcsUri: `file://${localDest}`,
        bucket: 'local-storage',
        destinationBlob: destinationBlobName
      };
    }
  }

  public async uploadJson(
    data: any,
    destinationBlobName: string,
    bucketName?: string
  ): Promise<{ gcsUri: string; bucket: string }> {
    const tempFile = path.join('/tmp', `upload-${Date.now()}.json`);
    try {
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      const res = await this.uploadFile(tempFile, destinationBlobName, bucketName);
      return { gcsUri: res.gcsUri, bucket: res.bucket };
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }
}

export const storageService = new StorageService();
