import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import crypto from 'crypto';
import { UPLOADS_DIR, TEMP_DIR, CLIPS_DIR, BATCH_SOURCES_DIR } from '../config.js';
import { downloadYouTubeSlice, fetchYouTubeVideoDuration, YouTubeSliceMetadata } from '../services/ffmpegService.js';
import { renderClip, validateMediaFile } from '../services/renderService.js';
import { jobQueue, validateBatchCutsArray, computeClipParamsHash } from '../services/jobQueueService.js';
import { sanitizeFileName } from '../services/zipService.js';
import {
  uploadVideoToYouTube,
  ALLOWED_YOUTUBE_PRIVACY,
  MAX_YOUTUBE_TITLE_LENGTH,
  MAX_YOUTUBE_DESCRIPTION_LENGTH,
} from '../services/youtubeService.js';
import { stateManager } from '../services/stateService.js';
import {
  createRateLimiter,
  normalizeSafeYouTubeUrl,
  sanitizeTimestamp,
  isPathInsideDir,
  validateCutInterval,
  parseHttpRange,
  getUploadedFileOwner,
  registerUploadedFile,
  parseTimeToSeconds,
  formatSecondsToTimestamp,
} from '../middleware/security.js';
import { AppError, sendErrorResponse, getCorrelationId } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const cutRouter = Router();

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);
const MAX_UPLOAD_DURATION_SEC = 7200; // 2 hours
const MAX_UPLOAD_RESOLUTION = 4096; // 4K max
const MAX_USER_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB quota per user

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_VIDEO_EXTENSIONS.has(ext) ? ext : '.mp4';
    const serverGeneratedName = `up_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${safeExt}`;
    cb(null, serverGeneratedName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isVideoMime = (file.mimetype || '').startsWith('video/');
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      return cb(new Error('Extensão de arquivo não permitida. Envie apenas arquivos (.mp4, .mov, .webm, .mkv).'));
    }
    if (!isVideoMime && file.mimetype !== 'application/octet-stream') {
      return cb(new Error('Tipo MIME inválido para vídeo.'));
    }
    cb(null, true);
  },
});

const renderRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  scope: 'ffmpeg-render',
  byUser: true,
  message: 'Limite de renderizações de vídeo por minuto atingido. Aguarde a conclusão do processamento atual.',
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  scope: 'video-upload',
  byUser: true,
  message: 'Limite de uploads por minuto atingido. Aguarde alguns instantes antes de enviar outro arquivo.',
});

