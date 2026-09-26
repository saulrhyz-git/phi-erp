import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates shifted by timezone.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

// Per-request context: who is acting and from where. The audit triggers in the database
// read it from transaction-local settings, so every write is attributed automatically.
export const requestContext = new AsyncLocalStorage();
export const currentContext = () => requestContext.getStore();

async function applyContext(client) {
  const ctx = currentContext();
  if (!ctx) return;
  await client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.user_name', $2, true),
            set_config('app.user_email', $3, true), set_config('app.ip', $4, true)`,
    [ctx.user ? String(ctx.user.id) : '', ctx.user?.name || '', ctx.user?.email || '', ctx.ip || '']);
}

const isRead = (text) => /^\s*SELECT\b/i.test(text) && !/\b(INSERT|UPDATE|DELETE)\b/i.test(text);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyContext(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Reads go straight to the pool. Writes made during a request run in a short transaction
// that carries the request context, so the audit log knows who made them.
export const q = (text, params) => (currentContext() && !isRead(text) ? tx((c) => c.query(text, params)) : pool.query(text, params));
