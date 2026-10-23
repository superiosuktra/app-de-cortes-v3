import { jobQueue } from '../services/jobQueueService.js';

export interface VideoJobPayload {
  id?: string;
  name: string;
  data: any;
}

class VideoQueueBridge {
  async add(name: string, data: any) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[VideoQueue] Delegando job para JobQueue: ${name} (#${jobId})`);
    if (name === 'batch-render' && data?.cuts && data?.sourceVideoPath) {
      return jobQueue.createBatchRenderJob(data.cuts, data.sourceVideoPath);
    }
    if (name === 'batch-zip' && data?.cuts) {
      return jobQueue.createBatchZipJob(data.cuts, data.videoTitle);
    }
    return {
      id: jobId,
      name,
      data,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
  }

  on(_event: string, _callback: (...args: any[]) => void) {
    return this;
  }
}

export const videoQueue = new VideoQueueBridge();

export const addVideoJob = async (jobName: string, data: any) => {
  return await videoQueue.add(jobName, data);
};
