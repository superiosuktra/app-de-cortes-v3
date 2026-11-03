import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import { TEMP_DIR } from '../config.js';
import { ViralCut } from '../../src/types.js';

export interface CreateZipOptions {
  jobId: string;
  cuts: (ViralCut & { filePath?: string })[];
  videoTitle?: string;
  includeMetadataFolder?: boolean;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Sanitizes a string for use in zip filenames
 */
export function sanitizeFileName(name: string, maxLength: number = 40): string {
  return (name || 'corte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents for maximal zip tool compatibility
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLength);
}

/**
 * Generates an SRT subtitle content string from a cut's overlay sample or timing
 */
export function generateSrtContent(cut: ViralCut): string {
  const words =
    cut.overlaySubtitlesSample && cut.overlaySubtitlesSample.length > 0
      ? cut.overlaySubtitlesSample
      : (cut.hook || cut.title).split(/\s+/).filter(Boolean);

  let srt = '';
  let start = 0;
  const chunkDur = Math.max(1.8, Math.min(3.5, cut.durationSeconds / Math.max(1, words.length)));

  words.forEach((chunk, idx) => {
    const end = Math.min(cut.durationSeconds, start + chunkDur);

    const formatSrtTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    srt += `${idx + 1}\n`;
    srt += `${formatSrtTime(start)} --> ${formatSrtTime(end)}\n`;
    srt += `${chunk.trim()}\n\n`;

    start = end;
  });

  return srt;
}

/**
 * Generates a clean CSV index of all cuts in the batch
 */
export function generateCsvIndex(cuts: ViralCut[]): string {
  const headers = ['numero', 'id', 'titulo', 'inicio', 'fim', 'duracao_s', 'virality_score', 'categoria', 'gancho', 'payoff'];
  const rows = cuts.map((cut, idx) => {
    const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    return [
      idx + 1,
      escapeCsv(cut.id),
      escapeCsv(cut.title),
      escapeCsv(cut.startTime),
      escapeCsv(cut.endTime),
      cut.durationSeconds,
      cut.viralityScore,
      escapeCsv(cut.category || 'Geral'),
      escapeCsv(cut.hook),
      escapeCsv(cut.payoff),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Creates a complete ZIP archive on disk containing MP4 videos, SRT subtitles, CSV index, and JSON metadata
 */
export async function createBatchZipArchive(options: CreateZipOptions): Promise<{
  zipPath: string;
  totalSize: number;
  filesCount: number;
}> {
  const { jobId, cuts, videoTitle, includeMetadataFolder = true, onProgress } = options;
  const zipFileName = `batch_${sanitizeFileName(videoTitle || 'cortes_virais')}_${jobId}.zip`;
  const zipPath = path.join(TEMP_DIR, zipFileName);

  const output = fs.createWriteStream(zipPath);
  const archive = new yazl.ZipFile();

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const stats = fs.statSync(zipPath);
      console.log(`[ZipService] Arquivo ZIP concluído: ${zipPath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
      resolve({
        zipPath,
        totalSize: stats.size,
        filesCount: cuts.length,
      });
    });

    archive.outputStream.on('error', (err: Error) => {
      console.error('[ZipService] Erro durante criação do ZIP:', err);
      reject(err);
    });

    archive.outputStream.pipe(output);

    let processedCount = 0;

    // 1. Add video files and corresponding SRT subtitles
    cuts.forEach((cut, idx) => {
      const numPrefix = String(idx + 1).padStart(3, '0');
      const safeTitle = sanitizeFileName(cut.title || `corte_${idx + 1}`);
      const baseName = `${numPrefix}_${safeTitle}`;

      // Video file
      if (cut.filePath && fs.existsSync(cut.filePath)) {
        archive.addFile(cut.filePath, `${baseName}.mp4`);
      }

      // SRT subtitle
      const srtContent = generateSrtContent(cut);
      archive.addBuffer(Buffer.from(srtContent, 'utf8'), `${baseName}.srt`);

      // JSON metadata inside metadata/ folder
      if (includeMetadataFolder) {
        const metadataJson = JSON.stringify(cut, null, 2);
        archive.addBuffer(Buffer.from(metadataJson, 'utf8'), `metadata/${baseName}.json`);
      }

      processedCount++;
      onProgress?.(processedCount, cuts.length);
    });

    // 2. Add CSV index at the root of the ZIP
    const csvContent = generateCsvIndex(cuts);
    archive.addBuffer(Buffer.from(csvContent, 'utf8'), 'index_cortes.csv');

    // 3. Add summary README.txt
    const readmeContent = `AI VIRAL SHORTS CUTTER - PACOTE DE EXPORTAÇÃO
Projeto: ${videoTitle || 'Cortes Virais'}
Data: ${new Date().toLocaleString('pt-BR')}
Total de cortes: ${cuts.length}

ESTRUTURA DO PACOTE:
- Arquivos [001..XXX]_[Titulo].mp4: Vídeos verticais de alta qualidade prontos para redes sociais.
- Arquivos [001..XXX]_[Titulo].srt: Legendas sincronizadas em formato padrão SRT.
- index_cortes.csv: Planilha com métricas, ganchos e timestamps de todos os cortes.
- Pasta metadata/: Arquivos JSON com a análise completa e parâmetros de cada corte.
`;
    archive.addBuffer(Buffer.from(readmeContent, 'utf8'), 'LEIA_ME.txt');

    archive.end();
  });
}
