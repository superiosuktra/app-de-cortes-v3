// In-memory Video Queue implementation for AI Studio environment (no Redis required)
type JobHandler = (job: { id: string; name: string; data: any }) => Promise<any>;

interface QueuedJob {
  id: string;
  name: string;
  data: any;
}

class InMemoryQueue {
  private handlers: Map<string, JobHandler[]> = new Map();

  async add(name: string, data: any): Promise<{ id: string; name: string; data: any }> {
    const job: QueuedJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      data,
    };

    console.log(`[VideoQueue] Job adicionado à fila: ${job.name} (#${job.id})`);

    // Process asynchronously in background
    setTimeout(async () => {
      try {
        console.log(`[VideoQueue] Iniciando processamento de: ${job.name} (#${job.id})`);
        if (job.name === 'render-cut') {
          // Simulated render job
          await new Promise((r) => setTimeout(r, 1500));
        }
        console.log(`[VideoQueue] Job ${job.id} concluído com sucesso!`);
      } catch (err: any) {
        console.error(`[VideoQueue] Erro no processamento do job ${job.id}:`, err);
      }
    }, 50);

    return job;
  }

  on(_event: string, _callback: (...args: any[]) => void) {
    // Event listener stub
    return this;
  }
}

export const videoQueue = new InMemoryQueue();

export const addVideoJob = async (jobName: string, data: any) => {
  return await videoQueue.add(jobName, data);
};
