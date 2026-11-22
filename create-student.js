require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const [studentId, fullName, yearGroup = '', programme = '', house = ''] = process.argv.slice(2);
if (!studentId || !fullName) { console.error('Usage: npm run create-student -- STUDENT_ID \"FULL NAME\" [YEAR_GROUP] [PROGRAMME] [HOUSE]'); process.exit(1); }
if (!/^[A-Za-z0-9-]{2,40}$/.test(studentId.trim()) || fullName.trim().length > 120 || !fullName.trim() || yearGroup.length > 40 || programme.length > 80 || house.length > 80) { console.error('Student ID or profile fields are invalid or too long.'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Temporary password (min 12 chars, mixed case and number): ', async (password) => {
  rl.close();
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { console.error('Password does not meet complexity requirements.'); process.exit(1); }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL missing.'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query("INSERT INTO accounts(username,password_hash,role,password_reset_required) VALUES($1,$2,'student',TRUE) RETURNING id", [studentId.trim().toUpperCase(), hash]);
    await client.query('INSERT INTO student_profiles(account_id,student_id,full_name,year_group,programme,house) VALUES($1,$2,$3,$4,$5,$6)', [rows[0].id, studentId.trim().toUpperCase(), fullName.trim(), yearGroup || null, programme || null, house || null]);
    await client.query('COMMIT'); console.log(`Created student account ${studentId.toUpperCase()}. Student must change temporary password on first login.`);
  } catch (err) { await client.query('ROLLBACK'); console.error('Account creation failed:', err.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
});