export async function getUserUploadStorageBytes(userId: string): Promise<number> {
  let total = 0;
  try {
    const exists = await checkFileExists(UPLOADS_DIR);
    if (!exists) return 0;
    const files = await fsPromises.readdir(UPLOADS_DIR);
    for (const f of files) {
      const fullPath = path.join(UPLOADS_DIR, f);
      if (getUploadedFileOwner(fullPath) === userId) {
        try {
          const s = await fsPromises.stat(fullPath);
          total += s.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

export async function validateUploadedFile(
  file: Express.Multer.File,
  userId: string
): Promise<{ valid: boolean; error?: string; status?: number; code?: AppError['code']; duration?: number }> {
  if (!file || !isPathInsideDir(file.path, UPLOADS_DIR)) {
    return { valid: false, error: 'Arquivo de vídeo inválido.', status: 400, code: 'INVALID_MEDIA' };
  }

  // 1. Quota check
  const currentUsage = await getUserUploadStorageBytes(userId);
  if (currentUsage + file.size > MAX_USER_STORAGE_BYTES) {
    return {
      valid: false,
      error: 'Cota de armazenamento de upload excedida (máximo de 1GB por usuário).',
      status: 413,
      code: 'STORAGE_FULL',
    };
  }

  // 2. ffprobe real content validation
  const probe = await validateMediaFile(file.path);
  if (!probe.valid || !probe.hasVideo) {
    return {
      valid: false,
      error: probe.error || 'Arquivo de vídeo inválido ou sem stream de vídeo detectado.',
      status: 400,
      code: 'INVALID_MEDIA',
    };
  }

  // 3. Duration check
  if (probe.duration > MAX_UPLOAD_DURATION_SEC) {
    return {
      valid: false,
      error: `A duração do vídeo (${Math.round(probe.duration)}s) excede o limite máximo permitido de ${MAX_UPLOAD_DURATION_SEC}s.`,
      status: 400,
      code: 'INVALID_MEDIA',
    };
  }

  // 4. Resolution check
  if (probe.width > MAX_UPLOAD_RESOLUTION || probe.height > MAX_UPLOAD_RESOLUTION) {
    return {
      valid: false,
      error: `A resolução do vídeo (${probe.width}x${probe.height}) excede o limite de ${MAX_UPLOAD_RESOLUTION}x${MAX_UPLOAD_RESOLUTION}.`,
      status: 400,
      code: 'INVALID_MEDIA',
    };
  }

  registerUploadedFile(file.path, userId);
  return { valid: true, duration: probe.duration };
}

function validateTitleAndDescriptionAndPrivacy({
  title,
  description,
  privacy,
  requirePrivacy = false,
}: {
  title?: unknown;
  description?: unknown;
  privacy?: unknown;
  requirePrivacy?: boolean;
}): { valid: boolean; error?: string; code?: AppError['code'] } {
  if (title !== undefined && title !== null) {
    const t = String(title).trim();
    if (t.length > MAX_YOUTUBE_TITLE_LENGTH) {
      return {
        valid: false,
        code: 'INVALID_CUT_INTERVAL',
        error: `O título não pode exceder ${MAX_YOUTUBE_TITLE_LENGTH} caracteres (atual: ${t.length}).`,
      };
    }
  }

  if (description !== undefined && description !== null) {
    const d = String(description);
    if (d.length > MAX_YOUTUBE_DESCRIPTION_LENGTH) {
      return {
        valid: false,
        code: 'INVALID_CUT_INTERVAL',
        error: `A descrição não pode exceder ${MAX_YOUTUBE_DESCRIPTION_LENGTH} caracteres (atual: ${d.length}).`,
      };
    }
  }

  if (requirePrivacy || (privacy !== undefined && privacy !== null && String(privacy).trim() !== '')) {
    const cleanPrivacy = String(privacy ?? '').trim().toLowerCase();
    if (!ALLOWED_YOUTUBE_PRIVACY.has(cleanPrivacy)) {
      return {
        valid: false,
        code: 'INVALID_CUT_INTERVAL',
        error: 'Privacidade inválida. Aceito somente: public, unlisted ou private.',
      };
    }
  }

  return { valid: true };
}

function parseJsonField<T>(value: any): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// 1. Render Specific Clip to CLIPS_DIR and register with JobQueue
cutRouter.post('/clips/:clipId/render', renderRateLimiter, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  let rawSourcePath: string | null = null;
  let shouldCleanupSource = false;

  try {
    const {
      videoUrl,
      sourceFilePath,
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      subtitleTheme = 'none',
      title = 'corte_viral',
      hook = '',
      framing,
      subtitles,
      transcriptSegments,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      removeSilence = false,
    } = req.body;

    const metaVal = validateTitleAndDescriptionAndPrivacy({ title });
    if (!metaVal.valid) {
      return sendErrorResponse(
        res,
        new AppError({ code: metaVal.code || 'INVALID_CUT_INTERVAL', statusCode: 400, userMessage: metaVal.error! }),
        'clips-render',
        { userId: req.userId }
      );
    }

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: intervalCheck.error || 'Intervalo de tempo inválido.',
        }),
        'clips-render',
        { userId: req.userId }
      );
    }

    const paramsHash = computeClipParamsHash({
      videoUrl,
      sourceFilePath,
      startTime: intervalCheck.formattedStart,
      endTime: intervalCheck.formattedEnd,
      format,
      subtitleTheme,
      title,
      hook,
      framing,
      subtitles,
      teaserOffsetSec,
      teaserDurationSec,
      removeSilence: Boolean(removeSilence),
    });

    // Enforce owner match AND parameter hash match on cache hit
    const existing = jobQueue.getRenderedClipForUser(clipId, req.userId);
    if (existing && existing.paramsHash && existing.paramsHash === paramsHash && (await checkFileExists(existing.filePath))) {
      return res.json({
        success: true,
        clipId,
        status: 'completed',
        previewUrl: `/api/clips/${clipId}/preview`,
        downloadUrl: `/api/clips/${clipId}/download`,
        fileSize: existing.fileSize,
        duration: existing.duration,
      });
    }

    let sliceMeta: YouTubeSliceMetadata | null = null;
    const cleanStart = intervalCheck.formattedStart!;
    const cleanEnd = intervalCheck.formattedEnd!;

    // Resolve source video
    if (sourceFilePath) {
      if (!isPathInsideDir(sourceFilePath, UPLOADS_DIR)) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 403,
            userMessage: 'Acesso negado: caminho de arquivo fora do diretório de uploads.',
          }),
          'clips-render',
          { userId: req.userId }
        );
      }
      const owner = getUploadedFileOwner(sourceFilePath);
      if (!owner || !req.userId || owner !== req.userId) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 404,
            userMessage: 'Arquivo de vídeo não encontrado.',
          }),
          'clips-render',
          { userId: req.userId }
        );
      }
      if (!(await checkFileExists(sourceFilePath))) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 404,
            userMessage: 'Arquivo de vídeo não encontrado no disco.',
          }),
          'clips-render',
          { userId: req.userId }
        );
      }

      const localProbe = await validateMediaFile(sourceFilePath);
      if (!localProbe.valid || !localProbe.hasVideo) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 400,
            userMessage: localProbe.error || 'Arquivo de vídeo local inválido.',
          }),
          'clips-render',
          { userId: req.userId }
        );
      }
      if (intervalCheck.endSec! > localProbe.duration) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_CUT_INTERVAL',
            statusCode: 400,
            userMessage: `O tempo final (${cleanEnd}) excede a duração real do vídeo (${formatSecondsToTimestamp(localProbe.duration)}).`,
          }),
          'clips-render',
          { userId: req.userId }
        );
      }

      rawSourcePath = sourceFilePath;
    } else if (videoUrl) {
      const safeYt = normalizeSafeYouTubeUrl(videoUrl);
      if (!safeYt) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'YOUTUBE_DOWNLOAD_FAILED',
            statusCode: 400,
            userMessage: 'URL do YouTube inválida ou bloqueada.',
          }),
          'clips-render',
          { userId: req.userId }
        );
      }
      sliceMeta = await downloadYouTubeSlice({
        videoUrl: safeYt.canonicalUrl,
        startTime: cleanStart,
        endTime: cleanEnd,
        userId: req.userId,
      });
      rawSourcePath = sliceMeta.filePath;
      shouldCleanupSource = true;
    } else {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_MEDIA',
          statusCode: 400,
          userMessage: 'Nenhum vídeo de origem fornecido (videoUrl ou sourceFilePath).',
        }),
        'clips-render',
        { userId: req.userId }
      );
    }

    if (!rawSourcePath || !(await checkFileExists(rawSourcePath))) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_MEDIA',
          statusCode: 400,
          userMessage: 'Falha ao obter o vídeo de origem para processamento.',
        }),
        'clips-render',
        { userId: req.userId }
      );
    }

    const targetOutPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
    const requestedDur = Math.max(1, intervalCheck.endSec! - intervalCheck.startSec!);
    const effectiveSliceDuration = sliceMeta ? Math.min(requestedDur, sliceMeta.duration) : undefined;

    const renderResult = await renderClip({
      sourcePath: rawSourcePath,
      startTime: sliceMeta ? '00:00' : cleanStart,
      endTime: sliceMeta ? formatSecondsToTimestamp(Math.ceil(effectiveSliceDuration!)) : cleanEnd,
      durationOverrideSec: effectiveSliceDuration,
      originalCutStartSec: intervalCheck.startSec!,
      clipId,
      outputPath: targetOutPath,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing,
      subtitles: Array.isArray(subtitles) ? subtitles : undefined,
      transcriptSegments: Array.isArray(transcriptSegments) ? transcriptSegments : undefined,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      removeSilence: Boolean(removeSilence),
    });

    jobQueue.registerRenderedClip(
      clipId,
      renderResult.outputPath,
      renderResult.duration,
      renderResult.fileSize,
      req.userId,
      paramsHash
    );

    return res.json({
      success: true,
      clipId,
      status: 'completed',
      previewUrl: `/api/clips/${clipId}/preview`,
      downloadUrl: `/api/clips/${clipId}/download`,
      fileSize: renderResult.fileSize,
      duration: renderResult.duration,
      width: renderResult.width,
      height: renderResult.height,
      hasAudio: renderResult.hasAudio,
    });
  } catch (err: any) {
    return sendErrorResponse(res, err, 'clips-render', { userId: req.userId });
  } finally {
    if (shouldCleanupSource && rawSourcePath) {
      await fsPromises.unlink(rawSourcePath).catch(() => {});
    }
  }
});

