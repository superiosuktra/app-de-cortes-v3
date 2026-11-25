import crypto from 'crypto';
import type { Response } from 'express';
import { logger } from './logger.js';

export type AppErrorCode =
  | 'YOUTUBE_BLOCKED'
  | 'YOUTUBE_DOWNLOAD_FAILED'
  | 'INVALID_MEDIA'
  | 'FFMPEG_FAILED'
  | 'INVALID_CUT_INTERVAL'
  | 'QUOTA_EXCEEDED'
  | 'STORAGE_FULL'
  | 'YOUTUBE_UPLOAD_FAILED'
  | 'JOB_NOT_FOUND'
  | 'JOB_CANNOT_CANCEL';

export interface AppErrorOptions {
  code: AppErrorCode;
  statusCode?: number;
  userMessage: string;
  internalMessage?: string;
  correlationId?: string;
  cause?: unknown;
  details?: Record<string, any>;
}

const DEFAULT_STATUS_BY_CODE: Record<AppErrorCode, number> = {
  YOUTUBE_BLOCKED: 422,
  YOUTUBE_DOWNLOAD_FAILED: 502,
  INVALID_MEDIA: 400,
  FFMPEG_FAILED: 500,
  INVALID_CUT_INTERVAL: 400,
  QUOTA_EXCEEDED: 429,
  STORAGE_FULL: 507,
  YOUTUBE_UPLOAD_FAILED: 502,
  JOB_NOT_FOUND: 404,
  JOB_CANNOT_CANCEL: 409,
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly userMessage: string;
  public readonly correlationId: string;
  public readonly details?: Record<string, any>;

  constructor(options: AppErrorOptions) {
    super(options.internalMessage || options.userMessage, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? DEFAULT_STATUS_BY_CODE[options.code] ?? 500;
    this.userMessage = options.userMessage;
    this.correlationId = options.correlationId || crypto.randomUUID();
    this.details = options.details;
  }
}

export function isBotChallengeMessage(raw: string): boolean {
  const msg = String(raw || '');
  return (
    msg.includes('Sign in to confirm you’re not a bot') ||
    msg.includes("Sign in to confirm you're not a bot") ||
    msg.includes('Sign in to confirm you are not a bot')
  );
}

export function isStorageFullError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || err.stderr || '').toLowerCase();
  return (
    code === 'ENOSPC' ||
    msg.includes('no space left on device') ||
    msg.includes('enospc') ||
    msg.includes('cota de armazenamento')
  );
}

export function classifyError(err: unknown, fallbackCode: AppErrorCode = 'FFMPEG_FAILED'): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const anyErr = err as any;
  const rawMsg = String(anyErr?.message || anyErr || '');
  const stderr = String(anyErr?.stderr || '');
  const combined = `${rawMsg}\n${stderr}`;

  if (isStorageFullError(anyErr)) {
    return new AppError({
      code: 'STORAGE_FULL',
      statusCode: 507,
      userMessage: 'Espaço de armazenamento insuficiente no servidor para concluir a operação.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (isBotChallengeMessage(combined)) {
    return new AppError({
      code: 'YOUTUBE_BLOCKED',
      statusCode: 422,
      userMessage:
        'O YouTube solicitou confirmação de acesso (bloqueio anti-bot). Salve seus cookies do YouTube na Central de Conexões ou envie o vídeo localmente.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (/quota|dailyLimitExceeded|uploadLimitExceeded|cota diária/i.test(combined)) {
    return new AppError({
      code: 'QUOTA_EXCEEDED',
      statusCode: 429,
      userMessage:
        'Cota da API do YouTube excedida. Aguarde a renovação da cota diária ou configure seu próprio Client ID/Secret do Google Cloud.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (
    /intervalo|tempo inicial|tempo final|timestamp inválido|excede a duração real|mínimo 3 segundos|não pode exceder \d+s/i.test(
      rawMsg
    )
  ) {
    return new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: rawMsg || 'Intervalo de corte inválido para este vídeo.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (
    /ffprobe|stream de vídeo|arquivo corrompido|0 bytes|mídia inválid|vídeo fonte inválido|sem stream de vídeo/i.test(
      combined
    )
  ) {
    return new AppError({
      code: 'INVALID_MEDIA',
      statusCode: 400,
      userMessage: rawMsg || 'O arquivo de mídia é inválido ou está corrompido.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (/yt-dlp|download do youtube|url do youtube/i.test(combined)) {
    return new AppError({
      code: 'YOUTUBE_DOWNLOAD_FAILED',
      statusCode: 502,
      userMessage: rawMsg || 'Falha ao baixar o vídeo do YouTube. Verifique se o vídeo está público e disponível.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  if (/youtube api|publicar.*youtube|upload.*youtube|resumable/i.test(combined)) {
    return new AppError({
      code: 'YOUTUBE_UPLOAD_FAILED',
      statusCode: 502,
      userMessage: rawMsg || 'Falha ao enviar o vídeo para o YouTube.',
      internalMessage: rawMsg,
      cause: err,
    });
  }

  return new AppError({
    code: fallbackCode,
    statusCode: DEFAULT_STATUS_BY_CODE[fallbackCode] ?? 500,
    userMessage:
      fallbackCode === 'FFMPEG_FAILED'
        ? rawMsg && rawMsg.length <= 240 && !rawMsg.includes('\n    at ')
          ? rawMsg
          : 'Falha ao processar o vídeo no FFmpeg. Verifique o formato do arquivo e tente novamente.'
        : rawMsg && rawMsg.length <= 240 && !rawMsg.includes('\n    at ')
          ? rawMsg
          : 'Ocorreu um erro interno ao processar sua solicitação.',
    internalMessage: rawMsg,
    cause: err,
  });
}

export function getCorrelationId(res: Response): string {
  const existing = res.getHeader('X-Request-Id');
  if (typeof existing === 'string' && existing.trim()) {
    return existing.trim();
  }
  const generated = crypto.randomUUID();
  res.setHeader('X-Request-Id', generated);
  return generated;
}

export function sendErrorResponse(
  res: Response,
  err: unknown,
  context: string,
  options?: {
    fallbackCode?: AppErrorCode;
    userId?: string;
    extra?: Record<string, any>;
  }
) {
  const appErr = classifyError(err, options?.fallbackCode || 'FFMPEG_FAILED');
  const correlationId = getCorrelationId(res);

  logger.error(`[${context}] ${appErr.code}`, appErr, {
    action: context,
    code: appErr.code,
    status: appErr.statusCode,
    correlationId,
    userId: options?.userId,
    details: appErr.details,
  });

  return res.status(appErr.statusCode).json({
    error: appErr.userMessage,
    code: appErr.code,
    correlationId,
    isBotError: appErr.code === 'YOUTUBE_BLOCKED',
    ...(options?.extra || {}),
  });
}
