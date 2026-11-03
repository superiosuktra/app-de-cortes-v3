import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { SQLITE_DB_PATH } from './config.js';

const dataDir = path.dirname(SQLITE_DB_PATH);
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

const sqlitePath = SQLITE_DB_PATH;
const legacyJsonPath = path.join(dataDir, 'database.json');
const legacyBakPath = path.join(dataDir, 'database.json.bak');

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

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

// Initialize SQLite database instance
const sqlite = new Database(sqlitePath);

// Enable WAL mode, foreign keys, and normal synchronous mode
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = sqlite.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  // Migration 1: Core tables with cascading foreign keys and default timestamps
  if (!appliedVersions.has(1)) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT,
        email TEXT UNIQUE,
        name TEXT,
        picture TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_states (
        user_id TEXT PRIMARY KEY,
        credentials_json TEXT,
        saved_cuts_json TEXT,
        queue_json TEXT,
        settings_json TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        data_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cuts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_id TEXT,
        title TEXT,
        data_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        current_step TEXT,
        total_items INTEGER DEFAULT 0,
        completed_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        item_ids_json TEXT,
        clip_data_json TEXT,
        error TEXT,
        zip_download_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rendered_clips (
        clip_id TEXT PRIMARY KEY,
        user_id TEXT,
        file_path TEXT NOT NULL,
        duration REAL DEFAULT 0,
        file_size INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_rendered_clips_user_id ON rendered_clips(user_id);
      CREATE INDEX IF NOT EXISTS idx_cuts_user_id ON cuts(user_id);
      CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

      -- Auto-provision users for orphan sessions and states
      CREATE TRIGGER IF NOT EXISTS trg_ensure_user_for_session
      BEFORE INSERT ON user_sessions
      FOR EACH ROW
      BEGIN
        INSERT OR IGNORE INTO users (id, created_at, last_login)
        VALUES (NEW.user_id, datetime('now'), datetime('now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_ensure_user_for_state
      BEFORE INSERT ON user_states
      FOR EACH ROW
      BEGIN
        INSERT OR IGNORE INTO users (id, created_at, last_login)
        VALUES (NEW.user_id, datetime('now'), datetime('now'));
      END;
    `);

    sqlite.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
    ).run(1, '001_initial_schema', new Date().toISOString());
    console.log('[Db] Migração 1 aplicada com sucesso: tabelas criadas.');
  }

  // Migration 2: Import legacy database.json if it exists and keep backup
  if (!appliedVersions.has(2)) {
    if (fs.existsSync(legacyJsonPath)) {
      try {
        // 1. Maintain backup of legacy database.json
        fs.copyFileSync(legacyJsonPath, legacyBakPath);
        const timestampedBak = `${legacyJsonPath}.migrated.${Date.now()}`;
        fs.copyFileSync(legacyJsonPath, timestampedBak);

        const raw = fs.readFileSync(legacyJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);

        const insertUser = sqlite.prepare(`
          INSERT OR IGNORE INTO users (id, google_id, email, name, picture, created_at, last_login)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const insertSession = sqlite.prepare(`
          INSERT OR IGNORE INTO user_sessions (session_token, user_id, expires_at, created_at)
          VALUES (?, ?, ?, ?)
        `);
        const insertState = sqlite.prepare(`
          INSERT OR IGNORE INTO user_states (user_id, credentials_json, saved_cuts_json, queue_json, settings_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        sqlite.transaction(() => {
          if (parsed.users) {
            for (const u of Object.values(parsed.users) as any[]) {
              insertUser.run(
                u.id,
                u.google_id || null,
                u.email || null,
                u.name || null,
                u.picture || null,
                u.created_at || new Date().toISOString(),
                u.last_login || new Date().toISOString()
              );
            }
          }

          if (parsed.user_sessions) {
            for (const s of Object.values(parsed.user_sessions) as any[]) {
              const token = s.session_token ? (s.session_token.length === 64 ? s.session_token : hashSessionToken(s.session_token)) : '';
              if (token && s.user_id) {
                insertUser.run(s.user_id, null, null, null, null, new Date().toISOString(), new Date().toISOString());
                insertSession.run(
                  token,
                  s.user_id,
                  s.expires_at || new Date().toISOString(),
                  s.created_at || new Date().toISOString()
                );
              }
            }
          }

          if (parsed.user_states) {
            for (const st of Object.values(parsed.user_states) as any[]) {
              if (st.user_id) {
                insertUser.run(st.user_id, null, null, null, null, new Date().toISOString(), new Date().toISOString());
                insertState.run(
                  st.user_id,
                  st.credentials_json || null,
                  st.saved_cuts_json || null,
                  st.queue_json || null,
                  st.settings_json || null,
                  st.updated_at || new Date().toISOString()
                );
              }
            }
          }
        })();

        console.log('[Db] Migração 2 aplicada: database.json migrado para SQLite com backup mantido.');
      } catch (migrationErr) {
        console.error('[Db] Erro ao migrar database.json para SQLite:', migrationErr);
      }
    }

    sqlite.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
    ).run(2, '002_import_legacy_json', new Date().toISOString());
  }
}

runMigrations();

export function initDb() {
  console.log('✅ SQLite (better-sqlite3) ativo em:', sqlitePath);
}

// Compatibility layer for direct dictionary access: db.data.users, db.data.sessions, etc.
const usersProxy = new Proxy({} as Record<string, any>, {
  get(_target, prop: string) {
    if (typeof prop !== 'string' || prop === 'then') return undefined;
    const row = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(prop);
    return row || undefined;
  },
  set(_target, prop: string, val: any) {
    const id = val?.id || prop;
    sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, google_id, email, name, picture, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      val?.google_id || null,
      val?.email || null,
      val?.name || null,
      val?.picture || null,
      val?.created_at || new Date().toISOString(),
      val?.last_login || new Date().toISOString()
    );
    return true;
  },
  deleteProperty(_target, prop: string) {
    sqlite.prepare('DELETE FROM users WHERE id = ?').run(prop);
    return true;
  },
});

const sessionsProxy = new Proxy({} as Record<string, any>, {
  get(_target, prop: string) {
    if (typeof prop !== 'string' || prop === 'then') return undefined;
    const row = sqlite.prepare('SELECT * FROM user_sessions WHERE session_token = ?').get(prop);
    return row || undefined;
  },
  set(_target, prop: string, val: any) {
    const token = val?.session_token || prop;
    const hashed = hashSessionToken(token);
    sqlite.prepare(`
      INSERT OR REPLACE INTO user_sessions (session_token, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      hashed,
      val?.user_id,
      val?.expires_at || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      val?.created_at || new Date().toISOString()
    );
    return true;
  },
  deleteProperty(_target, prop: string) {
    const hashed = hashSessionToken(prop);
    sqlite.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(hashed);
    return true;
  },
});

const userStatesProxy = new Proxy({} as Record<string, any>, {
  get(_target, prop: string) {
    if (typeof prop !== 'string' || prop === 'then') return undefined;
    const row = sqlite.prepare('SELECT * FROM user_states WHERE user_id = ?').get(prop);
    return row || undefined;
  },
  set(_target, prop: string, val: any) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO user_states (user_id, credentials_json, saved_cuts_json, queue_json, settings_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      prop,
      val?.credentials_json || null,
      val?.saved_cuts_json || null,
      val?.queue_json || null,
      val?.settings_json || null,
      val?.updated_at || new Date().toISOString()
    );
    return true;
  },
  deleteProperty(_target, prop: string) {
    sqlite.prepare('DELETE FROM user_states WHERE user_id = ?').run(prop);
    return true;
  },
});

export const db = {
  raw: sqlite,
  get data() {
    return {
      users: usersProxy,
      sessions: sessionsProxy,
      user_sessions: sessionsProxy,
      user_states: userStatesProxy,
      projects: {},
      cuts: {},
    };
  },
  exec(sql: string) {
    return sqlite.exec(sql);
  },
  prepare(sql: string) {
    return sqlite.prepare(sql);
  },
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return sqlite.transaction(fn) as unknown as T;
  },
  createSession(userId: string, rawToken: string, expiresAtMs: number) {
    const hashed = hashSessionToken(rawToken);
    sqlite.prepare(`
      INSERT OR REPLACE INTO user_sessions (session_token, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      hashed,
      userId,
      new Date(expiresAtMs).toISOString(),
      new Date().toISOString()
    );
  },
  getSessionByRawToken(rawToken: string): UserSession | undefined {
    const hashed = hashSessionToken(rawToken);
    const row = sqlite.prepare(
      'SELECT session_token, user_id, expires_at, created_at FROM user_sessions WHERE session_token = ?'
    ).get(hashed) as UserSession | undefined;
    return row;
  },
  deleteSessionByRawToken(rawToken: string) {
    const hashed = hashSessionToken(rawToken);
    sqlite.prepare(
      'DELETE FROM user_sessions WHERE session_token = ?'
    ).run(hashed);
  },
};

export default db;
