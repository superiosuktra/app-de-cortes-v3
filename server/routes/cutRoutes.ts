import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
import crypto from 'crypto';
import { UPLOADS_DIR, TEMP_DIR, CLIPS_DIR } from '../config.js';
import { renderRealCutVideo, downloadAndProcessYouTubeCut, downloadYouTubeSlice } from '../services/ffmpegService.js';
import { renderClip, validateMediaFile } from '../services/renderService.js';
import { parseTimeToSeconds, formatSecondsToMMSS } from '../services/geminiService.js';
import { jobQueue } from '../services/jobQueueService.js';
import { sanitizeFileName } from '../services/zipService.js';
import { uploadVideoToYouTube } from '../services/youtubeService.js';
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
} from '../middleware/security.js';

export const cutRouter = Router();

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
): Promise<{ valid: boolean; error?: string; status?: number }> {
  if (!file || !isPathInsideDir(file.path, UPLOADS_DIR)) {
    return { valid: false, error: 'Arquivo de vídeo inválido.', status: 400 };
  }

  // 1. Quota check
  const currentUsage = await getUserUploadStorageBytes(userId);
  if (currentUsage + file.size > MAX_USER_STORAGE_BYTES) {
    return {
      valid: false,
      error: 'Cota de armazenamento de upload excedida (máximo de 1GB por usuário).',
      status: 413,
    };
  }

  // 2. ffprobe real content validation
  const probe = await validateMediaFile(file.path);
  if (!probe.valid || !probe.hasVideo) {
    return {
      valid: false,
      error: probe.error || 'Arquivo de vídeo inválido ou sem stream de vídeo detectado.',
      status: 400,
    };
  }

  // 3. Duration check
  if (probe.duration > MAX_UPLOAD_DURATION_SEC) {
    return {
      valid: false,
      error: `A duração do vídeo (${Math.round(probe.duration)}s) excede o limite máximo permitido de ${MAX_UPLOAD_DURATION_SEC}s.`,
      status: 400,
    };
  }

  // 4. Resolution check
  if (probe.width > MAX_UPLOAD_RESOLUTION || probe.height > MAX_UPLOAD_RESOLUTION) {
    return {
      valid: false,
      error: `A resolução do vídeo (${probe.width}x${probe.height}) excede o limite de ${MAX_UPLOAD_RESOLUTION}x${MAX_UPLOAD_RESOLUTION}.`,
      status: 400,
    };
  }

  registerUploadedFile(file.path, userId);
  return { valid: true };
}

function handleRouteError(res: Response, err: any, context: string) {
  const correlationId = crypto.randomUUID();
  console.error(`[CutRoutes][${context}][${correlationId}]:`, err);
  const errMsg = err?.message || '';
  const isBotError =
    errMsg.includes('Sign in to confirm you’re not a bot') ||
    errMsg.includes('cookies') ||
    errMsg.includes('confirm you’re not a bot');
  const userError = isBotError
    ? 'O YouTube solicitou confirmação de acesso no servidor em nuvem. Salve seus cookies do YouTube na Central de Conexões ou envie o arquivo diretamente na aba Upload de Vídeo.'
    : err?.message || 'Falha interna ao processar o vídeo. Tente novamente em instantes.';

  return res.status(500).json({
    error: userError,
    isBotError,
    correlationId,
  });
}