// 2. Stream Rendered MP4 Preview with HTTP 206 Range Support (strict metadata + ownership only, zero path fallback)
cutRouter.get('/clips/:clipId/preview', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipMeta = jobQueue.getRenderedClipForUser(clipId, req.userId);

  if (!clipMeta || !clipMeta.filePath) {
    return res.status(404).json({
      error: 'Corte não encontrado.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  const filePath = clipMeta.filePath;
  if (!isPathInsideDir(filePath, CLIPS_DIR) && !isPathInsideDir(filePath, TEMP_DIR)) {
    return res.status(404).json({
      error: 'Corte não encontrado.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  if (!(await checkFileExists(filePath))) {
    return res.status(404).json({
      error: 'Corte ainda não foi renderizado ou expirou.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
      clipId,
      status: 'pending',
    });
  }

  const stat = await fsPromises.stat(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parsedRange = parseHttpRange(range, fileSize);
    if (!parsedRange.valid) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }
    const file = fs.createReadStream(filePath, { start: parsedRange.start, end: parsedRange.end });
    const head = {
      'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': parsedRange.chunkSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 3. Download Single Rendered Cut MP4 (strict metadata + ownership only, zero path fallback)
cutRouter.get('/clips/:clipId/download', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipMeta = jobQueue.getRenderedClipForUser(clipId, req.userId);

  if (!clipMeta || !clipMeta.filePath) {
    return res.status(404).json({
      error: 'Arquivo do corte não encontrado para download.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  const filePath = clipMeta.filePath;
  if (!isPathInsideDir(filePath, CLIPS_DIR) && !isPathInsideDir(filePath, TEMP_DIR)) {
    return res.status(404).json({
      error: 'Arquivo do corte não encontrado para download.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  if (!(await checkFileExists(filePath))) {
    return res.status(404).json({
      error: 'Arquivo do corte não encontrado para download.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  const fileName = `${sanitizeFileName(clipId)}.mp4`;
  res.download(filePath, fileName);
});

// 4. Batch Render Multiple Cuts (persists source in BATCH_SOURCES_DIR and validates every cut against real video duration)
cutRouter.post('/batch/render', renderRateLimiter, async (req: Request, res: Response) => {
  let persistedBatchSource: string | null = null;
  let jobCreated = false;

  try {
    const { cuts, videoUrl, sourceFilePath } = req.body;
    if (!Array.isArray(cuts) || cuts.length === 0 || cuts.length > 20) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: 'Selecione entre 1 e 20 cortes válidos para renderização em lote.',
        }),
        'batch-render',
        { userId: req.userId }
      );
    }

    const cutsValidation = validateBatchCutsArray(cuts);
    if (!cutsValidation.valid || !cutsValidation.sanitizedCuts) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: cutsValidation.error || 'Cortes inválidos no lote.',
        }),
        'batch-render',
        { userId: req.userId }
      );
    }
    const validatedCuts = cutsValidation.sanitizedCuts;

    let sourceOffsetSec = 0;
    let sourceDurationSec = 0;

    if (sourceFilePath) {
      if (!isPathInsideDir(sourceFilePath, UPLOADS_DIR)) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 403,
            userMessage: 'Acesso negado: caminho de arquivo fora do diretório de uploads.',
          }),
          'batch-render',
          { userId: req.userId }
        );
      }
      const owner = getUploadedFileOwner(sourceFilePath);
      if (!owner || !req.userId || owner !== req.userId) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 404,
            userMessage: 'Arquivo de vídeo não encontrado.',
          }),
          'batch-render',
          { userId: req.userId }
        );
      }
      if (!(await checkFileExists(sourceFilePath))) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 404,
            userMessage: 'Arquivo de vídeo local não encontrado no disco.',
          }),
          'batch-render',
          { userId: req.userId }
        );
      }

      // Validate real duration of local source video BEFORE accepting batch cuts
      const sourceProbe = await validateMediaFile(sourceFilePath);
      if (!sourceProbe.valid || !sourceProbe.hasVideo) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 400,
            userMessage: sourceProbe.error || 'Arquivo de vídeo local inválido.',
          }),
          'batch-render',
          { userId: req.userId }
        );
      }

      for (const cut of validatedCuts) {
        if (cut.endSeconds > sourceProbe.duration) {
          return sendErrorResponse(
            res,
            new AppError({
              code: 'INVALID_CUT_INTERVAL',
              statusCode: 400,
              userMessage: `O corte "${cut.title}" termina em ${cut.endTime}, excedendo a duração real do vídeo (${formatSecondsToTimestamp(sourceProbe.duration)}).`,
            }),
            'batch-render',
            { userId: req.userId }
          );
        }
      }

      // Persist independent batch source copy so temp/upload cleanups never break an active job
      const ext = path.extname(sourceFilePath).toLowerCase() || '.mp4';
      persistedBatchSource = path.join(
        BATCH_SOURCES_DIR,
        `batch_src_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`
      );
      await fsPromises.copyFile(sourceFilePath, persistedBatchSource);
      sourceDurationSec = sourceProbe.duration;
      sourceOffsetSec = 0;
    } else {
      const safeYt = normalizeSafeYouTubeUrl(videoUrl);
      if (!safeYt) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'YOUTUBE_DOWNLOAD_FAILED',
            statusCode: 400,
            userMessage: 'URL do YouTube ou arquivo de vídeo local obrigatório.',
          }),
          'batch-render',
          { userId: req.userId }
        );
      }

      // Validate real duration of YouTube video BEFORE accepting batch cuts
      const ytDuration = await fetchYouTubeVideoDuration(safeYt.canonicalUrl, req.userId);
      if (ytDuration && ytDuration > 0) {
        for (const cut of validatedCuts) {
          if (cut.endSeconds > ytDuration) {
            return sendErrorResponse(
              res,
              new AppError({
                code: 'INVALID_CUT_INTERVAL',
                statusCode: 400,
                userMessage: `O corte "${cut.title}" termina em ${cut.endTime}, excedendo a duração real do vídeo (${formatSecondsToTimestamp(ytDuration)}).`,
              }),
              'batch-render',
              { userId: req.userId }
            );
          }
        }
      }

      const minStart = Math.min(...validatedCuts.map((c) => Number(c.startSeconds ?? 0)));
      const maxEnd = Math.max(...validatedCuts.map((c) => Number(c.endSeconds ?? c.startSeconds + 45)));
      const spanSeconds = Math.max(3, maxEnd - minStart);

      const sliceMeta = await downloadYouTubeSlice({
        videoUrl: safeYt.canonicalUrl,
        startTime: formatSecondsToTimestamp(minStart),
        endTime: formatSecondsToTimestamp(maxEnd),
        userId: req.userId,
        maxIntervalSeconds: Math.max(300, Math.min(3600, spanSeconds + 10)),
        knownVideoDurationSec: ytDuration ?? undefined,
      });

      // Validate cuts against the real downloaded slice duration
      for (const cut of validatedCuts) {
        const relEnd = cut.endSeconds - minStart;
        if (relEnd > sliceMeta.duration + 0.5) {
          await fsPromises.unlink(sliceMeta.filePath).catch(() => {});
          return sendErrorResponse(
            res,
            new AppError({
              code: 'INVALID_CUT_INTERVAL',
              statusCode: 400,
              userMessage: `O corte "${cut.title}" ultrapassa a duração real disponível do trecho baixado (${formatSecondsToTimestamp(minStart + sliceMeta.duration)}).`,
            }),
            'batch-render',
            { userId: req.userId }
          );
        }
      }

      // Move downloaded slice into persistent BATCH_SOURCES_DIR so TEMP_DIR cleanup never deletes it mid-job
      persistedBatchSource = path.join(
        BATCH_SOURCES_DIR,
        `batch_src_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.mp4`
      );
      try {
        await fsPromises.rename(sliceMeta.filePath, persistedBatchSource);
      } catch {
        await fsPromises.copyFile(sliceMeta.filePath, persistedBatchSource);
        await fsPromises.unlink(sliceMeta.filePath).catch(() => {});
      }

      sourceOffsetSec = minStart;
      sourceDurationSec = sliceMeta.duration;
    }

    const task = jobQueue.createBatchRenderJob(validatedCuts, persistedBatchSource, req.userId, {
      sourceOffsetSec,
      sourceDurationSec,
      ownsSourceFile: true,
    });
    jobCreated = true;

    return res.json({
      success: true,
      jobId: task.id,
      status: task.status,
      totalItems: task.totalItems,
      message: `Fila de renderização iniciada para ${task.totalItems} corte(s).`,
    });
  } catch (err: any) {
    if (!jobCreated && persistedBatchSource) {
      await fsPromises.unlink(persistedBatchSource).catch(() => {});
    }
    return sendErrorResponse(res, err, 'batch-render', { userId: req.userId });
  }
});

