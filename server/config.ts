import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Base Directories
export const ROOT_DIR = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const TEMP_DIR = path.join(DATA_DIR, 'temp');
export const CLIPS_DIR = path.join(DATA_DIR, 'rendered_clips');
export const BIN_DIR = path.join(ROOT_DIR, 'bin');
export const STATE_FILE = path.join(DATA_DIR, 'app_state.json');

// Ensure essential directories exist
export function ensureDirectories() {
  [DATA_DIR, UPLOADS_DIR, TEMP_DIR, CLIPS_DIR, BIN_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn(`[Config] Não foi possível criar diretório ${dir}:`, err);
      }
    }
  });
}

ensureDirectories();

// 1. Zod environment validation schema
export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_VISION_MODEL: z.string().default('gemini-3.8-flash'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ENABLE_DEMO_LOGIN: z.string().optional(),
  MAX_CONCURRENT_FFMPEG: z.coerce.number().default(2),
  APP_URL: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A variável GEMINI_API_KEY é obrigatória em ambiente de produção.',
      path: ['GEMINI_API_KEY'],
    });
  }
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Falha crítica de validação de ambiente (Zod):');
    for (const issue of result.error.issues) {
      console.error(`  - [${issue.path.join('.')}] ${issue.message}`);
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Falha no boot de produção: ${result.error.issues.map((i) => i.message).join('; ')}`);
    }
  }
  return result.success ? result.data : envSchema.parse({ ...process.env, NODE_ENV: 'development' });
}

export const env = validateEnv();

// Environment Configuration
export const PORT = env.PORT;
export const GEMINI_API_KEY = env.GEMINI_API_KEY || '';

// Normalize and auto-upgrade deprecated Gemini models (e.g., gemini-2.5-flash -> gemini-3.8-flash)
function normalizeGeminiModel(modelName: string | undefined, defaultModel = 'gemini-3.8-flash'): string {
  const clean = (modelName || '').trim();
  if (!clean || clean.includes('gemini-2.5') || clean.includes('gemini-1.5') || clean.includes('gemini-2.0')) {
    return defaultModel;
  }
  return clean;
}

export const GEMINI_TEXT_MODEL = normalizeGeminiModel(env.GEMINI_TEXT_MODEL, 'gemini-3.8-flash');
export const GEMINI_VISION_MODEL = normalizeGeminiModel(env.GEMINI_VISION_MODEL, 'gemini-3.8-flash');
export const NODE_ENV = env.NODE_ENV;

/**
 * Finds a suitable TrueType Font on the current operating system (Windows, Linux, macOS).
 * Returns the path to the font or undefined if none is found.
 */
export function getSystemFont(): string | undefined {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const candidateFonts: string[] = [];

  if (isWindows) {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    candidateFonts.push(
      path.join(winDir, 'Fonts', 'arialbd.ttf'),
      path.join(winDir, 'Fonts', 'arial.ttf'),
      path.join(winDir, 'Fonts', 'segoeui.ttf'),
      path.join(winDir, 'Fonts', 'tahoma.ttf')
    );
  } else if (isMac) {
    candidateFonts.push(
      '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/Library/Fonts/Arial Bold.ttf',
      '/System/Library/Fonts/Helvetica.ttc'
    );
  } else {
    // Linux / Docker / Colab
    candidateFonts.push(
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
    );
  }

  for (const fontPath of candidateFonts) {
    if (fs.existsSync(fontPath)) {
      // Normaliza para barras inclinadas para compatibilidade de filtros FFmpeg
      return fontPath.replace(/\\/g, '/');
    }
  }

  return undefined;
}

/**
 * Periodic cleanup of old temporary files in TEMP_DIR and UPLOADS_DIR.
 * Defaults to 4 hours retention to avoid interrupting long renders.
 */
export function cleanOldTempFiles(maxAgeMs: number = 4 * 60 * 60 * 1000) {
  const targetDirs = [TEMP_DIR, UPLOADS_DIR];
  const now = Date.now();

  targetDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            if (stats.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
            console.log(`[Cleaner] Arquivo temporário removido: ${filePath}`);
          }
        } catch {}
      });
    } catch (err) {
      console.warn(`[Cleaner] Falha ao varrer diretório temporário ${dir}:`, err);
    }
  });
}
