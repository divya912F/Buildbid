// Auth, profile, regions/rates, estimation, notifications, dashboard, admin.
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, issueToken, requireAuth } = require('../auth');
const { estimate } = require('../estimator');
const { ah, httpError, parseJSON, getModel, loadRegionWithRates } = require('../helpers');

const router = express.Router();
const ROLES = ['customer', 'contractor', 'professional', 'supplier'];
const CATEGORIES = ['contractor', 'civil_engineer', 'architect', 'structural_engineer', 'mason', 'plumber', 'electrician', 'carpenter', 'painter', 'supplier'];

// ---------- Auth ----------
router.post('/auth/register', ah(async (req, res) => {
  const { name, email, password, role, phone, city, category, company, skills, experience_years, day_rate, licence_no, bio } = req.body || {};
  if (!name || !email || !password) throw httpError(400, 'Name, email and password are required.');
  if (String(password).length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  if (!ROLES.includes(role)) throw httpError(400, 'Choose a valid account type.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Enter a valid email address.');
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) throw httpError(409, 'An account with this email already exists.');
  const r = await db.run('INSERT INTO users (name, email, password_hash, role, phone, city) VALUES (?, ?, ?, ?, ?, ?)',
    [name.trim(), email.toLowerCase().trim(), hashPassword(password), role, phone, city]);
  if (role !== 'customer') {
    const cat = role === 'contractor' ? 'contractor' : role === 'supplier' ? 'supplier' : (CATEGORIES.includes(category) ? category : 'civil_engineer');
    await db.run(`INSERT INTO profiles (user_id, category, company, skills, experience_years, day_rate, licence_no, bio)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.insertId, cat, company, skills, Number(experience_years) || 0, day_rate ? Number(day_rate) : null, licence_no, bio]);
  }
  const user = await db.get('SELECT id, name, email, role, phone, city FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: issueToken(user), user });
}));

router.post('/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const row = await db.get('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase().trim()]);
  if (!row || !verifyPassword(password, row.password_hash)) throw httpError(401, 'Incorrect email or password.');
  const user = { id: row.id, name: row.name, email: row.email, role: row.role, phone: row.phone, city: row.city };
  res.json({ token: issueToken(user), user });
}));

router.get('/me', requireAuth(), ah(async (req, res) => {
  const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
  res.json({ user: req.user, profile });
}));

router.put('/me', requireAuth(), ah(async (req, res) => {
  const b = req.body || {};
  await db.run('UPDATE users SET name = COALESCE(?, name), phone = ?, city = ? WHERE id = ?', [b.name || null, b.phone, b.city, req.user.id]);
  if (req.user.role !== 'customer') {
    await db.run(`UPDATE profiles SET company = ?, skills = ?, experience_years = ?, day_rate = ?, licence_no = ?, bio = ?,
                  category = COALESCE(?, category) WHERE user_id = ?`,
    [b.company, b.skills, Number(b.experience_years) || 0, b.day_rate ? Number(b.day_rate) : null, b.licence_no, b.bio,
      CATEGORIES.includes(b.category) ? b.category : null, req.user.id]);
  }
  const user = await db.get('SELECT id, name, email, role, phone, city FROM users WHERE id = ?', [req.user.id]);
  const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
  res.json({ user, profile });
}));

// ---------- Regions & rates ----------
router.get('/regions', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM regions ORDER BY state, city'));
}));

router.get('/regions/:id/rates', ah(async (req, res) => {
  const { region, rates } = await loadRegionWithRates(req.params.id);
  // Live supplier prices in this region give a market cross-check for each material.
  const market = await db.all(`SELECT material_key, MIN(price) AS min_price, AVG(price) AS avg_price, COUNT(*) AS offers
                                 FROM supplier_products WHERE region_id = ? AND in_stock = 1 AND material_key IS NOT NULL
                                GROUP BY material_key`, [req.params.id]);
  const m = Object.fromEntries(market.map((x) => [x.material_key, x]));
  res.json({ region, rates: rates.map((r) => ({ ...r, market: m[r.material_key] || null })) });
}));

router.put('/rates/:id', requireAuth('admin'), ah(async (req, res) => {
  const rate = Number(req.body?.rate);
  if (!(rate > 0)) throw httpError(400, 'Rate must be a positive number.');
  await db.run('UPDATE material_rates SET rate = ?, source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [rate, req.body.source || 'Updated by admin', req.params.id]);
  res.json(await db.get('SELECT * FROM material_rates WHERE id = ?', [req.params.id]));
}));

router.put('/regions/:id', requireAuth('admin'), ah(async (req, res) => {
  const labour = Number(req.body?.labour_rate_sqft);
  if (!(labour > 0)) throw httpError(400, 'Labour rate must be a positive number.');
  await db.run('UPDATE regions SET labour_rate_sqft = ? WHERE id = ?', [labour, req.params.id]);
  res.json(await db.get('SELECT * FROM regions WHERE id = ?', [req.params.id]));
}));

// ---------- Cost estimation ----------
router.post('/estimates', ah(async (req, res) => {
  const body = req.body || {};
  const { region, rates } = await loadRegionWithRates(body.region_id);
  const result = estimate(body, region, rates, await getModel());
  let id = null;
  if (body.save !== false) {
    const r = await db.run('INSERT INTO estimates (user_id, region_id, inputs, result, total) VALUES (?, ?, ?, ?, ?)',
      [req.user ? req.user.id : null, region.id, JSON.stringify(result.inputs), JSON.stringify(result), result.total]);
    id = r.insertId;
  }
  res.json({ id, ...result });
}));

router.get('/estimates/mine', requireAuth(), ah(async (req, res) => {
  const rows = await db.all(`SELECT e.id, e.total, e.inputs, e.created_at, r.city FROM estimates e JOIN regions r ON r.id = e.region_id
                              WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 50`, [req.user.id]);
  res.json(rows.map((r) => ({ ...r, inputs: parseJSON(r.inputs, {}) })));
}));

router.get('/estimates/:id', ah(async (req, res) => {
  const row = await db.get('SELECT * FROM estimates WHERE id = ?', [req.params.id]);
  if (!row) throw httpError(404, 'Estimate not found.');
  res.json({ id: row.id, ...parseJSON(row.result, {}) });
}));

router.get('/model', ah(async (req, res) => {
  const m = await getModel();
  res.json(m ? { samples: m.n, rmse: Math.round(m.rmse), r2: Math.round(m.r2 * 1000) / 1000, features: ['intercept', 'ln(total area)', 'floors', 'quality', 'region cost index', 'commercial'], weights: m.weights.map((w) => Math.round(w * 100) / 100) } : { samples: 0 });
}));

// ---------- Notifications ----------
router.get('/notifications', requireAuth(), ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]));
}));
router.post('/notifications/read', requireAuth(), ah(async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}));

// ---------- Public stats & dashboard ----------
router.get('/stats', ah(async (req, res) => {
  const one = async (sql) => Number((await db.get(sql)).n);
  res.json({
    professionals: await one("SELECT COUNT(*) AS n FROM users WHERE role IN ('contractor','professional')"),
    suppliers: await one("SELECT COUNT(*) AS n FROM users WHERE role = 'supplier'"),
    open_projects: await one("SELECT COUNT(*) AS n FROM projects WHERE status = 'open'"),
    tenders: await one('SELECT COUNT(*) AS n FROM tenders'),
    regions: await one('SELECT COUNT(*) AS n FROM regions'),
    estimates: await one('SELECT COUNT(*) AS n FROM estimates'),
  });
}));

router.get('/dashboard', requireAuth(), ah(async (req, res) => {
  const u = req.user; const out = { role: u.role };
  if (u.role === 'customer') {
    out.projects = await db.all(`SELECT p.*, r.city, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id AND b.status <> 'withdrawn') AS bid_count
                                   FROM projects p JOIN regions r ON r.id = p.region_id WHERE p.customer_id = ? ORDER BY p.id DESC`, [u.id]);
    out.estimates = (await db.get('SELECT COUNT(*) AS n FROM estimates WHERE user_id = ?', [u.id])).n;
    out.hires = await db.all(`SELECT h.*, t.name AS to_name FROM hire_requests h JOIN users t ON t.id = h.to_user WHERE h.from_user = ? ORDER BY h.id DESC LIMIT 10`, [u.id]);
  } else if (u.role === 'contractor') {
    out.bids = await db.all(`SELECT b.*, p.title, p.status AS project_status, r.city FROM bids b JOIN projects p ON p.id = b.project_id
                              JOIN regions r ON r.id = p.region_id WHERE b.contractor_id = ? ORDER BY b.id DESC`, [u.id]);
    out.active = await db.all(`SELECT p.*, r.city FROM projects p JOIN bids b ON b.id = p.awarded_bid_id JOIN regions r ON r.id = p.region_id
                                WHERE b.contractor_id = ? ORDER BY p.id DESC`, [u.id]);
    out.open_count = (await db.get("SELECT COUNT(*) AS n FROM projects WHERE status = 'open'")).n;
  }
  if (['contractor', 'professional', 'supplier'].includes(u.role)) {
    out.profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [u.id]);
    out.incoming_hires = await db.all(`SELECT h.*, f.name AS from_name, f.phone AS from_phone, p.title AS project_title FROM hire_requests h
                                         JOIN users f ON f.id = h.from_user LEFT JOIN projects p ON p.id = h.project_id
                                        WHERE h.to_user = ? ORDER BY h.id DESC LIMIT 20`, [u.id]);
  }
  if (u.role === 'supplier') out.products = await db.all('SELECT sp.*, r.city FROM supplier_products sp JOIN regions r ON r.id = sp.region_id WHERE supplier_id = ? ORDER BY sp.id DESC', [u.id]);
  if (u.role === 'admin') {
    out.pending = await db.all(`SELECT u.id, u.name, u.email, u.city, p.category, p.company, p.licence_no, p.experience_years
                                  FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.verified = 0 ORDER BY u.id DESC`);
  }
  res.json(out);
}));

// ---------- Admin ----------
router.post('/admin/verify/:userId', requireAuth('admin'), ah(async (req, res) => {
  const verified = req.body?.verified === false ? 0 : 1;
  await db.run('UPDATE profiles SET verified = ? WHERE user_id = ?', [verified, req.params.userId]);
  res.json({ ok: true });
}));

module.exports = router;
