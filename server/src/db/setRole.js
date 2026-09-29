// Usage: npm run set-role -- <email> <role>
//   role: superadmin | project_manager | executive, or the name of a custom role (e.g. "Process Owner").
// For server-side recovery, e.g. assigning Superadmin when no one can sign in as one.
import { pool } from './pool.js';

const [email, role] = process.argv.slice(2);
if (!email || !role) { console.error('Usage: npm run set-role -- <email> <superadmin|project_manager|executive|"Custom role name">'); process.exit(1); }
const r = await pool.query('SELECT id, name FROM roles WHERE key=$1 OR lower(name)=lower($1) ORDER BY key NULLS LAST LIMIT 1', [role]);
if (!r.rowCount) { console.error(`No role called "${role}".`); process.exit(1); }
const u = await pool.query('UPDATE users SET role_id=$1, active=TRUE WHERE lower(email)=lower($2) RETURNING name', [r.rows[0].id, email]);
if (!u.rowCount) { console.error(`No user with email ${email}.`); process.exit(1); }
console.log(`${u.rows[0].name} <${email}> is now ${r.rows[0].name}.`);
await pool.end();
