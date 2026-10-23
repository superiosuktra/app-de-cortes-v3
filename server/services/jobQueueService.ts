import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, CLIPS_DIR } from '../config.js';
import { renderClip, validateMediaFile } from './renderService.js';
import { createBatchZipArchive } from './zipService.js';
import { ViralCut, BatchRenderJob } from '../../src/types.js';

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

  private updateJob(jobId: string, updates: Partial<RenderJobTask>) {
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
}

export const jobQueue = new JobQueueService();
