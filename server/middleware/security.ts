import { Request, Response, NextFunction } from 'express';
import path from 'path';

/**
 * 1. HTTP Security Headers Middleware (Helmet-grade protection)
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
}

/**
 * 2. Prototype Pollution & Input Sanitization Middleware
 */
function cleanObject(obj: any, depth: number = 0): any {
  if (depth > 8 || obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Strip null bytes and cap maximum string length to 60KB
      return obj.replace(/\0/g, '').slice(0, 60000);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 200).map((item) => cleanObject(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    sanitized[key] = cleanObject(obj[key], depth + 1);
  }
  return sanitized;
}

export function sanitizeRequestMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = cleanObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = cleanObject(req.query);
  }
  next();
}

/**
 * 3. Sliding-Window In-Memory Rate Limiter (DoS & Brute-Force Protection)
 */
interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

// Periodic cleanup to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 60,
  scope = 'global',
  message = 'Muitas requisições em sequência. Aguarde alguns segundos antes de tentar novamente.',
}: {
  windowMs?: number;
  maxRequests?: number;
  scope?: string;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${scope}:${clientIp}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(maxRequests - 1));
      return next();
    }

    current.count += 1;
    const remaining = Math.max(0, maxRequests - current.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (current.count > maxRequests) {
      const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

/**
 * 4. Strict SSRF & Argument Injection Guard for YouTube URLs
 * Always normalizes any valid YouTube input into a canonical `https://www.youtube.com/watch?v=<11-char-id>` URL.
 * Rejects internal IPs, non-YouTube domains, file:// schemes, or CLI option flags (starting with '-').
 */
export function normalizeSafeYouTubeUrl(urlOrId: string): { videoId: string; canonicalUrl: string } | null {
  const raw = (urlOrId || '').trim();
  if (!raw || raw.startsWith('-')) {
    return null;
  }

  // Direct 11-character YouTube ID
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return {
      videoId: raw,
      canonicalUrl: `https://www.youtube.com/watch?v=${raw}`,
    };
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    const allowedHosts = new Set([
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'www.youtu.be',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ]);

    if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const match = raw.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    const videoId = match?.[1] || parsed.searchParams.get('v') || '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return null;
    }

    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch {
    return null;
  }
}

/**
 * 5. Validate MM:SS or HH:MM:SS timestamp format to prevent yt-dlp section injection
 */
export function sanitizeTimestamp(timeStr: string, fallback: string = '00:00'): string {
  const clean = (timeStr || '').trim();
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(clean)) {
    return clean;
  }
  return fallback;
}

/**
 * 6. Path Traversal Guard
 */
export function isPathInsideDir(filePath: string, allowedDir: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(allowedDir);
  return resolvedFile.startsWith(resolvedDir + path.sep) || resolvedFile === resolvedDir;
}

/**
 * 7. Parse MM:SS or HH:MM:SS to total seconds
 */
export function parseTimeToSeconds(t: string | number): number {
  if (typeof t === 'number') return t;
  if (!t || typeof t !== 'string') return NaN;
  const parts = t.trim().split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return NaN;
}

/**
 * 8. Strict Cut Interval Validation (Bounds, duration, ordering)
 */
export function validateCutInterval(
  startTime: string | number,
  endTime: string | number,
  maxDuration = 180
): { valid: boolean; error?: string; startSec?: number; endSec?: number } {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);

  if (isNaN(startSec) || isNaN(endSec) || !isFinite(startSec) || !isFinite(endSec)) {
    return { valid: false, error: 'Intervalo de corte inválido (valores não numéricos).' };
  }
  if (startSec < 0 || endSec <= 0) {
    return { valid: false, error: 'Tempos de corte não podem ser negativos ou zero.' };
  }
  if (startSec >= endSec) {
    return { valid: false, error: 'O tempo inicial deve ser menor que o tempo final.' };
  }
  const duration = endSec - startSec;
  if (duration < 3) {
    return { valid: false, error: 'O corte deve ter no mínimo 3 segundos de duração.' };
  }
  if (duration > maxDuration) {
    return { valid: false, error: `A duração do corte não pode exceder ${maxDuration} segundos.` };
  }
  return { valid: true, startSec, endSec };
}
