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
  // Document storage in SharePoint / OneDrive via Microsoft Graph (app-only). See README "SharePoint storage".
  sharepoint: {
    enabled: process.env.SP_ENABLED === 'true',
    tenantId: process.env.MS_TENANT_ID || '',
    clientId: process.env.MS_CLIENT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    siteUrl: process.env.SP_SITE_URL || '',             // e.g. https://primaryhomes.sharepoint.com/sites/ERPProject
    driveId: process.env.SP_DRIVE_ID || '',             // optional: use a specific library / OneDrive drive directly
    library: process.env.SP_LIBRARY || 'Documents',     // library name on the site (ignored if SP_DRIVE_ID is set)
    folder: (process.env.SP_FOLDER || 'PHI Blueprint Documents').replace(/^\/+|\/+$/g, ''),
    graphBase: process.env.MS_GRAPH_BASE || 'https://graph.microsoft.com/v1.0',
    loginBase: process.env.MS_LOGIN_BASE || 'https://login.microsoftonline.com',
  },
};

if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('CHANGE_ME'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
