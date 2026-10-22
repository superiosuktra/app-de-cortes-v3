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

/**
 * Extracts session token or userId from headers, cookies or query,
 * verifies the session against SQLite, and attaches req.user and req.userId.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token =
    (req.headers['x-session-token'] as string) ||
    (req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null) ||
    (req.query.sessionToken as string) ||
    (req.headers['x-user-id'] as string);

  if (token) {
    try {
      // 1. Check user_sessions table
      const session = db
        .prepare(`
          SELECT s.user_id, u.id, u.google_id, u.email, u.name, u.picture
          FROM user_sessions s
          JOIN users u ON s.user_id = u.id
          WHERE s.session_token = ?
        `)
        .get(token) as any;

      if (session) {
        req.user = {
          id: session.id,
          google_id: session.google_id,
          email: session.email,
          name: session.name,
          picture: session.picture,
        };
        req.userId = session.id;
        return next();
      }

      // 2. Direct user_id match
      const directUser = db
        .prepare('SELECT id, google_id, email, name, picture FROM users WHERE id = ?')
        .get(token) as any;

      if (directUser) {
        req.user = directUser;
        req.userId = directUser.id;
        return next();
      }
    } catch (e) {
      console.warn('[AuthMiddleware] Erro ao validar token de sessão:', e);
    }
  }

  // Fallback to default user
  req.userId = 'default';
  next();
}
