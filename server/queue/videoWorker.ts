// In-memory Video Worker stub for AI Studio environment (no Redis required)
export const videoWorker = {
  on(_event: string, _callback: (...args: any[]) => void) {
    return this;
  },
  close: async () => {},
};

console.log('✅ Video Worker em memória ativo.');
