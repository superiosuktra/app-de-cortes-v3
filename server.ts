import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
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
import './server/services/jobQueueService.js';


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

  // 1. Parse JSON body (global, antes de qualquer middleware que leia req.body)
  app.use(express.json({ limit: '15mb' }));

  // 2. P0 — Security Headers: X-Powered-By removal, CSP, HSTS (prod), etc.
  app.use(securityHeadersMiddleware);

  // 3. P0 — Sanitize body/query: prototype-pollution guard, null-byte strip, overflow check
  app.use(sanitizeRequestMiddleware);

  // 4. P1 — Trust proxy: necessário para que req.ip reflita o IP real atrás de Nginx/Caddy/Cloud Run
  app.set('trust proxy', 1);

  // 5. P1 — Rate limiter global para /api: 120 req/min por IP (proteção mínima de burst)
  const globalApiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    scope: 'global-api',
    message: 'Muitas requisições em sequência. Aguarde alguns segundos antes de tentar novamente.',
  });
  app.use('/api', globalApiRateLimiter);

  // 6. Resolve User Session for multi-tenant isolation
  app.use('/api', resolveSessionMiddleware);

  // 7. Mount Modular API Routers
  app.use('/api', authRouter);
  app.use('/api', videoRouter);
  app.use('/api', cutRouter);
  app.use('/api', socialRouter);
  app.use('/api', stateRouter);

  // Health check endpoint — registered before the error handler
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
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
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

