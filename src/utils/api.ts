export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  code?: string;
  correlationId?: string;
}

const BACKEND_ERROR_HINTS: Record<string, string> = {
  YOUTUBE_BLOCKED: 'O YouTube bloqueou temporariamente o download (verificação anti-bot). Configure seus cookies do YouTube em APIs & Conexões ou tente novamente.',
  YOUTUBE_DOWNLOAD_FAILED: 'Não foi possível baixar o trecho do YouTube. Verifique se o vídeo é público e acessível.',
  INVALID_MEDIA: 'O arquivo de vídeo é inválido, está corrompido ou não possui stream de vídeo compatível.',
  FFMPEG_FAILED: 'Falha ao processar o vídeo no FFmpeg. Verifique o formato do arquivo e o intervalo do corte.',
  INVALID_CUT_INTERVAL: 'Intervalo de corte inválido ou além da duração real do vídeo.',
  QUOTA_EXCEEDED: 'A cota da API do YouTube foi excedida. Aguarde a renovação da cota ou use outra credencial.',
  STORAGE_FULL: 'Espaço em disco insuficiente no servidor para processar o corte.',
  YOUTUBE_UPLOAD_FAILED: 'Falha ao enviar o corte para o YouTube. O vídeo renderizado foi preservado.',
  JOB_NOT_FOUND: 'Tarefa de renderização não encontrada ou expirada.',
  JOB_CANNOT_CANCEL: 'Não é possível cancelar esta tarefa no estado atual.',
};

export function formatBackendErrorMessage(
  code?: string,
  fallbackMessage?: string,
  correlationId?: string
): string {
  const cleanMsg = (fallbackMessage || '').trim();
  const mapped = code && BACKEND_ERROR_HINTS[code] ? BACKEND_ERROR_HINTS[code] : '';
  const base = cleanMsg || mapped || 'Ocorreu um erro inesperado ao processar a solicitação.';
  return correlationId ? `${base} (Ref: ${correlationId})` : base;
}

export interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
}

const AUTH_STORAGE_KEY = 'app_session_token';
let cachedToken: string | null = typeof window !== 'undefined' ? localStorage.getItem(AUTH_STORAGE_KEY) : null;

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && !cachedToken) {
    cachedToken = localStorage.getItem(AUTH_STORAGE_KEY);
  }
  return cachedToken;
}

export function setAuthToken(token: string | null): void {
  cachedToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }
}

export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Standard fetch with automatic authentication headers, cookie credentials,
 * and resilient exponential backoff retry for transient network/server failures.
 */
export async function authFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { retries = 2, retryDelayMs = 500, ...fetchOptions } = options;
  let attempt = 0;

  while (true) {
    try {
      const token = getAuthToken();
      const headers = new Headers(fetchOptions.headers || {});
      if (token) {
        if (!headers.has('x-session-token')) {
          headers.set('x-session-token', token);
        }
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }
      const csrf = getCsrfToken();
      if (csrf && !headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', csrf);
      }

      const res = await fetch(url, { ...fetchOptions, headers, credentials: fetchOptions.credentials || 'include' });

      // Retry on transient server errors (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Safely fetches an API endpoint with exponential backoff retry on transient errors
 * and ensures JSON parsing never throws "Unexpected token '<', '<html>' is not valid JSON".
 */
export async function fetchJson<T = any>(
  url: string,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  const { retries = 2, retryDelayMs = 500, ...fetchOptions } = options || {};
  let attempt = 0;

  while (true) {
    try {
      const token = getAuthToken();
      const reqOptions = { ...fetchOptions };
      const headers = new Headers(reqOptions.headers || {});
      if (token) {
        if (!headers.has('x-session-token')) {
          headers.set('x-session-token', token);
        }
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }
      const csrf = getCsrfToken();
      if (csrf && !headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', csrf);
      }
      reqOptions.headers = headers;
      reqOptions.credentials = reqOptions.credentials || 'include';

      const res = await fetch(url, reqOptions);

      // Retry on transient 502/503/504
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }

      const rawText = await res.text();
      const trimmed = (rawText || '').trim();

      // Check if the response is an HTML page
      if (
        trimmed.startsWith('<') ||
        trimmed.toLowerCase().startsWith('<!doctype') ||
        trimmed.toLowerCase().startsWith('<html')
      ) {
        let friendlyMessage = 'O servidor respondeu com uma página web (HTML) em vez de dados JSON.';

        if (res.status === 401 || res.status === 403 || trimmed.includes('__cookie_check') || trimmed.includes('accounts.google.com')) {
          friendlyMessage =
            'A sessão expirou ou redirecionou para autenticação do Google. Recarregue a página para reautenticar.';
        } else if (res.status === 404) {
          friendlyMessage = `Endpoint da API não encontrado (404): ${url}`;
        } else if (res.status === 502 || res.status === 503 || res.status === 504) {
          friendlyMessage =
            'O servidor está reiniciando ou temporariamente ocupado. Por favor, aguarde alguns instantes e tente novamente.';
        }

        return {
          ok: false,
          status: res.status,
          data: {} as T,
          error: friendlyMessage,
        };
      }

      // Attempt safe JSON parse
      let data: any;
      try {
        data = trimmed ? JSON.parse(trimmed) : {};
      } catch (parseError: any) {
        return {
          ok: false,
          status: res.status,
          data: {} as T,
          error: `Resposta da API em formato inesperado: ${parseError.message}`,
        };
      }

      return {
        ok: res.ok,
        status: res.status,
        data: data as T,
        error: !res.ok ? data?.error || `Erro HTTP ${res.status}` : undefined,
        code: !res.ok && typeof data?.code === 'string' ? data.code : undefined,
        correlationId:
          typeof data?.correlationId === 'string'
            ? data.correlationId
            : res.headers.get('x-correlation-id') || undefined,
      };
    } catch (err: any) {
      if (attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }
      return {
        ok: false,
        status: 0,
        data: {} as T,
        error: `Falha na requisição de rede: ${err?.message || 'Verifique sua conexão de internet.'}`,
      };
    }
  }
}
