export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const e = new Error(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    e.status = 400;
    throw e;
  }
  return r.data;
}

export function notFound(what) {
  const e = new Error(`${what} not found.`);
  e.status = 404;
  return e;
}

export async function logActivity(db, userId, action, entityType, entityId, summary = '') {
  await db.query(
    'INSERT INTO activity_log(user_id, action, entity_type, entity_id, summary) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entityType, String(entityId), summary.slice(0, 500)]);
}

// Builds "SET a=$1, b=$2" from an object of allowed fields that are present.
export function buildUpdate(fields, startIndex = 1, jsonFields = []) {
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    values.push(jsonFields.includes(k) ? JSON.stringify(v) : v);
    sets.push(`${k} = $${startIndex + values.length - 1}`);
  }
  return { sets, values };
}

// Writes an application event (sign-in, export, download, denied access…) to the immutable audit log.
// Data changes are captured automatically by database triggers; use this only for non-data events.
export async function auditEvent(action, { table = null, recordId = null, summary = '', user, ip } = {}) {
  const { currentContext, pool } = await import('../db/pool.js');
  const ctx = currentContext() || {};
  const u = user ?? ctx.user ?? null;
  await pool.query(
    `INSERT INTO audit_log(user_id,user_name,user_email,ip,action,table_name,record_id,summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [u?.id ?? null, u?.name ?? null, u?.email ?? null, ip ?? ctx.ip ?? null, action, table, recordId == null ? null : String(recordId), String(summary).slice(0, 1000)]);
}
