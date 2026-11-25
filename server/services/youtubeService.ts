import fs from 'fs';
import { stateManager } from './stateService.js';
import { downloadAndProcessYouTubeCut } from './ffmpegService.js';
import { AppError, AppErrorCode, isStorageFullError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const ALLOWED_YOUTUBE_PRIVACY = new Set(['public', 'unlisted', 'private']);
export const MAX_YOUTUBE_TITLE_LENGTH = 100;
export const MAX_YOUTUBE_DESCRIPTION_LENGTH = 5000;
export const MAX_YOUTUBE_TAGS_TOTAL_LENGTH = 500;

export interface RefreshTokenResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  channelName?: string;
  customUrl?: string;
  avatar?: string;
  subscribers?: string;
  error?: string;
  missingSecret?: boolean;
}

export interface YouTubeUploadResult {
  success: boolean;
  videoId?: string;
  channelTitle?: string;
  channelId?: string;
  videoUrl?: string;
  message?: string;
  error?: string;
  code?: AppErrorCode;
  status?: number;
  tokenExpired?: boolean;
  quotaExceeded?: boolean;
  renderedFilePath?: string;
}

export function validateYouTubeMetadata({
  title,
  description = '',
  privacy = 'public',
  tags = ['Shorts', 'Viral'],
}: {
  title: string;
  description?: string;
  privacy?: string;
  tags?: string[];
}): {
  valid: boolean;
  error?: string;
  code?: AppErrorCode;
  sanitizedTitle?: string;
  sanitizedDescription?: string;
  sanitizedPrivacy?: 'public' | 'unlisted' | 'private';
  sanitizedTags?: string[];
} {
  const cleanPrivacy = String(privacy || '').trim().toLowerCase();
  if (!ALLOWED_YOUTUBE_PRIVACY.has(cleanPrivacy)) {
    return {
      valid: false,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: 'Privacidade inválida. Aceito apenas: public, unlisted ou private.',
    };
  }

  const rawTitle = String(title || '').replace(/[\r\n]+/g, ' ').trim();
  if (!rawTitle) {
    return {
      valid: false,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: 'O título do vídeo é obrigatório.',
    };
  }
  if (rawTitle.length > MAX_YOUTUBE_TITLE_LENGTH) {
    return {
      valid: false,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: `O título excede o limite máximo de ${MAX_YOUTUBE_TITLE_LENGTH} caracteres do YouTube (atual: ${rawTitle.length}).`,
    };
  }

  const rawDesc = String(description || '');
  if (rawDesc.length > MAX_YOUTUBE_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: `A descrição excede o limite máximo de ${MAX_YOUTUBE_DESCRIPTION_LENGTH} caracteres do YouTube (atual: ${rawDesc.length}).`,
    };
  }

  // Sanitize tags: remove #, <, >, deduplicate, enforce 500-char total YouTube limit
  const sanitizedTags: string[] = [];
  const seen = new Set<string>();
  let totalTagChars = 0;
  for (const rawTag of Array.isArray(tags) ? tags : []) {
    const clean = String(rawTag || '')
      .replace(/^#+/, '')
      .replace(/[<>]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    const addedLen = clean.includes(' ') ? clean.length + 2 : clean.length;
    if (totalTagChars + addedLen + (sanitizedTags.length > 0 ? 1 : 0) > MAX_YOUTUBE_TAGS_TOTAL_LENGTH) {
      break;
    }
    seen.add(key);
    sanitizedTags.push(clean);
    totalTagChars += addedLen + (sanitizedTags.length > 1 ? 1 : 0);
  }

  const hasShorts = rawTitle.toLowerCase().includes('#shorts');
  const finalTitle =
    hasShorts || rawTitle.length + 8 > MAX_YOUTUBE_TITLE_LENGTH ? rawTitle : `${rawTitle} #Shorts`;

  return {
    valid: true,
    sanitizedTitle: finalTitle,
    sanitizedDescription: rawDesc || `${finalTitle}\n\n#Shorts #Viral`,
    sanitizedPrivacy: cleanPrivacy as 'public' | 'unlisted' | 'private',
    sanitizedTags: sanitizedTags.length > 0 ? sanitizedTags : ['Shorts', 'Viral'],
  };
}

function parseYouTubeApiError(
  status: number,
  errJson: any,
  fallbackStatusText: string
): {
  code: AppErrorCode;
  status: number;
  message: string;
  tokenExpired: boolean;
  quotaExceeded: boolean;
} {
  const apiMessage = String(errJson?.error?.message || fallbackStatusText || 'Erro na API do YouTube');
  const firstReason = String(errJson?.error?.errors?.[0]?.reason || '');

  if (
    firstReason === 'quotaExceeded' ||
    firstReason === 'dailyLimitExceeded' ||
    firstReason === 'uploadLimitExceeded' ||
    /quota|exceeded the number of videos|daily limit/i.test(apiMessage)
  ) {
    return {
      code: 'QUOTA_EXCEEDED',
      status: status === 403 ? 429 : status || 429,
      message:
        firstReason === 'uploadLimitExceeded'
          ? 'Limite diário de envios do canal no YouTube atingido. Aguarde 24 horas para publicar novamente.'
          : 'Cota diária da API do YouTube excedida. Aguarde a renovação da cota ou configure seu próprio Client ID/Secret do Google Cloud.',
      tokenExpired: false,
      quotaExceeded: true,
    };
  }

  if (status === 401 || firstReason === 'authError' || /invalid credentials|expired|unauthorized/i.test(apiMessage)) {
    return {
      code: 'YOUTUBE_UPLOAD_FAILED',
      status: 401,
      message:
        'Sessão ou Access Token do YouTube expirado/inválido. Reconecte sua conta do Google ou renove o token e tente publicar novamente sem precisar re-renderizar o vídeo.',
      tokenExpired: true,
      quotaExceeded: false,
    };
  }

  if (firstReason === 'youtubeSignupRequired' || firstReason === 'channelNotFound') {
    return {
      code: 'YOUTUBE_UPLOAD_FAILED',
      status: 403,
      message:
        'Esta conta Google ainda não possui um canal do YouTube criado. Crie um canal no YouTube Studio e tente novamente.',
      tokenExpired: false,
      quotaExceeded: false,
    };
  }

  if (firstReason === 'invalidTitle' || firstReason === 'invalidDescription' || firstReason === 'invalidTags') {
    return {
      code: 'YOUTUBE_UPLOAD_FAILED',
      status: 400,
      message: `Metadados rejeitados pelo YouTube (${firstReason}): ${apiMessage}`,
      tokenExpired: false,
      quotaExceeded: false,
    };
  }

  return {
    code: 'YOUTUBE_UPLOAD_FAILED',
    status: status || 502,
    message: `Falha ao enviar para o YouTube (${status}): ${apiMessage}`,
    tokenExpired: false,
    quotaExceeded: false,
  };
}

/**
 * Helper to fetch YouTube Channel profile from an Access Token
 */
export async function fetchYouTubeChannelProfile(accessToken: string): Promise<{
  valid: boolean;
  channelName: string;
  customUrl: string;
  avatar: string;
  subscribers: string;
}> {
  try {
    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (chRes.ok) {
      const chData = await chRes.json();
      const item = chData.items?.[0];
      return {
        valid: true,
        channelName: item?.snippet?.title || 'Canal do YouTube',
        customUrl: item?.snippet?.customUrl || '@canal.youtube',
        avatar: item?.snippet?.thumbnails?.default?.url || '',
        subscribers: item?.statistics?.subscriberCount || '0',
      };
    }
  } catch {}
  return {
    valid: false,
    channelName: 'Canal do YouTube',
    customUrl: '',
    avatar: '',
    subscribers: '0',
  };
}

/**
 * Automatically refreshes YouTube OAuth Access Token using stored or passed Refresh Token.
 */
export async function refreshYouTubeToken(customCreds?: {
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  userId?: string;
}): Promise<RefreshTokenResult> {
  const userKey = customCreds?.userId;
  const serverCreds = userKey ? stateManager.getCredentials(userKey) : null;
  const rawPassedRt = (customCreds?.refreshToken || '').trim();
  const cleanPassedRt = rawPassedRt.startsWith('***') || rawPassedRt.includes('••••') ? '' : rawPassedRt;
  const refreshToken = (cleanPassedRt || serverCreds?.youtube.refreshToken || '').trim();

  if (!refreshToken) {
    return {
      success: false,
      error: 'Nenhum Refresh Token encontrado. Clique em "Entrar com o Google" para conectar seu canal.',
    };
  }

  const clientId = (customCreds?.clientId || process.env.GOOGLE_CLIENT_ID || serverCreds?.youtube.clientId || '').trim();
  const rawSecret = (customCreds?.clientSecret || '').trim();
  const cleanSecret = rawSecret.startsWith('***') || rawSecret.includes('••••') ? '' : rawSecret;
  const clientSecret = (cleanSecret || process.env.GOOGLE_CLIENT_SECRET || serverCreds?.youtube.clientSecret || '').trim();

  let newAccessToken = '';
  let newRefreshToken = refreshToken;
  let lastError = '';

  // 1. Direct Google OAuth2 token endpoint when Client Secret is available
  if (clientSecret && clientSecret !== 'demo-client-secret') {
    try {
      const params = new URLSearchParams();
      params.append('client_id', clientId || '407408718192.apps.googleusercontent.com');
      params.append('client_secret', clientSecret);
      params.append('refresh_token', refreshToken);
      params.append('grant_type', 'refresh_token');

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          newAccessToken = data.access_token;
          if (data.refresh_token) newRefreshToken = data.refresh_token;
        }
      } else {
        const errBody: any = await response.json().catch(() => ({}));
        lastError = errBody?.error_description || errBody?.error || '';
      }
    } catch (e: any) {
      lastError = e?.message || '';
    }
  }

  // 2. Zero-config refresh via Google OAuth Playground relay
  if (!newAccessToken) {
    try {
      const pgRes = await fetch('https://developers.google.com/oauthplayground/refreshAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          refresh_token: refreshToken,
        }),
      });

      if (pgRes.ok) {
        const pgData = await pgRes.json().catch(() => ({}));
        if (pgData.access_token) {
          newAccessToken = pgData.access_token;
          if (pgData.refresh_token) newRefreshToken = pgData.refresh_token;
        }
      }
    } catch {}
  }

  if (newAccessToken) {
    const profile = await fetchYouTubeChannelProfile(newAccessToken);
    const prevYt = serverCreds?.youtube;
    const channelName = profile.valid
      ? profile.channelName
      : prevYt?.channelTitle || prevYt?.accountName || 'Canal do YouTube';
    const avatar = profile.avatar || prevYt?.avatar || '';
    const customUrl = profile.customUrl || prevYt?.customUrl || '';

    if (userKey) {
      stateManager.updateCredentials(
        {
          youtube: {
            ...prevYt,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            clientId: clientId || prevYt?.clientId,
            clientSecret: clientSecret || prevYt?.clientSecret,
            status: 'connected',
            channelTitle: channelName,
            accountName: channelName,
            displayName: channelName,
            customUrl,
            avatar,
            verifiedAt: new Date().toLocaleTimeString('pt-BR'),
          },
        },
        userKey
      );
    }

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      channelName,
      customUrl,
      avatar,
      subscribers: profile.subscribers,
    };
  }

  return {
    success: false,
    error: lastError
      ? `Não foi possível renovar a sessão do YouTube (${lastError}). Clique em "Entrar com o Google" para reconectar.`
      : 'Não foi possível renovar a sessão automaticamente. Clique em "Entrar com o Google" para reconectar sua conta.',
  };
}