// 5. Query Batch Job Status (strict owner isolation)
cutRouter.get('/batch/:batchId', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const job = jobQueue.getJobForUser(jobId, req.userId);
  if (!job) {
    return res.status(404).json({
      error: 'Tarefa não encontrada.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }
  return res.json(job);
});

// 6. Cancel Batch Job (differentiates not_found, already_completed, already_cancelled, cannot_cancel)
cutRouter.post('/batch/:batchId/cancel', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const correlationId = getCorrelationId(res);
  const result = jobQueue.cancelJobDetailed(jobId, req.userId);

  if (result.reason === 'not_found') {
    return res.status(404).json({
      success: false,
      reason: 'not_found',
      code: 'JOB_NOT_FOUND',
      error: 'Tarefa não encontrada.',
      message: 'Tarefa não encontrada.',
      correlationId,
    });
  }

  if (result.reason === 'already_completed') {
    return res.status(409).json({
      success: false,
      reason: 'already_completed',
      code: 'JOB_CANNOT_CANCEL',
      error: 'A tarefa já foi concluída e não pode ser cancelada.',
      message: 'A tarefa já foi concluída e não pode ser cancelada.',
      correlationId,
    });
  }

  if (result.reason === 'already_cancelled') {
    return res.status(409).json({
      success: false,
      reason: 'already_cancelled',
      code: 'JOB_CANNOT_CANCEL',
      error: 'A tarefa já foi cancelada anteriormente.',
      message: 'A tarefa já foi cancelada anteriormente.',
      correlationId,
    });
  }

  if (result.reason === 'cannot_cancel') {
    return res.status(409).json({
      success: false,
      reason: 'cannot_cancel',
      code: 'JOB_CANNOT_CANCEL',
      error: 'A tarefa está em um estado final que não permite cancelamento.',
      message: 'A tarefa está em um estado final que não permite cancelamento.',
      correlationId,
    });
  }

  return res.json({
    success: true,
    reason: 'cancelled',
    status: 'cancelled',
    message: 'Tarefa cancelada com sucesso.',
    correlationId,
  });
});

// 7. Enqueue Bulk ZIP Generation (Selected Cuts or All)
cutRouter.post('/clips/bulk-download', async (req: Request, res: Response) => {
  try {
    const { cuts, videoTitle } = req.body;
    if (!Array.isArray(cuts) || cuts.length === 0) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: 'Nenhum corte fornecido para empacotamento em ZIP.',
        }),
        'bulk-download',
        { userId: req.userId }
      );
    }

    const task = jobQueue.createBatchZipJob(cuts, videoTitle, req.userId);
    return res.json({
      success: true,
      jobId: task.id,
      status: task.status,
      totalItems: task.totalItems,
      message: `Empacotamento ZIP iniciado para ${task.totalItems} corte(s).`,
    });
  } catch (err: any) {
    return sendErrorResponse(res, err, 'bulk-download', { userId: req.userId });
  }
});

