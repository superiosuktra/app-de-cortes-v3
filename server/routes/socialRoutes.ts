import { Router, Request, Response } from 'express';
import {
  refreshYouTubeToken,
  exchangeYouTubeAuthCode,
  uploadVideoToYouTube,
} from '../services/youtubeService.js';
import {
  verifyInstagramToken,
  verifyTikTokToken,
  postToInstagram,
  postToTikTok,
} from '../services/socialService.js';
import { stateManager } from '../services/stateService.js';

export const socialRouter = Router();

// 1. Unified Social Media Post Endpoint (YouTube, Instagram, TikTok)
socialRouter.post('/post-social', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 'default';
    const {
      platform,
      token,
      refreshToken,
      clientId,
      clientSecret,
      title,
      caption,
      privacy = 'public',
      videoUrl,
      startTime,
      endTime,
      format,
      hook,
      framing,
      subtitles,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      partBadge,
    } = req.body;
    if (!platform) {
      return res.status(400).json({ error: 'Plataforma não especificada.' });
    }

    const serverCreds = stateManager.getCredentials(userId);
    const rawIncomingToken = (token || '').trim();
    const isMaskedToken = !rawIncomingToken || rawIncomingToken.startsWith('***') || rawIncomingToken.includes('••••');
    const platformVaultToken =
      platform === 'youtube'
        ? serverCreds.youtube.accessToken
        : platform === 'instagram'
          ? serverCreds.instagram.accessToken
          : platform === 'tiktok'
            ? serverCreds.tiktok.accessToken
            : '';

    let cleanToken = (isMaskedToken ? platformVaultToken : rawIncomingToken || '').trim();

    if (!cleanToken && !(platform === 'youtube' && (refreshToken || serverCreds.youtube.refreshToken))) {
      return res.status(400).json({
        error: `Token de acesso não fornecido para ${platform}. Configure na aba 'APIs & Conexões'.`,
      });
    }

    if (platform === 'youtube') {
      const yaMatch = cleanToken.match(/(ya29\.[a-zA-Z0-9_\-\.]+)/);
      if (yaMatch) {
        cleanToken = yaMatch[1];
      }

      if (cleanToken.startsWith('demo_') || cleanToken === 'demo-youtube-token') {
        return res.json({
          success: true,
          platform: 'youtube',
          account: 'Canal Demo (Modo Teste)',
          videoUrl: 'https://youtube.com/shorts/demo_yt_video_123',
          message: `[Modo Demonstração] Publicação transmitida para YouTube Shorts no canal de teste com visibilidade "${privacy}".`,
          publishedAt: new Date().toISOString(),
        });
      }

      const rawRt = (refreshToken || '').trim();
      const cleanRt = rawRt.startsWith('***') || rawRt.includes('••••') ? '' : rawRt;
      const useRefreshToken = (cleanRt || serverCreds.youtube.refreshToken || '').trim();

      // If token is a refresh token starting with 1// or empty
      if (cleanToken.startsWith('1//') || !cleanToken) {
        if (useRefreshToken) {
          const refreshed = await refreshYouTubeToken({
            refreshToken: useRefreshToken,
            clientId,
            clientSecret,
            userId,
          });
          if (refreshed.success && refreshed.accessToken) {
            cleanToken = refreshed.accessToken;
          } else {
            return res.status(400).json({
              error:
                'O código configurado para o YouTube (1//...) é o Refresh Token. Para transmitir vídeos, o YouTube exige o Access Token (começa com ya29...). No seu OAuth Playground (Passo 2), copie o campo "Access token" e cole em APIs & Conexões, ou ative o Modo de Demonstração.',
              isRefreshTokenOnly: true,
            });
          }
        } else {
          return res.status(400).json({
            error:
              'Token de acesso do YouTube não configurado ou inválido. Insira o Access Token (ya29...) na aba APIs & Conexões ou ative o Modo Demonstração.',
          });
        }
      }

      // Real upload to YouTube!
      const uploadResult = await uploadVideoToYouTube({
        token: cleanToken,
        title: title || 'Corte Viral',
        description: caption || '',
        privacy,
        tags: ['Shorts', 'Viral', 'Produtividade'],
        videoUrl,
        startTime,
        endTime,
        format,
        hook,
        framing,
        subtitles,
        teaserOffsetSec,
        teaserDurationSec,
        teaserText,
        partBadge,
      });

      if (uploadResult.success) {
        return res.json({
          success: true,
          platform: 'youtube',
          account: uploadResult.channelTitle || 'Canal do YouTube',
          videoId: uploadResult.videoId,
          videoUrl: uploadResult.videoUrl,
          message: `Vídeo postado no YouTube Shorts (${uploadResult.channelTitle})! Link: ${uploadResult.videoUrl}`,
          publishedAt: new Date().toISOString(),
        });
      }

      // If token expired (401), try automatic refresh via refreshToken
      if (uploadResult.status === 401 && useRefreshToken) {
        const refreshed = await refreshYouTubeToken({
          refreshToken: useRefreshToken,
          clientId,
          clientSecret,
          userId,
        });
        if (refreshed.success && refreshed.accessToken) {
          cleanToken = refreshed.accessToken;
          const retryUpload = await uploadVideoToYouTube({
            token: cleanToken,
            title: title || 'Corte Viral',
            description: caption || '',
            privacy,
            tags: ['Shorts', 'Viral', 'Produtividade'],
            videoUrl,
            startTime,
            endTime,
            format,
            hook,
            framing,
            subtitles,
            teaserOffsetSec,
            teaserDurationSec,
            teaserText,
            partBadge,
          });
          if (retryUpload.success) {
            return res.json({
              success: true,
              platform: 'youtube',
              account: retryUpload.channelTitle || 'Canal do YouTube',
              videoId: retryUpload.videoId,
              videoUrl: retryUpload.videoUrl,
              message: `Vídeo postado no YouTube Shorts (${retryUpload.channelTitle})! Link: ${retryUpload.videoUrl}`,
              publishedAt: new Date().toISOString(),
            });
          }
        }
      }

      if (uploadResult.status === 403) {
        return res.status(403).json({
          error: uploadResult.error?.includes('quota')
            ? 'Cota diária da API do YouTube excedida no projeto do OAuth Playground. Para cota exclusiva, use seu próprio Client ID/Secret.'
            : `Erro YouTube API (403): ${uploadResult.error}`,
        });
      }

      if (uploadResult.status === 401) {
        return res.status(401).json({
          error:
            'Access Token do YouTube (ya29...) expirou. No OAuth Playground (Passo 2), gere um novo Access token ou renove com o Refresh Token.',
        });
      }

      return res.status(uploadResult.status || 500).json({
        error: `Erro YouTube API (${uploadResult.status}): ${uploadResult.error}`,
      });
    }

    if (platform === 'instagram') {
      const igResult = await postToInstagram({ token: cleanToken, caption, videoUrl });
      return res.json(igResult);
    }

    if (platform === 'tiktok') {
      const ttResult = await postToTikTok({ token: cleanToken, caption, videoUrl });
      return res.json(ttResult);
    }

    return res.status(400).json({ error: `Plataforma não suportada: ${platform}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao publicar nas redes.' });
  }
});

// 2. Direct Post to YouTube Shorts
socialRouter.post('/post-youtube', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 'default';
    const { accessToken, refreshToken, clientId, clientSecret, title, description, privacy = 'private', hook, videoUrl, startTime, endTime, format } = req.body;
    const serverCreds = stateManager.getCredentials(userId);

    const rawAt = (accessToken || '').trim();
    const isMaskedAt = !rawAt || rawAt.startsWith('***') || rawAt.includes('••••');
    let tokenToUse = (isMaskedAt ? serverCreds.youtube.accessToken : rawAt || '').trim();

    const rawRt = (refreshToken || '').trim();
    const cleanRt = rawRt.startsWith('***') || rawRt.includes('••••') ? '' : rawRt;
    const useRefreshToken = (cleanRt || serverCreds.youtube.refreshToken || '').trim();

    const yaMatch = tokenToUse.match(/(ya29\.[a-zA-Z0-9_\-\.]+)/);
    if (yaMatch) {
      tokenToUse = yaMatch[1];
    }

    if ((tokenToUse.startsWith('1//') || !tokenToUse) && useRefreshToken) {
      const refreshResult = await refreshYouTubeToken({
        refreshToken: useRefreshToken,
        clientId,
        clientSecret,
        userId,
      });
      if (refreshResult.success && refreshResult.accessToken) {
        tokenToUse = refreshResult.accessToken;
      } else {
        return res.status(400).json({
          error: 'Access Token do YouTube ausente ou expirado e não foi possível renovar automaticamente.',
        });
      }
    }

    const uploadResult = await uploadVideoToYouTube({
      token: tokenToUse,
      title,
      description,
      privacy,
      hook,
      videoUrl,
      startTime,
      endTime,
      format,
    });

    if (uploadResult.success) {
      return res.json(uploadResult);
    }

    return res.status(uploadResult.status || 500).json({
      error: uploadResult.error || 'Erro ao publicar vídeo no YouTube.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao processar postagem no YouTube.' });
  }
});

// 3. Verify YouTube Token (with automatic 4/ Auth Code exchange and 1// Refresh Token renewal)
socialRouter.post('/verify-token/youtube', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 'default';
    const { token, refreshToken, clientId, clientSecret } = req.body;
    const serverCreds = stateManager.getCredentials(userId);
    const rawRt = (refreshToken || '').trim();
    const cleanRt = rawRt.startsWith('***') || rawRt.includes('••••') ? '' : rawRt;
    const effectiveRefresh = (cleanRt || serverCreds.youtube.refreshToken || '').trim();

    const rawToken = (token || '').trim();
    const isMaskedToken = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
    let tokenToUse = (isMaskedToken ? serverCreds.youtube.accessToken : rawToken || '').trim();

    if (!tokenToUse && !effectiveRefresh) {
      return res.status(400).json({ error: 'Token não fornecido. Clique em "Entrar com o Google" para conectar.' });
    }

    let updatedRefreshToken = effectiveRefresh;

    // Clean wrapping quotes or Bearer
    if ((tokenToUse.startsWith('"') && tokenToUse.endsWith('"')) || (tokenToUse.startsWith("'") && tokenToUse.endsWith("'"))) {
      tokenToUse = tokenToUse.slice(1, -1).trim();
    }
    if (tokenToUse.toLowerCase().startsWith('bearer ')) {
      tokenToUse = tokenToUse.slice(7).trim();
    }

    // Extract code from URL if passed
    if (tokenToUse.includes('code=')) {
      try {
        const match = tokenToUse.match(/[?&]code=([^&#\s]+)/);
        if (match && match[1]) tokenToUse = decodeURIComponent(match[1]);
      } catch {}
    } else if (tokenToUse.startsWith('4%2F') || tokenToUse.startsWith('4%2f')) {
      try {
        tokenToUse = decodeURIComponent(tokenToUse);
      } catch {}
    }

    // Parse JSON block if copied directly from Playground
    if (tokenToUse.startsWith('{')) {
      try {
        const parsed = JSON.parse(tokenToUse);
        if (parsed.refresh_token) {
          updatedRefreshToken = parsed.refresh_token;
          stateManager.updateCredentials(
            { youtube: { ...serverCreds.youtube, refreshToken: parsed.refresh_token } },
            userId
          );
        }
        if (parsed.access_token) {
          tokenToUse = parsed.access_token;
        } else if (parsed.refresh_token) {
          tokenToUse = parsed.refresh_token;
        }
      } catch {}
    }

    // Authorization code flow (starts with 4/) -> Automatic backend exchange!
    if (tokenToUse.startsWith('4/')) {
      const authResult = await exchangeYouTubeAuthCode({
        code: tokenToUse,
        clientId,
        clientSecret,
        userId,
      });

      if (authResult.success && authResult.accessToken) {
        tokenToUse = authResult.accessToken;
        if (authResult.refreshToken) updatedRefreshToken = authResult.refreshToken;
      } else {
        return res.status(400).json({
          valid: false,
          isAuthCode: true,
          error:
            authResult.error ||
            'O código de autorização (4/...) expirou ou já foi utilizado. Clique em "Entrar com o Google" para fazer login novamente.',
        });
      }
    }

    // Refresh token flow (starts with 1// or empty accessToken when refreshToken is available)
    if (tokenToUse.startsWith('1//') || (!tokenToUse && updatedRefreshToken)) {
      const rtToUse = tokenToUse.startsWith('1//') ? tokenToUse : updatedRefreshToken;
      updatedRefreshToken = rtToUse;
      stateManager.updateCredentials(
        {
          youtube: {
            ...serverCreds.youtube,
            refreshToken: rtToUse,
            clientId: clientId?.trim() || serverCreds.youtube.clientId,
            clientSecret: clientSecret?.trim() || serverCreds.youtube.clientSecret,
          },
        },
        userId
      );

      const refreshed = await refreshYouTubeToken({
        refreshToken: rtToUse,
        clientId,
        clientSecret,
        userId,
      });
      if (refreshed.success && refreshed.accessToken) {
        tokenToUse = refreshed.accessToken;
      } else {
        return res.status(400).json({
          valid: false,
          isRefreshTokenOnly: true,
          error: refreshed.error || 'Não foi possível renovar o Refresh Token.',
        });
      }
    }

    if (tokenToUse.startsWith('demo_') || tokenToUse === 'demo-youtube-token') {
      stateManager.updateCredentials(
        {
          youtube: {
            ...serverCreds.youtube,
            accessToken: tokenToUse,
            status: 'connected',
            verifiedAt: new Date().toLocaleTimeString('pt-BR'),
          },
        },
        userId
      );
      return res.json({
        valid: true,
        accessToken: tokenToUse,
        accountName: 'Canal YouTube (Modo Teste/Demo)',
        customUrl: '@canal.demonstracao',
        avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60',
        subscribers: '15.4K',
        details: 'Modo Demonstração ativo! Toda a fila automática pode ser testada sem configuração do Google Cloud.',
      });
    }

    let response = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      }
    );

    if (!response.ok && response.status === 401 && updatedRefreshToken) {
      const refreshedResult = await refreshYouTubeToken({
        refreshToken: updatedRefreshToken,
        clientId,
        clientSecret,
        userId,
      });
      if (refreshedResult.success && refreshedResult.accessToken) {
        response = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
          {
            headers: { Authorization: `Bearer ${refreshedResult.accessToken}` },
          }
        );
        if (response.ok) tokenToUse = refreshedResult.accessToken;
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        valid: false,
        error:
          response.status === 401
            ? 'Sessão expirada. Clique no botão "Entrar com o Google" para conectar seu canal em 1 clique!'
            : err?.error?.message || 'Erro ao verificar token com a API do YouTube.',
      });
    }

    const data = await response.json();
    const item = data.items?.[0];
    const accountName = item?.snippet?.title || 'Canal do YouTube';
    const customUrl = item?.snippet?.customUrl;
    const avatar = item?.snippet?.thumbnails?.default?.url;

    const latestCreds = stateManager.getCredentials(userId);
    stateManager.updateCredentials(
      {
        youtube: {
          ...latestCreds.youtube,
          accessToken: tokenToUse,
          refreshToken: updatedRefreshToken || latestCreds.youtube.refreshToken,
          status: 'connected',
          accountName,
          channelTitle: accountName,
          customUrl,
          avatar,
          verifiedAt: new Date().toLocaleTimeString('pt-BR'),
        },
      },
      userId
    );

    res.json({
      valid: true,
      accessToken: tokenToUse,
      refreshToken: updatedRefreshToken || latestCreds.youtube.refreshToken,
      accountName,
      customUrl,
      avatar,
      subscribers: item?.statistics?.subscriberCount,
      details: updatedRefreshToken
        ? 'Conectado permanentemente com Renovação Automática ativa (Nunca Expira)!'
        : 'Conexão ativa com o YouTube Data API v3.',
    });
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message || 'Erro de conexão.' });
  }
});

// 4. Verify Instagram Token
socialRouter.post('/verify-token/instagram', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const result = await verifyInstagramToken(token, req.userId || 'default');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message || 'Erro de conexão.' });
  }
});

// 5. Verify TikTok Token
socialRouter.post('/verify-token/tiktok', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const result = await verifyTikTokToken(token, req.userId || 'default');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message || 'Erro de conexão.' });
  }
});

// 6. Refresh YouTube Token Endpoint
socialRouter.post('/refresh-token/youtube', async (req: Request, res: Response) => {
  const userId = req.userId || 'default';
  const { refreshToken, clientId, clientSecret } = req.body || {};
  const result = await refreshYouTubeToken({ refreshToken, clientId, clientSecret, userId });

  if (result.success && result.accessToken) {
    const serverCreds = stateManager.getCredentials(userId);
    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || serverCreds.youtube.refreshToken,
      channelName: result.channelName || serverCreds.youtube.channelTitle,
      avatar: result.avatar || serverCreds.youtube.avatar,
      customUrl: result.customUrl || serverCreds.youtube.customUrl,
      message: 'Token de acesso do YouTube renovado automaticamente com sucesso!',
      verifiedAt: serverCreds.youtube.verifiedAt,
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Não foi possível renovar o token.',
      missingSecret: result.missingSecret || false,
    });
  }
});

// 7. Exchange Code Endpoint
socialRouter.post('/exchange-code/youtube', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 'default';
    const { code, clientId, clientSecret, redirectUri } = req.body || {};
    if (!code?.trim()) {
      return res.status(400).json({ error: 'Código de autorização não informado.' });
    }

    const result = await exchangeYouTubeAuthCode({ code, clientId, clientSecret, redirectUri, userId });
    if (result.success) {
      return res.json(result);
    }
    return res.status(400).json({ error: result.error || 'Falha ao trocar código de autorização.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao processar troca de código.' });
  }
});

// 8. 1-Click Quick Connect / Auto-Heal Endpoint (/api/auth/google/quick-connect)
socialRouter.post('/auth/google/quick-connect', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 'default';
    const { input } = req.body || {};
    const serverCreds = stateManager.getCredentials(userId);
    const rawInput = (input || '').trim();

    // Case 1: No input passed, but server already has a permanent Refresh Token (1//...) -> Auto-connect in 1 click!
    if (!rawInput && serverCreds.youtube.refreshToken?.startsWith('1//')) {
      const refreshed = await refreshYouTubeToken({
        refreshToken: serverCreds.youtube.refreshToken,
        userId,
      });
      if (refreshed.success) {
        const latest = stateManager.getCredentials(userId).youtube;
        return res.json({
          success: true,
          youtube: latest,
          accountName: latest.channelTitle || refreshed.channelName,
          avatar: latest.avatar || refreshed.avatar,
          customUrl: latest.customUrl || refreshed.customUrl,
          message: `Canal "${latest.channelTitle || refreshed.channelName}" reconectado automaticamente com 1 clique!`,
        });
      }
    }

    // Case 2: Input contains a redirect URL (?code=4/...), Auth Code (4/...), Refresh Token (1//...), or Access Token (ya29...)
    if (rawInput) {
      let codeOrToken = rawInput;
      if (codeOrToken.includes('code=')) {
        const match = codeOrToken.match(/[?&]code=([^&#\s]+)/);
        if (match && match[1]) codeOrToken = decodeURIComponent(match[1]);
      } else if (codeOrToken.startsWith('4%2F') || codeOrToken.startsWith('4%2f')) {
        codeOrToken = decodeURIComponent(codeOrToken);
      }

      if (codeOrToken.startsWith('4/')) {
        const exchanged = await exchangeYouTubeAuthCode({ code: codeOrToken, userId });
        if (exchanged.success) {
          const latest = stateManager.getCredentials(userId).youtube;
          return res.json({
            success: true,
            youtube: latest,
            accountName: latest.channelTitle || exchanged.channelName,
            avatar: latest.avatar || exchanged.avatar,
            customUrl: latest.customUrl || exchanged.customUrl,
            message: exchanged.message,
          });
        }
        return res.status(400).json({
          success: false,
          error: exchanged.error || 'Não foi possível trocar o código de autorização.',
        });
      }

      if (codeOrToken.startsWith('1//')) {
        const refreshed = await refreshYouTubeToken({ refreshToken: codeOrToken, userId });
        if (refreshed.success) {
          const latest = stateManager.getCredentials(userId).youtube;
          return res.json({
            success: true,
            youtube: latest,
            accountName: latest.channelTitle || refreshed.channelName,
            avatar: latest.avatar || refreshed.avatar,
            customUrl: latest.customUrl || refreshed.customUrl,
            message: `Canal "${latest.channelTitle || refreshed.channelName}" conectado permanentemente!`,
          });
        }
      }
    }

    return res.status(400).json({
      success: false,
      needsPopup: true,
      error: 'Abrindo janela de login do Google...',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao conectar com o Google.' });
  }
});

