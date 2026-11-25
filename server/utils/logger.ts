export interface LogMeta {
  userId?: string;
  action?: string;
  status?: string | number;
  durationMs?: number;
  [key: string]: any;
}

export function sanitizeForLogs(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
      .replace(/([?&](?:key|token|access_token|secret|refresh_token)=)[^&]+/gi, '$1[REDACTED]')
      .replace(/(session_token=)[^;]+/gi, '$1[REDACTED]')
      .replace(/(csrf_token=)[^;]+/gi, '$1[REDACTED]')
      .replace(/("?(?:accessToken|refreshToken|clientSecret|apiKey|appSecret|cookies|authorization)"?\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLogs);
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|apiKey|appSecret|cookie|authorization/i.test(k) && typeof v === 'string') {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeForLogs(v);
      }
    }
    return sanitized;
  }
  return value;
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? sanitizeForLogs(meta) : undefined;
    if (process.env.NODE_ENV === 'test') {
      // In test mode, keep standard concise output
      return;
    }
    console.log(JSON.stringify({ timestamp, level: 'info', message: sanitizeForLogs(message), ...cleanMeta }));
  },
  warn(message: string, meta?: LogMeta) {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? sanitizeForLogs(meta) : undefined;
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    console.warn(JSON.stringify({ timestamp, level: 'warn', message: sanitizeForLogs(message), ...cleanMeta }));
  },
  error(message: string, error?: any, meta?: LogMeta) {
    const timestamp = new Date().toISOString();
    const errMsg = error instanceof Error ? error.message : String(error || '');
    const cleanMeta = meta ? sanitizeForLogs(meta) : undefined;
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    console.error(JSON.stringify({ timestamp, level: 'error', message: sanitizeForLogs(message), error: sanitizeForLogs(errMsg), ...cleanMeta }));
  },
};

export default logger;
