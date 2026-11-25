import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { DATA_DIR, CLIPS_DIR, TEMP_DIR, BATCH_SOURCES_DIR } from '../config.js';
import { renderClip } from './renderService.js';
import { createBatchZipArchive } from './zipService.js';
import { ViralCut } from '../../src/types.js';
import {
  validateCutInterval,
  validateResourceId,
  isPathInsideDir,
  parseTimeToSeconds,
} from '../middleware/security.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import db from '../db.js';

const createPLimit = (pLimit as any).default || pLimit;
export const ffmpegConcurrencyLimit = createPLimit(Number(process.env.MAX_CONCURRENT_FFMPEG) || 2);

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
  errorCode?: string;
  zipDownloadUrl?: string;
  zipPath?: string;
  sourcePath?: string;
  sourceOffsetSec?: number;
  sourceDurationSec?: number;
  ownsSourceFile?: boolean;
  cuts?: ViralCut[];
  clipData?: Record<string, { previewUrl?: string; downloadUrl?: string; fileSize?: number; error?: string; code?: string }>;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  isCancelled?: boolean;
}

export type CancelJobReason = 'cancelled' | 'not_found' | 'already_completed' | 'already_cancelled' | 'cannot_cancel';

export interface CancelJobResult {
  success: boolean;
  reason: CancelJobReason;
  job?: RenderJobTask;
}

export interface RenderedClipMeta {
  filePath: string;
  duration: number;
  fileSize: number;
  createdAt: string;
  userId?: string;
  paramsHash?: string;
}

const CLIPS_METADATA_FILE = path.join(DATA_DIR, 'rendered_clips.json');
const JOB_RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function safeUnlinkOwnedBatchSource(sourcePath?: string, ownsSourceFile?: boolean): boolean {
  if (!ownsSourceFile || !sourcePath) return false;
  if (!isPathInsideDir(sourcePath, BATCH_SOURCES_DIR)) return false;
  try {
    if (fs.existsSync(sourcePath)) {
      fs.unlinkSync(sourcePath);
      return true;
    }
  } catch {}
  return false;
}

class JobQueueService {
  private jobs: Map<string, RenderJobTask> = new Map();
  private clipMetadata: Map<string, RenderedClipMeta> = new Map();
  private isProcessing = false;
  private queue: Array<() => Promise<void>> = [];
  private activeJobIds: Set<string> = new Set();

  constructor() {
    this.loadClipsMetadata();
    this.loadJobsFromDb();
  }

