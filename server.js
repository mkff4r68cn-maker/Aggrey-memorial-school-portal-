'use strict';
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be 32+ characters.');
app.set('trust proxy', Number(process.env.TRUST_PROXY || (production ? 1 : 0)));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"] } } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'portal_sessions', createTableIfMissing: true }),
  name: 'aggrey.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: production, sameSite: 'strict', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use((req, res, next) => { if (production && !req.secure) return res.redirect(301, 'https://' + req.headers.host + req.originalUrl); next(); });
app.use(express.static('public', { index: 'index.html', maxAge: production ? '1h' : 0 }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
const csrfEqual = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };
function issueCsrf(req) { if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex'); return req.session.csrfToken; }
function requireCsrf(req, res, next) { if (!csrfEqual(req.session.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token missing or expired. Refresh and retry.' }); next(); }
function requireAuth(req, res, next) { if (!req.session.account) return res.status(401).json({ error: 'Please sign in.' }); next(); }
function requireAdmin(req, res, next) { if (!req.session.account || req.session.account.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' }); next(); }
function requirePasswordChanged(req, res, next) { if (req.session.account?.passwordResetRequired) return res.status(403).json({ error: 'Change your temporary password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' }); next(); }
const cleanUser = (account) => ({ id: account.id, username: account.username, role: account.role, passwordResetRequired: account.password_reset_required });
app.get('/api/csrf', (req, res) => res.json({ token: issueCsrf(req) }));
app.post('/api/auth/login', loginLimiter, requireCsrf, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toUpperCase(); const password = String(req.body.password || '');
    if (!username || username.length > 40 || !password || password.length > 128) return res.status(400).json({ error: 'Enter your student ID and password.' });
    const result = await pool.query('SELECT id, username, password_hash, role, active, password_reset_required FROM accounts WHERE username=$1', [username]); const account = result.rows[0];
    const dummyHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const valid = await bcrypt.compare(password, account?.password_hash || dummyHash).catch(() => false);
    if (!account || !account.active || !valid) return res.status(401).json({ error: 'Invalid ID or password.' });
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.account = cleanUser(account); req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE accounts SET last_login_at=NOW() WHERE id=$1', [account.id]);
    res.json({ user: req.session.account, csrfToken: req.session.csrfToken });
  } catch (e) { next(e); }
});
app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => req.session.destroy(err => { if (err) return res.status(500).json({ error: 'Logout failed.' }); res.clearCookie('aggrey.sid', { httpOnly: true, secure: production, sameSite: 'strict' }); res.json({ ok: true }); }));
app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try { if (req.session.account.role === 'student') { const { rows } = await pool.query('SELECT student_id, full_name, year_group, programme, house, email FROM student_profiles WHERE account_id=$1', [req.session.account.id]); return res.json({ user: req.session.account, profile: rows[0] || null }); } res.json({ user: req.session.account, profile: null }); } catch (e) { next(e); }
});
app.post('/api/auth/change-password', requireAuth, requireCsrf, async (req, res, next) => {
  try { const current = String(req.body.currentPassword || ''), nextPassword = String(req.body.newPassword || ''); if (nextPassword.length < 12 || nextPassword.length > 128 || !/[A-Z]/.test(nextPassword) || !/[a-z]/.test(nextPassword) || !/[0-9]/.test(nextPassword)) return res.status(400).json({ error: 'New password must be at least 12 characters and include uppercase, lowercase, and a number.' }); const { rows } = await pool.query('SELECT password_hash FROM accounts WHERE id=$1', [req.session.account.id]); if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) return res.status(401).json({ error: 'Current password is incorrect.' }); const hash = await bcrypt.hash(nextPassword, 12); await pool.query('UPDATE accounts SET password_hash=$1, password_reset_required=FALSE WHERE id=$2', [hash, req.session.account.id]); req.session.account.passwordResetRequired = false; res.json({ ok: true }); } catch (e) { next(e); }
});
app.get('/api/student/timetable', requireAuth, requirePasswordChanged, async (req, res, next) => { if (req.session.account.role !== 'student') return res.status(403).json({ error: 'Student access required.' }); try { const { rows } = await pool.query('SELECT weekday, start_time, end_time, subject, room, teacher FROM timetable_entries WHERE student_id=(SELECT student_id FROM student_profiles WHERE account_id=$1) ORDER BY weekday,start_time', [req.session.account.id]); res.json({ entries: rows }); } catch (e) { next(e); }
});
app.get('/api/student/results', requireAuth, requirePasswordChanged, async (req, res, next) => { if (req.session.account.role !== 'student') return res.status(403).json({ error: 'Student access required.' }); try { const { rows } = await pool.query('SELECT subject, term, academic_year, score, grade, remark FROM student_results WHERE published=TRUE AND student_id=(SELECT student_id FROM student_profiles WHERE account_id=$1) ORDER BY academic_year DESC, term, subject', [req.session.account.id]); res.json({ results: rows }); } catch (e) { next(e); }
});
app.get('/api/announcements', async (req, res, next) => { try { const { rows } = await pool.query("SELECT id,title,body,created_at FROM announcements WHERE published=TRUE AND audience IN ('all','students') ORDER BY created_at DESC LIMIT 50"); res.json({ announcements: rows }); } catch (e) { next(e); }
});
app.post('/api/admin/students', requireAuth, requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const studentId = String(req.body.studentId || '').trim().toUpperCase();
    const fullName = String(req.body.fullName || '').trim();
    const yearGroup = String(req.body.yearGroup || '').trim();
    const programme = String(req.body.programme || '').trim();
    const house = String(req.body.house || '').trim();
    const email = String(req.body.email || '').trim();
    const temporaryPassword = String(req.body.temporaryPassword || '');
    const emailValid = !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (!/^[A-Z0-9-]{2,40}$/.test(studentId) || !fullName || fullName.length > 120 || yearGroup.length > 40 || programme.length > 80 || house.length > 80 || !emailValid || temporaryPassword.length < 12 || temporaryPassword.length > 128 || !/[A-Z]/.test(temporaryPassword) || !/[a-z]/.test(temporaryPassword) || !/[0-9]/.test(temporaryPassword)) return res.status(400).json({ error: 'Student ID, full name, optional profile fields, and strong temporary password must be valid.' });
    const hash = await bcrypt.hash(temporaryPassword, 12);
    const client = await pool.connect();
    try { await client.query('BEGIN'); const { rows } = await client.query("INSERT INTO accounts(username,password_hash,role,password_reset_required) VALUES($1,$2,'student',TRUE) RETURNING id,username", [studentId,hash]); const account = rows[0]; await client.query('INSERT INTO student_profiles(account_id,student_id,full_name,year_group,programme,house,email) VALUES($1,$2,$3,$4,$5,$6,$7)', [account.id,studentId,fullName,yearGroup||null,programme||null,house||null,email||null]); await client.query('COMMIT'); res.status(201).json({ account: { id:account.id, username:account.username, role:'student', passwordResetRequired:true } }); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Student ID is already registered.' }); next(e); }
});
app.post('/api/admin/announcements', requireAuth, requireAdmin, requireCsrf, async (req, res, next) => { try { const title = String(req.body.title || '').trim(), body = String(req.body.body || '').trim(); if (!title || !body || title.length > 140 || body.length > 5000) return res.status(400).json({ error: 'Title and message required (title ≤140, message ≤5000 characters).' }); const { rows } = await pool.query('INSERT INTO announcements(title,body,published,created_by) VALUES($1,$2,TRUE,$3) RETURNING id,title,body,created_at', [title, body, req.session.account.id]); res.status(201).json({ announcement: rows[0] }); } catch (e) { next(e); }
});
app.get('/api/health', async (req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, req, res, next) => { console.error('Request error:', err.message); if (res.headersSent) return next(err); res.status(500).json({ error: 'Unexpected server error. Please try again.' }); });
const server = app.listen(port, () => console.log(`Aggrey Portal server listening on port ${port}`));
process.on('SIGTERM', () => server.close(() => pool.end()));
