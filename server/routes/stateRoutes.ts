import { Router, Request, Response } from 'express';
import { stateManager, PersistedCredentials } from '../services/stateService.js';
import { refreshYouTubeToken } from '../services/youtubeService.js';

export const stateRouter = Router();

const ALLOWED_PLATFORMS = new Set(['youtube', 'instagram', 'tiktok', 'kwai', 'gemini']);

/**
 * Builds a strictly masked representation of user credentials by allowlist.
 * Never leaks raw refresh tokens, client secrets, API keys, or cookies.
 */
function maskSecret(val?: string, visibleChars: number = 4): string {
  if (!val || typeof val !== 'string') return '';
  const clean = val.trim();
  if (!clean || clean.startsWith('enc:v1:')) return '••••••••';
  if (clean.length <= visibleChars) return '••••••••';
  return `${clean.slice(0, visibleChars)}••••••••`;
}

export function buildSafeCredentials(creds: PersistedCredentials) {
  const yt = creds.youtube || ({} as any);
  const ig = creds.instagram || ({} as any);
  const tt = creds.tiktok || ({} as any);
  const kw = creds.kwai || ({} as any);
  const gm = creds.gemini || ({} as any);
  const ai = creds.aiConfig || ({} as any);
  const wh = creds.webhooks || ({} as any);

  return {
    youtube: {
      status: yt.status || 'disconnected',
      channelTitle: yt.channelTitle || '',
      displayName: yt.displayName || '',
      accountName: yt.accountName || '',
      customUrl: yt.customUrl || '',
      avatar: yt.avatar || '',
      verifiedAt: yt.verifiedAt || '',
      clientId: yt.clientId ? maskSecret(yt.clientId, 8) : '',
      clientSecret: yt.clientSecret ? '••••••••' : '',
      accessToken: maskSecret(yt.accessToken, 8),
      hasRefreshToken: Boolean(yt.refreshToken),
      hasCookies: Boolean(yt.cookies),
    },
    instagram: {
      status: ig.status || 'disconnected',
      accountName: ig.accountName || '',
      avatar: ig.avatar || '',
      verifiedAt: ig.verifiedAt || '',
      businessAccountId: ig.businessAccountId || '',
      appId: ig.appId || '',
      appSecret: ig.appSecret ? '••••••••' : '',
      accessToken: maskSecret(ig.accessToken, 8),
    },
    tiktok: {
      status: tt.status || 'disconnected',
      displayName: tt.displayName || '',
      avatar: tt.avatar || '',
      verifiedAt: tt.verifiedAt || '',
      clientKey: tt.clientKey || '',
      clientSecret: tt.clientSecret ? '••••••••' : '',
      accessToken: maskSecret(tt.accessToken, 8),
    },
    kwai: {
      status: kw.status || 'disconnected',
      accountName: kw.accountName || '',
      avatar: kw.avatar || '',
      verifiedAt: kw.verifiedAt || '',
      appId: kw.appId || '',
      appSecret: kw.appSecret ? '••••••••' : '',
      accessToken: maskSecret(kw.accessToken, 8),
    },
    gemini: {
      status: gm.status || 'disconnected',
      model: gm.model || 'gemini-3.8-flash',
      verifiedAt: gm.verifiedAt || '',
      apiKey: maskSecret(gm.apiKey, 6),
      configured: Boolean(gm.apiKey),
    },
    aiConfig: {
      provider: ai.provider || 'gemini',
      ollamaEndpoint: ai.ollamaEndpoint || 'http://localhost:11434',
      ollamaModel: ai.ollamaModel || 'llama3:8b',
      activeModel: ai.activeModel || 'gemini-3.8-flash',
      status: ai.status || 'disconnected',
      latencyMs: ai.latencyMs || 0,
      hasOpenAiKey: Boolean(ai.openaiApiKey),
      hasAnthropicKey: Boolean(ai.anthropicApiKey),
    },
    webhooks: {
      hasDiscordWebhook: Boolean(wh.discordWebhookUrl),
      hasTelegramToken: Boolean(wh.telegramBotToken),
      telegramChatId: wh.telegramChatId || '',
    },
  };
}

// 1. Get Persisted State for authenticated user (with masked credentials)
stateRouter.get('/storage/state', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  let state = stateManager.getState(userId);

  // Auto-heal YouTube connection if a permanent Refresh Token is saved
  const yt = state.credentials?.youtube;
  if (yt?.refreshToken?.startsWith('1//') && (yt.status !== 'connected' || !yt.accessToken)) {
    try {
      const refreshed = await refreshYouTubeToken({ refreshToken: yt.refreshToken, userId });
      if (refreshed.success) {
        state = stateManager.getState(userId);
      }
    } catch {}
  }

  const safeCredentials = buildSafeCredentials(state.credentials);

  res.json({
    success: true,
    userId,
    state: {
      ...state,
      credentials: safeCredentials,
    },
    autoSaveActive: true,
    lastUpdated: state.lastUpdated,
  });
});

// 2. Save Persisted State for authenticated user
stateRouter.post('/storage/state', (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const { savedCuts, viralCuts, queue, autoPostSettings, credentials } = req.body;
    stateManager.updateFullState(
      {
        savedCuts,
        viralCuts,
        queue,
        autoPostSettings,
        credentials,
      },
      userId
    );

    const state = stateManager.getState(userId);
    res.json({
      success: true,
      userId,
      message: 'Dados salvos automaticamente com sucesso no perfil do usuário.',
      lastUpdated: state.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao persistir dados.' });
  }
});

// 3. Storage Status
stateRouter.get('/storage/status', (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const state = stateManager.getState(userId);
  res.json({
    userId,
    autoSaveActive: true,
    persistentStorage: true,
    lastUpdated: state.lastUpdated,
    savedCutsCount: state.savedCuts.length,
    viralCutsCount: Array.isArray(state.viralCuts) ? state.viralCuts.length : 0,
    queueCount: state.queue.length,
  });
});

// 4. Get Credentials (strictly masked by allowlist)
stateRouter.get('/settings/credentials', (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const creds = stateManager.getCredentials(userId);
  const safeCreds = buildSafeCredentials(creds);

  res.json({ userId, credentials: safeCreds, rawAvailable: false, autoSaveActive: true });
});

// 5. Update Credentials for authenticated user
stateRouter.post('/settings/credentials', (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const { credentials } = req.body;
  if (credentials) {
    stateManager.updateCredentials(credentials, userId);
  }
  res.json({ success: true, userId, message: 'Credenciais sincronizadas e gravadas com sucesso no perfil.' });
});

// 6. Clear Credentials for authenticated user with strict platform validation
stateRouter.post('/settings/credentials/clear', (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const { platform } = req.body;
  if (!platform || typeof platform !== 'string' || !ALLOWED_PLATFORMS.has(platform)) {
    return res.status(400).json({
      error: 'Plataforma inválida para redefinição. Escolha: youtube, instagram, tiktok, kwai ou gemini.',
    });
  }

  stateManager.clearCredentials(platform, userId);
  res.json({ success: true, userId, message: `Credenciais da plataforma ${platform} removidas com sucesso.` });
});
