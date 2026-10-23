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
    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    const cleanUrl = safeYt?.canonicalUrl || videoUrl || 'https://www.youtube.com/watch?v=B57eOqeLVfc';

    const cuts = await analyzeViralCuts({
      videoUrl: cleanUrl,
      transcript: transcript || '',
      userPrompt,
      intent,
      videoTitle,
      channelName,
      cutsCount: cutsCount ? Number(cutsCount) : 6,
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
    const safeYt = normalizeSafeYouTubeUrl(videoUrl || videoId);
    const framing = await analyzeVideoFraming({
      videoUrl: safeYt?.canonicalUrl || videoUrl,
      videoId: safeYt?.videoId || extractVideoId(videoId || videoUrl || '') || 'B57eOqeLVfc',
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
    const safeYt = normalizeSafeYouTubeUrl(videoUrl);
    const result = generateFfmpegCommand({
      videoUrl: safeYt?.canonicalUrl || 'https://www.youtube.com/watch?v=B57eOqeLVfc',
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

    let modelToUse = GEMINI_TEXT_MODEL;
    let response;
    try {
      response = await testAi.models.generateContent({
        model: modelToUse,
        contents: 'Responda apenas: OK',
      });
    } catch (modelErr: any) {
      if (modelErr?.message?.includes('is no longer available') || modelErr?.message?.includes('404')) {
        modelToUse = 'gemini-3.8-flash';
        response = await testAi.models.generateContent({
          model: modelToUse,
          contents: 'Responda apenas: OK',
        });
      } else {
        throw modelErr;
      }
    }

    if (response?.text) {
      process.env.GEMINI_API_KEY = keyToTest;
      stateManager.updateCredentials(
        {
          gemini: {
            apiKey: keyToTest,
            status: 'connected',
            model: modelToUse,
          },
        },
        req.userId || 'default'
      );
      return res.json({
        valid: true,
        model: modelToUse,
        message: 'Chave do Google AI Studio validada com sucesso! Todos os recursos de IA foram ativados com Gemini 3.8 Flash.',
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

// 9. Test Local AI (Ollama / LM Studio) Endpoint
videoRouter.post('/ai/test-local', async (req: Request, res: Response) => {
  const endpoint = String(req.body?.endpoint || 'http://localhost:11434').trim().replace(/\/$/, '');
  const model = String(req.body?.model || 'llama3:8b').trim();

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const tagsRes = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!tagsRes.ok) {
      return res.status(400).json({
        success: false,
        error: `Ollama respondeu com status ${tagsRes.status}. Verifique se o endpoint está correto.`,
      });
    }

    const data: any = await tagsRes.json();
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
      : [];

    return res.json({
      success: true,
      latencyMs,
      endpoint,
      models,
      hasRequestedModel: models.some((m) => m.toLowerCase().includes(model.toLowerCase())),
      message: `Conectado com sucesso ao Ollama local (${latencyMs}ms)! ${models.length} modelo(s) encontrado(s).`,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({
      success: false,
      latencyMs,
      error: isTimeout
        ? `Tempo limite excedido (4s) ao tentar conectar em ${endpoint}. Verifique se o Ollama está rodando ('ollama serve').`
        : `Não foi possível conectar em ${endpoint}: ${err.message || 'Serviço offline'}. Certifique-se de que o Ollama ou servidor local está ativo.`,
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


