import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_TEXT_MODEL } from '../config.js';
import {
  extractVideoId,
  fetchVideoMetadata,
  fetchTranscript,
  fetchTrendingVideos,
  analyzeViralCuts,
  analyzeVideoFraming,
  generateCaption,
  resolveGeminiApiKey,
} from '../services/geminiService.js';
import { stateManager } from '../services/stateService.js';
import { generateFfmpegCommand } from '../services/ffmpegService.js';
import { createRateLimiter, normalizeSafeYouTubeUrl, sanitizeTimestamp } from '../middleware/security.js';

export const videoRouter = Router();

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  scope: 'ai-analysis',
  message: 'Limite de análises de IA por minuto atingido. Aguarde alguns segundos.',
});

// 1. Fetch Video Metadata via oEmbed (Protected against SSRF)
videoRouter.post('/video-info', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const safeYt = normalizeSafeYouTubeUrl(url);
    const videoId = safeYt?.videoId || extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'URL ou ID do YouTube inválido.' });
    }

    const metadata = await fetchVideoMetadata(videoId);
    res.json(metadata);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao buscar dados do vídeo.' });
  }
});

// 2. Fetch Video Transcript
videoRouter.post('/transcript', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const safeYt = normalizeSafeYouTubeUrl(url);
    const videoId = safeYt?.videoId || extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'URL ou ID do YouTube inválido.' });
    }

    const result = await fetchTranscript(videoId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao buscar transcrição.' });
  }
});

// 3. Auto Explore Trending Long-form Videos for Viral Shorts
async function handleTrending(req: Request, res: Response) {
  try {
    const niche = String(req.body?.niche || req.query?.niche || 'geral').slice(0, 40);
    const trending = await fetchTrendingVideos(niche, req.userId);
    res.json({ trending, videos: trending });
  } catch (error: any) {
    console.error('[VideoRoutes] Trending error:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar vídeos em alta.' });
  }
}
videoRouter.get('/trending', handleTrending);
videoRouter.post('/trending', handleTrending);

// 4. Detect & Analyze Viral Cuts with Gemini + Multimodal Framing + Sequential Continuation Engine
async function handleAnalyze(req: Request, res: Response) {
  try {
    const { videoUrl, transcript, userPrompt, intent, videoTitle, channelName, cutsCount } = req.body;
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
      return res.status(400).json({ error: 'URL do vídeo é obrigatória.' });
    }

    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    if (!safeYt) {
      return res.status(400).json({ error: 'URL do YouTube inválida ou malformada.' });
    }
    const cleanUrl = safeYt.canonicalUrl;

    let validCutsCount = 6;
    if (cutsCount !== undefined) {
      const parsed = Number(cutsCount);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
        return res.status(400).json({ error: 'cutsCount deve ser um número finito entre 1 e 12.' });
      }
      validCutsCount = Math.floor(parsed);
    }

    const cuts = await analyzeViralCuts({
      videoUrl: cleanUrl,
      transcript: transcript || '',
      userPrompt,
      intent,
      videoTitle,
      channelName,
      cutsCount: validCutsCount,
      userId: req.userId,
    });

    res.json({
      success: true,
      cuts,
      total: cuts.length,
    });
  } catch (error: any) {
    console.error('[VideoRoutes] Analyze error:', error);
    res.status(500).json({ error: error.message || 'Erro ao analisar cortes com IA.' });
  }
}
videoRouter.post('/analyze', aiRateLimiter, handleAnalyze);
videoRouter.post('/generate-cuts', aiRateLimiter, handleAnalyze);

// 4b. Multimodal Gemini Vision Framing Detection (Scene Frames 1, 2, 3)
videoRouter.post('/analyze-framing', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { videoUrl, videoId, videoTitle, title } = req.body;
    const rawTarget = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
      return res.status(400).json({ error: 'URL ou ID do vídeo é obrigatório.' });
    }

    const safeYt = normalizeSafeYouTubeUrl(rawTarget);
    if (!safeYt) {
      return res.status(400).json({ error: 'URL ou ID do YouTube inválido.' });
    }

    const framing = await analyzeVideoFraming({
      videoUrl: safeYt.canonicalUrl,
      videoId: safeYt.videoId,
      videoTitle: videoTitle || title,
      userId: req.userId,
    });
    res.json({
      success: true,
      framing,
      ...framing,
    });
  } catch (error: any) {
    console.error('[VideoRoutes] Analyze framing error:', error);
    res.status(500).json({ error: error.message || 'Erro ao detectar enquadramento com IA Vision.' });
  }
});

// 5. Generate Tailored Social Media Captions
videoRouter.post('/generate-caption', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { cutTitle, hook, platform, trigger, customTone } = req.body;
    const caption = await generateCaption({
      cutTitle,
      hook,
      platform,
      trigger,
      customTone,
      userId: req.userId,
    });

    res.json({ caption });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao gerar legenda personalizada.' });
  }
});