/**
 * Exchanges a temporary Authorization Code (4/...) or Google Redirect URL for permanent Access & Refresh tokens.
 */
export async function exchangeYouTubeAuthCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  userId,
}: {
  code: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  userId?: string;
}) {
  const userKey = userId;
  const serverCreds = userKey ? stateManager.getCredentials(userKey) : null;
  let cleanCode = (code || '').trim();

  if (cleanCode.includes('code=')) {
    try {
      const match = cleanCode.match(/[?&]code=([^&#\s]+)/);
      if (match && match[1]) {
        cleanCode = decodeURIComponent(match[1]);
      }
    } catch {}
  } else if (cleanCode.startsWith('4%2F') || cleanCode.startsWith('4%2f')) {
    try {
      cleanCode = decodeURIComponent(cleanCode);
    } catch {}
  }

  const useClientId = (clientId || process.env.GOOGLE_CLIENT_ID || serverCreds?.youtube.clientId || '').trim();
  const rawSecret = (clientSecret || '').trim();
  const cleanSecret = rawSecret.startsWith('***') || rawSecret.includes('••••') ? '' : rawSecret;
  const useClientSecret = (cleanSecret || process.env.GOOGLE_CLIENT_SECRET || serverCreds?.youtube.clientSecret || '').trim();

  let accessToken = '';
  let refreshToken = '';

  if (useClientSecret && useClientSecret !== 'demo-client-secret') {
    try {
      const params = new URLSearchParams();
      params.append('code', cleanCode);
      params.append('client_id', useClientId || '407408718192.apps.googleusercontent.com');
      params.append('client_secret', useClientSecret);
      params.append('redirect_uri', redirectUri || 'https://developers.google.com/oauthplayground');
      params.append('grant_type', 'authorization_code');

      const googleRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (googleRes.ok) {
        const data = await googleRes.json().catch(() => ({}));
        if (data.access_token) {
          accessToken = data.access_token;
          refreshToken = data.refresh_token || '';
        }
      }
    } catch {}
  }

  if (!accessToken) {
    try {
      const pgRes = await fetch('https://developers.google.com/oauthplayground/exchangeAuthCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          code: cleanCode,
        }),
      });

      if (pgRes.ok) {
        const pgData = await pgRes.json().catch(() => ({}));
        if (pgData.access_token) {
          accessToken = pgData.access_token;
          refreshToken = pgData.refresh_token || '';
        }
      }
    } catch {}
  }

  if (accessToken) {
    const profile = await fetchYouTubeChannelProfile(accessToken);
    const channelName = profile.channelName || 'Canal do YouTube';
    const avatar = profile.avatar || '';
    const customUrl = profile.customUrl || '';

    if (userKey && serverCreds) {
      stateManager.updateCredentials(
        {
          youtube: {
            ...serverCreds.youtube,
            accessToken,
            refreshToken: refreshToken || serverCreds?.youtube.refreshToken,
            clientId: useClientId || serverCreds.youtube.clientId,
            clientSecret: useClientSecret || serverCreds.youtube.clientSecret,
            status: 'connected',
            channelTitle: channelName,
            displayName: channelName,
            accountName: channelName,
            customUrl,
            avatar,
            verifiedAt: new Date().toLocaleTimeString('pt-BR'),
          },
        },
        userKey
      );
    }

    return {
      success: true,
      accessToken,
      refreshToken: refreshToken || serverCreds?.youtube.refreshToken,
      channelName,
      customUrl,
      avatar,
      subscribers: profile.subscribers,
      message: `Sucesso! Canal "${channelName}" conectado permanentemente via Login do Google.`,
    };
  }

  return {
    success: false,
    error: 'Código de autorização expirado ou já utilizado. Clique em "Entrar com o Google" para fazer login novamente.',
  };
}