// 1. Render Specific Clip to CLIPS_DIR and register with JobQueue
cutRouter.post('/clips/:clipId/render', renderRateLimiter, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  let rawSourcePath: string | null = null;
  let shouldCleanupSource = false;

  try {
    const existing = jobQueue.getRenderedClip(clipId);
    if (existing && (await checkFileExists(existing.filePath))) {
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
      removeSilence = false,
    } = req.body;

    // Resolve source video
    if (sourceFilePath) {
      if (!isPathInsideDir(sourceFilePath, UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Acesso negado: caminho de arquivo fora do diretório de uploads.' });
      }
      const owner = getUploadedFileOwner(sourceFilePath);
      if (!owner || !req.userId || owner !== req.userId) {
        return res.status(404).json({ error: 'Arquivo de vídeo não encontrado.' });
      }
      if (!(await checkFileExists(sourceFilePath))) {
        return res.status(404).json({ error: 'Arquivo de vídeo não encontrado no disco.' });
      }
      rawSourcePath = sourceFilePath;
    } else if (videoUrl) {
      const safeYt = normalizeSafeYouTubeUrl(videoUrl);
      if (!safeYt) {
        return res.status(400).json({ error: 'URL do YouTube inválida ou bloqueada.' });
      }
      rawSourcePath = await downloadYouTubeSlice({
        videoUrl: safeYt.canonicalUrl,
        startTime: sanitizeTimestamp(startTime, '00:00'),
        endTime: sanitizeTimestamp(endTime, '00:30'),
      });
      shouldCleanupSource = true;
    } else {
      return res.status(400).json({ error: 'Nenhum vídeo de origem fornecido (videoUrl ou sourceFilePath).' });
    }

    if (!rawSourcePath || !(await checkFileExists(rawSourcePath))) {
      return res.status(400).json({ error: 'Falha ao obter o vídeo de origem para processamento.' });
    }

    const targetOutPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
    const renderResult = await renderClip({
      sourcePath: rawSourcePath,
      startTime: shouldCleanupSource ? '00:00' : startTime,
      endTime: shouldCleanupSource
        ? formatSecondsToMMSS(parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime))
        : endTime,
      clipId,
      outputPath: targetOutPath,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing,
      subtitles: Array.isArray(subtitles) ? subtitles : undefined,
      removeSilence: Boolean(removeSilence),
    });

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize, req.userId);

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
    });
  } catch (err: any) {
    return handleRouteError(res, err, 'clips-render');
  } finally {
    if (shouldCleanupSource && rawSourcePath) {
      await fsPromises.unlink(rawSourcePath).catch(() => {});
    }
  }
});

// 2. Stream Rendered MP4 Preview with HTTP 206 Range Support (zero gray screen, instant HTML5 seek)
cutRouter.get('/clips/:clipId/preview', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipMeta = jobQueue.getRenderedClip(clipId);
  const filePath = clipMeta?.filePath || path.join(CLIPS_DIR, `${clipId}.mp4`);

  if (!clipMeta || !clipMeta.userId || !req.userId || clipMeta.userId !== req.userId) {
    return res.status(404).json({ error: 'Corte não encontrado.' });
  }

  if (!(await checkFileExists(filePath))) {
    return res.status(404).json({
      error: 'Corte ainda não foi renderizado ou expirou.',
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

// 3. Download Single Rendered Cut MP4
cutRouter.get('/clips/:clipId/download', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipMeta = jobQueue.getRenderedClip(clipId);
  const filePath = clipMeta?.filePath || path.join(CLIPS_DIR, `${clipId}.mp4`);

  if (!clipMeta || !clipMeta.userId || !req.userId || clipMeta.userId !== req.userId) {
    return res.status(404).json({ error: 'Arquivo do corte não encontrado para download.' });
  }

  if (!(await checkFileExists(filePath))) {
    return res.status(404).json({ error: 'Arquivo do corte não encontrado para download.' });
  }

  const fileName = `${sanitizeFileName(clipId)}.mp4`;
  res.download(filePath, fileName);
});

// 4. Batch Render Multiple Cuts
cutRouter.post('/batch/render', renderRateLimiter, async (req: Request, res: Response) => {
  try {
    const { cuts, videoUrl, sourceFilePath } = req.body;
    if (!Array.isArray(cuts) || cuts.length === 0) {
      return res.status(400).json({ error: 'Nenhum corte selecionado para renderização em lote.' });
    }

    let sourcePathToUse = sourceFilePath;
    if (sourcePathToUse) {
      if (!isPathInsideDir(sourcePathToUse, UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Acesso negado: caminho de arquivo fora do diretório de uploads.' });
      }
      const owner = getUploadedFileOwner(sourcePathToUse);
      if (!owner || !req.userId || owner !== req.userId) {
        return res.status(404).json({ error: 'Arquivo de vídeo não encontrado.' });
      }
    }

    if (!sourcePathToUse || !(await checkFileExists(sourcePathToUse))) {
      const safeYt = normalizeSafeYouTubeUrl(videoUrl);
      if (!safeYt) {
        return res.status(400).json({ error: 'URL do YouTube ou arquivo de vídeo local obrigatório.' });
      }
      // Download raw slice spanning from earliest cut to latest cut
      const minStart = Math.min(...cuts.map((c) => c.startSeconds || 0));
      const maxEnd = Math.max(...cuts.map((c) => c.endSeconds || c.startSeconds + 45));
      sourcePathToUse = await downloadYouTubeSlice({
        videoUrl: safeYt.canonicalUrl,
        startTime: formatSecondsToMMSS(minStart),
        endTime: formatSecondsToMMSS(maxEnd),
        userId: req.userId,
      });
    }

    const task = jobQueue.createBatchRenderJob(cuts, sourcePathToUse, req.userId);
    res.json({
      success: true,
      jobId: task.id,
      status: task.status,
      totalItems: task.totalItems,
      message: `Fila de renderização iniciada para ${task.totalItems} corte(s).`,
    });
  } catch (err: any) {
    return handleRouteError(res, err, 'batch-render');
  }
});

// 5. Query Batch Job Status
cutRouter.get('/batch/:batchId', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const job = jobQueue.getJob(jobId) || jobQueue.get(jobId);
  if (!job || !job.userId || !req.userId || job.userId !== req.userId) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }
  res.json(job);
});

// 6. Cancel Batch Job
cutRouter.post('/batch/:batchId/cancel', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const job = jobQueue.getJob(jobId) || jobQueue.get(jobId);
  if (!job || !job.userId || !req.userId || job.userId !== req.userId) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }
  const success = jobQueue.cancelJob(jobId);
  res.json({ success, message: success ? 'Tarefa cancelada com sucesso.' : 'Tarefa não encontrada.' });
});