// 8. Download Completed ZIP File (strict owner isolation + exact deterministic ZIP path)
cutRouter.get('/batch/:batchId/download', async (req: Request, res: Response) => {
  const jobId = String(req.params.batchId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const job = jobQueue.getJobForUser(jobId, req.userId);
  if (!job) {
    return res.status(404).json({
      error: 'Arquivo ZIP não encontrado.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  const zipName = `batch_${jobId}.zip`;
  const zipPath = job.zipPath && isPathInsideDir(job.zipPath, TEMP_DIR) ? job.zipPath : path.join(TEMP_DIR, zipName);

  if (!isPathInsideDir(zipPath, TEMP_DIR) || !(await checkFileExists(zipPath))) {
    return res.status(404).json({
      error: 'Arquivo ZIP ainda não está pronto ou expirou.',
      code: 'JOB_NOT_FOUND',
      correlationId: getCorrelationId(res),
    });
  }

  res.setHeader('Content-Type', 'application/zip');
  return res.download(zipPath, zipName);
});

// 9. Legacy /download-youtube-cut with real slice metadata and persistent CLIPS_DIR output
cutRouter.post('/download-youtube-cut', renderRateLimiter, async (req: Request, res: Response) => {
  let rawSlicePath: string | null = null;
  try {
    const {
      videoUrl,
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      subtitleTheme = 'none',
      title = 'corte_viral',
      hook = '',
      framing,
      subtitles,
      transcriptSegments,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      removeSilence = false,
    } = req.body;

    const metaVal = validateTitleAndDescriptionAndPrivacy({ title });
    if (!metaVal.valid) {
      return sendErrorResponse(
        res,
        new AppError({ code: metaVal.code || 'INVALID_CUT_INTERVAL', statusCode: 400, userMessage: metaVal.error! }),
        'download-youtube-cut',
        { userId: req.userId }
      );
    }

    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    if (!safeYt) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'YOUTUBE_DOWNLOAD_FAILED',
          statusCode: 400,
          userMessage: 'URL do YouTube inválida ou bloqueada.',
        }),
        'download-youtube-cut',
        { userId: req.userId }
      );
    }

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: intervalCheck.error || 'Intervalo de tempo inválido.',
        }),
        'download-youtube-cut',
        { userId: req.userId }
      );
    }

    const cleanStart = intervalCheck.formattedStart!;
    const cleanEnd = intervalCheck.formattedEnd!;

    logger.info('[CutRoutes] Corte direto do YouTube', {
      action: 'download_youtube_cut',
      videoId: safeYt.videoId,
      startTime: cleanStart,
      endTime: cleanEnd,
      userId: req.userId,
    });

    const sliceMeta = await downloadYouTubeSlice({
      videoUrl: safeYt.canonicalUrl,
      startTime: cleanStart,
      endTime: cleanEnd,
      userId: req.userId,
    });
    rawSlicePath = sliceMeta.filePath;

    const clipId = `cut_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
    const requestedDur = Math.max(1, intervalCheck.endSec! - intervalCheck.startSec!);
    const effectiveDur = Math.min(requestedDur, sliceMeta.duration);

    const renderResult = await renderClip({
      sourcePath: sliceMeta.filePath,
      startTime: '00:00',
      endTime: formatSecondsToTimestamp(Math.ceil(effectiveDur)),
      durationOverrideSec: effectiveDur,
      originalCutStartSec: intervalCheck.startSec!,
      clipId,
      outputPath: outPath,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing,
      subtitles: Array.isArray(subtitles) ? subtitles : undefined,
      transcriptSegments: Array.isArray(transcriptSegments) ? transcriptSegments : undefined,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      removeSilence: Boolean(removeSilence),
    });

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize, req.userId);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    return res.download(outPath, `${safeTitle}.mp4`);
  } catch (err: any) {
    return sendErrorResponse(res, err, 'download-youtube-cut', { userId: req.userId });
  } finally {
    if (rawSlicePath) {
      await fsPromises.unlink(rawSlicePath).catch(() => {});
    }
  }
});

// 10. Upload Local Video File, Cut with FFmpeg, Register Clip BEFORE Publish, and Post to YouTube
// Also supports retrying publish for an already-rendered clipId without re-rendering!
cutRouter.post('/upload-and-cut-short', uploadRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(res);
  try {
    if (!req.userId) {
      if (req.file?.path) await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(401).json({
        error: 'Acesso não autorizado. Faça login para continuar.',
        code: 'YOUTUBE_UPLOAD_FAILED',
        correlationId,
      });
    }

    const {
      clipId: requestedClipId,
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      subtitleTheme = 'none',
      title = 'Corte Viral #Shorts',
      description = '',
      privacy = 'public',
      tags = '',
      token = '',
      refreshToken = '',
      hook = '',
      framing,
      removeSilence = false,
    } = req.body || {};

    // Validate privacy, title (<=100), description (<=5000)
    const metaCheck = validateTitleAndDescriptionAndPrivacy({
      title,
      description,
      privacy,
      requirePrivacy: true,
    });
    if (!metaCheck.valid) {
      return sendErrorResponse(
        res,
        new AppError({ code: metaCheck.code || 'INVALID_CUT_INTERVAL', statusCode: 400, userMessage: metaCheck.error! }),
        'upload-and-cut-short',
        { userId: req.userId }
      );
    }

    let clipId: string;
    let renderedPath: string;
    let previewUrl: string;
    let downloadUrl: string;

    const existingClipId = requestedClipId ? String(requestedClipId).replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const existingRendered = existingClipId ? jobQueue.getRenderedClipForUser(existingClipId, req.userId) : null;

    if (!req.file && existingRendered && (await checkFileExists(existingRendered.filePath))) {
      // Retry publication without re-rendering!
      clipId = existingClipId;
      renderedPath = existingRendered.filePath;
      previewUrl = `/api/clips/${clipId}/preview`;
      downloadUrl = `/api/clips/${clipId}/download`;
    } else {
      const file = req.file;
      if (!file) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_MEDIA',
            statusCode: 400,
            userMessage: existingClipId
              ? 'Corte renderizado não encontrado para republicação. Envie o arquivo de vídeo novamente.'
              : 'Nenhum arquivo de vídeo válido foi enviado.',
          }),
          'upload-and-cut-short',
          { userId: req.userId }
        );
      }

      const validation = await validateUploadedFile(file, req.userId);
      if (!validation.valid) {
        return sendErrorResponse(
          res,
          new AppError({
            code: validation.code || 'INVALID_MEDIA',
            statusCode: validation.status || 400,
            userMessage: validation.error || 'Arquivo de vídeo inválido.',
          }),
          'upload-and-cut-short',
          { userId: req.userId }
        );
      }

      const intervalCheck = validateCutInterval(startTime, endTime, 300);
      if (!intervalCheck.valid) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_CUT_INTERVAL',
            statusCode: 400,
            userMessage: intervalCheck.error || 'Intervalo de corte inválido.',
          }),
          'upload-and-cut-short',
          { userId: req.userId }
        );
      }

      if (validation.duration && intervalCheck.endSec! > validation.duration) {
        return sendErrorResponse(
          res,
          new AppError({
            code: 'INVALID_CUT_INTERVAL',
            statusCode: 400,
            userMessage: `O tempo final (${intervalCheck.formattedEnd}) excede a duração real do vídeo (${formatSecondsToTimestamp(validation.duration)}).`,
          }),
          'upload-and-cut-short',
          { userId: req.userId }
        );
      }

      clipId = `up_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
      const parsedFraming = parseJsonField<any>(framing);

      const renderResult = await renderClip({
        sourcePath: file.path,
        startTime: intervalCheck.formattedStart!,
        endTime: intervalCheck.formattedEnd!,
        clipId,
        outputPath: outPath,
        format,
        subtitleTheme,
        overlayTitle: title,
        hook,
        framing: parsedFraming,
        removeSilence: Boolean(removeSilence === true || removeSilence === 'true'),
      });

      renderedPath = renderResult.outputPath;
      previewUrl = `/api/clips/${clipId}/preview`;
      downloadUrl = `/api/clips/${clipId}/download`;

      // Register the rendered clip BEFORE attempting YouTube upload so it is always preserved for preview, download, and retry
      jobQueue.registerRenderedClip(
        clipId,
        renderResult.outputPath,
        renderResult.duration,
        renderResult.fileSize,
        req.userId
      );
    }

    const serverCreds = stateManager.getCredentials(req.userId);
    const rawToken = String(token || '').trim();
    const isMasked = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
    const tokenToUse = (isMasked ? serverCreds.youtube.accessToken : rawToken || '').trim();

    const rawRt = String(refreshToken || '').trim();
    const cleanRt = !rawRt || rawRt.startsWith('***') || rawRt.includes('••••') ? '' : rawRt;
    const refreshToUse = (cleanRt || serverCreds.youtube.refreshToken || '').trim();

    if (!tokenToUse && !refreshToUse) {
      return res.status(400).json({
        success: false,
        error: 'Token de autorização do YouTube não configurado. O corte foi salvo e pode ser baixado ou publicado depois.',
        code: 'YOUTUBE_UPLOAD_FAILED',
        correlationId,
        clipId,
        previewUrl,
        downloadUrl,
        canRetryPublish: true,
      });
    }

    const parsedTags = Array.isArray(tags)
      ? tags.map((t: any) => String(t).trim()).filter(Boolean)
      : typeof tags === 'string' && tags.trim()
        ? tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : ['Shorts', 'Viral'];

    const uploadResult = await uploadVideoToYouTube({
      token: tokenToUse,
      refreshToken: refreshToUse,
      title,
      description: description || `${title}\n\n#Shorts #Viral`,
      privacy: String(privacy).trim().toLowerCase(),
      tags: parsedTags,
      hook,
      videoFilePath: renderedPath,
      userId: req.userId,
    });

    if (uploadResult.success) {
      return res.json({
        success: true,
        clipId,
        previewUrl,
        downloadUrl,
        videoId: uploadResult.videoId,
        account: uploadResult.channelTitle,
        videoUrl: uploadResult.videoUrl,
        message: `Corte real renderizado e postado com sucesso no canal "${uploadResult.channelTitle}"! Assista em: ${uploadResult.videoUrl}`,
      });
    }

    // Upload failed: keep rendered clip intact and return clipId + previewUrl + downloadUrl for immediate retry without re-rendering
    logger.warn('[CutRoutes][upload-and-cut-short] Falha no upload para o YouTube após renderização bem-sucedida', {
      action: 'upload_and_cut_publish_failed',
      clipId,
      code: uploadResult.code || 'YOUTUBE_UPLOAD_FAILED',
      status: uploadResult.status || 502,
      correlationId,
      userId: req.userId,
    });

    return res.status(uploadResult.status || 502).json({
      success: false,
      error: uploadResult.error || 'Erro ao enviar o vídeo cortado para o YouTube.',
      code: uploadResult.code || 'YOUTUBE_UPLOAD_FAILED',
      correlationId,
      clipId,
      previewUrl,
      downloadUrl,
      canRetryPublish: true,
    });
  } catch (err: any) {
    return sendErrorResponse(res, err, 'upload-and-cut-short', { userId: req.userId });
  } finally {
    if (req.file?.path) {
      await fsPromises.unlink(req.file.path).catch(() => {});
    }
  }
});

