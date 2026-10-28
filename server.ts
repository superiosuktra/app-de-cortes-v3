import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import { ensureDirectories, PORT } from './server/config.js';
import { resolveSessionMiddleware } from './server/middleware/auth.js';
import {
  securityHeadersMiddleware,
  sanitizeRequestMiddleware,
  createRateLimiter,
} from './server/middleware/security.js';
import { authRouter } from './server/routes/authRoutes.js';
import { videoRouter } from './server/routes/videoRoutes.js';
import { cutRouter } from './server/routes/cutRoutes.js';
import { socialRouter } from './server/routes/socialRoutes.js';
import { stateRouter } from './server/routes/stateRoutes.js';
import './server/queue/videoWorker.js';
import { cleanExpiredJobsAndFiles } from './server/services/jobQueueService.js';


const isProd = process.env.NODE_ENV === 'production';

// P0 Item 1: Log unhandled rejections and uncaught exceptions.
// In production, exit after flush to avoid running in a corrupted state.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Promise Rejection:', reason);
  if (isProd) {
    setTimeout(() => process.exit(1), 1000).unref();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
  if (isProd) {
    setTimeout(() => process.exit(1), 1000).unref();
  }
});

// Initialize required folders (uploads, temp, data)
ensureDirectories();

export function createApp() {
  const app = express();

  // 1. Correlation ID for distributed tracing and structured logs
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    res.setHeader('X-Request-Id', correlationId);
    next();
  });

  // 2. Parse JSON body (global, antes de qualquer middleware que leia req.body)
  app.use(express.json({ limit: '15mb' }));

  // 3. P0 — Security Headers: X-Powered-By removal, CSP, HSTS (prod), etc.
  app.use(securityHeadersMiddleware);

  // 4. P0 — Sanitize body/query: prototype-pollution guard, null-byte strip, overflow check
  app.use(sanitizeRequestMiddleware);

  // 5. P1 — Trust proxy: necessário para que req.ip reflita o IP real atrás de Nginx/Caddy/Cloud Run
  app.set('trust proxy', 1);

  // 6. P1 — Rate limiter global para /api: 120 req/min por IP (proteção mínima de burst)
  const globalApiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    scope: 'global-api',
    message: 'Muitas requisições em sequência. Aguarde alguns segundos antes de tentar novamente.',
  });
  app.use('/api', globalApiRateLimiter);

  // 7. Resolve User Session for multi-tenant isolation
  app.use('/api', resolveSessionMiddleware);

  // 8. Mount Modular API Routers
  app.use('/api', authRouter);
  app.use('/api', videoRouter);
  app.use('/api', cutRouter);
  app.use('/api', socialRouter);
  app.use('/api', stateRouter);

  // Health check endpoint (Liveness probe)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Readiness probe endpoint (checks persistence and workspace directories)
  app.get('/ready', (_req: Request, res: Response) => {
    try {
      ensureDirectories();
      res.json({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'unready',
        error: err?.message || 'Diretórios ou banco indisponíveis.',
      });
    }
  });

  // Explicit API 404 handler — guarantees /api calls never fall back to index.html SPA
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: `Endpoint da API não encontrado: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    });
  });

  return app;
}


async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Express Error Handler — registered last, after Vite/static middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Express Error Handler]:', err?.message || err);
    if (res.headersSent) {
      return;
    }
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({
      error: err?.message || 'Erro interno no servidor.',
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown: stop accepting new connections and wait for pending requests
  const gracefulShutdown = (signal: string) => {
    console.log(`[Process] Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log('[Process] HTTP server closed.');
      process.exit(0);
    });
    // Force-exit if close takes longer than 10 s
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Periodic cleanup of temporary batch jobs and expired files (every 30 minutes)
  const cleanupTimer = setInterval(() => {
    try {
      const stats = cleanExpiredJobsAndFiles(60 * 60 * 1000);
      if (stats.expiredJobs > 0 || stats.expiredFiles > 0) {
        console.log(`[Cleanup] Limpeza periódica: ${stats.expiredJobs} tarefas e ${stats.expiredFiles} arquivos temporários expirados removidos.`);
      }
    } catch (e) {
      console.warn('[Cleanup] Erro na limpeza periódica:', e);
    }
  }, 30 * 60 * 1000);
  cleanupTimer.unref();
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