// 7. Enqueue Bulk ZIP Generation (Selected Cuts or All)
cutRouter.post('/clips/bulk-download', async (req: Request, res: Response) => {
  try {
    const { cuts, videoTitle } = req.body;
    if (!Array.isArray(cuts) || cuts.length === 0) {
      return res.status(400).json({ error: 'Nenhum corte fornecido para empacotamento em ZIP.' });
    }

    const task = jobQueue.createBatchZipJob(cuts, videoTitle, req.userId);
    res.json({
      success: true,
      jobId: task.id,
      status: task.status,
      totalItems: task.totalItems,
      message: `Empacotamento ZIP iniciado para ${task.totalItems} corte(s).`,
    });
  } catch (err: any) {
    return handleRouteError(res, err, 'bulk-download');
  }
});

// 8. Download Completed ZIP File
cutRouter.get('/batch/:batchId/download', async (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const job = jobQueue.getJob(jobId) || jobQueue.get(jobId);
  if (!job || !job.userId || !req.userId || job.userId !== req.userId) {
    return res.status(404).json({ error: 'Arquivo ZIP não encontrado.' });
  }

  // Exact deterministic ZIP lookup (no substring scanning to prevent collisions or traversal)
  const zipName = `batch_${jobId}.zip`;
  const zipPath = path.join(TEMP_DIR, zipName);

  if (!(await checkFileExists(zipPath)) || !isPathInsideDir(zipPath, TEMP_DIR)) {
    return res.status(404).json({ error: 'Arquivo ZIP ainda não está pronto ou expirou.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.download(zipPath, zipName);
});

// 9. Legacy /download-youtube-cut with persistent CLIPS_DIR output
cutRouter.post('/download-youtube-cut', renderRateLimiter, async (req: Request, res: Response) => {
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
      removeSilence = false,
    } = req.body;

    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    if (!safeYt) {
      return res.status(400).json({ error: 'URL do YouTube inválida ou bloqueada.' });
    }

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      return res.status(400).json({ error: intervalCheck.error });
    }

    const cleanStart = sanitizeTimestamp(startTime, '00:00');
    const cleanEnd = sanitizeTimestamp(endTime, '00:30');

    console.log(`[CutRoutes] Corte direto do YouTube: ${safeYt.canonicalUrl} [${cleanStart} -> ${cleanEnd}]`);

    const rawSlice = await downloadYouTubeSlice({
      videoUrl: safeYt.canonicalUrl,
      startTime: cleanStart,
      endTime: cleanEnd,
    });

    const clipId = `cut_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);

    const renderResult = await renderClip({
      sourcePath: rawSlice,
      startTime: '00:00',
      endTime: formatSecondsToMMSS(parseTimeToSeconds(cleanEnd) - parseTimeToSeconds(cleanStart)),
      clipId,
      outputPath: outPath,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing,
      subtitles: Array.isArray(subtitles) ? subtitles : undefined,
      removeSilence: Boolean(removeSilence),
    });

    // Cleanup intermediate raw slice
    if (rawSlice) await fsPromises.unlink(rawSlice).catch(() => {});

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize, req.userId);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(outPath, `${safeTitle}.mp4`);
  } catch (err: any) {
    return handleRouteError(res, err, 'download-youtube-cut');
  }
});

// 10. Upload Local Video File, Cut with FFmpeg and Post to YouTube
cutRouter.post('/upload-and-cut-short', uploadRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  let renderedPath: string | undefined;
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo válido foi enviado.' });
    }

    if (!req.userId) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
    }

    const validation = await validateUploadedFile(file, req.userId);
    if (!validation.valid) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const {
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      title = 'Corte Viral #Shorts',
      description = '',
      privacy = 'public',
      tags = '',
      token = '',
      hook = '',
      framing,
    } = req.body;

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      return res.status(400).json({ error: intervalCheck.error });
    }

    const serverCreds = stateManager.getCredentials(req.userId);
    const rawToken = (token || '').trim();
    const isMasked = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
    const tokenToUse = (isMasked ? serverCreds.youtube.accessToken : rawToken || '').trim();
    if (!tokenToUse) {
      return res.status(400).json({ error: 'Token de autorização do YouTube não configurado.' });
    }

    const clipId = `up_${Date.now()}`;
    const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);

    const renderResult = await renderClip({
      sourcePath: file.path,
      startTime: sanitizeTimestamp(startTime, '00:00'),
      endTime: sanitizeTimestamp(endTime, '00:30'),
      clipId,
      outputPath: outPath,
      format,
      overlayTitle: title,
      hook,
      framing,
    });
    renderedPath = renderResult.outputPath;

    const parsedTags =
      typeof tags === 'string'
        ? tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : ['Shorts', 'Viral'];

    const uploadResult = await uploadVideoToYouTube({
      token: tokenToUse,
      title,
      description: description || `${title}\n\n#Shorts #Viral`,
      privacy,
      tags: parsedTags,
      hook,
      videoFilePath: renderedPath,
    });

    if (uploadResult.success) {
      return res.json({
        success: true,
        videoId: uploadResult.videoId,
        account: uploadResult.channelTitle,
        videoUrl: uploadResult.videoUrl,
        message: `Corte real renderizado e postado com sucesso no canal "${uploadResult.channelTitle}"! Assista em: ${uploadResult.videoUrl}`,
      });
    }

    return res.status(uploadResult.status || 500).json({
      error: uploadResult.error || 'Erro ao enviar o vídeo cortado para o YouTube.',
    });
  } catch (err: any) {
    return handleRouteError(res, err, 'upload-and-cut-short');
  } finally {
    if (req.file?.path) {
      await fsPromises.unlink(req.file.path).catch(() => {});
    }
  }
});