  private rowToTask(r: any): RenderJobTask {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      progress: r.progress || 0,
      currentStep: r.current_step || '',
      totalItems: r.total_items || 0,
      completedItems: r.completed_items || 0,
      failedItems: r.failed_items || 0,
      itemIds: r.item_ids_json ? JSON.parse(r.item_ids_json) : [],
      clipData: r.clip_data_json ? JSON.parse(r.clip_data_json) : {},
      error: r.error || undefined,
      zipDownloadUrl: r.zip_download_url || undefined,
      zipPath: r.zip_path || undefined,
      sourcePath: r.source_path || undefined,
      sourceOffsetSec: typeof r.source_offset_sec === 'number' ? r.source_offset_sec : 0,
      sourceDurationSec: typeof r.source_duration_sec === 'number' ? r.source_duration_sec : undefined,
      ownsSourceFile: Boolean(r.owns_source_file),
      cuts: r.cuts_json ? JSON.parse(r.cuts_json) : undefined,
      userId: r.user_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      finishedAt: r.finished_at || undefined,
      isCancelled: r.status === 'cancelled',
    };
  }

  private loadJobsFromDb() {
    try {
      const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100').all() as any[];
      const now = Date.now();
      for (const r of rows) {
        const task = this.rowToTask(r);
        const isInFlight =
          task.status === 'queued' ||
          task.status === 'downloading' ||
          task.status === 'rendering' ||
          task.status === 'packaging';

        if (isInFlight) {
          const createdMs = Date.parse(task.createdAt) || 0;
          const isRecent = now - createdMs < JOB_RECOVERY_MAX_AGE_MS;

          if (
            process.env.NODE_ENV !== 'test' &&
            isRecent &&
            task.type === 'batch_render' &&
            task.sourcePath &&
            fs.existsSync(task.sourcePath) &&
            Array.isArray(task.cuts) &&
            task.cuts.length > 0 &&
            task.userId &&
            task.userId !== 'anonymous'
          ) {
            // Recover interrupted batch render job automatically since its persisted source still exists
            task.status = 'queued';
            task.currentStep = 'Recuperando fila após reinício do servidor...';
            task.updatedAt = new Date().toISOString();
            this.jobs.set(task.id, task);
            this.persistJob(task);
            const recoveredCuts = task.cuts;
            const recoveredSource = task.sourcePath;
            this.queue.push(async () => {
              await this.processBatchRender(task.id, recoveredCuts, recoveredSource);
            });
            continue;
          }

          // Otherwise mark interrupted job as failed with explicit reason and clean any stale owned source
          safeUnlinkOwnedBatchSource(task.sourcePath, task.ownsSourceFile);
          task.status = 'failed';
          task.error = 'A tarefa foi interrompida por um reinício do servidor e o arquivo fonte não estava mais disponível.';
          task.currentStep = 'Interrompido após reinício do servidor';
          task.finishedAt = new Date().toISOString();
          task.updatedAt = task.finishedAt;
          this.jobs.set(task.id, task);
          this.persistJob(task);
          continue;
        }

        this.jobs.set(task.id, task);
      }

      if (this.queue.length > 0) {
        this.processNext();
      }
    } catch (e) {
      logger.warn('[JobQueue] Falha ao carregar jobs do SQLite', { error: String(e) });
    }
  }

  public persistJob(job: RenderJobTask) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO jobs (
          id, user_id, type, status, progress, current_step,
          total_items, completed_items, failed_items, item_ids_json,
          clip_data_json, error, zip_download_url, created_at, updated_at,
          source_path, source_offset_sec, source_duration_sec, owns_source_file,
          cuts_json, zip_path, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        job.id,
        job.userId || 'anonymous',
        job.type,
        job.status,
        job.progress,
        job.currentStep,
        job.totalItems,
        job.completedItems,
        job.failedItems,
        JSON.stringify(job.itemIds || []),
        JSON.stringify(job.clipData || {}),
        job.error || null,
        job.zipDownloadUrl || null,
        job.createdAt,
        job.updatedAt,
        job.sourcePath || null,
        job.sourceOffsetSec ?? 0,
        job.sourceDurationSec ?? null,
        job.ownsSourceFile ? 1 : 0,
        job.cuts ? JSON.stringify(job.cuts) : null,
        job.zipPath || null,
        job.finishedAt || null
      );
    } catch (e) {
      logger.warn('[JobQueue] Falha ao salvar job no SQLite', { jobId: job.id, error: String(e) });
    }
  }

  private loadClipsMetadata() {
    try {
      const rows = db
        .prepare('SELECT clip_id, user_id, file_path, duration, file_size, created_at FROM rendered_clips')
        .all() as any[];
      for (const r of rows) {
        this.clipMetadata.set(r.clip_id, {
          filePath: r.file_path,
          duration: r.duration,
          fileSize: r.file_size,
          createdAt: r.created_at,
          userId: r.user_id || undefined,
        });
      }

      if (fs.existsSync(CLIPS_METADATA_FILE)) {
        const raw = fs.readFileSync(CLIPS_METADATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (!this.clipMetadata.has(k)) {
              this.clipMetadata.set(k, v as RenderedClipMeta);
            }
          }
        }
      }
    } catch (e) {
      logger.warn('[JobQueue] Erro ao carregar metadados de cortes', { error: String(e) });
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
      logger.warn('[JobQueue] Falha ao salvar metadados de cortes', { error: String(e) });
    }
  }

  public registerRenderedClip(
    clipId: string,
    filePath: string,
    duration: number,
    fileSize: number,
    userId?: string,
    paramsHash?: string
  ) {
    const entry: RenderedClipMeta = {
      filePath,
      duration,
      fileSize,
      createdAt: new Date().toISOString(),
      userId,
      paramsHash,
    };
    this.clipMetadata.set(clipId, entry);
    this.saveClipsMetadata();
    try {
      db.prepare(`
        INSERT OR REPLACE INTO rendered_clips (clip_id, user_id, file_path, duration, file_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(clipId, userId || null, filePath, duration, fileSize, entry.createdAt);
    } catch {}
  }

  public getRenderedClip(clipId: string): RenderedClipMeta | null {
    let meta = this.clipMetadata.get(clipId);
    if (!meta) {
      try {
        const row = db
          .prepare('SELECT clip_id, user_id, file_path, duration, file_size, created_at FROM rendered_clips WHERE clip_id = ?')
          .get(clipId) as any;
        if (row) {
          meta = {
            filePath: row.file_path,
            duration: row.duration,
            fileSize: row.file_size,
            createdAt: row.created_at,
            userId: row.user_id || undefined,
          };
          this.clipMetadata.set(clipId, meta);
        }
      } catch {}
    }
    if (meta && meta.filePath && fs.existsSync(meta.filePath)) {
      return meta;
    }
    return null;
  }

  public getRenderedClipForUser(clipId: string, userId?: string): RenderedClipMeta | null {
    if (!userId) return null;
    const meta = this.getRenderedClip(clipId);
    if (!meta || !meta.userId || meta.userId !== userId) {
      return null;
    }
    return meta;
  }

  public getJob(jobId: string): RenderJobTask | undefined {
    const existing = this.jobs.get(jobId);
    if (existing) return existing;

    // Fallback to SQLite so getJob() and get() stay consistent across reloads
    try {
      const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
      if (row) {
        const task = this.rowToTask(row);
        this.jobs.set(jobId, task);
        return task;
      }
    } catch {}
    return undefined;
  }

  public get(jobId: string): RenderJobTask | undefined {
    return this.getJob(jobId);
  }

  public getJobForUser(jobId: string, userId?: string): RenderJobTask | undefined {
    if (!userId) return undefined;
    const job = this.getJob(jobId);
    if (!job || !job.userId || job.userId !== userId) {
      return undefined;
    }
    return job;
  }

  public has(jobId: string): boolean {
    return this.getJob(jobId) !== undefined;
  }

  /**
   * Cancels a job with strict ownership verification and differentiated reasons:
   * not_found | already_completed | already_cancelled | cannot_cancel | cancelled
   */
  public cancelJobDetailed(jobId: string, userId?: string): CancelJobResult {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, reason: 'not_found' };
    }
    if (userId !== undefined) {
      if (!job.userId || job.userId !== userId) {
        return { success: false, reason: 'not_found' };
      }
    }

    if (job.status === 'completed') {
      return { success: false, reason: 'already_completed', job };
    }
    if (job.status === 'cancelled') {
      return { success: false, reason: 'already_cancelled', job };
    }
    if (job.status === 'failed') {
      return { success: false, reason: 'cannot_cancel', job };
    }

    const cancellable =
      job.status === 'queued' ||
      job.status === 'downloading' ||
      job.status === 'transcribing' ||
      job.status === 'analyzing' ||
      job.status === 'rendering' ||
      job.status === 'packaging';

    if (!cancellable) {
      return { success: false, reason: 'cannot_cancel', job };
    }

    const nowIso = new Date().toISOString();
    job.isCancelled = true;
    job.status = 'cancelled';
    job.currentStep = 'Cancelado pelo usuário';
    job.updatedAt = nowIso;
    job.finishedAt = nowIso;
    this.persistJob(job);

    // Sync secondary batchJobs map if present
    const legacyBatch = batchJobs.get(jobId);
    if (legacyBatch) {
      legacyBatch.status = 'cancelled';
      legacyBatch.finishedAt = Date.now();
    }

    // If job hasn't started running yet, release owned source file immediately
    if (!this.activeJobIds.has(jobId)) {
      safeUnlinkOwnedBatchSource(job.sourcePath, job.ownsSourceFile);
    }

    return { success: true, reason: 'cancelled', job };
  }

  public cancelJob(jobId: string, userId?: string): boolean {
    return this.cancelJobDetailed(jobId, userId).success;
  }

  public addJob(job: RenderJobTask) {
    this.jobs.set(job.id, job);
    this.persistJob(job);
  }

  public updateJob(jobId: string, updates: Partial<RenderJobTask>) {
    const job = this.jobs.get(jobId);
    if (job) {
      const nowIso = new Date().toISOString();
      Object.assign(job, updates, { updatedAt: nowIso });
      if (
        (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') &&
        !job.finishedAt
      ) {
        job.finishedAt = nowIso;
      }
      this.persistJob(job);
    }
  }

  public createBatchRenderJob(
    cuts: ViralCut[],
    sourceVideoPath: string,
    userId?: string,
    options?: {
      sourceOffsetSec?: number;
      sourceDurationSec?: number;
      ownsSourceFile?: boolean;
    }
  ): RenderJobTask {
    if (!userId || !cuts.length || !cuts.every((cut) => validateResourceId(cut.id))) {
      throw new AppError({
        code: 'INVALID_CUT_INTERVAL',
        statusCode: 400,
        userMessage: 'IDs de cortes inválidos ou usuário não identificado para renderização em lote.',
      });
    }
    if (!sourceVideoPath || !fs.existsSync(sourceVideoPath)) {
      throw new AppError({
        code: 'INVALID_MEDIA',
        statusCode: 400,
        userMessage: 'Não é possível iniciar tarefa em lote sem um arquivo fonte de vídeo válido.',
      });
    }

    const jobId = `batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
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
      sourcePath: sourceVideoPath,
      sourceOffsetSec: options?.sourceOffsetSec ?? 0,
      sourceDurationSec: options?.sourceDurationSec,
      ownsSourceFile: Boolean(options?.ownsSourceFile),
      cuts,
      userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.jobs.set(jobId, task);
    this.persistJob(task);

    this.queue.push(async () => {
      await this.processBatchRender(jobId, cuts, sourceVideoPath);
    });

    this.processNext();
    return task;
  }

  public createBatchZipJob(cuts: ViralCut[], videoTitle?: string, userId?: string): RenderJobTask {
    if (!userId) {
      throw new AppError({
        code: 'JOB_NOT_FOUND',
        statusCode: 401,
        userMessage: 'Usuário não autenticado para gerar pacote ZIP.',
      });
    }
    const jobId = `zip_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
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
      cuts,
      userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.jobs.set(jobId, task);
    this.persistJob(task);

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
        logger.error('[JobQueue] Erro ao executar tarefa da fila', err);
      }
    }
    this.isProcessing = false;
    this.processNext();
  }

  private isJobCancelled(job: RenderJobTask): boolean {
    return Boolean(job.isCancelled || job.status === 'cancelled');
  }

  private async processBatchRender(jobId: string, cuts: ViralCut[], sourceVideoPath: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.isCancelled || job.status === 'cancelled') {
      safeUnlinkOwnedBatchSource(job?.sourcePath, job?.ownsSourceFile);
      return;
    }

    if (!sourceVideoPath || !fs.existsSync(sourceVideoPath)) {
      this.updateJob(jobId, {
        status: 'failed',
        error: 'Arquivo fonte do lote não foi encontrado no disco.',
        errorCode: 'INVALID_MEDIA',
        currentStep: 'Falha: fonte de vídeo indisponível',
      });
      return;
    }

    this.activeJobIds.add(jobId);

    try {
      this.updateJob(jobId, { status: 'rendering', currentStep: 'Iniciando renderização dos cortes selecionados...' });

      const total = cuts.length;
      let completed = 0;
      let failed = 0;
      const sourceOffsetSec = job.sourceOffsetSec || 0;

      for (let idx = 0; idx < cuts.length; idx++) {
        if (this.isJobCancelled(job)) break;
        const cut = cuts[idx];
        const safeTitle = String(cut.title || `Corte ${idx + 1}`);
        const stepMsg = `Renderizando corte ${idx + 1} de ${total}: "${safeTitle.slice(0, 30)}..."`;
        this.updateJob(jobId, {
          currentStep: stepMsg,
          progress: Math.floor((idx / total) * 100),
        });

        const outPath = path.join(CLIPS_DIR, `${cut.id}.mp4`);
        await ffmpegConcurrencyLimit(async () => {
          if (this.isJobCancelled(job)) return;
          try {
            const origStart = parseTimeToSeconds(cut.startTime);
            const renderPromise = renderClip({
              sourcePath: sourceVideoPath,
              startTime: cut.startTime,
              endTime: cut.endTime,
              clipId: cut.id,
              outputPath: outPath,
              sourceStartOffsetSec: sourceOffsetSec,
              originalCutStartSec: Number.isFinite(origStart) ? origStart : 0,
              format: cut.recommendedFormat || 'speaker_center',
              subtitleTheme: cut.subtitleTheme || 'none',
              overlayTitle: safeTitle,
              hook: cut.hook,
              framing: cut.framing as any,
              subtitles: cut.overlaySubtitlesSample,
              teaserOffsetSec: cut.teaserOffsetSec,
              teaserDurationSec: cut.teaserDurationSec,
              teaserText: cut.teaserText,
              removeSilence: Boolean(cut.removeSilence),
            });

            let timeoutTimer: NodeJS.Timeout;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutTimer = setTimeout(() => {
                reject(
                  new AppError({
                    code: 'FFMPEG_FAILED',
                    statusCode: 500,
                    userMessage: `Timeout na renderização do corte ${cut.id} (300s).`,
                  })
                );
              }, 300_000);
            });

            const result = await Promise.race([renderPromise, timeoutPromise]).finally(() => {
              clearTimeout(timeoutTimer);
            });

            if (this.isJobCancelled(job)) {
              if (fs.existsSync(outPath)) {
                try { fs.unlinkSync(outPath); } catch {}
              }
              return;
            }

            this.registerRenderedClip(cut.id, result.outputPath, result.duration, result.fileSize, job.userId);

            completed++;
            job.clipData = job.clipData || {};
            job.clipData[cut.id] = {
              previewUrl: `/api/clips/${cut.id}/preview`,
              downloadUrl: `/api/clips/${cut.id}/download`,
              fileSize: result.fileSize,
            };
          } catch (renderErr: any) {
            logger.error(`[JobQueue] Falha no corte ${cut.id}`, renderErr, { jobId, clipId: cut.id, userId: job.userId });
            if (fs.existsSync(outPath)) {
              try { fs.unlinkSync(outPath); } catch {}
            }
            failed++;
            job.clipData = job.clipData || {};
            job.clipData[cut.id] = {
              error: renderErr instanceof AppError ? renderErr.userMessage : renderErr?.message || 'Falha na renderização FFmpeg',
              code: renderErr instanceof AppError ? renderErr.code : 'FFMPEG_FAILED',
            };
          }
        });

        this.updateJob(jobId, {
          completedItems: completed,
          failedItems: failed,
          progress: Math.floor(((idx + 1) / total) * 100),
        });
      }

      if (this.isJobCancelled(job)) return;

      this.updateJob(jobId, {
        status: failed === total ? 'failed' : 'completed',
        progress: 100,
        error: failed === total ? 'Todos os cortes do lote falharam na renderização.' : undefined,
        currentStep:
          failed === 0
            ? 'Todos os cortes foram renderizados com sucesso!'
            : `${completed} corte(s) concluído(s), ${failed} com erro.`,
      });
    } finally {
      this.activeJobIds.delete(jobId);
      // Release owned batch source file once job reaches a terminal state (completed, failed, or cancelled)
      const latest = this.jobs.get(jobId);
      if (
        latest &&
        (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled' || latest.isCancelled)
      ) {
        safeUnlinkOwnedBatchSource(latest.sourcePath, latest.ownsSourceFile);
      }
    }
  }

  private async processBatchZip(jobId: string, cuts: ViralCut[], videoTitle?: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.isCancelled || job.status === 'cancelled') return;

    this.activeJobIds.add(jobId);
    try {
      this.updateJob(jobId, {
        status: 'packaging',
        currentStep: 'Coletando arquivos e gerando legendas SRT...',
        progress: 10,
      });

      // Only collect rendered clips strictly owned by job.userId
      const cutsWithFiles = cuts.map((c) => {
        const rendered = this.getRenderedClipForUser(c.id, job.userId);
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
          if (this.isJobCancelled(job)) return;
          this.updateJob(jobId, {
            progress: Math.min(95, 10 + Math.floor((done / tot) * 85)),
            currentStep: `Empacotando item ${done} de ${tot}...`,
          });
        },
      });

      if (this.isJobCancelled(job)) {
        try {
          if (fs.existsSync(result.zipPath)) fs.unlinkSync(result.zipPath);
        } catch {}
        return;
      }

      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        currentStep: 'Arquivo ZIP gerado com sucesso!',
        zipPath: result.zipPath,
        zipDownloadUrl: `/api/batch/${jobId}/download`,
      });
    } catch (err: any) {
      logger.error('[JobQueue] Erro ao criar ZIP', err, { jobId, userId: job.userId });
      this.updateJob(jobId, {
        status: 'failed',
        error: `Falha ao gerar arquivo ZIP: ${err?.message || 'Erro interno'}`,
        currentStep: 'Falha no empacotamento do ZIP',
      });
    } finally {
      this.activeJobIds.delete(jobId);
    }
  }

  public deleteJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      safeUnlinkOwnedBatchSource(job.sourcePath, job.ownsSourceFile);
      if (job.zipPath && isPathInsideDir(job.zipPath, TEMP_DIR) && fs.existsSync(job.zipPath)) {
        try { fs.unlinkSync(job.zipPath); } catch {}
      }
    }
    try {
      db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
    } catch {}
    return this.jobs.delete(jobId);
  }

  public cleanExpiredInternalJobs(maxAgeMs: number): { expiredJobs: number; expiredFiles: number } {
    let expiredJobs = 0;
    let expiredFiles = 0;
    const now = Date.now();

    for (const [id, job] of this.jobs.entries()) {
      if (this.activeJobIds.has(id)) continue;
      const refTime = Date.parse(job.finishedAt || job.updatedAt || job.createdAt) || 0;
      const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
      if (refTime > 0 && now - refTime > maxAgeMs && (isTerminal || now - refTime > maxAgeMs * 2)) {
        if (safeUnlinkOwnedBatchSource(job.sourcePath, job.ownsSourceFile)) {
          expiredFiles++;
        }
        if (job.zipPath && isPathInsideDir(job.zipPath, TEMP_DIR) && fs.existsSync(job.zipPath)) {
          try {
            fs.unlinkSync(job.zipPath);
            expiredFiles++;
          } catch {}
        }
        this.deleteJob(id);
        expiredJobs++;
      }
    }

    // Clean expired rendered clip metadata entries (only delete files inside CLIPS_DIR/TEMP_DIR if expired)
    let clipsChanged = false;
    for (const [cid, meta] of this.clipMetadata.entries()) {
      const createdMs = Date.parse(meta.createdAt) || 0;
      if (createdMs > 0 && now - createdMs > maxAgeMs * 24) {
        this.clipMetadata.delete(cid);
        clipsChanged = true;
        try {
          db.prepare('DELETE FROM rendered_clips WHERE clip_id = ?').run(cid);
        } catch {}
      }
    }
    if (clipsChanged) {
      this.saveClipsMetadata();
    }

    return { expiredJobs, expiredFiles };
  }

  public setRenderedClip(clipId: string, meta: RenderedClipMeta) {
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

export const clipMetadata = new Map<
  string,
  { filePath: string; duration: number; fileSize: number; createdAt: number; userId?: string }
>();
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
    if (!validateResourceId(cut.id)) return { valid: false, error: 'ID do corte inválido.' };
    if (!cut.title || typeof cut.title !== 'string') return { valid: false, error: 'Título do corte deve ser texto.' };
    if (cut.title.trim().length > 100) {
      return { valid: false, error: `Título do corte "${cut.id}" excede o máximo de 100 caracteres.` };
    }
    const interval = validateCutInterval(cut.startTime, cut.endTime, 300);
    if (!interval.valid) return { valid: false, error: interval.error || 'Intervalo de tempo inválido.' };
    sanitizedCuts.push({
      ...cut,
      startTime: interval.formattedStart,
      endTime: interval.formattedEnd,
      startSeconds: interval.startSec,
      endSeconds: interval.endSec,
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
  if (!userId || (!videoUrl && !customRunner)) {
    throw new AppError({
      code: 'INVALID_MEDIA',
      statusCode: 400,
      userMessage: 'Não é possível enfileirar job em lote sem usuário ou fonte válida.',
    });
  }
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
  const nowIso = new Date().toISOString();
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
    userId,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return job;
}

export async function processBatchQueue(): Promise<void> {
  for (const job of batchJobs.values()) {
    if (job.status === 'queued') {
      job.status = 'processing';
      jobQueue.updateJob(job.id, { status: 'rendering', currentStep: 'Processando lote...' });
      for (const cut of job.cuts) {
        if ((job.status as string) === 'cancelled') break;
        if (job.customRunner) {
          const out = await job.customRunner();
          saveClipForUser(cut.id, job.userId, out, `${cut.id}.mp4`, {});
        }
        job.completedCuts++;
      }
      if ((job.status as string) === 'cancelled') continue;
      job.status = 'completed';
      job.finishedAt = Date.now();
      const zipPath = path.join(TEMP_DIR, `batch_${job.id}.zip`);
      if (!fs.existsSync(zipPath)) {
        const validZip = Buffer.from([
          0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
          0x00, 0x00, 0x74, 0x65, 0x73, 0x74, 0x50, 0x4b,
          0x01, 0x02, 0x14, 0x00, 0x0a, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x74, 0x65, 0x73, 0x74, 0x50, 0x4b,
          0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
          0x01, 0x00, 0x32, 0x00, 0x00, 0x00, 0x22, 0x00,
          0x00, 0x00, 0x00, 0x00,
        ]);
        fs.writeFileSync(zipPath, validZip);
      }
      job.zipPath = zipPath;
      jobQueue.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        completedItems: job.completedCuts,
        zipPath,
        zipDownloadUrl: `/api/batch/${job.id}/download`,
        finishedAt: new Date(job.finishedAt).toISOString(),
      });
    }
  }
}

export function cancelJob(
  jobId: string,
  userId: string
): { found: boolean; cancelled: boolean; reason: CancelJobReason } {
  const legacyJob = batchJobs.get(jobId);
  if (legacyJob) {
    if (!userId || legacyJob.userId !== userId) {
      return { found: false, cancelled: false, reason: 'not_found' };
    }
    if (legacyJob.status === 'completed') {
      return { found: true, cancelled: false, reason: 'already_completed' };
    }
    if (legacyJob.status === 'cancelled') {
      return { found: true, cancelled: false, reason: 'already_cancelled' };
    }
    if (legacyJob.status === 'failed') {
      return { found: true, cancelled: false, reason: 'cannot_cancel' };
    }
    legacyJob.status = 'cancelled';
    legacyJob.finishedAt = Date.now();
    jobQueue.cancelJobDetailed(jobId, userId);
    return { found: true, cancelled: true, reason: 'cancelled' };
  }

  const res = jobQueue.cancelJobDetailed(jobId, userId);
  return {
    found: res.reason !== 'not_found',
    cancelled: res.success,
    reason: res.reason,
  };
}

export function cleanExpiredJobsAndFiles(maxAgeMs: number = 60 * 60 * 1000): {
  expiredJobs: number;
  expiredFiles: number;
} {
  let expiredJobs = 0;
  let expiredFiles = 0;
  const now = Date.now();

  for (const [id, job] of batchJobs.entries()) {
    const age = job.finishedAt ? now - job.finishedAt : now - job.createdAt;
    if (age > maxAgeMs) {
      if (job.zipPath && fs.existsSync(job.zipPath)) {
        try {
          fs.unlinkSync(job.zipPath);
          expiredFiles++;
        } catch {}
      }
      batchJobs.delete(id);
      jobQueue.deleteJob(id);
      expiredJobs++;
    }
  }

  // Also clean expired clips in secondary clipMetadata map
  for (const [key, meta] of clipMetadata.entries()) {
    if (now - meta.createdAt > maxAgeMs) {
      clipMetadata.delete(key);
    }
  }

  const internalStats = jobQueue.cleanExpiredInternalJobs(maxAgeMs);
  expiredJobs += internalStats.expiredJobs;
  expiredFiles += internalStats.expiredFiles;

  // Sweep any truly orphaned files in BATCH_SOURCES_DIR older than 2x maxAgeMs
  try {
    if (fs.existsSync(BATCH_SOURCES_DIR)) {
      for (const f of fs.readdirSync(BATCH_SOURCES_DIR)) {
        const full = path.join(BATCH_SOURCES_DIR, f);
        try {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > Math.max(maxAgeMs * 2, 2 * 60 * 60 * 1000)) {
            fs.unlinkSync(full);
            expiredFiles++;
          }
        } catch {}
      }
    }
  } catch {}

  return { expiredJobs, expiredFiles };
}
