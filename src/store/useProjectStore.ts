import { create } from 'zustand';
import { apiClient } from '../services/apiClient';

type Cut = {
  id: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'processing' | 'done' | 'error';
};

interface ProjectState {
  currentVideoUrl: string;
  videoMetadata: any | null;
  cuts: Cut[];
  isProcessing: boolean;
  error: string | null;
  
  // Ações
  setVideoUrl: (url: string) => void;
  analyzeVideo: (url: string) => Promise<void>;
  requestVideoCut: (file: File, startTime: string, endTime: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentVideoUrl: '',
  videoMetadata: null,
  cuts: [],
  isProcessing: false,
  error: null,

  setVideoUrl: (url) => set({ currentVideoUrl: url }),

  // Chama o backend para pegar dados do vídeo
  analyzeVideo: async (url) => {
    set({ isProcessing: true, error: null });
    try {
      const metadata = await apiClient.fetchVideoInfo(url);
      set({ videoMetadata: metadata, currentVideoUrl: url, isProcessing: false });
    } catch (err: any) {
      set({ error: err.message, isProcessing: false });
    }
  },

  // Inicia o pedido de corte para o backend
  requestVideoCut: async (file, startTime, endTime) => {
    set({ isProcessing: true, error: null });
    
    // Adiciona o corte localmente como pendente
    const newCut: Cut = { id: Date.now().toString(), startTime, endTime, status: 'processing' };
    set((state) => ({ cuts: [...state.cuts, newCut] }));

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('startTime', startTime);
      formData.append('endTime', endTime);
      
      // Faz a requisição
      const blob = await apiClient.requestCut(formData);
      
      // Simula o download do blob recebido
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `corte_${startTime}_${endTime}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Atualiza o status para concluído
      set((state) => ({
        cuts: state.cuts.map(c => c.id === newCut.id ? { ...c, status: 'done' } : c),
        isProcessing: false
      }));
    } catch (err: any) {
      set((state) => ({
        cuts: state.cuts.map(c => c.id === newCut.id ? { ...c, status: 'error' } : c),
        error: err.message,
        isProcessing: false
      }));
    }
  }
}));
