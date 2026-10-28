import crypto from 'crypto';
import db from '../db.js';

// Derive 32-byte AES-256-GCM key for encrypting OAuth tokens at rest
if (process.env.NODE_ENV === 'production' && !process.env.APP_ENCRYPTION_KEY) {
  throw new Error('[Security] Variável de ambiente APP_ENCRYPTION_KEY é obrigatória em produção.');
}

const VAULT_SECRET = process.env.APP_ENCRYPTION_KEY || 'dev_insecure_cortes_vault_secret_key_32_bytes!';
const AES_KEY = crypto.scryptSync(VAULT_SECRET, 'cortes_viral_salt_v1', 32);
const ENC_PREFIX = 'enc:v1:';

function encryptSecret(plainText?: string): string {
  if (!plainText || typeof plainText !== 'string') return '';
  if (plainText.startsWith(ENC_PREFIX)) return plainText;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (err) {
    console.error('[Security] Falha ao criptografar segredo:', err);
    return plainText;
  }
}

function decryptSecret(cipherText?: string): string {
  if (!cipherText || typeof cipherText !== 'string') return '';
  if (!cipherText.startsWith(ENC_PREFIX)) return cipherText;
  try {
    const payload = cipherText.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      console.error('[Security] Formato inválido de segredo cifrado.');
      return cipherText;
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Security] Falha na descriptografia do segredo:', err);
    // Return original cipherText rather than empty string so secret is not silently destroyed
    return cipherText;
  }
}

function cleanDecryptedSecret(val?: string): string {
  const s = decryptSecret(val);
  if (s.startsWith('***') || s.includes('••••')) return '';
  return s;
}

function preserveRealSecret(incoming?: string, existing?: string, status?: string): string {
  if (typeof incoming !== 'string') return existing || '';
  const trimmed = incoming.trim();
  if (trimmed.startsWith('***') || trimmed.includes('••••')) {
    return existing || '';
  }
  if (!trimmed && status === 'connected' && existing) {
    return existing;
  }
  return trimmed;
}

function decryptCredentialsObject(creds: any): PersistedCredentials {
  const yt = { ...DEFAULT_STATE.credentials.youtube, ...(creds?.youtube || {}) };
  const ig = { ...DEFAULT_STATE.credentials.instagram, ...(creds?.instagram || {}) };
  const tt = { ...DEFAULT_STATE.credentials.tiktok, ...(creds?.tiktok || {}) };
  const kw = { ...(DEFAULT_STATE.credentials.kwai || {}), ...(creds?.kwai || {}) };
  const gm = { ...DEFAULT_STATE.credentials.gemini, ...(creds?.gemini || {}) };
  const wh = { ...(creds?.webhooks || {}) };
  const ai = { ...((DEFAULT_STATE.credentials as any).aiConfig || {}), ...(creds?.aiConfig || {}) };

  yt.accessToken = cleanDecryptedSecret(yt.accessToken);
  yt.refreshToken = cleanDecryptedSecret(yt.refreshToken);
  yt.clientSecret = cleanDecryptedSecret(yt.clientSecret);
  if (yt.cookies) yt.cookies = cleanDecryptedSecret(yt.cookies);

  ig.accessToken = cleanDecryptedSecret(ig.accessToken);
  ig.appSecret = cleanDecryptedSecret(ig.appSecret);

  tt.accessToken = cleanDecryptedSecret(tt.accessToken);
  tt.clientSecret = cleanDecryptedSecret(tt.clientSecret);

  if (kw.accessToken) kw.accessToken = cleanDecryptedSecret(kw.accessToken);
  if (kw.appSecret) kw.appSecret = cleanDecryptedSecret(kw.appSecret);

  if (gm.apiKey) {
    gm.apiKey = cleanDecryptedSecret(gm.apiKey);
  }
  if (!gm.model || gm.model.includes('gemini-2.5') || gm.model.includes('gemini-1.5') || gm.model.includes('gemini-2.0')) {
    gm.model = 'gemini-3.8-flash';
  }

  if (wh.discordWebhookUrl) wh.discordWebhookUrl = cleanDecryptedSecret(wh.discordWebhookUrl);
  if (wh.telegramBotToken) wh.telegramBotToken = cleanDecryptedSecret(wh.telegramBotToken);

  if (ai.openaiApiKey) ai.openaiApiKey = cleanDecryptedSecret(ai.openaiApiKey);
  if (ai.anthropicApiKey) ai.anthropicApiKey = cleanDecryptedSecret(ai.anthropicApiKey);

  return { youtube: yt, instagram: ig, tiktok: tt, kwai: kw, gemini: gm, webhooks: wh, aiConfig: ai };
}

