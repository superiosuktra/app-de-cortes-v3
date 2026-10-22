import path from 'path';
import fs from 'fs';
import { ROOT_DIR } from './config.js';

const dataDir = path.join(ROOT_DIR, 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

const dbStorePath = path.join(dataDir, 'database.json');

interface UserRecord {
  id: string;
  google_id?: string;
  email?: string;
  name?: string;
  picture?: string;
  created_at: string;
  last_login: string;
}

interface UserSession {
  session_token: string;
  user_id: string;
  expires_at?: string;
  created_at: string;
}

interface UserState {
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

// In-memory store with JSON file persistence
let store: DbStore = {
  users: {},
  user_sessions: {},
  user_states: {},
  projects: {},
  cuts: {},
};

function loadStore() {
  try {
    if (fs.existsSync(dbStorePath)) {
      const raw = fs.readFileSync(dbStorePath, 'utf-8');
      const parsed = JSON.parse(raw);
      store = {
        users: parsed.users || {},
        user_sessions: parsed.user_sessions || {},
        user_states: parsed.user_states || {},
        projects: parsed.projects || {},
        cuts: parsed.cuts || {},
      };
    }
  } catch (e) {
    console.warn('[Db] Não foi possível carregar dados existentes, iniciando limpo:', e);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(dbStorePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Db] Falha ao persistir dados:', e);
  }
}

loadStore();

export function initDb() {
  console.log('✅ Banco de dados em memória inicializado e sincronizado com:', dbStorePath);
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
      const targetId = id || (email ? `usr_${Buffer.from(email).toString('hex').slice(0, 16)}` : `usr_${Date.now()}`);
      
      // Check existing user by email or id
      let existingKey = Object.keys(store.users).find(
        (k) => store.users[k].id === targetId || (email && store.users[k].email?.toLowerCase() === email.toLowerCase())
      );
      const userKey = existingKey || targetId;

      store.users[userKey] = {
        id: store.users[userKey]?.id || targetId,
        google_id: google_id || store.users[userKey]?.google_id,
        email: email || store.users[userKey]?.email,
        name: name || store.users[userKey]?.name,
        picture: picture || store.users[userKey]?.picture,
        created_at: store.users[userKey]?.created_at || now,
        last_login: now,
      };
      saveStore();
      return { changes: 1 };
    }

    // 2. Insert or update user_sessions
    if (s.includes('into user_sessions')) {
      const [session_token, user_id, expires_at] = params;
      if (session_token) {
        store.user_sessions[session_token] = {
          session_token,
          user_id,
          expires_at: expires_at || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          created_at: now,
        };
        saveStore();
        return { changes: 1 };
      }
    }

    // 3. Delete user_sessions
    if (s.includes('delete from user_sessions')) {
      const [token] = params;
      if (token && store.user_sessions[token]) {
        delete store.user_sessions[token];
        saveStore();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // 4. Insert or update user_states
    if (s.includes('into user_states')) {
      const [user_id, credentials_json, saved_cuts_json, queue_json, settings_json] = params;
      if (user_id) {
        store.user_states[user_id] = {
          user_id,
          credentials_json: credentials_json || store.user_states[user_id]?.credentials_json,
          saved_cuts_json: saved_cuts_json || store.user_states[user_id]?.saved_cuts_json,
          queue_json: queue_json || store.user_states[user_id]?.queue_json,
          settings_json: settings_json || store.user_states[user_id]?.settings_json,
          updated_at: now,
        };
        saveStore();
        return { changes: 1 };
      }
    }

    saveStore();
    return { changes: 1 };
  }

  get(...params: any[]): any {
    const s = this.sql.toLowerCase();

    // 1. SELECT user_id FROM user_sessions WHERE session_token = ?
    if (s.includes('from user_sessions')) {
      const [token] = params;
      const session = store.user_sessions[token];
      if (!session) return undefined;
      return { user_id: session.user_id, session_token: session.session_token };
    }

    // 2. SELECT id, email, name, picture FROM users WHERE email = ? or id = ?
    if (s.includes('from users')) {
      if (s.includes('count(*)')) {
        return { count: Object.keys(store.users).length };
      }

      const [param1, param2] = params;
      const allUsers = Object.values(store.users);

      if (s.includes('where email = ?')) {
        const found = allUsers.find((u) => u.email?.toLowerCase() === String(param1).toLowerCase());
        return found ? { ...found } : undefined;
      }

      if (s.includes('where id = ? or email = ?')) {
        const found = allUsers.find(
          (u) => u.id === param1 || (param2 && u.email?.toLowerCase() === String(param2).toLowerCase())
        );
        return found ? { ...found } : undefined;
      }

      if (s.includes('where id = ?')) {
        const found = allUsers.find((u) => u.id === param1);
        return found ? { ...found } : undefined;
      }

      return allUsers[0] ? { ...allUsers[0] } : undefined;
    }

    // 3. SELECT * FROM user_states WHERE user_id = ?
    if (s.includes('from user_states')) {
      const [userId] = params;
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
    // Schema creation is handled by in-memory tables
  },
  prepare(sql: string) {
    return new Statement(sql);
  },
};

export default db;