// 10b. Retry publishing an already-rendered clip to YouTube without re-rendering
cutRouter.post('/clips/:clipId/publish-youtube', async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(res);
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: 'Acesso não autorizado. Faça login para continuar.',
        code: 'YOUTUBE_UPLOAD_FAILED',
        correlationId,
      });
    }

    const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const clipMeta = jobQueue.getRenderedClipForUser(clipId, req.userId);
    if (!clipMeta || !(await checkFileExists(clipMeta.filePath))) {
      return res.status(404).json({
        error: 'Corte renderizado não encontrado para republicação.',
        code: 'JOB_NOT_FOUND',
        correlationId,
      });
    }

    const {
      title = 'Corte Viral #Shorts',
      description = '',
      privacy = 'public',
      tags = '',
      token = '',
      refreshToken = '',
      hook = '',
    } = req.body || {};

    const metaCheck = validateTitleAndDescriptionAndPrivacy({
      title,
      description,
      privacy,
      requirePrivacy: true,
    });
    if (!metaCheck.valid) {
      return sendErrorResponse(
        res,
        new AppError({ code: metaCheck.code || 'INVALID_CUT_INTERVAL', statusCode: 400, userMessage: metaCheck.error! }),
        'clips-publish-youtube',
        { userId: req.userId }
      );
    }

    const serverCreds = stateManager.getCredentials(req.userId);
    const rawToken = String(token || '').trim();
    const isMasked = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
    const tokenToUse = (isMasked ? serverCreds.youtube.accessToken : rawToken || '').trim();
    const rawRt = String(refreshToken || '').trim();
    const cleanRt = !rawRt || rawRt.startsWith('***') || rawRt.includes('••••') ? '' : rawRt;
    const refreshToUse = (cleanRt || serverCreds.youtube.refreshToken || '').trim();

    const parsedTags = Array.isArray(tags)
      ? tags.map((t: any) => String(t).trim()).filter(Boolean)
      : typeof tags === 'string' && tags.trim()
        ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : ['Shorts', 'Viral'];

    const uploadResult = await uploadVideoToYouTube({
      token: tokenToUse,
      refreshToken: refreshToUse,
      title,
      description: description || `${title}\n\n#Shorts #Viral`,
      privacy: String(privacy).trim().toLowerCase(),
      tags: parsedTags,
      hook,
      videoFilePath: clipMeta.filePath,
      userId: req.userId,
    });

    const previewUrl = `/api/clips/${clipId}/preview`;
    const downloadUrl = `/api/clips/${clipId}/download`;

    if (uploadResult.success) {
      return res.json({
        success: true,
        clipId,
        previewUrl,
        downloadUrl,
        videoId: uploadResult.videoId,
        account: uploadResult.channelTitle,
        videoUrl: uploadResult.videoUrl,
        message: `Corte publicado com sucesso no canal "${uploadResult.channelTitle}"! Assista em: ${uploadResult.videoUrl}`,
      });
    }

    return res.status(uploadResult.status || 502).json({
      success: false,
      error: uploadResult.error || 'Erro ao enviar o corte para o YouTube.',
      code: uploadResult.code || 'YOUTUBE_UPLOAD_FAILED',
      correlationId,
      clipId,
      previewUrl,
      downloadUrl,
      canRetryPublish: true,
    });
  } catch (err: any) {
    return sendErrorResponse(res, err, 'clips-publish-youtube', { userId: req.userId });
  }
});