function encryptCredentialsObject(creds: PersistedCredentials): PersistedCredentials {
  return {
    youtube: {
      ...creds.youtube,
      accessToken: encryptSecret(creds.youtube.accessToken),
      refreshToken: encryptSecret(creds.youtube.refreshToken),
      clientSecret: encryptSecret(creds.youtube.clientSecret),
      cookies: creds.youtube.cookies ? encryptSecret(creds.youtube.cookies) : undefined,
    },
    instagram: {
      ...creds.instagram,
      accessToken: encryptSecret(creds.instagram.accessToken),
      appSecret: encryptSecret(creds.instagram.appSecret),
    },
    tiktok: {
      ...creds.tiktok,
      accessToken: encryptSecret(creds.tiktok.accessToken),
      clientSecret: encryptSecret(creds.tiktok.clientSecret),
    },
    kwai: creds.kwai
      ? {
          ...creds.kwai,
          accessToken: encryptSecret(creds.kwai.accessToken),
          appSecret: encryptSecret(creds.kwai.appSecret),
        }
      : undefined,
    gemini: creds.gemini
      ? {
          ...creds.gemini,
          apiKey: encryptSecret(creds.gemini.apiKey),
        }
      : undefined,
    webhooks: creds.webhooks
      ? {
          ...creds.webhooks,
          discordWebhookUrl: creds.webhooks.discordWebhookUrl ? encryptSecret(creds.webhooks.discordWebhookUrl) : undefined,
          telegramBotToken: creds.webhooks.telegramBotToken ? encryptSecret(creds.webhooks.telegramBotToken) : undefined,
        }
      : undefined,
    aiConfig: creds.aiConfig
      ? {
          ...creds.aiConfig,
          openaiApiKey: creds.aiConfig.openaiApiKey ? encryptSecret(creds.aiConfig.openaiApiKey) : undefined,
          anthropicApiKey: creds.aiConfig.anthropicApiKey ? encryptSecret(creds.aiConfig.anthropicApiKey) : undefined,
        }
      : undefined,
  };
}

export interface PersistedCredentials {
  youtube: {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    status: 'connected' | 'disconnected' | 'error';
    channelTitle?: string;
    displayName?: string;
    accountName?: string;
    customUrl?: string;
    avatar?: string;
    verifiedAt?: string;
    cookies?: string;
  };
  instagram: {
    accessToken: string;
    businessAccountId?: string;
    appId?: string;
    appSecret?: string;
    status: 'connected' | 'disconnected' | 'error';
    accountName?: string;
    avatar?: string;
    verifiedAt?: string;
  };
  tiktok: {
    accessToken: string;
    clientKey?: string;
    clientSecret?: string;
    status: 'connected' | 'disconnected' | 'error';
    displayName?: string;
    avatar?: string;
    verifiedAt?: string;
  };
  kwai?: {
    accessToken: string;
    appId?: string;
    appSecret?: string;
    status: 'connected' | 'disconnected' | 'error';
    accountName?: string;
    avatar?: string;
    verifiedAt?: string;
  };
  gemini?: {
    apiKey?: string;
    status?: 'connected' | 'disconnected' | 'error';
    model?: string;
    verifiedAt?: string;
  };
  webhooks?: {
    discordWebhookUrl?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  aiConfig?: {
    provider: 'gemini' | 'ollama' | 'claude' | 'openai';
    ollamaEndpoint: string;
    ollamaModel: string;
    activeModel: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    status?: 'connected' | 'disconnected' | 'testing';
    latencyMs?: number;
  };
}

export interface PersistedState {
  credentials: PersistedCredentials;
  savedCuts: any[];
  viralCuts?: any[];
  queue: any[];
  autoPostSettings: any;
  lastUpdated: string;
}

const DEFAULT_STATE: PersistedState = {
  credentials: {
    youtube: {
      accessToken: '',
      refreshToken: '',
      clientId: '',
      clientSecret: '',
      status: 'disconnected',
      channelTitle: '',
      avatar: '',
      verifiedAt: '',
    },
    instagram: {
      accessToken: '',
      businessAccountId: '',
      appId: '',
      appSecret: '',
      status: 'disconnected',
      accountName: '',
      avatar: '',
      verifiedAt: '',
    },
    tiktok: {
      accessToken: '',
      clientKey: '',
      clientSecret: '',
      status: 'disconnected',
      displayName: '',
      avatar: '',
      verifiedAt: '',
    },
    kwai: {
      accessToken: '',
      appId: '',
      appSecret: '',
      status: 'disconnected',
      accountName: '',
      avatar: '',
      verifiedAt: '',
    },
    gemini: {
      apiKey: '',
      status: 'disconnected',
      model: 'gemini-3.8-flash',
      verifiedAt: '',
    },
    aiConfig: {
      provider: 'gemini',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3:8b',
      activeModel: 'gemini-3.8-flash',
      status: 'connected',
      latencyMs: 0,
    },
  },
  savedCuts: [],
  viralCuts: undefined,
  queue: [],
  autoPostSettings: null,
  lastUpdated: new Date().toISOString(),
};

class StateManager {
  private userStates = new Map<string, PersistedState>();
  private saveTimeouts = new Map<string, NodeJS.Timeout>();

