import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { UPLOADS_DIR, TEMP_DIR } from '../config.js';
import { renderRealCutVideo, downloadAndProcessYouTubeCut } from '../services/ffmpegService.js';
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
  maxRequests: 10,
  scope: 'ffmpeg-render',
  message: 'Limite de renderizações de vídeo por minuto atingido. Aguarde a conclusão do processamento atual.',
});

function handleRouteError(res: Response, err: any, context: string) {
  const correlationId = crypto.randomUUID();
  console.error(`[CutRoutes][${context}][${correlationId}]:`, err);
  return res.status(500).json({
    error: 'Falha interna ao processar o vídeo. Tente novamente em instantes.',
    correlationId,
  });
}

// 1. Download YouTube Video Slice & Render 9:16 Vertical Cut Directly
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
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      partBadge,
    } = req.body;

    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    if (!safeYt) {
      return res.status(400).json({ error: 'URL do YouTube inválida ou bloqueada por política de segurança.' });
    }

    const intervalCheck = validateCutInterval(startTime, endTime, 180);
    if (!intervalCheck.valid) {
      return res.status(400).json({ error: intervalCheck.error });
    }

    const cleanStart = sanitizeTimestamp(startTime, '00:00');
    const cleanEnd = sanitizeTimestamp(endTime, '00:30');

    console.log(`[CutRoutes] Iniciando corte real do YouTube: ${safeYt.canonicalUrl} [${cleanStart} -> ${cleanEnd}]`);

    renderedPath = await downloadAndProcessYouTubeCut({
      videoUrl: safeYt.canonicalUrl,
      startTime: cleanStart,
      endTime: cleanEnd,
      format,
      subtitleTheme,
      overlayTitle: title,
      hook,
      framing,
      subtitles: Array.isArray(subtitles) ? subtitles : undefined,
      teaserOffsetSec: typeof teaserOffsetSec === 'number' ? teaserOffsetSec : undefined,
      teaserDurationSec: typeof teaserDurationSec === 'number' ? teaserDurationSec : undefined,
      teaserText: typeof teaserText === 'string' ? teaserText : undefined,
      partBadge: typeof partBadge === 'string' ? partBadge : undefined,
    });

    if (!isPathInsideDir(renderedPath, TEMP_DIR) || !fs.existsSync(renderedPath)) {
      throw new Error('Caminho de arquivo de saída inválido ou não gerado.');
    }

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(renderedPath, `${safeTitle}.mp4`, () => {
      try {
        if (renderedPath && fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
      } catch {}
    });
  } catch (err: any) {
    if (renderedPath && fs.existsSync(renderedPath)) {
      try {
        fs.unlinkSync(renderedPath);
      } catch {}
    }
    return handleRouteError(res, err, 'download-youtube-cut');
  }
});

// 2. Upload Real Local Video File, Cut with FFmpeg and Post directly to YouTube
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

    const intervalCheck = validateCutInterval(startTime, endTime, 180);
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

    // Cut and render real vertical video using FFmpeg
    renderedPath = await renderRealCutVideo({
      inputFilePath: file.path,
      startTime: sanitizeTimestamp(startTime, '00:00'),
      endTime: sanitizeTimestamp(endTime, '00:30'),
      format,
      overlayTitle: title,
      hook,
      framing,
    });

    const parsedTags =
      typeof tags === 'string'
        ? tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : ['Shorts', 'Viral'];

    // Upload the real rendered video to YouTube
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
      if (renderedPath && fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
    } catch {}
  }
});

// 3. Render Local Video File Cut to MP4 and Download to Computer
cutRouter.post('/render-download-cut', renderRateLimiter, upload.single('video') as any, async (req: Request, res: Response) => {
  let renderedPath = '';
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

    const intervalCheck = validateCutInterval(startTime, endTime, 180);
    if (!intervalCheck.valid) {
      return res.status(400).json({ error: intervalCheck.error });
    }

    renderedPath = await renderRealCutVideo({
      inputFilePath: file.path,
      startTime: sanitizeTimestamp(startTime, '00:00'),
      endTime: sanitizeTimestamp(endTime, '00:30'),
      format,
      overlayTitle: title,
      framing,
    });

    if (!isPathInsideDir(renderedPath, TEMP_DIR) || !fs.existsSync(renderedPath)) {
      throw new Error('Caminho de arquivo renderizado inválido ou inexistente.');
    }

    const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    res.download(renderedPath, `${safeTitle}.mp4`, () => {
      try {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (renderedPath && fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
      } catch {}
    });
  } catch (err: any) {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      if (renderedPath && fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
    } catch {}
    return handleRouteError(res, err, 'render-download-cut');
  }
});