// 11. Render Local Video File Cut to MP4 and Download to Computer
cutRouter.post('/render-download-cut', uploadRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  const file = req.file;
  try {
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo válido foi enviado.' });
    }

    if (!req.userId) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
    }

    const validation = await validateUploadedFile(file, req.userId);
    if (!validation.valid) {
      if (file.path) await fsPromises.unlink(file.path).catch(() => {});
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const {
      startTime = '00:00',
      endTime = '00:30',
      format = 'speaker_center',
      title = 'corte_viral',
      framing,
    } = req.body;

    const intervalCheck = validateCutInterval(startTime, endTime, 300);
    if (!intervalCheck.valid) {
      return res.status(400).json({ error: intervalCheck.error });
    }

    const clipId = `local_${Date.now()}`;
    const outPath = path.join(CLIPS_DIR, `${clipId}.mp4`);

    const renderResult = await renderClip({
      sourcePath: file.path,
      startTime: sanitizeTimestamp(startTime, '00:00'),
      endTime: sanitizeTimestamp(endTime, '00:30'),
      clipId,
      outputPath: outPath,
      format,
      overlayTitle: title,
      framing,
    });

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize, req.userId);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(outPath, `${safeTitle}.mp4`, () => {
      if (file?.path) {
        fsPromises.unlink(file.path).catch(() => {});
      }
    });
  } catch (err: any) {
    if (file?.path) {
      await fsPromises.unlink(file.path).catch(() => {});
    }
    return handleRouteError(res, err, 'render-download-cut');
  }
});