  private loadUserState(userId: string): PersistedState {
    try {
      const row = db.prepare('SELECT * FROM user_states WHERE user_id = ?').get(userId) as any;
      if (row) {
        const creds = row.credentials_json
          ? decryptCredentialsObject(JSON.parse(row.credentials_json))
          : JSON.parse(JSON.stringify(DEFAULT_STATE.credentials));
        const savedCuts = row.saved_cuts_json ? JSON.parse(row.saved_cuts_json) : [];
        const queue = row.queue_json ? JSON.parse(row.queue_json) : [];
        const rawSettings = row.settings_json ? JSON.parse(row.settings_json) : null;
        const autoPostSettings = rawSettings?.__wrapped
          ? rawSettings.autoPostSettings
          : rawSettings;
        const viralCuts = rawSettings?.__wrapped && Array.isArray(rawSettings.viralCuts)
          ? rawSettings.viralCuts
          : undefined;
        return {
          credentials: creds,
          savedCuts,
          viralCuts,
          queue,
          autoPostSettings,
          lastUpdated: row.updated_at || new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn(`[StateService] Aviso ao carregar SQLite para usuário ${userId}:`, e);
    }

    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  public getState(userId: string): PersistedState {
    const key = userId || 'anonymous';
    if (!this.userStates.has(key)) {
      const state = this.loadUserState(key);
      this.userStates.set(key, state);
    }
    return this.userStates.get(key)!;
  }

  public getCredentials(userId: string): PersistedCredentials {
    return this.getState(userId).credentials;
  }

  public updateCredentials(creds: Partial<PersistedCredentials>, userId: string): void {
    const key = userId || 'anonymous';
    const state = this.getState(key);
    if (creds.youtube) {
      const prevYt = state.credentials.youtube;
      const nextStatus = creds.youtube.status || prevYt.status;
      state.credentials.youtube = {
        status: creds.youtube.status !== undefined ? creds.youtube.status : prevYt.status,
        channelTitle: creds.youtube.channelTitle !== undefined ? creds.youtube.channelTitle : prevYt.channelTitle,
        displayName: creds.youtube.displayName !== undefined ? creds.youtube.displayName : prevYt.displayName,
        accountName: creds.youtube.accountName !== undefined ? creds.youtube.accountName : prevYt.accountName,
        customUrl: creds.youtube.customUrl !== undefined ? creds.youtube.customUrl : prevYt.customUrl,
        avatar: creds.youtube.avatar !== undefined ? creds.youtube.avatar : prevYt.avatar,
        verifiedAt: creds.youtube.verifiedAt !== undefined ? creds.youtube.verifiedAt : prevYt.verifiedAt,
        clientId: creds.youtube.clientId !== undefined ? creds.youtube.clientId : prevYt.clientId,
        accessToken: preserveRealSecret(creds.youtube.accessToken, prevYt.accessToken, nextStatus),
        refreshToken: preserveRealSecret(creds.youtube.refreshToken, prevYt.refreshToken, nextStatus),
        clientSecret: preserveRealSecret(creds.youtube.clientSecret, prevYt.clientSecret, nextStatus),
        cookies: preserveRealSecret(creds.youtube.cookies, prevYt.cookies, nextStatus),
      };
    }
    if (creds.instagram) {
      const prevIg = state.credentials.instagram;
      const nextStatus = creds.instagram.status || prevIg.status;
      state.credentials.instagram = {
        status: creds.instagram.status !== undefined ? creds.instagram.status : prevIg.status,
        accountName: creds.instagram.accountName !== undefined ? creds.instagram.accountName : prevIg.accountName,
        avatar: creds.instagram.avatar !== undefined ? creds.instagram.avatar : prevIg.avatar,
        verifiedAt: creds.instagram.verifiedAt !== undefined ? creds.instagram.verifiedAt : prevIg.verifiedAt,
        businessAccountId: creds.instagram.businessAccountId !== undefined ? creds.instagram.businessAccountId : prevIg.businessAccountId,
        appId: creds.instagram.appId !== undefined ? creds.instagram.appId : prevIg.appId,
        accessToken: preserveRealSecret(creds.instagram.accessToken, prevIg.accessToken, nextStatus),
        appSecret: preserveRealSecret(creds.instagram.appSecret, prevIg.appSecret, nextStatus),
      };
    }
    if (creds.tiktok) {
      const prevTt = state.credentials.tiktok;
      const nextStatus = creds.tiktok.status || prevTt.status;
      state.credentials.tiktok = {
        status: creds.tiktok.status !== undefined ? creds.tiktok.status : prevTt.status,
        displayName: creds.tiktok.displayName !== undefined ? creds.tiktok.displayName : prevTt.displayName,
        avatar: creds.tiktok.avatar !== undefined ? creds.tiktok.avatar : prevTt.avatar,
        verifiedAt: creds.tiktok.verifiedAt !== undefined ? creds.tiktok.verifiedAt : prevTt.verifiedAt,
        clientKey: creds.tiktok.clientKey !== undefined ? creds.tiktok.clientKey : prevTt.clientKey,
        accessToken: preserveRealSecret(creds.tiktok.accessToken, prevTt.accessToken, nextStatus),
        clientSecret: preserveRealSecret(creds.tiktok.clientSecret, prevTt.clientSecret, nextStatus),
      };
    }
    if (creds.kwai) {
      const prevKw = state.credentials.kwai || ({} as any);
      const nextStatus = creds.kwai.status || prevKw.status;
      state.credentials.kwai = {
        status: creds.kwai.status !== undefined ? creds.kwai.status : prevKw.status,
        accountName: creds.kwai.accountName !== undefined ? creds.kwai.accountName : prevKw.accountName,
        avatar: creds.kwai.avatar !== undefined ? creds.kwai.avatar : prevKw.avatar,
        verifiedAt: creds.kwai.verifiedAt !== undefined ? creds.kwai.verifiedAt : prevKw.verifiedAt,
        appId: creds.kwai.appId !== undefined ? creds.kwai.appId : prevKw.appId,
        accessToken: preserveRealSecret(creds.kwai.accessToken, prevKw.accessToken, nextStatus),
        appSecret: preserveRealSecret(creds.kwai.appSecret, prevKw.appSecret, nextStatus),
      };
    }
    if (creds.gemini) {
      const prevGm = state.credentials.gemini || ({} as any);
      state.credentials.gemini = {
        status: creds.gemini.status !== undefined ? creds.gemini.status : prevGm.status,
        model: creds.gemini.model !== undefined ? creds.gemini.model : prevGm.model,
        verifiedAt: creds.gemini.verifiedAt !== undefined ? creds.gemini.verifiedAt : prevGm.verifiedAt,
        apiKey: preserveRealSecret(creds.gemini.apiKey, prevGm.apiKey, creds.gemini.status),
      };
    }
    if (creds.webhooks) {
      state.credentials.webhooks = {
        ...(state.credentials.webhooks || {}),
        ...creds.webhooks,
      };
    }
    if (creds.aiConfig) {
      const prevAi = (state.credentials as any).aiConfig || {};
      const aiInput = creds.aiConfig as any;
      (state.credentials as any).aiConfig = {
        provider: aiInput.provider !== undefined ? aiInput.provider : prevAi.provider,
        ollamaEndpoint: aiInput.ollamaEndpoint !== undefined ? aiInput.ollamaEndpoint : prevAi.ollamaEndpoint,
        ollamaModel: aiInput.ollamaModel !== undefined ? aiInput.ollamaModel : prevAi.ollamaModel,
        openAiKey: preserveRealSecret(aiInput.openAiKey || aiInput.openaiApiKey, prevAi.openAiKey || prevAi.openaiApiKey),
      };
    }

    this.scheduleSave(key);
  }

  public updateFullState(full: Partial<PersistedState>, userId: string): void {
    const key = userId || 'anonymous';
    const state = this.getState(key);

    if (full.savedCuts !== undefined) state.savedCuts = full.savedCuts;
    if (full.viralCuts !== undefined) state.viralCuts = full.viralCuts;
    if (full.queue !== undefined) state.queue = full.queue;
    if (full.autoPostSettings !== undefined) state.autoPostSettings = full.autoPostSettings;
    if (full.credentials) {
      this.updateCredentials(full.credentials, key);
    } else {
      this.scheduleSave(key);
    }
  }

  public clearCredentials(platform: string, userId: string): void {
    const ALLOWED = new Set(['youtube', 'instagram', 'tiktok', 'kwai', 'gemini']);
    if (!ALLOWED.has(platform)) {
      throw new Error(`Plataforma inválida para exclusão de credenciais: ${platform}`);
    }
    const state = this.getState(userId);
    if (platform === 'youtube') {
      state.credentials.youtube = { ...DEFAULT_STATE.credentials.youtube };
    } else if (platform === 'instagram') {
      state.credentials.instagram = { ...DEFAULT_STATE.credentials.instagram };
    } else if (platform === 'tiktok') {
      state.credentials.tiktok = { ...DEFAULT_STATE.credentials.tiktok };
    } else if (platform === 'kwai') {
      state.credentials.kwai = {
        accessToken: '',
        appId: '',
        appSecret: '',
        status: 'disconnected',
        accountName: '',
        avatar: '',
        verifiedAt: '',
      };
    } else if (platform === 'gemini') {
      state.credentials.gemini = { ...DEFAULT_STATE.credentials.gemini };
    }
    this.scheduleSave(userId);
  }

  private scheduleSave(userId: string): void {
    const existing = this.saveTimeouts.get(userId);
    if (existing) clearTimeout(existing);

    this.saveTimeouts.set(
      userId,
      setTimeout(() => {
        this.saveNow(userId);
      }, 500)
    );
  }

  private saveNow(userId: string): void {
    const state = this.userStates.get(userId);
    if (!state) return;

    try {
      const encryptedCreds = encryptCredentialsObject(state.credentials);
      const settingsPayload = JSON.stringify({
        __wrapped: true,
        autoPostSettings: state.autoPostSettings,
        viralCuts: state.viralCuts,
      });

      db.prepare(`
        INSERT INTO user_states (user_id, credentials_json, saved_cuts_json, queue_json, settings_json, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          credentials_json = excluded.credentials_json,
          saved_cuts_json = excluded.saved_cuts_json,
          queue_json = excluded.queue_json,
          settings_json = excluded.settings_json,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        userId,
        JSON.stringify(encryptedCreds),
        JSON.stringify(state.savedCuts || []),
        JSON.stringify(state.queue || []),
        settingsPayload
      );

      state.lastUpdated = new Date().toISOString();
    } catch (e) {
      console.error(`[StateService] Falha ao persistir estado para usuário ${userId}:`, e);
    }
  }
}

export const stateManager = new StateManager();
