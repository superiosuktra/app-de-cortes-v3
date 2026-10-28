import { Request, Response, NextFunction } from 'express';
import path from 'path';

/**
 * 1. HTTP Security Headers Middleware (CSP, Anti-Clickjacking, Nosniff)
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self' https:; frame-src 'self' https://www.youtube.com;"
  );
  // P1 — HSTS: obrigatório em produção para garantir transporte seguro por 2 anos
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
}

/**
 * 2. Prototype Pollution & Input Sanitization Middleware with 413 response on overflow
 */
function inspectAndSanitize(obj: any, depth: number = 0): { data: any; overflow: boolean } {
  if (depth > 12) {
    return { data: obj, overflow: false };
  }

  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // If single string exceeds 500KB (e.g. accidental base64 dump in json), signal overflow
      if (obj.length > 500000) {
        return { data: null, overflow: true };
      }
      return { data: obj.replace(/\0/g, ''), overflow: false };
    }
    return { data: obj, overflow: false };
  }

  if (Array.isArray(obj)) {
    if (obj.length > 5000) {
      return { data: null, overflow: true };
    }
    const cleanArr: any[] = [];
    for (const item of obj) {
      const res = inspectAndSanitize(item, depth + 1);
      if (res.overflow) return { data: null, overflow: true };
      cleanArr.push(res.data);
    }
    return { data: cleanArr, overflow: false };
  }

  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const res = inspectAndSanitize(obj[key], depth + 1);
    if (res.overflow) return { data: null, overflow: true };
    sanitized[key] = res.data;
  }
  return { data: sanitized, overflow: false };
}

export function sanitizeRequestMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const check = inspectAndSanitize(req.body);
    if (check.overflow) {
      return res.status(413).json({ error: 'Payload muito grande (Payload Too Large).' });
    }
    req.body = check.data;
  }
  if (req.query && typeof req.query === 'object') {
    const check = inspectAndSanitize(req.query);
    if (check.overflow) {
      return res.status(413).json({ error: 'Parâmetros de query excederam o limite permitido.' });
    }
    req.query = check.data;
  }
  next();
}

/**
 * 3. Sliding-Window Rate Limiter using req.ip and per-user scope
 */
interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

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
  byUser = false,
  message = 'Muitas requisições em sequência. Aguarde alguns segundos antes de tentar novamente.',
}: {
  windowMs?: number;
  maxRequests?: number;
  scope?: string;
  byUser?: boolean;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.ip is trusted via app.set('trust proxy', 1)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userScope = byUser && req.userId ? `usr:${req.userId}` : `ip:${clientIp}`;
    const key = `${scope}:${userScope}`;
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
 */
export function normalizeSafeYouTubeUrl(urlOrId: string): { videoId: string; canonicalUrl: string } | null {
  const raw = (urlOrId || '').trim();
  if (!raw || raw.startsWith('-') || /[;|`$<>\0\r\n]/.test(raw)) {
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
 * 5. Parse MM:SS or HH:MM:SS or plain seconds to total seconds with strict range checks (minutes and seconds < 60)
 */
export function parseTimeToSeconds(t: string | number): number {
  if (typeof t === 'number') {
    return Number.isFinite(t) && t >= 0 ? Math.floor(t) : NaN;
  }
  if (!t || typeof t !== 'string') return NaN;
  const clean = t.trim();
  if (!clean) return NaN;

  // Plain seconds e.g. "90"
  if (/^\d+$/.test(clean)) {
    const val = parseInt(clean, 10);
    return Number.isFinite(val) && val >= 0 ? val : NaN;
  }

  const parts = clean.split(':');
  if (parts.length === 2) {
    const [mStr, sStr] = parts;
    if (!/^\d+$/.test(mStr) || !/^\d{2}$/.test(sStr)) return NaN;
    const m = parseInt(mStr, 10);
    const s = parseInt(sStr, 10);
    if (s >= 60) return NaN;
    return m * 60 + s;
  }

  if (parts.length === 3) {
    const [hStr, mStr, sStr] = parts;
    if (!/^\d+$/.test(hStr) || !/^\d{2}$/.test(mStr) || !/^\d{2}$/.test(sStr)) return NaN;
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const s = parseInt(sStr, 10);
    if (m >= 60 || s >= 60) return NaN;
    return h * 3600 + m * 60 + s;
  }

  return NaN;
}

export function formatSecondsToTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remS = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

/**
 * 6. Validates timestamp and returns normalized formatted string without fallback silent substitutions.
 * Throws when invalid and no fallback is specified.
 */
export function sanitizeTimestamp(timeStr: string | number, fallbackDefault?: string): string {
  const sec = parseTimeToSeconds(timeStr);
  if (isNaN(sec)) {
    if (fallbackDefault !== undefined) {
      return fallbackDefault;
    }
    throw new Error('Timestamp inválido.');
  }
  return formatSecondsToTimestamp(sec);
}

/**
 * Parses seconds to MM:SS string. Throws error on invalid numbers (e.g. NaN, negative).
 */
export function formatSecondsToMMSS(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || !Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Valor de segundos inválido.');
  }
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
}

/**
 * Cookie Parser with safe percent-decoding (never throws URIError on malformed % sequences)
 */
export function parseCookies(header?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const rawVal = parts.slice(1).join('=').trim();
      try {
        list[key] = decodeURIComponent(rawVal);
      } catch {
        list[key] = rawVal;
      }
    }
  });
  return list;
}

/**
 * Validates HTTP Range headers (RFC 7233). Supports standard, open-ended, and suffix ranges.
 */
export function parseHttpRange(
  rangeHeader: string | undefined,
  fileSize: number
): { valid: boolean; start?: number; end?: number; chunkSize?: number } {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return { valid: false };
  }
  const raw = rangeHeader.slice(6).trim();
  if (raw.includes(',')) return { valid: false }; // multi-range unsupported

  if (raw.startsWith('-')) {
    // Suffix range: bytes=-500 -> last 500 bytes
    const suffixStr = raw.slice(1);
    if (!/^\d+$/.test(suffixStr)) return { valid: false };
    const suffixLen = parseInt(suffixStr, 10);
    if (suffixLen <= 0 || suffixLen > fileSize) return { valid: false };
    const start = fileSize - suffixLen;
    const end = fileSize - 1;
    return { valid: true, start, end, chunkSize: suffixLen };
  }

  const parts = raw.split('-');
  if (parts.length !== 2) return { valid: false };
  const [startStr, endStr] = parts;
  if (!/^\d+$/.test(startStr)) return { valid: false };
  const start = parseInt(startStr, 10);
  if (start < 0 || start >= fileSize) return { valid: false };

  if (endStr === '') {
    // Open-ended: bytes=1500-
    const end = fileSize - 1;
    return { valid: true, start, end, chunkSize: end - start + 1 };
  }

  if (!/^\d+$/.test(endStr)) return { valid: false };
  const end = parseInt(endStr, 10);
  if (end < start || end >= fileSize) return { valid: false };

  return { valid: true, start, end, chunkSize: end - start + 1 };
}

export async function assertSafeOutboundUrl(
  urlStr: string,
  options?: { lookupFn?: (host: string) => Promise<Array<{ address: string; family: number }>> }
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('URL inválida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocolo inseguro: ${parsed.protocol}. Apenas protocolos permitidos (http/https).`);
  }

  const isPrivate = (host: string) => {
    const clean = host.toLowerCase().replace(/^[\[]|[\]]$/g, '');
    if (
      clean === 'localhost' ||
      clean === '127.0.0.1' ||
      clean === '0.0.0.0' ||
      clean === '::1' ||
      clean.startsWith('127.') ||
      clean.startsWith('10.') ||
      clean.startsWith('192.168.') ||
      clean.startsWith('169.254.') ||
      clean.startsWith('::ffff:') ||
      clean.startsWith('fc00:') ||
      clean.startsWith('fd00:') ||
      clean.startsWith('fe80:') ||
      clean.includes('meta-data') ||
      clean.includes('metadata') ||
      clean.endsWith('.internal')
    ) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(clean)) {
      return true;
    }
    return false;
  };

  const cleanHost = parsed.hostname.toLowerCase().replace(/^[\[]|[\]]$/g, '');
  if (isPrivate(cleanHost)) {
    throw new Error(`SSRF bloqueado: endereço de rede privada ou local (${cleanHost})`);
  }

  if (options?.lookupFn) {
    const resolved = await options.lookupFn(parsed.hostname);
    for (const r of resolved) {
      if (isPrivate(r.address)) {
        throw new Error(`SSRF bloqueado: DNS resolveu para endereço privado (${r.address})`);
      }
    }
  }

  return parsed;
}

/**
 * Tracks uploaded files ownership to enforce strict multi-tenant access control
 */
const uploadedFileOwners = new Map<string, string>();

export function registerUploadedFile(filePath: string, userId: string): void {
  uploadedFileOwners.set(path.resolve(filePath).toLowerCase(), userId);
}

export function getUploadedFileOwner(filePath: string): string | undefined {
  return uploadedFileOwners.get(path.resolve(filePath).toLowerCase());
}

/**
 * 7. Path Traversal Guard
 */
export function isPathInsideDir(filePath: string, allowedDir: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(allowedDir);
  return resolvedFile.startsWith(resolvedDir + path.sep) || resolvedFile === resolvedDir;
}

/**
 * 8. Strict Cut Interval Validation (No silent fallbacks, minutes & seconds < 60)
 */
export function validateCutInterval(
  startTime: string | number,
  endTime: string | number,
  maxDuration = 300
): { valid: boolean; error?: string; startSec?: number; endSec?: number; formattedStart?: string; formattedEnd?: string } {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);

  if (isNaN(startSec) || isNaN(endSec)) {
    return {
      valid: false,
      error: 'Formato de tempo inválido. Use MM:SS ou HH:MM:SS (minutos e segundos devem ser menores que 60).',
    };
  }
  if (startSec < 0 || endSec <= 0) {
    return { valid: false, error: 'Os tempos de início e término não podem ser negativos.' };
  }
  if (startSec >= endSec) {
    return { valid: false, error: 'O tempo inicial deve ser menor que o tempo final.' };
  }
  const duration = endSec - startSec;
  if (duration < 3) {
    return { valid: false, error: 'O corte deve ter no mínimo 3 segundos de duração.' };
  }
  if (duration > maxDuration) {
    return { valid: false, error: `A duração do corte não pode exceder ${maxDuration}s (${maxDuration} segundos).` };
  }

  return {
    valid: true,
    startSec,
    endSec,
    formattedStart: formatSecondsToTimestamp(startSec),
    formattedEnd: formatSecondsToTimestamp(endSec),
  };
}
