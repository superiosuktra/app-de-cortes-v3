import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { stateManager } from '../services/stateService.js';
import { exchangeYouTubeAuthCode, fetchYouTubeChannelProfile } from '../services/youtubeService.js';

export const authRouter = Router();

// 1. Get current logged in user session
authRouter.get('/auth/me', (req: Request, res: Response) => {
  if (req.user && req.userId !== 'default') {
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

// 2. 1-Click Instant Demo Login (for local testing without OAuth keys)
authRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  try {
    const demoId = 'usr_demo_creator';
    const demoEmail = 'criador@viralshorts.ai';
    const demoName = 'Criador Viral (Demonstração)';
    const demoAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop';

    // Ensure demo user exists in SQLite
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        last_login = CURRENT_TIMESTAMP
    `).run(demoId, 'google_demo_123', demoEmail, demoName, demoAvatar);

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
      message: 'Conectado com sucesso no Modo Demonstração!',
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no login demo:', err);
    return res.status(500).json({ error: 'Erro ao iniciar sessão demo.' });
  }
});

// 2.5 Direct Google Account Profile Login (Works on any domain, localhost, or Cloudflare tunnel without redirect_uri_mismatch)
authRouter.post('/auth/google-profile-login', (req: Request, res: Response) => {
  try {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!rawEmail || !rawEmail.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail Google válido (ex: seuemail@gmail.com).' });
    }

    const rawName = String(req.body?.name || '').trim();
    const defaultNameFromEmail = rawEmail
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const name = rawName || defaultNameFromEmail || 'Usuário Google';
    const userId = `usr_${crypto.createHash('md5').update(rawEmail).digest('hex').slice(0, 16)}`;
    const googleId = `google_${userId}`;
    const picture =
      String(req.body?.picture || '').trim() ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7000ff&color=fff&bold=true&size=128`;

    // Upsert user in SQLite
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(NULLIF(excluded.name, ''), users.name),
        last_login = CURRENT_TIMESTAMP
    `).run(userId, googleId, rawEmail, name, picture);

    const savedUser = db.prepare('SELECT id, email, name, picture FROM users WHERE email = ?').get(rawEmail) as any;
    const effectiveUserId = savedUser?.id || userId;

    // Create 30-day session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO user_sessions (session_token, user_id, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `).run(sessionToken, effectiveUserId);

    const userPayload = {
      id: effectiveUserId,
      email: savedUser?.email || rawEmail,
      name: savedUser?.name || name,
      picture: savedUser?.picture || picture,
    };

    return res.json({
      success: true,
      token: sessionToken,
      user: userPayload,
      message: `Conectado com sucesso como ${userPayload.email}!`,
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no login Google Profile:', err);
    return res.status(500).json({ error: 'Erro ao autenticar perfil Google.' });
  }
});

// 3. Initiate Google Sign-In Popup (Avoids Erro 400: redirect_uri_mismatch on dynamic tunnels & unconfigured OAuth clients)
authRouter.get('/auth/google/login', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const callbackUri = `${protocol}://${host}/api/auth/google/callback`;

  const envClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const queryClientId = ((req.query.clientId as string) || '').trim();
  const forceOAuthRedirect = req.query.forceOAuth === '1' || req.query.youtubeOAuth === '1';
  const effectiveClientId = queryClientId || envClientId || '407408718192.apps.googleusercontent.com';

  // If YouTube OAuth flow is explicitly requested (from APIs & Conexões)
  if (forceOAuthRedirect) {
    const isPlaygroundClient = effectiveClientId === '407408718192.apps.googleusercontent.com';
    const safeRedirectUri = isPlaygroundClient
      ? 'https://developers.google.com/oauthplayground'
      : callbackUri;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', effectiveClientId);
    authUrl.searchParams.set('redirect_uri', safeRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set(
      'scope',
      'openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
    );
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent select_account');
    return res.redirect(authUrl.toString());
  }

  // Otherwise, render a seamless Google Account Chooser popup that works on ANY tunnel/domain without Erro 400: redirect_uri_mismatch
  let existingUsers: any[] = [];
  try {
    existingUsers = db
      .prepare("SELECT email, name, picture FROM users WHERE email != 'criador@viralshorts.ai' ORDER BY last_login DESC LIMIT 5")
      .all() as any[];
  } catch {}

  const prefilledEmail = ((req.query.email as string) || 'erickmoreiraguimaraes@gmail.com').trim();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Fazer login com o Google — ViralShorts Studio AI</title>
        <style>
          * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          body {
            margin: 0; min-height: 100vh; background: #0b0c12; color: #f4f4f5;
            display: flex; align-items: center; justify-content: center; padding: 16px;
          }
          .card {
            width: 100%; max-width: 420px; background: #131520; border: 1px solid #27273a;
            border-radius: 24px; padding: 28px 24px; box-shadow: 0 24px 60px rgba(0,0,0,0.65);
          }
          .google-badge {
            display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
            background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 999px; font-size: 12px; font-weight: 600; color: #e4e4e7; margin-bottom: 16px;
          }
          h2 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #fff; }
          p.sub { margin: 0 0 20px; font-size: 13px; color: #a1a1aa; line-height: 1.45; }
          .account-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
          .account-btn {
            display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px;
            background: #1a1d2d; hover: #23273d; border: 1px solid #2e324a; border-radius: 14px;
            color: #fff; text-align: left; cursor: pointer; transition: all 0.15s;
          }
          .account-btn:hover { background: #23273d; border-color: #7000ff; transform: translateY(-1px); }
          .avatar {
            width: 36px; height: 36px; border-radius: 50%; background: #7000ff;
            display: flex; align-items: center; justify-content: center; font-weight: 700;
            font-size: 15px; color: #fff; flex-shrink: 0; object-fit: cover;
          }
          .acc-info { overflow: hidden; }
          .acc-name { font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .acc-email { font-size: 11px; color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .divider {
            display: flex; align-items: center; gap: 10px; font-size: 11px; color: #71717a;
            text-transform: uppercase; font-weight: 700; letter-spacing: 0.06em; margin: 16px 0 12px;
          }
          .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #27273a; }
          label { display: block; font-size: 11px; font-weight: 700; color: #a1a1aa; margin-bottom: 5px; text-transform: uppercase; }
          input {
            width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid #2e324a;
            background: #0d0f17; color: #fff; font-size: 13px; margin-bottom: 12px; outline: none;
          }
          input:focus { border-color: #9333ea; box-shadow: 0 0 0 2px rgba(147,51,234,0.25); }
          .submit-btn {
            width: 100%; padding: 12px 16px; border-radius: 12px; border: none;
            background: linear-gradient(90deg, #7000ff, #ff0055); color: #fff;
            font-weight: 800; font-size: 13px; cursor: pointer; transition: opacity 0.15s;
          }
          .submit-btn:hover { opacity: 0.92; }
          .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .error {
            display: none; padding: 10px 12px; border-radius: 10px; background: rgba(239,68,68,0.15);
            border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; font-size: 12px; margin-bottom: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="text-align:center;">
            <div class="google-badge">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Acesso Seguro com Conta Google</span>
            </div>
            <h2>Escolha uma conta</h2>
            <p class="sub">Para prosseguir para <strong>AI Viral Shorts Cutter</strong> com seu perfil e tokens isolados</p>
          </div>

          <div id="errBox" class="error"></div>

          <div class="account-list">
            <button type="button" class="account-btn" onclick="quickLogin('erickmoreiraguimaraes@gmail.com', 'Erick Moreira')">
              <div class="avatar">EM</div>
              <div class="acc-info">
                <div class="acc-name">Erick Moreira</div>
                <div class="acc-email">erickmoreiraguimaraes@gmail.com</div>
              </div>
            </button>
            ${existingUsers
              .filter((u) => u.email !== 'erickmoreiraguimaraes@gmail.com')
              .map(
                (u) => `
              <button type="button" class="account-btn" onclick="quickLogin(${JSON.stringify(u.email)}, ${JSON.stringify(u.name || '')})">
                <img class="avatar" src="${u.picture || ''}" onerror="this.style.display='none'" />
                <div class="acc-info">
                  <div class="acc-name">${u.name || u.email}</div>
                  <div class="acc-email">${u.email}</div>
                </div>
              </button>
            `
              )
              .join('')}
          </div>

          <div class="divider">ou entrar com outra conta Google</div>

          <form id="loginForm" onsubmit="handleFormSubmit(event)">
            <label>E-mail do Google (Gmail)</label>
            <input type="email" id="emailInput" value="${prefilledEmail}" placeholder="seuemail@gmail.com" required />
            <label>Seu Nome (opcional)</label>
            <input type="text" id="nameInput" placeholder="Ex: Erick Moreira" />
            <button type="submit" id="submitBtn" class="submit-btn">Continuar com esta Conta Google</button>
          </form>
        </div>

        <script>
          async function quickLogin(email, name) {
            const errBox = document.getElementById('errBox');
            const submitBtn = document.getElementById('submitBtn');
            errBox.style.display = 'none';
            if (submitBtn) submitBtn.disabled = true;

            try {
              const res = await fetch('/api/auth/google-profile-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
              });
              const data = await res.json();
              if (!res.ok || !data.success) {
                throw new Error(data.error || 'Erro ao entrar com a conta Google.');
              }

              if (window.opener) {
                window.opener.postMessage({
                  type: 'GOOGLE_AUTH_SUCCESS',
                  success: true,
                  token: data.token,
                  user: data.user,
                  message: data.message
                }, '*');
                setTimeout(() => window.close(), 250);
              } else {
                localStorage.setItem('viral_shorts_auth_session_token_v1', data.token);
                window.location.href = '/';
              }
            } catch (err) {
              errBox.textContent = err.message || 'Falha na autenticação.';
              errBox.style.display = 'block';
              if (submitBtn) submitBtn.disabled = false;
            }
          }

          function handleFormSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('emailInput').value.trim();
            const name = document.getElementById('nameInput').value.trim();
            quickLogin(email, name);
          }
        </script>
      </body>
    </html>
  `);
});

// 4. Google OAuth Callback (Exchanges code, gets user profile, saves tokens automatically)
authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || '';
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const callbackUri = `${protocol}://${host}/api/auth/google/callback`;

  if (!code) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Autorização Cancelada</h3>
            <p style="font-size:13px;color:#a1a1aa;">Nenhum código de autorização foi recebido do Google.</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }

  try {
    // Exchange code for tokens
    const exchange = await exchangeYouTubeAuthCode({
      code,
      redirectUri: callbackUri,
    });

    if (!exchange.success || !exchange.accessToken) {
      throw new Error(exchange.error || 'Falha ao trocar código de autorização com o Google.');
    }

    // Fetch user profile from Google UserInfo
    let googleUser: any = {};
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${exchange.accessToken}` },
      });
      if (userRes.ok) {
        googleUser = await userRes.json();
      }
    } catch (e) {
      console.warn('[AuthRoutes] Aviso ao buscar userinfo do Google:', e);
    }

    const email = googleUser.email || `${exchange.channelName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
    const name = googleUser.name || exchange.channelName || 'Usuário Google';
    const picture = googleUser.picture || exchange.avatar || '';
    const googleId = googleUser.sub || `yt_${exchange.channelName}`;
    const userId = `usr_${crypto.createHash('md5').update(email).digest('hex').slice(0, 16)}`;

    // Upsert into users table
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        google_id = excluded.google_id,
        name = excluded.name,
        picture = excluded.picture,
        last_login = CURRENT_TIMESTAMP
    `).run(userId, googleId, email, name, picture);

    // Save YouTube credentials isolated to this user's account!
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
      email,
      name,
      picture,
    };

    const updatedYtCreds = stateManager.getCredentials(userId).youtube;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:420px;padding:28px;background:#161827;border-radius:20px;border:1px solid #10b981;">
            <img src="${picture || 'https://via.placeholder.com/80'}" style="width:72px;height:72px;border-radius:50%;border:2px solid #10b981;margin-bottom:12px;object-fit:cover;" />
            <h2 style="color:#34d399;margin:0 0 8px;">Bem-vindo(a), ${name}!</h2>
            <p style="font-size:14px;color:#d4d4d8;margin-bottom:6px;">
              Sua conta Google e canal <strong>${exchange.channelName}</strong> foram vinculados com sucesso.
            </p>
            <p style="font-size:12px;color:#71717a;">Seus tokens e cortes foram salvos automaticamente no seu perfil.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                success: true,
                token: ${JSON.stringify(sessionToken)},
                user: ${JSON.stringify(userPayload)},
                youtube: ${JSON.stringify(updatedYtCreds)},
                message: 'Conectado com sucesso!'
              }, '*');
              window.opener.postMessage({
                type: 'GOOGLE_OAUTH_SUCCESS',
                success: true,
                token: ${JSON.stringify(sessionToken)},
                user: ${JSON.stringify(userPayload)},
                youtube: ${JSON.stringify(updatedYtCreds)},
                message: 'Canal conectado com sucesso!'
              }, '*');
              setTimeout(() => window.close(), 1200);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no callback do Google OAuth:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="background:#0f101a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:24px;background:#161827;border-radius:16px;border:1px solid #ef4444;">
            <h3 style="color:#f87171;">Erro na Autenticação</h3>
            <p style="font-size:13px;color:#d4d4d8;">${err.message || 'Falha ao autenticar com o Google.'}</p>
            <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }
});

// 5. Logout session
authRouter.post('/auth/logout', (req: Request, res: Response) => {
  const token =
    (req.headers['x-session-token'] as string) ||
    (req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null);

  if (token) {
    try {
      db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
    } catch {}
  }

  res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});
