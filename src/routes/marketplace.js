// Professional discovery & hiring, material suppliers, government / institutional tenders.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { ah, httpError, notify, today } = require('../helpers');

const router = express.Router();

// ---------- Professional / contractor discovery ----------
router.get('/professionals', ah(async (req, res) => {
  const { category, city, q, verified, sort } = req.query;
  const where = ["u.role IN ('contractor','professional')"]; const params = [];
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (city) { where.push('LOWER(u.city) = LOWER(?)'); params.push(city); }
  if (verified === '1') where.push('p.verified = 1');
  if (q) { where.push('(LOWER(u.name) LIKE ? OR LOWER(p.company) LIKE ? OR LOWER(p.skills) LIKE ?)'); const s = `%${String(q).toLowerCase()}%`; params.push(s, s, s); }
  const order = sort === 'experience' ? 'p.experience_years DESC' : sort === 'rate' ? 'p.day_rate ASC' : 'p.verified DESC, p.rating DESC, p.rating_count DESC';
  res.json(await db.all(`SELECT u.id, u.name, u.city, u.role, p.category, p.company, p.skills, p.experience_years, p.day_rate,
      p.rating, p.rating_count, p.projects_completed, p.verified FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, params));
}));

router.get('/professionals/:id', ah(async (req, res) => {
  const pro = await db.get(`SELECT u.id, u.name, u.city, u.role, u.phone, u.email, p.* FROM users u JOIN profiles p ON p.user_id = u.id
                             WHERE u.id = ? AND u.role IN ('contractor','professional','supplier')`, [req.params.id]);
  if (!pro) throw httpError(404, 'Profile not found.');
  if (!req.user) { pro.phone = null; pro.email = null; } // contact details for logged-in users only
  const reviews = await db.all(`SELECT r.rating, r.comment, r.created_at, u.name AS reviewer, pr.title AS project
                                  FROM reviews r JOIN users u ON u.id = r.reviewer_id LEFT JOIN projects pr ON pr.id = r.project_id
                                 WHERE r.reviewee_id = ? ORDER BY r.id DESC`, [pro.id]);
  res.json({ profile: pro, reviews });
}));

router.post('/hire-requests', requireAuth(), ah(async (req, res) => {
  const { to_user, project_id, message } = req.body || {};
  const target = await db.get("SELECT id, name FROM users WHERE id = ? AND role IN ('contractor','professional','supplier')", [to_user]);
  if (!target) throw httpError(400, 'Choose a valid professional.');
  if (target.id === req.user.id) throw httpError(400, 'You cannot send a request to yourself.');
  await db.run('INSERT INTO hire_requests (from_user, to_user, project_id, message) VALUES (?, ?, ?, ?)', [req.user.id, target.id, project_id || null, message]);
  await notify(target.id, `${req.user.name} sent you an enquiry`, '#/dashboard');
  res.status(201).json({ ok: true });
}));

router.put('/hire-requests/:id', requireAuth(), ah(async (req, res) => {
  const h = await db.get('SELECT * FROM hire_requests WHERE id = ?', [req.params.id]);
  if (!h || h.to_user !== req.user.id) throw httpError(404, 'Request not found.');
  const status = ['accepted', 'declined'].includes(req.body?.status) ? req.body.status : null;
  if (!status) throw httpError(400, 'Status must be accepted or declined.');
  await db.run('UPDATE hire_requests SET status = ? WHERE id = ?', [status, h.id]);
  await notify(h.from_user, `${req.user.name} ${status} your enquiry`, '#/dashboard');
  res.json({ ok: true });
}));

// ---------- Materials & suppliers ----------
router.get('/materials', ah(async (req, res) => {
  const { region_id, material_key, q } = req.query;
  const where = ['1 = 1']; const params = [];
  if (region_id) { where.push('sp.region_id = ?'); params.push(region_id); }
  if (material_key) { where.push('sp.material_key = ?'); params.push(material_key); }
  if (q) { where.push('(LOWER(sp.name) LIKE ? OR LOWER(sp.brand) LIKE ?)'); const s = `%${String(q).toLowerCase()}%`; params.push(s, s); }
  const rows = await db.all(`SELECT sp.*, r.city, u.name AS supplier_name, u.phone AS supplier_phone, p.company, p.verified, p.rating,
        mr.rate AS reference_rate, mr.unit AS reference_unit
      FROM supplier_products sp JOIN regions r ON r.id = sp.region_id JOIN users u ON u.id = sp.supplier_id
      LEFT JOIN profiles p ON p.user_id = sp.supplier_id
      LEFT JOIN material_rates mr ON mr.region_id = sp.region_id AND mr.material_key = sp.material_key
      WHERE ${where.join(' AND ')} ORDER BY sp.material_key, sp.price LIMIT 300`, params);
  rows.forEach((r) => {
    if (!req.user) r.supplier_phone = null;
    r.vs_reference_pct = r.reference_rate && r.reference_unit === r.unit ? Math.round(((r.price - r.reference_rate) / r.reference_rate) * 1000) / 10 : null;
  });
  res.json(rows);
}));

router.post('/materials', requireAuth('supplier'), ah(async (req, res) => {
  const b = req.body || {};
  const price = Number(b.price);
  if (!b.name || !b.unit || !(price > 0) || !b.region_id) throw httpError(400, 'Name, unit, price and city are required.');
  const r = await db.run(`INSERT INTO supplier_products (supplier_id, region_id, material_key, name, brand, unit, price, min_order, in_stock)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [req.user.id, b.region_id, b.material_key || null, b.name, b.brand, b.unit, price, b.min_order, b.in_stock === false ? 0 : 1]);
  res.status(201).json(await db.get('SELECT * FROM supplier_products WHERE id = ?', [r.insertId]));
}));

router.put('/materials/:id', requireAuth('supplier'), ah(async (req, res) => {
  const sp = await db.get('SELECT * FROM supplier_products WHERE id = ?', [req.params.id]);
  if (!sp || sp.supplier_id !== req.user.id) throw httpError(404, 'Product not found.');
  const b = req.body || {};
  await db.run('UPDATE supplier_products SET price = ?, in_stock = ?, min_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [Number(b.price) > 0 ? Number(b.price) : sp.price, b.in_stock === undefined ? sp.in_stock : (b.in_stock ? 1 : 0), b.min_order ?? sp.min_order, sp.id]);
  res.json(await db.get('SELECT * FROM supplier_products WHERE id = ?', [sp.id]));
}));

router.delete('/materials/:id', requireAuth('supplier'), ah(async (req, res) => {
  const sp = await db.get('SELECT * FROM supplier_products WHERE id = ?', [req.params.id]);
  if (!sp || sp.supplier_id !== req.user.id) throw httpError(404, 'Product not found.');
  await db.run('DELETE FROM supplier_products WHERE id = ?', [sp.id]);
  res.json({ ok: true });
}));

// ---------- Tenders ----------
router.get('/tenders', ah(async (req, res) => {
  const { type, state, q, category, include_closed, saved } = req.query;
  const where = ['1 = 1']; const params = [];
  if (type) { where.push('t.tender_type = ?'); params.push(type); }
  if (state) { where.push('t.state = ?'); params.push(state); }
  if (category) { where.push('t.category = ?'); params.push(category); }
  if (include_closed !== '1') { where.push('(t.closing_date IS NULL OR t.closing_date >= ?)'); params.push(today()); }
  if (q) { where.push('(LOWER(t.title) LIKE ? OR LOWER(t.organization) LIKE ? OR LOWER(t.location) LIKE ?)'); const s = `%${String(q).toLowerCase()}%`; params.push(s, s, s); }
  if (saved === '1' && req.user) { where.push('t.id IN (SELECT tender_id FROM tender_bookmarks WHERE user_id = ?)'); params.push(req.user.id); }
  const rows = await db.all(`SELECT t.* FROM tenders t WHERE ${where.join(' AND ')} ORDER BY t.closing_date ASC LIMIT 200`, params);
  if (req.user) {
    const marks = new Set((await db.all('SELECT tender_id FROM tender_bookmarks WHERE user_id = ?', [req.user.id])).map((m) => m.tender_id));
    rows.forEach((r) => { r.saved = marks.has(r.id); });
  }
  res.json(rows);
}));

router.post('/tenders/:id/bookmark', requireAuth(), ah(async (req, res) => {
  const t = await db.get('SELECT id FROM tenders WHERE id = ?', [req.params.id]);
  if (!t) throw httpError(404, 'Tender not found.');
  const has = await db.get('SELECT tender_id FROM tender_bookmarks WHERE user_id = ? AND tender_id = ?', [req.user.id, t.id]);
  if (has) await db.run('DELETE FROM tender_bookmarks WHERE user_id = ? AND tender_id = ?', [req.user.id, t.id]);
  else await db.run('INSERT INTO tender_bookmarks (user_id, tender_id) VALUES (?, ?)', [req.user.id, t.id]);
  res.json({ saved: !has });
}));

module.exports = router;
