import { authFetch } from '../utils/api';

export const apiClient = {
  // Buscar informações do vídeo do YouTube
  fetchVideoInfo: async (url: string) => {
    const response = await authFetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) throw new Error('Erro ao buscar dados do vídeo');
    return response.json();
  },

  // Enviar vídeo para processamento/corte
  requestCut: async (formData: FormData) => {
    const response = await authFetch('/api/render-download-cut', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Erro ao solicitar corte');
    return response.blob();
  },
};

