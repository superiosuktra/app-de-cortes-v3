export interface TrackingOptions {
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  strategy: 'center' | 'face_detect';
}

/**
 * Gera o filtro FFmpeg para recorte dinâmico (Smart Crop).
 * Por padrão, usa um recorte centralizado se não houver dados de rastreamento avançado.
 */
export const generateSmartCropFilter = (options: TrackingOptions): string => {
  const { originalWidth, originalHeight, targetWidth, targetHeight, strategy } = options;
  
  if (strategy === 'center') {
    // Recorte simples no centro do vídeo original
    const cropX = `(in_w-${targetWidth})/2`;
    const cropY = `(in_h-${targetHeight})/2`;
    return `crop=${targetWidth}:${targetHeight}:${cropX}:${cropY}`;
  }

  // Aqui poderia entrar uma lógica mais complexa baseada em keyframes (se a IA fornecer as coordenadas)
  return `crop=${targetWidth}:${targetHeight}:(in_w-${targetWidth})/2:(in_h-${targetHeight})/2`;
};
