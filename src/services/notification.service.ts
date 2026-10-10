import axios from 'axios';
import { ProgressPayload, JobCompletePayload } from '../types.js';

export class NotificationService {
  /**
   * Sends progress update to calling backend via PUT:
   * URL: {backend_url}/api/v1/jobs/{job_id}/progress
   */
  public async sendProgress(
    backendUrl: string | undefined,
    jobId: string,
    step: string,
    progress: number,
    status: 'processing' | 'completed' | 'failed' = 'processing',
    additionalData?: Record<string, any>
  ): Promise<void> {
    if (!backendUrl || !jobId) {
      console.log(`[NotificationService] Skipping progress (${progress}% - ${step}): No backendUrl/jobId`);
      return;
    }

    const cleanBase = backendUrl.replace(/\/+$/, '');
    const url = `${cleanBase}/api/v1/jobs/${jobId}/progress`;

    const body: ProgressPayload = {
      progress,
      step,
      status,
      ...(additionalData || {})
    };

    try {
      console.log(`[NotificationService] PUT ${url} -> ${progress}% (${step})`);
      await axios.put(url, body, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.warn(`[NotificationService] PUT progress failed to ${url}: ${err?.message || err}`);
    }
  }

  /**
   * Sends completion update to calling backend via POST:
   * URL: {backend_url}/api/v1/jobs/{job_id}/complete
   */
  public async sendComplete(
    backendUrl: string | undefined,
    jobId: string,
    success: boolean,
    assets?: Record<string, any>,
    error?: string,
    errors?: any[]
  ): Promise<void> {
    if (!backendUrl || !jobId) {
      console.log(`[NotificationService] Skipping complete (success=${success}): No backendUrl/jobId`);
      return;
    }

    const cleanBase = backendUrl.replace(/\/+$/, '');
    const url = `${cleanBase}/api/v1/jobs/${jobId}/complete`;

    const body: JobCompletePayload = {
      success,
      assets: assets || {},
      ...(error ? { error } : {}),
      ...(errors ? { errors } : {})
    };

    try {
      console.log(`[NotificationService] POST ${url} -> success=${success}`);
      await axios.post(url, body, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.warn(`[NotificationService] POST complete failed to ${url}: ${err?.message || err}`);
    }
  }
}

export const notificationService = new NotificationService();
