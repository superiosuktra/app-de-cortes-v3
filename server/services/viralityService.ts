export interface ViralityMetrics {
  score: number;
  hookStrength: number;
  retentionProbability: number;
  reasoning: string;
}

/**
 * Analisa o texto/transcrição para estimar o potencial viral do corte.
 * Integraria-se perfeitamente com a análise da API do Gemini.
 */
export const calculateViralityScore = (text: string, durationInSeconds: number): ViralityMetrics => {
  // Lógica heurística base para demonstração
  const wordCount = text.split(' ').length;
  const wpm = (wordCount / durationInSeconds) * 60;
  
  let score = 50;
  let hookStrength = 50;
  let retentionProbability = 50;

  // Ritmo acelerado (130-160 WPM é ideal para shorts)
  if (wpm > 130 && wpm < 160) {
    score += 20;
    retentionProbability += 20;
  }

  // Hooks fortes geralmente contêm palavras-chave de impacto no início
  const firstWords = text.split(' ').slice(0, 10).join(' ').toLowerCase();
  if (firstWords.includes('segredo') || firstWords.includes('como') || firstWords.includes('você')) {
     hookStrength += 30;
     score += 15;
  }

  return {
    score: Math.min(score, 100),
    hookStrength: Math.min(hookStrength, 100),
    retentionProbability: Math.min(retentionProbability, 100),
    reasoning: 'Análise estrutural baseada em ritmo de WPM e análise do gancho (hook) inicial.'
  };
};
