export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
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

/**
 * Standard fetch with automatic authentication headers.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    if (!headers.has('x-session-token')) {
      headers.set('x-session-token', token);
    }
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return fetch(url, { ...options, headers });
}

/**
 * Safely fetches an API endpoint and ensures JSON parsing never throws
 * "Unexpected token '<', '<html>' is not valid JSON".
 */
export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const token = getAuthToken();
    const reqOptions = { ...options };
    const headers = new Headers(reqOptions.headers || {});
    if (token) {
      if (!headers.has('x-session-token')) {
        headers.set('x-session-token', token);
      }
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
    reqOptions.headers = headers;

    const res = await fetch(url, reqOptions);
    const rawText = await res.text();
    const trimmed = (rawText || '').trim();

    // Check if the response is an HTML page (e.g. from Google Auth redirect, Cloud Run proxy error, or 404 page)
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
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: `Falha na requisição de rede: ${err.message || 'Verifique sua conexão de internet.'}`,
    };
  }
}
