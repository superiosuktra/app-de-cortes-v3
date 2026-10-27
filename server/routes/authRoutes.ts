import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { stateManager } from '../services/stateService.js';
import { exchangeYouTubeAuthCode } from '../services/youtubeService.js';
import { createRateLimiter } from '../middleware/security.js';

export const authRouter = Router();

// P1 — Rate limiter agressivo para demo-login: 5 req/min por IP para evitar geração em massa de sessões
const demoLoginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  scope: 'demo-login',
  message: 'Muitas tentativas de login demo. Aguarde 1 minuto antes de tentar novamente.',
});


function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonScript(obj: any): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function parseCookies(header?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${host}`;
}

// 1. Get current logged in user session
authRouter.get('/auth/me', (req: Request, res: Response) => {
  if (req.user && req.userId) {
    return res.json({
      authenticated: true,
      user: req.user,
    });
  }

  return res.json({
    authenticated: false,
    user: null,
  });
});

// 2. Demo Login (ONLY permitted in non-production environments)
authRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Modo demonstração desabilitado em ambiente de produção.',
    });
  }

  try {
    const demoId = `usr_demo_${crypto.randomUUID().slice(0, 8)}`;
    const demoEmail = `convidado_${demoId.slice(9)}@viralshorts.local`;
    const demoName = 'Criador Convidado';
    const demoAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop';

    // Insert isolated demo user
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(demoId, `demo_${demoId}`, demoEmail, demoName, demoAvatar);

    // Create session token
    const sessionToken = `demo_tok_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO user_sessions (session_token, user_id, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `).run(sessionToken, demoId);

    const userObj = {
      id: demoId,
      email: demoEmail,
      name: demoName,
      picture: demoAvatar,
    };

    return res.json({
      success: true,
      token: sessionToken,
      user: userObj,
      message: 'Conectado em ambiente de testes/demonstração.',
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no login demo:', err);
    return res.status(500).json({ error: 'Erro ao iniciar sessão demo.' });
  }
});

// 3. Initiate Google OAuth 2.0 Sign-In
authRouter.get('/auth/google/login', (req: Request, res: Response) => {
  const envClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const baseUrl = getAppBaseUrl(req);
  const callbackUri = `${baseUrl}/api/auth/google/callback`;

  if (!envClientId) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Google OAuth Não Configurado</title>
          <style>
            body { background: #0b0c12; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { max-width: 440px; padding: 28px; background: #131520; border: 1px solid #3f3f46; border-radius: 16px; text-align: center; }
            h3 { color: #f87171; margin-top: 0; }
            p { font-size: 13px; color: #a1a1aa; line-height: 1.5; }
            code { background: #1f2937; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
            button { margin-top: 16px; padding: 10px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="box">
            <h3>Google OAuth Não Configurado</h3>
            <p>Para habilitar o login com o Google, defina as variáveis <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no arquivo <code>.env</code> do servidor.</p>
            <p>URI de redirecionamento configurada: <code>${escapeHtml(callbackUri)}</code></p>
            <button onclick="window.close()">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }

  // Generate anti-CSRF state
  const state = crypto.randomBytes(32).toString('hex');
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/',
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', envClientId);
  authUrl.searchParams.set('redirect_uri', callbackUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent select_account');

  return res.redirect(authUrl.toString());
});

// 4. Google OAuth Callback
authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || '';
  const queryState = (req.query.state as string) || '';
  const queryError = (req.query.error as string) || '';
  const baseUrl = getAppBaseUrl(req);
  const callbackUri = `${baseUrl}/api/auth/google/callback`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Handle explicit OAuth errors from Google
  if (queryError) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Autorização Recusada</h3>
            <p style="font-size:13px;color:#a1a1aa;">O Google retornou o seguinte erro: ${escapeHtml(queryError)}</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }

  // Validate state to prevent CSRF attacks
  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies['google_oauth_state'];
  if (!queryState || !expectedState || queryState !== expectedState) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Falha de Segurança (CSRF)</h3>
            <p style="font-size:13px;color:#a1a1aa;">O parâmetro de validação de estado (state) é inválido ou expirou. Tente novamente.</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }

  // Clear state cookie
  res.clearCookie('google_oauth_state', { path: '/' });

  if (!code) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Código Ausente</h3>
            <p style="font-size:13px;color:#a1a1aa;">Nenhum código de autorização foi recebido do Google.</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const exchange = await exchangeYouTubeAuthCode({
      code,
      redirectUri: callbackUri,
    });

    if (!exchange.success || !exchange.accessToken) {
      throw new Error(exchange.error || 'Falha ao trocar código de autorização com o Google.');
    }

    // Fetch user profile from Google UserInfo
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${exchange.accessToken}` },
    });

    if (!userRes.ok) {
      throw new Error(`Falha ao obter perfil do usuário no Google (${userRes.status}).`);
    }

    const googleUser: any = await userRes.json();
    const verifiedEmail = googleUser.email ? String(googleUser.email).trim().toLowerCase() : '';
    if (!verifiedEmail || !verifiedEmail.includes('@')) {
      throw new Error('E-mail verificado não foi retornado pelo Google.');
    }

    const name = googleUser.name || verifiedEmail.split('@')[0];
    const picture = googleUser.picture || exchange.avatar || '';
    const googleId = googleUser.sub || `google_${crypto.randomUUID()}`;

    // Look up existing user by verified email
    const existingUser = db.prepare('SELECT id, email, name, picture FROM users WHERE email = ?').get(verifiedEmail) as any;
    const userId = existingUser?.id || `usr_${crypto.randomUUID()}`;

    // Upsert into users table
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, googleId, verifiedEmail, name, picture);

    // Save YouTube credentials isolated to this user's account
    stateManager.updateCredentials(
      {
        youtube: {
          accessToken: exchange.accessToken,
          refreshToken: exchange.refreshToken,
          status: 'connected',
          channelTitle: exchange.channelName,
          displayName: exchange.channelName,
          accountName: exchange.channelName,
          customUrl: exchange.customUrl,
          avatar: exchange.avatar || picture,
          verifiedAt: new Date().toLocaleTimeString('pt-BR'),
        },
      },
      userId
    );

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO user_sessions (session_token, user_id, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `).run(sessionToken, userId);

    const userPayload = {
      id: userId,
      email: verifiedEmail,
      name,
      picture,
    };

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Autenticado com Sucesso</title>
        </head>
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:420px;padding:28px;background:#161827;border-radius:20px;border:1px solid #10b981;">
            <h2 style="color:#34d399;margin:0 0 8px;">Bem-vindo(a), ${escapeHtml(name)}!</h2>
            <p style="font-size:14px;color:#d4d4d8;margin-bottom:6px;">
              Sua conta Google <strong>${escapeHtml(verifiedEmail)}</strong> foi vinculada com sucesso.
            </p>
            <p style="font-size:12px;color:#71717a;">Fechando janela e conectando ao estúdio...</p>
          </div>
          <script>
            try {
              localStorage.setItem('app_session_token', ${safeJsonScript(sessionToken)});
            } catch (e) {}

            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                success: true,
                token: ${safeJsonScript(sessionToken)},
                user: ${safeJsonScript(userPayload)},
                message: 'Conectado com sucesso!'
              }, window.location.origin);

              window.opener.postMessage({
                type: 'GOOGLE_OAUTH_SUCCESS',
                success: true,
                token: ${safeJsonScript(sessionToken)},
                user: ${safeJsonScript(userPayload)},
                message: 'Canal conectado com sucesso!'
              }, window.location.origin);

              setTimeout(() => window.close(), 800);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no callback do Google OAuth:', err);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Erro na Autenticação</h3>
            <p style="font-size:13px;color:#d4d4d8;">${escapeHtml(err.message || 'Falha ao autenticar com o Google.')}</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }
});

// 5. Logout session
authRouter.post('/auth/logout', (req: Request, res: Response) => {
  let token: string | null = null;
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-session-token'] === 'string') {
    token = req.headers['x-session-token'].trim();
  }

  if (token) {
    try {
      db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
    } catch {}
  }

  res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});
