import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { ensureDirectories } from './server/config.js';
import { resolveSessionMiddleware } from './server/middleware/auth.js';
import { authRouter } from './server/routes/authRoutes.js';
import { videoRouter } from './server/routes/videoRoutes.js';
import { cutRouter } from './server/routes/cutRoutes.js';
import { socialRouter } from './server/routes/socialRoutes.js';
import { stateRouter } from './server/routes/stateRoutes.js';
import './server/queue/videoWorker.js';
import './server/services/jobQueueService.js';

// P0 Item 1: Log unhandled rejections and uncaught exceptions without crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

// Initialize required folders (uploads, temp, data)
ensureDirectories();

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Resolve User Session for multi-tenant isolation
  app.use('/api', resolveSessionMiddleware);

  // Mount Modular API Routers
  app.use('/api', authRouter);
  app.use('/api', videoRouter);
  app.use('/api', cutRouter);
  app.use('/api', socialRouter);
  app.use('/api', stateRouter);

  // Global Express Error Handler (catches errors forwarded by asyncHandler or multer)
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

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = 3000;

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