// 11. Render Local Video File Cut to MP4 and Download to Computer
cutRouter.post('/render-download-cut', uploadRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  const file = req.file;
  const correlationId = getCorrelationId(res);
  try {
    if (!file) {
      return res.status(400).json({
        error: 'Nenhum arquivo de vídeo válido foi enviado.',
        code: 'INVALID_MEDIA',
        correlationId,
      });
    }

    if (!req.userId) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(401).json({
        error: 'Acesso não autorizado. Faça login para continuar.',
        code: 'INVALID_MEDIA',
        correlationId,
      });
    }

    const validation = await validateUploadedFile(file, req.userId);
    if (!validation.valid) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(validation.status || 400).json({
        error: validation.error,
        code: validation.code || 'INVALID_MEDIA',
        correlationId,
      });
    }

    const {
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      subtitleTheme = 'none',
      title = 'corte_viral',
      hook = '',
      framing,
      removeSilence = false,
    } = req.body || {};

    const metaCheck = validateTitleAndDescriptionAndPrivacy({ title });
    if (!metaCheck.valid) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return sendErrorResponse(
        res,
        new AppError({ code: metaCheck.code || 'INVALID_CUT_INTERVAL', statusCode: 400, userMessage: metaCheck.error! }),
        'render-download-cut',
        { userId: req.userId }
      );
    }

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: intervalCheck.error || 'Intervalo de corte inválido.',
        }),
        'render-download-cut',
        { userId: req.userId }
      );
    }

    if (validation.duration && intervalCheck.endSec! > validation.duration) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return sendErrorResponse(
        res,
        new AppError({
          code: 'INVALID_CUT_INTERVAL',
          statusCode: 400,
          userMessage: `O tempo final (${intervalCheck.formattedEnd}) excede a duração real do vídeo (${formatSecondsToTimestamp(validation.duration)}).`,
        }),
        'render-download-cut',
        { userId: req.userId }
      );
    }

    const clipId = `local_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
    const parsedFraming = parseJsonField<any>(framing);

    const renderResult = await renderClip({
      sourcePath: file.path,
      startTime: sanitizeTimestamp(intervalCheck.formattedStart!, '00:00'),
      endTime: sanitizeTimestamp(intervalCheck.formattedEnd!, '00:30'),
      clipId,
      outputPath: outPath,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing: parsedFraming,
      removeSilence: Boolean(removeSilence === true || removeSilence === 'true'),
    });

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize, req.userId);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    return res.download(outPath, `${safeTitle}.mp4`, () => {
      if (file?.path) {
        fsPromises.unlink(file.path).catch(() => {});
      }
    });
  } catch (err: any) {
    if (file?.path) {
      await fsPromises.unlink(file.path).catch(() => {});
    }
    return sendErrorResponse(res, err, 'render-download-cut', { userId: req.userId });
  }
});