async function performResumableUpload({
  accessToken,
  videoFilePath,
  fileSize,
  metadata,
}: {
  accessToken: string;
  videoFilePath: string;
  fileSize: number;
  metadata: any;
}): Promise<YouTubeUploadResult> {
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errJson: any = await initRes.json().catch(() => ({}));
    const parsed = parseYouTubeApiError(initRes.status, errJson, initRes.statusText);
    return {
      success: false,
      status: parsed.status,
      code: parsed.code,
      error: parsed.message,
      tokenExpired: parsed.tokenExpired,
      quotaExceeded: parsed.quotaExceeded,
    };
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    return {
      success: false,
      status: 502,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: 'URL de upload resumable não foi retornada pela API do YouTube.',
    };
  }

  const fileStream = fs.createReadStream(videoFilePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: fileStream as any,
    duplex: 'half',
  } as any);

  if (!uploadRes.ok) {
    const errJson: any = await uploadRes.json().catch(() => ({}));
    const parsed = parseYouTubeApiError(uploadRes.status, errJson, uploadRes.statusText);
    return {
      success: false,
      status: parsed.status,
      code: parsed.code,
      error: parsed.message,
      tokenExpired: parsed.tokenExpired,
      quotaExceeded: parsed.quotaExceeded,
    };
  }

  const uploadData: any = await uploadRes.json();
  const videoId = uploadData.id;
  const channelTitle = uploadData.snippet?.channelTitle || 'Canal do YouTube';
  const channelId = uploadData.snippet?.channelId || '';

  return {
    success: true,
    videoId,
    channelTitle,
    channelId,
    videoUrl: `https://youtube.com/shorts/${videoId}`,
    message: `Vídeo enviado e publicado com sucesso no canal "${channelTitle}"! Assista em: https://youtube.com/shorts/${videoId}`,
  };
}

