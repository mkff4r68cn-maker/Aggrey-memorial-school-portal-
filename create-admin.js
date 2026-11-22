require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const [username] = process.argv.slice(2);
if (!username || !/^[A-Za-z0-9._-]{2,40}$/.test(username.trim())) { console.error('Usage: npm run create-admin -- ADMIN_USERNAME (2–40 letters, numbers, dots, underscores or hyphens)'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Admin password (min 12 chars, mixed case and number): ', async password => {
 rl.close(); if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { console.error('Password does not meet complexity requirements.'); process.exit(1); }
 const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
 try { const hash = await bcrypt.hash(password, 12); await pool.query("INSERT INTO accounts(username,password_hash,role,password_reset_required) VALUES($1,$2,'admin',FALSE)", [username.trim().toUpperCase(), hash]); console.log('Administrator account created. Keep credentials secure.'); } catch (e) { console.error('Admin creation failed:', e.message); process.exitCode=1; } finally { await pool.end(); }
});
