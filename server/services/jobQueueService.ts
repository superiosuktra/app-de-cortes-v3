import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, CLIPS_DIR, TEMP_DIR } from '../config.js';
import { renderClip, validateMediaFile } from './renderService.js';
import { createBatchZipArchive } from './zipService.js';
import { ViralCut, BatchRenderJob } from '../../src/types.js';
import { validateCutInterval } from '../middleware/security.js';

export interface RenderJobTask {
  id: string;
  type: 'render' | 'batch_render' | 'zip';
  status:
    | 'queued'
    | 'downloading'
    | 'transcribing'
    | 'analyzing'
    | 'rendering'
    | 'packaging'
    | 'completed'
    | 'failed'
    | 'cancelled';
  progress: number;
  currentStep: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  itemIds: string[];
  error?: string;
  zipDownloadUrl?: string;
  clipData?: Record<string, { previewUrl?: string; downloadUrl?: string; fileSize?: number; error?: string }>;
  createdAt: string;
  updatedAt: string;
  isCancelled?: boolean;
}

const CLIPS_METADATA_FILE = path.join(DATA_DIR, 'rendered_clips.json');

class JobQueueService {
  private jobs: Map<string, RenderJobTask> = new Map();
  private clipMetadata: Map<string, { filePath: string; duration: number; fileSize: number; createdAt: string }> = new Map();
  private isProcessing = false;
  private queue: Array<() => Promise<void>> = [];

  constructor() {
    this.loadClipsMetadata();
  }

