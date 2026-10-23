import { jobQueue } from '../services/jobQueueService.js';

export const videoWorker = {
  on(_event: string, _callback: (...args: any[]) => void) {
    return this;
  },
  close: async () => {},
  getJob: (jobId: string) => jobQueue.getJob(jobId),
  cancelJob: (jobId: string) => jobQueue.cancelJob(jobId),
};

console.log('✅ Video Worker integrado com JobQueueService ativo.');
