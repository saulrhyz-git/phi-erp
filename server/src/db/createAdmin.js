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
  `INSERT INTO users(email,name,password_hash,role,must_change_password) VALUES ($1,$2,$3,'admin',TRUE)
   ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', active=TRUE, must_change_password=TRUE`,
  [email, name, hash]);
console.log(`Admin ${email} is ready. They must change the password on first sign-in.`);
await pool.end();
