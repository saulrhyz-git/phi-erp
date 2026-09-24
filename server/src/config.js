import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: resolve(ROOT, '.env') });

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || 'postgres://phi:phi_local_pw@localhost:5432/phi_blueprint',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env === 'production',
  clientDist: resolve(ROOT, 'client/dist'),
  seedDir: resolve(ROOT, 'server/seed'),
  migrationsDir: resolve(ROOT, 'server/migrations'),
};

if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('CHANGE_ME'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
