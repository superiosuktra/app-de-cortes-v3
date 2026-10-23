import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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
} from '../middleware/security.js';

export const cutRouter = Router();

const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
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
  message: 'Limite de renderizações de vídeo por minuto atingido. Aguarde a conclusão do processamento atual.',
});

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
    if (existing && fs.existsSync(existing.filePath)) {
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
    if (sourceFilePath && fs.existsSync(sourceFilePath) && isPathInsideDir(sourceFilePath, UPLOADS_DIR)) {
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

    if (!rawSourcePath || !fs.existsSync(rawSourcePath)) {
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

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize);

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
    if (shouldCleanupSource && rawSourcePath && fs.existsSync(rawSourcePath)) {
      try {
        fs.unlinkSync(rawSourcePath);
      } catch {}
    }
  }
});

// 2. Stream Rendered MP4 Preview with HTTP 206 Range Support (zero gray screen, instant HTML5 seek)
cutRouter.get('/clips/:clipId/preview', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipMeta = jobQueue.getRenderedClip(clipId);
  const filePath = clipMeta?.filePath || path.join(CLIPS_DIR, `${clipId}.mp4`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Corte ainda não foi renderizado ou expirou.',
      clipId,
      status: 'pending',
    });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
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

  if (!fs.existsSync(filePath)) {
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
    if (!sourcePathToUse || !fs.existsSync(sourcePathToUse)) {
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
      });
    }

    const task = jobQueue.createBatchRenderJob(cuts, sourcePathToUse);
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
  const job = jobQueue.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }
  res.json(job);
});

// 6. Cancel Batch Job
cutRouter.post('/batch/:batchId/cancel', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
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

    const task = jobQueue.createBatchZipJob(cuts, videoTitle);
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
cutRouter.get('/batch/:batchId/download', (req: Request, res: Response) => {
  const jobId = req.params.batchId;
  const zipFiles = fs.readdirSync(TEMP_DIR).filter((f) => f.includes(jobId) && f.endsWith('.zip'));

  if (zipFiles.length === 0) {
    return res.status(404).json({ error: 'Arquivo ZIP ainda não está pronto ou expirou.' });
  }

  const zipPath = path.join(TEMP_DIR, zipFiles[0]);
  res.setHeader('Content-Type', 'application/zip');
  res.download(zipPath, zipFiles[0]);
});

// 9. Legacy /download-youtube-cut with persistent CLIPS_DIR output
cutRouter.post('/download-youtube-cut', renderRateLimiter, async (req: Request, res: Response) => {
  let renderedPath: string | null = null;
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
    try {
      if (fs.existsSync(rawSlice)) fs.unlinkSync(rawSlice);
    } catch {}

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(outPath, `${safeTitle}.mp4`);
  } catch (err: any) {
    return handleRouteError(res, err, 'download-youtube-cut');
  }
});

// 10. Upload Local Video File, Cut with FFmpeg and Post to YouTube
cutRouter.post('/upload-and-cut-short', renderRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  let renderedPath = '';
  try {
    const file = req.file;
    if (!file || !isPathInsideDir(file.path, UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo válido foi enviado.' });
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

    const serverCreds = stateManager.getCredentials(req.userId || 'default');
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
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
  }
});

// 11. Render Local Video File Cut to MP4 and Download to Computer
cutRouter.post('/render-download-cut', renderRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  const file = req.file;
  try {
    if (!file || !isPathInsideDir(file.path, UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo válido foi enviado.' });
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

    jobQueue.registerRenderedClip(clipId, renderResult.outputPath, renderResult.duration, renderResult.fileSize);

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(outPath, `${safeTitle}.mp4`, () => {
      try {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch {}
    });
  } catch (err: any) {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {}
    return handleRouteError(res, err, 'render-download-cut');
  }
});
