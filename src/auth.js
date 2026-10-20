// Password hashing (scrypt) and signed login tokens (HMAC-SHA256), using only Node's crypto.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');

function issueToken(user) {
  const payload = b64(JSON.stringify({ uid: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

// Attaches req.user when a valid token is present (never fails the request).
async function optionalAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const data = readToken(h.startsWith('Bearer ') ? h.slice(7) : null);
    if (data) {
      const user = await db.get('SELECT id, name, email, role, phone, city FROM users WHERE id = ?', [data.uid]);
      if (user) req.user = user;
    }
    next();
  } catch (e) { next(e); }
}

function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `This action is only available to: ${roles.join(', ')}.` });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, issueToken, readToken, optionalAuth, requireAuth };
