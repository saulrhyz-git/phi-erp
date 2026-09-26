// Usage: npm run create-admin -- email@example.com "Full Name" 'TempPassword123'
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- <email> "<full name>" <temporary password, 10+ chars>');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users(email,name,password_hash,role_id,must_change_password)
     VALUES ($1,$2,$3,(SELECT id FROM roles WHERE key='project_manager'),TRUE)
   ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role_id=EXCLUDED.role_id, active=TRUE, must_change_password=TRUE`,
  [email, name, hash]);
console.log(`Project Manager ${email} is ready. They must change the password on first sign-in.`);
await pool.end();