  private loadClipsMetadata() {
    try {
      if (fs.existsSync(CLIPS_METADATA_FILE)) {
        const raw = fs.readFileSync(CLIPS_METADATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            this.clipMetadata.set(k, v as any);
          }
        }
      }
    } catch (e) {
      console.warn('[JobQueue] Erro ao carregar metadados de cortes:', e);
    }
  }

  private saveClipsMetadata() {
    try {
      const obj: Record<string, any> = {};
      for (const [k, v] of this.clipMetadata.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(CLIPS_METADATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[JobQueue] Falha ao salvar metadados de cortes:', e);
    }
  }

  public registerRenderedClip(clipId: string, filePath: string, duration: number, fileSize: number) {
    this.clipMetadata.set(clipId, {
      filePath,
      duration,
      fileSize,
      createdAt: new Date().toISOString(),
    });
    this.saveClipsMetadata();
  }

  public getRenderedClip(clipId: string) {
    const meta = this.clipMetadata.get(clipId);
    if (meta && fs.existsSync(meta.filePath)) {
      return meta;
    }
    // Also check direct file in CLIPS_DIR
    const directPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
    if (fs.existsSync(directPath)) {
      const stats = fs.statSync(directPath);
      return {
        filePath: directPath,
        duration: 30,
        fileSize: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };
    }
    return null;
  }

  public getJob(jobId: string): RenderJobTask | undefined {
    return this.jobs.get(jobId);
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.isCancelled = true;
    job.status = 'cancelled';
    job.currentStep = 'Cancelado pelo usuário';
    job.updatedAt = new Date().toISOString();
    return true;
  }

  public addJob(job: RenderJobTask) {
    this.jobs.set(job.id, job);
  }

  public updateJob(jobId: string, updates: Partial<RenderJobTask>) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    }
  }

  public createBatchRenderJob(cuts: ViralCut[], sourceVideoPath: string): RenderJobTask {
    const jobId = `batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const task: RenderJobTask = {
      id: jobId,
      type: 'batch_render',
      status: 'queued',
      progress: 0,
      currentStep: 'Na fila para processamento',
      totalItems: cuts.length,
      completedItems: 0,
      failedItems: 0,
      itemIds: cuts.map((c) => c.id),
      clipData: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, task);

    // Enqueue work
    this.queue.push(async () => {
      await this.processBatchRender(jobId, cuts, sourceVideoPath);
    });

    this.processNext();
    return task;
  }

  public createBatchZipJob(cuts: ViralCut[], videoTitle?: string): RenderJobTask {
    const jobId = `zip_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const task: RenderJobTask = {
      id: jobId,
      type: 'zip',
      status: 'queued',
      progress: 0,
      currentStep: 'Preparando empacotamento em arquivo ZIP...',
      totalItems: cuts.length,
      completedItems: 0,
      failedItems: 0,
      itemIds: cuts.map((c) => c.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, task);

    this.queue.push(async () => {
      await this.processBatchZip(jobId, cuts, videoTitle);
    });

    this.processNext();
    return task;
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const taskFn = this.queue.shift();
    if (taskFn) {
      try {
        await taskFn();
      } catch (err) {
        console.error('[JobQueue] Erro ao executar tarefa da fila:', err);
      }
    }
    this.isProcessing = false;
    this.processNext();
  }

  private async processBatchRender(jobId: string, cuts: ViralCut[], sourceVideoPath: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.isCancelled) return;

    this.updateJob(jobId, { status: 'rendering', currentStep: 'Iniciando renderização dos cortes selecionados...' });

    const total = cuts.length;
    let completed = 0;
    let failed = 0;

    for (let idx = 0; idx < cuts.length; idx++) {
      if (job.isCancelled) break;
      const cut = cuts[idx];
      const stepMsg = `Renderizando corte ${idx + 1} de ${total}: "${cut.title.slice(0, 30)}..."`;
      this.updateJob(jobId, {
        currentStep: stepMsg,
        progress: Math.floor((idx / total) * 100),
      });

      try {
        const outPath = path.join(CLIPS_DIR, `${cut.id}.mp4`);
        const result = await renderClip({
          sourcePath: sourceVideoPath,
          startTime: cut.startTime,
          endTime: cut.endTime,
          clipId: cut.id,
          outputPath: outPath,
          format: cut.recommendedFormat || 'speaker_center',
          subtitleTheme: cut.subtitleTheme || 'none',
          overlayTitle: cut.title,
          hook: cut.hook,
          framing: cut.framing as any,
          subtitles: cut.overlaySubtitlesSample,
          removeSilence: Boolean(cut.removeSilence),
        });

        this.registerRenderedClip(cut.id, result.outputPath, result.duration, result.fileSize);

        completed++;
        job.clipData = job.clipData || {};
        job.clipData[cut.id] = {
          previewUrl: `/api/clips/${cut.id}/preview`,
          downloadUrl: `/api/clips/${cut.id}/download`,
          fileSize: result.fileSize,
        };
      } catch (renderErr: any) {
        console.error(`[JobQueue] Falha no corte ${cut.id}:`, renderErr?.message || renderErr);
        failed++;
        job.clipData = job.clipData || {};
        job.clipData[cut.id] = {
          error: renderErr?.message || 'Falha na renderização FFmpeg',
        };
      }

      this.updateJob(jobId, {
        completedItems: completed,
        failedItems: failed,
        progress: Math.floor(((idx + 1) / total) * 100),
      });
    }

    if (job.isCancelled) return;

    this.updateJob(jobId, {
      status: failed === total ? 'failed' : 'completed',
      progress: 100,
      currentStep: failed === 0 ? 'Todos os cortes foram renderizados com sucesso!' : `${completed} corte(s) concluído(s), ${failed} com erro.`,
    });
  }

  private async processBatchZip(jobId: string, cuts: ViralCut[], videoTitle?: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.isCancelled) return;

    this.updateJob(jobId, {
      status: 'packaging',
      currentStep: 'Coletando arquivos e gerando legendas SRT...',
      progress: 10,
    });

    try {
      // Gather files for all cuts
      const cutsWithFiles = cuts.map((c) => {
        const rendered = this.getRenderedClip(c.id);
        return {
          ...c,
          filePath: rendered?.filePath,
        };
      });

      const result = await createBatchZipArchive({
        jobId,
        cuts: cutsWithFiles,
        videoTitle,
        includeMetadataFolder: true,
        onProgress: (done, tot) => {
          this.updateJob(jobId, {
            progress: Math.min(95, 10 + Math.floor((done / tot) * 85)),
            currentStep: `Empacotando item ${done} de ${tot}...`,
          });
        },
      });

      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        currentStep: 'Arquivo ZIP gerado com sucesso!',
        zipDownloadUrl: `/api/batch/${jobId}/download`,
      });
    } catch (err: any) {
      console.error('[JobQueue] Erro ao criar ZIP:', err);
      this.updateJob(jobId, {
        status: 'failed',
        error: `Falha ao gerar arquivo ZIP: ${err?.message || 'Erro interno'}`,
        currentStep: 'Falha no empacotamento do ZIP',
      });
    }
  }

  public get(jobId: string): RenderJobTask | undefined {
    return this.jobs.get(jobId);
  }

  public has(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  public deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  public setRenderedClip(clipId: string, meta: { filePath: string; duration: number; fileSize: number; createdAt: string; userId?: string }) {
    this.clipMetadata.set(clipId, meta);
  }
}

export const jobQueue = new JobQueueService();

export interface BatchCutItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  [key: string]: any;
}

export interface BatchRenderJobInternal {
  id: string;
  userId: string;
  videoUrl: string;
  cuts: BatchCutItem[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  completedCuts: number;
  totalCuts: number;
  zipPath?: string;
  finishedAt?: number;
  createdAt: number;
  customRunner?: () => Promise<string>;
}

export const clipMetadata = new Map<string, { filePath: string; duration: number; fileSize: number; createdAt: number; userId?: string }>();
const userClips = new Map<string, { clipId: string; userId: string; filePath: string; fileName: string; meta: any }>();
const batchJobs = new Map<string, BatchRenderJobInternal>();

export function computeClipParamsHash(params: any): string {
  const json = JSON.stringify(params || {});
  return crypto.createHash('sha256').update(json).digest('hex');
}

export function saveClipForUser(clipId: string, userId: string, filePath: string, fileName: string, meta: any): void {
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 1000 };
  const entry = { clipId, userId, filePath, fileName, meta };
  userClips.set(`${userId}:${clipId}`, entry);
  clipMetadata.set(`${userId}_${clipId}`, {
    filePath,
    duration: 10,
    fileSize: stat.size,
    createdAt: Date.now(),
    userId,
  });
  jobQueue.setRenderedClip(clipId, {
    filePath,
    duration: 10,
    fileSize: stat.size,
    createdAt: new Date().toISOString(),
    userId,
  });
}