// 6. Generate FFmpeg Command
videoRouter.post('/ffmpeg-command', (req: Request, res: Response) => {
  try {
    const { videoUrl, startTime, endTime, format, title, framing } = req.body;
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
      return res.status(400).json({ error: 'URL do vídeo é obrigatória.' });
    }
    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    if (!safeYt) {
      return res.status(400).json({ error: 'URL do YouTube inválida ou malformada.' });
    }

    const result = generateFfmpegCommand({
      videoUrl: safeYt.canonicalUrl,
      startTime: sanitizeTimestamp(startTime, '00:00'),
      endTime: sanitizeTimestamp(endTime, '00:45'),
      format,
      title,
      framing,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao gerar comando FFmpeg.' });
  }
});

// 7. Verify Google AI Studio Gemini API Key
videoRouter.post('/gemini/verify', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    const incomingKey = String(apiKey || '').trim();
    const isMasked = !incomingKey || incomingKey.startsWith('***') || incomingKey.includes('••••');
    const keyToTest = isMasked ? resolveGeminiApiKey(req.userId) : incomingKey;
    if (!keyToTest) {
      return res.status(400).json({
        valid: false,
        error: 'Nenhuma chave de API do Google AI Studio fornecida. Obtenha sua chave gratuita em aistudio.google.com',
      });
    }

    const testAi = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const modelToUse = GEMINI_TEXT_MODEL;
    const response = await testAi.models.generateContent({
      model: modelToUse,
      contents: 'Responda apenas: OK',
    });

    if (response?.text) {
      stateManager.updateCredentials(
        {
          gemini: {
            apiKey: keyToTest,
            status: 'connected',
            model: modelToUse,
          },
        },
        req.userId
      );
      return res.json({
        valid: true,
        model: modelToUse,
        message: `Chave do Google AI Studio validada com sucesso! Recursos ativados com o modelo ${modelToUse}.`,
      });
    }

    return res.status(400).json({ valid: false, error: 'Resposta vazia da API do Google AI Studio.' });
  } catch (err: any) {
    return res.status(400).json({
      valid: false,
      error: err?.message || 'Falha ao autenticar com a API do Google AI Studio. Verifique se a chave é válida.',
    });
  }
});

// 8. Get Google AI Studio Status
videoRouter.get('/gemini/status', (req: Request, res: Response) => {
  const activeKey = resolveGeminiApiKey(req.userId);
  const hasKey = Boolean(activeKey);
  const creds = stateManager.getCredentials(req.userId || 'default');
  res.json({
    configured: hasKey,
    model: GEMINI_TEXT_MODEL,
    hasEnvKey: hasKey,
    aiConfig: creds.aiConfig,
  });
});

// 9. Test Local AI (Ollama / LM Studio) Endpoint with SSRF Protection
videoRouter.post('/ai/test-local', async (req: Request, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const rawEndpoint = String(req.body?.endpoint || 'http://localhost:11434').trim().replace(/\/$/, '');
  const model = String(req.body?.model || 'llama3:8b').trim();

  // Validate URL and enforce SSRF defenses
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawEndpoint);
  } catch {
    return res.status(400).json({ success: false, error: 'URL do endpoint inválida.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ success: false, error: 'Protocolo inválido. Apenas http e https são permitidos.' });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (process.env.NODE_ENV === 'production') {
    // In production, block loopback, link-local, private subnets, and cloud metadata
    if (
      isLocalhost ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('169.254.') ||
      hostname.includes('metadata')
    ) {
      return res.status(400).json({ success: false, error: 'Conexões para endereços de rede privada ou metadados são proibidas.' });
    }
  } else {
    // In dev, only permit loopback connections
    if (!isLocalhost) {
      return res.status(400).json({ success: false, error: 'Em ambiente local, apenas conexões para localhost ou 127.0.0.1 são permitidas.' });
    }
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const tagsRes = await fetch(`${parsedUrl.origin}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!tagsRes.ok) {
      return res.status(400).json({
        success: false,
        error: `Serviço local respondeu com status ${tagsRes.status}.`,
      });
    }

    const data: any = await tagsRes.json();
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
      : [];

    return res.json({
      success: true,
      latencyMs,
      endpoint: parsedUrl.origin,
      models,
      hasRequestedModel: models.some((m) => m.toLowerCase().includes(model.toLowerCase())),
      message: `Conectado com sucesso ao provedor local (${latencyMs}ms)! ${models.length} modelo(s) encontrado(s).`,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === 'AbortError';
    return res.status(502).json({
      success: false,
      latencyMs,
      error: isTimeout
        ? 'Tempo limite de conexão excedido (4s). Verifique se o serviço local está em execução.'
        : 'Não foi possível conectar ao provedor local. Certifique-se de que o serviço está ativo.',
    });
  }
});

// 10. Export Adobe Premiere Pro / DaVinci Resolve Timeline XML (xmeml v5)
videoRouter.post('/export-xml', async (req: Request, res: Response) => {
  try {
    const { generatePremiereXml } = await import('../services/xmlExportService.js');
    const cut = req.body?.cut || req.body;
    if (!cut || !cut.startTime || !cut.endTime) {
      return res.status(400).json({ error: 'Parâmetros de corte (startTime, endTime) ausentes.' });
    }
    const xml = generatePremiereXml(cut);
    const safeTitle = (cut.title || 'Corte_Viral')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 35);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_premiere.xml"`);
    res.send(xml);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao gerar arquivo XML do Premiere Pro.' });
  }
});


