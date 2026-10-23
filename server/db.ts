import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ROOT_DIR } from './config.js';

const dataDir = path.join(ROOT_DIR, 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

const dbStorePath = path.join(dataDir, 'database.json');
const dbBakPath = path.join(dataDir, 'database.json.bak');

export interface UserRecord {
  id: string;
  google_id?: string;
  email?: string;
  name?: string;
  picture?: string;
  created_at: string;
  last_login: string;
}

export interface UserSession {
  session_token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface UserState {
  user_id: string;
  credentials_json?: string;
  saved_cuts_json?: string;
  queue_json?: string;
  settings_json?: string;
  updated_at: string;
}

interface DbStore {
  users: Record<string, UserRecord>;
  user_sessions: Record<string, UserSession>;
  user_states: Record<string, UserState>;
  projects: Record<string, any>;
  cuts: Record<string, any>;
}

// In-memory store with atomic JSON file persistence
let store: DbStore = {
  users: {},
  user_sessions: {},
  user_states: {},
  projects: {},
  cuts: {},
};

function loadStore() {
  if (!fs.existsSync(dbStorePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(dbStorePath, 'utf-8');
    const parsed = JSON.parse(raw);
    store = {
      users: parsed.users || {},
      user_sessions: parsed.user_sessions || {},
      user_states: parsed.user_states || {},
      projects: parsed.projects || {},
      cuts: parsed.cuts || {},
    };
  } catch (e) {
    console.error('[Db] Falha ao carregar banco de dados corrompido:', e);
    // Create backup of corrupted file
    try {
      const corruptPath = `${dbStorePath}.corrupt.${Date.now()}`;
      fs.copyFileSync(dbStorePath, corruptPath);
      console.warn(`[Db] Arquivo corrompido copiado para ${corruptPath}`);
    } catch {}

    // Attempt to recover from .bak
    if (fs.existsSync(dbBakPath)) {
      try {
        const bakRaw = fs.readFileSync(dbBakPath, 'utf-8');
        const parsed = JSON.parse(bakRaw);
        store = {
          users: parsed.users || {},
          user_sessions: parsed.user_sessions || {},
          user_states: parsed.user_states || {},
          projects: parsed.projects || {},
          cuts: parsed.cuts || {},
        };
        console.log('[Db] Banco de dados recuperado com sucesso a partir de backup .bak');
      } catch (bakErr) {
        console.error('[Db] Falha também ao carregar backup .bak:', bakErr);
      }
    }
  }
}

function saveStore() {
  try {
    const content = JSON.stringify(store, null, 2);
    // 1. Create backup of current store if it exists
    if (fs.existsSync(dbStorePath)) {
      try {
        fs.copyFileSync(dbStorePath, dbBakPath);
      } catch {}
    }
    // 2. Atomic write via temporary file + rename
    const tmpPath = `${dbStorePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, dbStorePath);
  } catch (e) {
    console.error('[Db] Falha crítica ao persistir dados atomicamente:', e);
  }
}

loadStore();

export function initDb() {
  console.log('✅ Banco de dados endurecido inicializado com persistência atômica em:', dbStorePath);
}

class Statement {
  private sql: string;

  constructor(sql: string) {
    this.sql = sql.trim();
  }

  run(...params: any[]): { changes: number } {
    const s = this.sql.toLowerCase();
    const now = new Date().toISOString();

    // 1. Insert or update users
    if (s.includes('into users')) {
      const [id, google_id, email, name, picture] = params;
      const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;

      // Find existing user by ID or by email
      let existingUserKey = Object.keys(store.users).find((k) => {
        const u = store.users[k];
        if (id && u.id === id) return true;
        if (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) return true;
        return false;
      });

      const effectiveId = existingUserKey || id || `usr_${crypto.randomUUID()}`;
      const existing = store.users[effectiveId];

      store.users[effectiveId] = {
        id: effectiveId,
        google_id: google_id ?? existing?.google_id,
        email: cleanEmail ?? existing?.email,
        name: name ?? existing?.name,
        picture: picture ?? existing?.picture,
        created_at: existing?.created_at || now,
        last_login: now,
      };

      saveStore();
      return { changes: 1 };
    }

    // 2. Insert or update user_sessions
    if (s.includes('into user_sessions')) {
      const [session_token, user_id, expires_at] = params;
      if (session_token && user_id) {
        store.user_sessions[session_token] = {
          session_token,
          user_id,
          expires_at: expires_at || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          created_at: now,
        };
        saveStore();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // 3. Delete expired sessions
    if (s.includes('delete from user_sessions') && s.includes('expires_at < ?')) {
      const [expiryThreshold] = params;
      let count = 0;
      for (const token of Object.keys(store.user_sessions)) {
        if (store.user_sessions[token].expires_at < expiryThreshold) {
          delete store.user_sessions[token];
          count++;
        }
      }
      if (count > 0) saveStore();
      return { changes: count };
    }

    // 4. Delete user_sessions by token
    if (s.includes('delete from user_sessions')) {
      const [token] = params;
      if (token && store.user_sessions[token]) {
        delete store.user_sessions[token];
        saveStore();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // 5. Insert or update user_states
    if (s.includes('into user_states')) {
      const [user_id, credentials_json, saved_cuts_json, queue_json, settings_json] = params;
      if (user_id) {
        const existing = store.user_states[user_id];
        store.user_states[user_id] = {
          user_id,
          credentials_json: credentials_json !== undefined ? credentials_json : existing?.credentials_json,
          saved_cuts_json: saved_cuts_json !== undefined ? saved_cuts_json : existing?.saved_cuts_json,
          queue_json: queue_json !== undefined ? queue_json : existing?.queue_json,
          settings_json: settings_json !== undefined ? settings_json : existing?.settings_json,
          updated_at: now,
        };
        saveStore();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // Reject unknown queries instead of returning success
    throw new Error(`[Db] Operação SQL não suportada pelo armazenamento: ${this.sql}`);
  }

  get(...params: any[]): any {
    const s = this.sql.toLowerCase();

    // 1. SELECT * FROM user_sessions WHERE session_token = ?
    if (s.includes('from user_sessions')) {
      const [token] = params;
      if (!token) return undefined;
      const session = store.user_sessions[token];
      if (!session) return undefined;
      return {
        user_id: session.user_id,
        session_token: session.session_token,
        expires_at: session.expires_at,
        created_at: session.created_at,
      };
    }

    // 2. SELECT id, email, name, picture FROM users WHERE ...
    if (s.includes('from users')) {
      if (s.includes('count(*)')) {
        return { count: Object.keys(store.users).length };
      }

      const allUsers = Object.values(store.users);

      if (s.includes('where email = ?')) {
        const searchEmail = String(params[0] || '').trim().toLowerCase();
        const found = allUsers.find((u) => u.email?.toLowerCase() === searchEmail);
        return found ? { ...found } : undefined;
      }

      if (s.includes('where id = ? or email = ?')) {
        const [searchId, searchEmail] = params;
        const cleanEmail = searchEmail ? String(searchEmail).trim().toLowerCase() : undefined;
        const found = allUsers.find(
          (u) => u.id === searchId || (cleanEmail && u.email?.toLowerCase() === cleanEmail)
        );
        return found ? { ...found } : undefined;
      }

      if (s.includes('where id = ?')) {
        const [searchId] = params;
        const found = allUsers.find((u) => u.id === searchId);
        return found ? { ...found } : undefined;
      }

      return allUsers[0] ? { ...allUsers[0] } : undefined;
    }

    // 3. SELECT * FROM user_states WHERE user_id = ?
    if (s.includes('from user_states')) {
      const [userId] = params;
      if (!userId) return undefined;
      const state = store.user_states[userId];
      return state ? { ...state } : undefined;
    }

    return undefined;
  }

  all(...params: any[]): any[] {
    const s = this.sql.toLowerCase();

    if (s.includes('from users')) {
      return Object.values(store.users).sort(
        (a, b) => new Date(b.last_login).getTime() - new Date(a.last_login).getTime()
      );
    }

    if (s.includes('from projects')) {
      return Object.values(store.projects);
    }

    if (s.includes('from cuts')) {
      return Object.values(store.cuts);
    }

    return [];
  }
}

export const db = {
  exec(_sql: string) {
    // Schema creation is handled in-memory
  },
  prepare(sql: string) {
    return new Statement(sql);
  },
};

export default db;
