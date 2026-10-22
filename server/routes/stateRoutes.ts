import { Router, Request, Response } from 'express';
import { stateManager } from '../services/stateService.js';
import { refreshYouTubeToken } from '../services/youtubeService.js';
import { STATE_FILE } from '../config.js';

export const stateRouter = Router();

// 1. Get Full Persisted State for current user
stateRouter.get('/storage/state', async (req: Request, res: Response) => {
  const userId = req.userId || 'default';
  let state = stateManager.getState(userId);

  // Auto-heal YouTube connection if a permanent Refresh Token (1//...) is saved
  const yt = state.credentials?.youtube;
  if (yt?.refreshToken?.startsWith('1//') && (yt.status !== 'connected' || !yt.accessToken)) {
    try {
      const refreshed = await refreshYouTubeToken({ refreshToken: yt.refreshToken, userId });
      if (refreshed.success) {
        state = stateManager.getState(userId);
      }
    } catch {}
  }

  res.json({
    success: true,
    userId,
    state,
    autoSaveActive: true,
    lastUpdated: state.lastUpdated,
  });
});

// 2. Save Full Persisted State for current user
stateRouter.post('/storage/state', (req: Request, res: Response) => {
  const userId = req.userId || 'default';
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
  const userId = req.userId || 'default';
  const state = stateManager.getState(userId);
  res.json({
    userId,
    autoSaveActive: true,
    persistentStorage: true,
    lastUpdated: state.lastUpdated,
    savedCutsCount: state.savedCuts.length,
    viralCutsCount: Array.isArray(state.viralCuts) ? state.viralCuts.length : 0,
    queueCount: state.queue.length,
    storagePath: STATE_FILE,
  });
});

// 4. Get Credentials (with masked secrets)
stateRouter.get('/settings/credentials', (req: Request, res: Response) => {
  const userId = req.userId || 'default';
  const creds = stateManager.getCredentials(userId);
  const safeCreds = {
    youtube: {
      ...creds.youtube,
      accessToken: creds.youtube?.accessToken ? `${creds.youtube.accessToken.slice(0, 8)}••••••••` : '',
      clientSecret: creds.youtube?.clientSecret ? '••••••••' : '',
    },
    instagram: {
      ...creds.instagram,
      accessToken: creds.instagram?.accessToken ? `${creds.instagram.accessToken.slice(0, 8)}••••••••` : '',
      appSecret: creds.instagram?.appSecret ? '••••••••' : '',
    },
    tiktok: {
      ...creds.tiktok,
      accessToken: creds.tiktok?.accessToken ? `${creds.tiktok.accessToken.slice(0, 8)}••••••••` : '',
      clientSecret: creds.tiktok?.clientSecret ? '••••••••' : '',
    },
    gemini: {
      ...creds.gemini,
      apiKey: creds.gemini?.apiKey ? `${creds.gemini.apiKey.slice(0, 6)}••••••••` : '',
    },
  };
  res.json({ userId, credentials: safeCreds, rawAvailable: true, autoSaveActive: true });
});

// 5. Update Credentials for current user
stateRouter.post('/settings/credentials', (req: Request, res: Response) => {
  const userId = req.userId || 'default';
  const { credentials } = req.body;
  if (credentials) {
    stateManager.updateCredentials(credentials, userId);
  }
  res.json({ success: true, userId, message: 'Credenciais sincronizadas e gravadas com sucesso no perfil.' });
});

// 6. Clear Credentials for current user
stateRouter.post('/settings/credentials/clear', (req: Request, res: Response) => {
  const userId = req.userId || 'default';
  const { platform } = req.body;
  stateManager.clearCredentials(platform, userId);
  res.json({ success: true, userId, message: 'Credenciais redefinidas e removidas do perfil.' });
});