/**
 * Uploads a video to YouTube Shorts using the YouTube Data API v3 resumable protocol.
 * - Validates privacy, title (<= 100 chars), description (<= 5000 chars), and tags
 * - Automatically refreshes expired tokens (401) when refreshToken or userId is available, retrying once without re-rendering
 * - Never deletes the rendered cut file when upload fails
 * - Returns specific, actionable error codes and messages
 */
export async function uploadVideoToYouTube({
  token,
  refreshToken,
  clientId,
  clientSecret,
  title,
  description,
  privacy = 'public',
  tags = ['Shorts', 'Viral'],
  hook = '',
  videoFilePath,
  videoUrl,
  startTime,
  endTime,
  format,
  framing,
  subtitles,
  teaserOffsetSec,
  teaserDurationSec,
  teaserText,
  partBadge,
  userId,
}: {
  token: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  title: string;
  description: string;
  privacy?: string;
  tags?: string[];
  hook?: string;
  videoFilePath?: string;
  videoUrl?: string;
  startTime?: string;
  endTime?: string;
  format?: string;
  framing?: {
    speaker1X?: number;
    speaker1Y?: number;
    speaker2X?: number;
    speaker2Y?: number;
    zoom?: number;
  };
  subtitles?: string[];
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  partBadge?: string;
  userId?: string;
}): Promise<YouTubeUploadResult> {
  let tmpVideoPath = videoFilePath || '';
  let createdCutFile = false;
  let uploadSucceeded = false;

  try {
    const metaCheck = validateYouTubeMetadata({ title, description, privacy, tags });
    if (!metaCheck.valid) {
      return {
        success: false,
        status: 400,
        code: metaCheck.code || 'YOUTUBE_UPLOAD_FAILED',
        error: metaCheck.error,
        renderedFilePath: tmpVideoPath || undefined,
      };
    }

    const cleanTitle = metaCheck.sanitizedTitle!;
    const cleanDescription = metaCheck.sanitizedDescription!;
    const cleanPrivacy = metaCheck.sanitizedPrivacy!;
    const cleanTags = metaCheck.sanitizedTags!;
    const cleanHook = (hook || '').replace(/[\r\n]+/g, ' ').slice(0, 70);

    // 1. Render real YouTube cut if no rendered file was provided
    if (!tmpVideoPath || !fs.existsSync(tmpVideoPath)) {
      if (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.length === 11)) {
        logger.info('[YouTube Upload] Baixando e renderizando trecho real do YouTube', {
          action: 'youtube_upload_prepare',
          startTime: startTime || '00:00',
          endTime: endTime || '00:30',
          userId,
        });
        tmpVideoPath = await downloadAndProcessYouTubeCut({
          videoUrl,
          startTime: startTime || '00:00',
          endTime: endTime || '00:30',
          format: format || 'speaker_center',
          overlayTitle: cleanTitle,
          hook: cleanHook,
          framing,
          subtitles,
          teaserOffsetSec,
          teaserDurationSec,
          teaserText,
          partBadge,
          userId,
        });
        createdCutFile = true;
      }
    }

    if (!tmpVideoPath || !fs.existsSync(tmpVideoPath)) {
      return {
        success: false,
        status: 400,
        code: 'INVALID_MEDIA',
        error: 'Arquivo de vídeo não encontrado para publicação no YouTube Shorts.',
      };
    }

    const stats = fs.statSync(tmpVideoPath);
    if (stats.size === 0) {
      return {
        success: false,
        status: 400,
        code: 'INVALID_MEDIA',
        error: 'O arquivo de vídeo renderizado está vazio (0 bytes) e não pode ser publicado.',
        renderedFilePath: tmpVideoPath,
      };
    }

    let activeToken = String(token || '').trim();
    const serverCreds = userId ? stateManager.getCredentials(userId) : null;
    const effectiveRefreshToken = (
      (refreshToken && !refreshToken.startsWith('***') && !refreshToken.includes('••••') ? refreshToken : '') ||
      serverCreds?.youtube?.refreshToken ||
      ''
    ).trim();

    if ((!activeToken || activeToken.startsWith('1//')) && effectiveRefreshToken) {
      const refreshed = await refreshYouTubeToken({
        refreshToken: effectiveRefreshToken,
        clientId,
        clientSecret,
        userId,
      });
      if (refreshed.success && refreshed.accessToken) {
        activeToken = refreshed.accessToken;
      } else {
        return {
          success: false,
          status: 401,
          code: 'YOUTUBE_UPLOAD_FAILED',
          tokenExpired: true,
          error: refreshed.error || 'Token do YouTube expirado e não foi possível renovar automaticamente.',
          renderedFilePath: tmpVideoPath,
        };
      }
    }

    if (!activeToken) {
      return {
        success: false,
        status: 401,
        code: 'YOUTUBE_UPLOAD_FAILED',
        tokenExpired: true,
        error: 'Access Token do YouTube não informado. Conecte seu canal na Central de Conexões.',
        renderedFilePath: tmpVideoPath,
      };
    }

    const metadata = {
      snippet: {
        title: cleanTitle,
        description: cleanDescription,
        tags: cleanTags,
        categoryId: '22',
      },
      status: {
        privacyStatus: cleanPrivacy,
        selfDeclaredMadeForKids: false,
      },
    };

    let result = await performResumableUpload({
      accessToken: activeToken,
      videoFilePath: tmpVideoPath,
      fileSize: stats.size,
      metadata,
    });

    // Automatic single retry on 401 using refresh token without re-rendering
    if (!result.success && (result.status === 401 || result.tokenExpired) && effectiveRefreshToken) {
      const refreshed = await refreshYouTubeToken({
        refreshToken: effectiveRefreshToken,
        clientId,
        clientSecret,
        userId,
      });
      if (refreshed.success && refreshed.accessToken) {
        result = await performResumableUpload({
          accessToken: refreshed.accessToken,
          videoFilePath: tmpVideoPath,
          fileSize: stats.size,
          metadata,
        });
      }
    }

    if (result.success) {
      uploadSucceeded = true;
      if (userId && result.channelTitle) {
        const latestCreds = stateManager.getCredentials(userId);
        stateManager.updateCredentials(
          {
            youtube: {
              ...latestCreds.youtube,
              status: 'connected',
              accountName: result.channelTitle,
              channelTitle: result.channelTitle,
              customUrl: latestCreds.youtube.customUrl || '@' + result.channelTitle.replace(/\s+/g, '-'),
            },
          },
          userId
        );
      }
      return {
        ...result,
        renderedFilePath: videoFilePath || undefined,
      };
    }

    return {
      ...result,
      renderedFilePath: tmpVideoPath,
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      return {
        success: false,
        status: err.statusCode,
        code: err.code,
        error: err.userMessage,
        renderedFilePath: tmpVideoPath || undefined,
      };
    }
    if (isStorageFullError(err)) {
      return {
        success: false,
        status: 507,
        code: 'STORAGE_FULL',
        error: 'Espaço insuficiente em disco durante o preparo do upload para o YouTube.',
        renderedFilePath: tmpVideoPath || undefined,
      };
    }
    logger.error('[YouTube Upload] Erro inesperado no upload', err, { userId });
    return {
      success: false,
      status: 502,
      code: 'YOUTUBE_UPLOAD_FAILED',
      error: err?.message || 'Falha ao enviar vídeo para o YouTube.',
      renderedFilePath: tmpVideoPath || undefined,
    };
  } finally {
    // NEVER delete the rendered cut when upload fails; only clean internally-created temporary file after successful upload
    if (uploadSucceeded && createdCutFile && tmpVideoPath && fs.existsSync(tmpVideoPath)) {
      try {
        fs.unlinkSync(tmpVideoPath);
      } catch {}
    }
  }
}
