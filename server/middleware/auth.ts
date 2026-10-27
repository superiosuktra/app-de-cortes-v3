import { Request, Response, NextFunction } from 'express';
import db from '../db.js';

export interface AuthenticatedUser {
  id: string;
  google_id?: string;
  email: string;
  name: string;
  picture?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userId: string;
    }
  }
}

// Public endpoints that do not require an active session
const PUBLIC_API_ROUTES = new Set([
  '/api/auth/me',
  '/api/auth/google/login',
  '/api/auth/google/callback',
  '/api/auth/demo-login',
  '/api/auth/logout',
]);

// Periodic cleanup of expired sessions every 30 minutes
setInterval(() => {
  try {
    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(nowIso);
  } catch (err) {
    console.warn('[AuthMiddleware] Erro na limpeza periódica de sessões expiradas:', err);
  }
}, 30 * 60 * 1000).unref();

/**
 * Extracts and strictly verifies session tokens.
 * ONLY accepts 'Authorization: Bearer <token>' or 'x-session-token'.
 * Rejects and deletes expired sessions. Enforces 401 on protected routes.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only accept Authorization Bearer or x-session-token header
  let token: string | null = null;
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-session-token'] === 'string') {
    token = req.headers['x-session-token'].trim();
  }

  req.userId = '';
  req.user = undefined;

  if (token) {
    try {
      const session = db
        .prepare('SELECT user_id, session_token, expires_at, created_at FROM user_sessions WHERE session_token = ?')
        .get(token) as any;

      if (session) {
        // Validate expiration
        const expiresAtMs = new Date(session.expires_at).getTime();
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          // Session expired -> delete and do not authenticate
          try {
            db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
          } catch {}
        } else {
          // Find user by user_id
          const user = db
            .prepare('SELECT id, google_id, email, name, picture FROM users WHERE id = ?')
            .get(session.user_id) as any;

          if (user) {
            req.user = {
              id: user.id,
              google_id: user.google_id,
              email: user.email,
              name: user.name || 'Criador',
              picture: user.picture,
            };
            req.userId = user.id;
          }
        }
      }
    } catch (e) {
      console.warn('[AuthMiddleware] Erro ao validar token de sessão:', e);
    }
  }

  // Allow non-API requests (static assets, SPA entry points, legal pages)
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // Allow explicitly public API endpoints
  const cleanPath = req.path.replace(/\/$/, '');
  if (PUBLIC_API_ROUTES.has(cleanPath)) {
    return next();
  }

  // If user is authenticated, proceed
  if (req.user && req.userId) {
    return next();
  }

  // Protected API endpoint called without valid authentication
  return res.status(401).json({
    error: 'Acesso não autorizado. Faça login para continuar.',
    code: 'UNAUTHORIZED',
  });
}

export const resolveSessionMiddleware = authMiddleware;
