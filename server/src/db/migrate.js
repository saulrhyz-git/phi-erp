import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { pool, tx } from './pool.js';

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const files = readdirSync(config.migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(config.migrationsDir, file), 'utf8');
    await tx(async (c) => {
      const onNotice = (n) => console.log(`  ${n.message}`);
      c.on('notice', onNotice);
      try { await c.query(sql); } finally { c.off('notice', onNotice); }
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    console.log(`Applied ${file}`);
    applied++;
  }
  console.log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
