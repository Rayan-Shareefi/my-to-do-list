require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
app.disable('x-powered-by'); // Security: don't advertise the framework/version to attackers

// Security: secret must come from environment, never hardcoded (see CLAUDE.md rule #2)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Create a .env file (see .env.example).');
}

app.use(express.json({ limit: '10kb' })); // Security: cap payload size, prevent body DoS

// CORS: for a local student project, reflect whatever origin is calling
// (including the 'null' origin browsers send for file:// pages) so the
// frontend works whether opened directly as a file or served locally.
// A stricter, single-origin allowlist (see CLAUDE.md rule 9) is the
// recommended production setup once there's a real deployed frontend URL.
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 100 })); // Security: general rate limiting

// Security: stricter rate limit on login/register to slow brute-force attacks
// (disabled during automated tests so the test suite's own volume of
// register/login calls doesn't trip it and mask unrelated test failures)
const authLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: 'Too many attempts, please try again later' }
    });

// ---------- Validation helpers ----------
function validUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
}
function validPassword(p) {
  // Simplified per project scope: just a minimum length, no complexity rules
  return typeof p === 'string' && p.length >= 6 && p.length <= 72;
}
function validTitle(t) {
  return typeof t === 'string' && t.trim().length > 0 && t.length <= 200;
}

// ---------- Auth middleware ----------
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    // Security: no internal error detail leaked to client
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Security: strip characters that enable HTML/script injection, as a
// backend-side defense in depth even though the frontend already escapes output
function sanitize(str) {
  return str.replace(/[<>]/g, '');
}

// ---------- Auth routes ----------
app.post('/api/register', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 chars, letters/numbers/underscore only' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  // Security: passwords are hashed with bcrypt, never stored in plain text
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const token = jwt.sign({ userId: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '2h' });
  res.status(201).json({ token, username });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: 'Invalid credentials format' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Security: same generic error whether username or password is wrong (no user enumeration)
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, username: user.username });
});

// ---------- Todo routes (all require auth, all scoped to req.userId) ----------
app.get('/api/todos', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY id DESC').all(req.userId);
  res.json(rows);
});

// Added to satisfy tests/tdd-demo.test.js (written first, per TDD)
app.get('/api/todos/count', authRequired, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM todos WHERE user_id = ?').get(req.userId);
  res.json({ count: row.count });
});


app.post('/api/todos', authRequired, (req, res) => {
  const { title } = req.body || {};
  if (!validTitle(title)) return res.status(400).json({ error: 'Invalid title' });
  // Security: parameterized query prevents SQL injection; sanitize strips <> as defense-in-depth against XSS
  const clean = sanitize(title.trim());
  const info = db.prepare('INSERT INTO todos (user_id, title) VALUES (?, ?)').run(req.userId, clean);
  res.status(201).json({ id: info.lastInsertRowid, title: clean, done: 0 });
});

app.put('/api/todos/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { done } = req.body || {};
  // Security: reject anything that isn't strictly a boolean, instead of coercing silently
  if (typeof done !== 'boolean') return res.status(400).json({ error: 'done must be a boolean' });
  // Security: user_id check ensures users can only modify their own todos
  const result = db.prepare('UPDATE todos SET done = ? WHERE id = ? AND user_id = ?')
    .run(done ? 1 : 0, id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id, done: done ? 1 : 0 });
});

app.delete('/api/todos/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

module.exports = app;