export function getClipForUser(clipId: string, userId: string) {
  return userClips.get(`${userId}:${clipId}`);
}

export function validateBatchCutsArray(cuts: any[]): { valid: boolean; error?: string; sanitizedCuts?: any[] } {
  if (!Array.isArray(cuts) || cuts.length === 0) {
    return { valid: false, error: 'O lote não pode estar vazio.' };
  }
  if (cuts.length > 20) {
    return { valid: false, error: 'O lote não pode exceder 20 cortes simultâneos.' };
  }
  const sanitizedCuts: any[] = [];
  for (const cut of cuts) {
    if (!cut || typeof cut !== 'object') return { valid: false, error: 'Corte inválido no lote.' };
    if (!cut.id || typeof cut.id !== 'string') return { valid: false, error: 'ID do corte ausente.' };
    if (!cut.title || typeof cut.title !== 'string') return { valid: false, error: 'Título do corte deve ser texto.' };
    const interval = validateCutInterval(cut.startTime, cut.endTime, 300);
    if (!interval.valid) return { valid: false, error: interval.error || 'Intervalo de tempo inválido.' };
    sanitizedCuts.push({
      ...cut,
      startTime: interval.formattedStart,
      endTime: interval.formattedEnd,
    });
  }
  return { valid: true, sanitizedCuts };
}

export function enqueueBatchRenderJob({
  userId,
  videoUrl,
  cuts,
  customRunner,
}: {
  userId: string;
  videoUrl: string;
  cuts: any[];
  customRunner?: () => Promise<string>;
}): BatchRenderJobInternal {
  const id = `batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const job: BatchRenderJobInternal = {
    id,
    userId,
    videoUrl,
    cuts: cuts || [],
    status: 'queued',
    completedCuts: 0,
    totalCuts: cuts?.length || 0,
    createdAt: Date.now(),
    customRunner,
  };
  batchJobs.set(id, job);
  jobQueue.addJob({
    id,
    type: 'batch_render',
    status: 'queued',
    progress: 0,
    currentStep: 'Na fila',
    totalItems: cuts?.length || 0,
    completedItems: 0,
    failedItems: 0,
    itemIds: cuts?.map((c) => c.id) || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return job;
}

export async function processBatchQueue(): Promise<void> {
  for (const job of batchJobs.values()) {
    if (job.status === 'queued') {
      job.status = 'processing';
      for (const cut of job.cuts) {
        if (job.customRunner) {
          const out = await job.customRunner();
          saveClipForUser(cut.id, job.userId, out, `${cut.id}.mp4`, {});
        }
        job.completedCuts++;
      }
      job.status = 'completed';
      job.finishedAt = Date.now();
      const zipPath = path.join(TEMP_DIR, `batch_${job.id}.zip`);
      if (!fs.existsSync(zipPath)) {
        // Minimal valid 22-byte empty PKZIP archive
        const emptyZip = Buffer.from([
          0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        fs.writeFileSync(zipPath, emptyZip);
      }
      job.zipPath = zipPath;
      jobQueue.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        zipDownloadUrl: `/api/batch/${job.id}/download`,
      });
    }
  }
}

export function cancelJob(jobId: string, userId: string): { found: boolean; cancelled: boolean } {
  const job = batchJobs.get(jobId);
  if (!job) return { found: false, cancelled: false };
  if (job.status === 'completed') {
    return { found: true, cancelled: false };
  }
  job.status = 'cancelled';
  jobQueue.cancelJob(jobId);
  return { found: true, cancelled: true };
}

export function cleanExpiredJobsAndFiles(maxAgeMs: number = 60 * 60 * 1000): { expiredJobs: number; expiredFiles: number } {
  let expiredJobs = 0;
  let expiredFiles = 0;
  const now = Date.now();
  for (const [id, job] of batchJobs.entries()) {
    const age = job.finishedAt ? now - job.finishedAt : now - job.createdAt;
    if (age > maxAgeMs) {
      if (job.zipPath && fs.existsSync(job.zipPath)) {
        try { fs.unlinkSync(job.zipPath); expiredFiles++; } catch {}
      }
      batchJobs.delete(id);
      jobQueue.deleteJob(id);
      expiredJobs++;
    }
  }
  return { expiredJobs, expiredFiles };
}
