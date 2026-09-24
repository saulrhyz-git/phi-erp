import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { requireAuth, requirePasswordFresh, requireRole } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import processRoutes from './routes/processes.js';
import matrixRoutes from './routes/matrix.js';
import catalogRoutes from './routes/catalog.js';
import openItemRoutes from './routes/openItems.js';
import diagramRoutes from './routes/diagrams.js';
import commentRoutes from './routes/comments.js';
import userRoutes from './routes/users.js';
import activityRoutes from './routes/activity.js';
import exportRoutes from './routes/exports.js';
import reengineeringRoutes from './routes/reengineering.js';
import sowRoutes from './routes/sow.js';
import documentRoutes from './routes/documents.js';

const app = express();
app.set('trust proxy', 1); // behind Nginx
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // bpmn-js sets inline styles on SVG
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.cookieSecure ? [] : null,
    },
  },
  hsts: config.cookieSecure,
}));
app.use(compression());
const jsonBody = express.json({ limit: '6mb' });
// Document uploads send the raw file as the body; everything else is JSON.
app.use((req, res, next) => (req.method === 'POST' && req.path.startsWith('/api/documents') ? next() : jsonBody(req, res, next)));
app.use(cookieParser());

// ---- API ----
const api = express.Router();
api.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, env: config.env, time: new Date().toISOString() });
});
api.use('/auth', authRoutes);
api.use(requireAuth, requirePasswordFresh);
api.use(metaRoutes);
api.use('/processes', processRoutes);
api.use('/matrix', matrixRoutes);
api.use(catalogRoutes);
api.use('/open-items', openItemRoutes);
api.use('/diagrams', diagramRoutes);
api.use('/comments', commentRoutes);
api.use('/activity', activityRoutes);
api.use('/export', exportRoutes);
api.use('/reengineering', reengineeringRoutes);
api.use('/sow', sowRoutes);
api.use('/documents', documentRoutes);
api.use('/users', requireRole('admin'), userRoutes);
api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use('/api', api);

// ---- Client (built by Vite) ----
if (existsSync(config.clientDist)) {
  app.use('/assets', express.static(join(config.clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(config.clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.type('text').send('Client not built yet. Run `npm run build` from the project root.'));
}

// ---- Errors ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'That reference or code is already in use.' });
  if (err.code === '23503') return res.status(400).json({ error: 'That refers to a record that does not exist.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Check the logs.' : err.message });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`PHI Blueprint listening on http://${config.host}:${config.port} (${config.env})`);
});

const shutdown = (sig) => {
  console.log(`${sig} received, shutting down…`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
