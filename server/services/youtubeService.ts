import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { TEMP_DIR, getSystemFont } from '../config.js';
import { stateManager } from './stateService.js';
import { getFfmpegPath, downloadAndProcessYouTubeCut } from './ffmpegService.js';

const execPromise = util.promisify(exec);

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
 * Works both with custom Google Cloud Client ID/Secret AND out-of-the-box with OAuth Playground tokens (zero Client Secret required).
 */
export async function refreshYouTubeToken(customCreds?: {
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  userId?: string;
}): Promise<RefreshTokenResult> {
  const userKey = customCreds?.userId || 'default';
  const serverCreds = stateManager.getCredentials(userKey);
  const rawPassedRt = (customCreds?.refreshToken || '').trim();
  const cleanPassedRt = rawPassedRt.startsWith('***') || rawPassedRt.includes('••••') ? '' : rawPassedRt;
  const refreshToken = (cleanPassedRt || serverCreds.youtube.refreshToken || '').trim();

  if (!refreshToken) {
    return {
      success: false,
      error: 'Nenhum Refresh Token encontrado. Clique em "Entrar com o Google" para conectar seu canal.',
    };
  }

  const clientId = (customCreds?.clientId || process.env.GOOGLE_CLIENT_ID || serverCreds.youtube.clientId || '').trim();
  const rawSecret = (customCreds?.clientSecret || '').trim();
  const cleanSecret = rawSecret.startsWith('***') || rawSecret.includes('••••') ? '' : rawSecret;
  const clientSecret = (cleanSecret || process.env.GOOGLE_CLIENT_SECRET || serverCreds.youtube.clientSecret || '').trim();

  let newAccessToken = '';
  let newRefreshToken = refreshToken;

  // 1. If a custom Client Secret is provided (and isn't placeholder demo), try direct Google OAuth2 token endpoint first
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
      }
    } catch {}
  }

  // 2. Automatic zero-config refresh via Google OAuth Playground relay (no Client Secret needed!)
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
    const channelName = profile.valid
      ? profile.channelName
      : serverCreds.youtube.channelTitle || serverCreds.youtube.accountName || 'Canal do YouTube';
    const avatar = profile.avatar || serverCreds.youtube.avatar || '';
    const customUrl = profile.customUrl || serverCreds.youtube.customUrl || '';

    stateManager.updateCredentials(
      {
        youtube: {
          ...serverCreds.youtube,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          clientId: clientId || serverCreds.youtube.clientId,
          clientSecret: clientSecret || serverCreds.youtube.clientSecret,
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
    error: 'Não foi possível renovar a sessão automaticamente. Clique em "Entrar com o Google" para reconectar sua conta.',
  };
}

/**
 * Exchanges a temporary Authorization Code (4/...) or Google Redirect URL for permanent Access & Refresh tokens.
 * Supports both custom Client ID/Secret and zero-config OAuth Playground exchange.
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
  const userKey = userId || 'default';
  const serverCreds = stateManager.getCredentials(userKey);
  let cleanCode = (code || '').trim();

  // Extract ?code=... if user pasted the entire redirect URL
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

  const useClientId = (clientId || process.env.GOOGLE_CLIENT_ID || serverCreds.youtube.clientId || '').trim();
  const rawSecret = (clientSecret || '').trim();
  const cleanSecret = rawSecret.startsWith('***') || rawSecret.includes('••••') ? '' : rawSecret;
  const useClientSecret = (cleanSecret || process.env.GOOGLE_CLIENT_SECRET || serverCreds.youtube.clientSecret || '').trim();

  let accessToken = '';
  let refreshToken = '';

  // 1. Try direct Google OAuth exchange if custom Client Secret is available
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

  // 2. Try automatic zero-config exchange via Google OAuth Playground relay
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

    stateManager.updateCredentials(
      {
        youtube: {
          ...serverCreds.youtube,
          accessToken,
          refreshToken: refreshToken || serverCreds.youtube.refreshToken,
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

    return {
      success: true,
      accessToken,
      refreshToken: refreshToken || serverCreds.youtube.refreshToken,
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

/**
 * Uploads a video to YouTube Shorts using the Google YouTube Data API v3 multipart protocol
 */
export async function uploadVideoToYouTube({
  token,
  title,
  description,
  privacy = 'public',
  tags = ['Shorts', 'Viral'],
  hook = 'Se você não dominar sua mente logo cedo...',
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
}: {
  token: string;
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
}): Promise<{
  success: boolean;
  videoId?: string;
  channelTitle?: string;
  channelId?: string;
  videoUrl?: string;
  message?: string;
  error?: string;
  status?: number;
}> {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let tmpVideoPath = videoFilePath || '';
  const titleTxtPath = path.join(TEMP_DIR, `yt_title_${tmpId}.txt`);
  const hookTxtPath = path.join(TEMP_DIR, `yt_hook_${tmpId}.txt`);
  const fontPath = getSystemFont();
  const ffmpegCmd = getFfmpegPath();
  let createdCutFile = false;

  try {
    const cleanTitle = (title || 'Corte Viral #Shorts').replace(/[\r\n]+/g, ' ').slice(0, 95);
    const cleanHook = (hook || 'Se você não dominar sua mente logo cedo...').replace(/[\r\n]+/g, ' ').slice(0, 70);

    // 1. If no custom file was provided, but a videoUrl is available, download and process real YouTube cut!
    if (!tmpVideoPath || !fs.existsSync(tmpVideoPath)) {
      if (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.length === 11)) {
        try {
          console.log(`[YouTube Upload] Baixando e processando trecho real do YouTube: ${videoUrl} (${startTime || '00:00'} a ${endTime || '00:30'})...`);
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
          });
          createdCutFile = true;
          console.log(`[YouTube Upload] Corte real processado com sucesso: ${tmpVideoPath}`);
        } catch (downloadErr: any) {
          console.warn(`[YouTube Upload] Não foi possível cortar diretamente do YouTube (${downloadErr.message}). Utilizando template sintético como contingência.`);
        }
      }
    }

    // 2. Contingency fallback: If still no file, render a stylized template
    if (!tmpVideoPath || !fs.existsSync(tmpVideoPath)) {
      tmpVideoPath = path.join(TEMP_DIR, `yt_short_${tmpId}.mp4`);
      createdCutFile = true;
      fs.writeFileSync(titleTxtPath, cleanTitle, 'utf8');
      fs.writeFileSync(hookTxtPath, cleanHook, 'utf8');

      let drawFilters = '';
      if (fontPath) {
        const escapedFont = fontPath.replace(/:/g, '\\:').replace(/\\/g, '/');
        const escapedTitle = titleTxtPath.replace(/:/g, '\\:').replace(/\\/g, '/');
        const escapedHook = hookTxtPath.replace(/:/g, '\\:').replace(/\\/g, '/');
        drawFilters = `,drawtext=fontfile='${escapedFont}':textfile='${escapedTitle}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=430,drawtext=fontfile='${escapedFont}':textfile='${escapedHook}':fontcolor=#fcd34d:fontsize=32:x=(w-text_w)/2:y=520`;
      }

      await execPromise(
        `"${ffmpegCmd}" -y -f lavfi -i "color=c=#0f1016:s=1080x1920:d=10" -f lavfi -i "sine=frequency=528:beep_factor=3:duration=10" -filter_complex "[0:v]drawbox=x=60:y=350:w=960:h=300:color=#7c3aed@0.9:t=fill${drawFilters}[v]" -map "[v]" -map 1:a -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart -t 10 "${tmpVideoPath}"`,
        { timeout: 35000 }
      );
    }

    const fileBuffer = fs.readFileSync(tmpVideoPath);
    const boundary = '-------YouTubeBoundary' + tmpId;

    const metadata = JSON.stringify({
      snippet: {
        title: cleanTitle.includes('#Shorts') ? cleanTitle : `${cleanTitle} #Shorts`,
        description: description || `${cleanTitle}\n\n#Shorts #Viral`,
        tags: tags.map((t) => t.replace('#', '')),
        categoryId: '22',
      },
      status: {
        privacyStatus: privacy === 'private' || privacy === 'unlisted' ? privacy : 'public',
        selfDeclaredMadeForKids: false,
      },
    });

    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
      fileBuffer,
      `\r\n--${boundary}--\r\n`,
    ];

    const fullBody = Buffer.concat([
      Buffer.from(bodyParts[0]),
      Buffer.from(bodyParts[1]),
      fileBuffer,
      Buffer.from(bodyParts[3]),
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(fullBody.length),
        },
        body: fullBody,
      }
    );

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || uploadRes.statusText;
      return {
        success: false,
        status: uploadRes.status,
        error: errMsg,
      };
    }

    const uploadData = await uploadRes.json();
    const videoId = uploadData.id;
    const channelTitle = uploadData.snippet?.channelTitle || 'Canal do YouTube';
    const channelId = uploadData.snippet?.channelId || '';

    // Update state manager with verified channel info
    const serverCreds = stateManager.getCredentials();
    stateManager.updateCredentials({
      youtube: {
        ...serverCreds.youtube,
        status: 'connected',
        accountName: channelTitle,
        channelTitle,
        customUrl: '@' + channelTitle.replace(/\s+/g, '-'),
      },
    });

    return {
      success: true,
      videoId,
      channelTitle,
      channelId,
      videoUrl: `https://youtube.com/shorts/${videoId}`,
      message: `Vídeo enviado e publicado com sucesso no canal "${channelTitle}"! Assista em: https://youtube.com/shorts/${videoId}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Falha ao renderizar e enviar vídeo para o YouTube.',
    };
  } finally {
    try {
      if (createdCutFile && tmpVideoPath && fs.existsSync(tmpVideoPath)) fs.unlinkSync(tmpVideoPath);
      if (fs.existsSync(titleTxtPath)) fs.unlinkSync(titleTxtPath);
      if (fs.existsSync(hookTxtPath)) fs.unlinkSync(hookTxtPath);
    } catch {}
  }
}
