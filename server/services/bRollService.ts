export interface BRollSegment {
  videoPath: string;
  startTime: number;
  duration: number;
}

/**
 * Gera comandos do FFmpeg para inserir B-rolls sobre o vídeo principal.
 * 
 * @param mainVideoIndex O índice do vídeo principal no comando FFmpeg (geralmente 0)
 * @param bRolls Array com dados dos B-rolls a serem inseridos
 * @returns Uma string de filtro complexo (complex_filter) do FFmpeg
 */
export const generateBRollComplexFilter = (mainVideoIndex: number, bRolls: BRollSegment[]): string => {
  if (!bRolls || bRolls.length === 0) return '';

  let filterGraph = '';
  let lastOutput = `[${mainVideoIndex}:v]`;

  bRolls.forEach((broll, index) => {
    const brollInput = index + 1; // assumindo que os brolls são passados sequencialmente após o vídeo original
    const currentOut = `[v${index}]`;
    
    // Sobrepõe o B-roll no tempo especificado (enable='between(t, start, end)')
    filterGraph += `${lastOutput}[${brollInput}:v]overlay=enable='between(t,${broll.startTime},${broll.startTime + broll.duration})'${currentOut};`;
    lastOutput = currentOut;
  });

  return filterGraph.replace(/;$/, ''); // Remove último ponto e vírgula
};
