import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import './server/queue/videoWorker.js'; // Inicializa o worker em background
import { PORT, NODE_ENV, ROOT_DIR, cleanOldTempFiles } from './server/config.js';
import { videoRouter } from './server/routes/videoRoutes.js';
import { cutRouter } from './server/routes/cutRoutes.js';
import { socialRouter } from './server/routes/socialRoutes.js';
import { stateRouter } from './server/routes/stateRoutes.js';
import { authRouter } from './server/routes/authRoutes.js';
import { authMiddleware } from './server/middleware/auth.js';
import { PRIVACY_POLICY_HTML, TERMS_OF_SERVICE_HTML } from './server/pages/legalPages.js';
import {
  securityHeadersMiddleware,
  sanitizeRequestMiddleware,
  createRateLimiter,
} from './server/middleware/security.js';

import { initDb } from './server/db.js';
initDb();

const app = express();
const httpServer = http.createServer(app);

// Security & Payload Middlewares
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(sanitizeRequestMiddleware);
app.use(authMiddleware);

const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  scope: 'global-api',
});
app.use('/api', globalApiLimiter);

// 1. Legal Standalone Pages (for Google / TikTok OAuth & App Review)
app.get('/privacy', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PRIVACY_POLICY_HTML);
});

app.get('/terms', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(TERMS_OF_SERVICE_HTML);
});

// 2. API Routes
app.use('/api', authRouter);
app.use('/api', videoRouter);
app.use('/api', cutRouter);
app.use('/api', socialRouter);
app.use('/api', stateRouter);

// 3. API 404 Handler - Prevents /api calls from ever returning Vite HTML
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `Endpoint não encontrado: ${req.method} ${req.originalUrl}` });
});

// 4. API Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]:', err);
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({ error: err.message || 'Erro interno no servidor da API.' });
  }
  next(err);
});

// 5. Periodic Temporary Files Cleanup (Runs every 1 hour)
setInterval(() => {
  cleanOldTempFiles();
}, 60 * 60 * 1000);


// 6. Vite Dev Server or Production Static Serving
async function startServer() {
  if (NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {
          ignored: [
            '**/data/**',
            '**/server/**',
            '**/dist/**',
            '**/dev-dist/**',
            '**/*.tmp',
            '**/*.json',
            '**/*.log',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI Viral Shorts Cutter Server running on port ${PORT} [${NODE_ENV}]`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});
