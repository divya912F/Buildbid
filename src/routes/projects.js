// Projects, bidding/quotations, comparison & award, project management workspace.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { estimate } = require('../estimator');
const { compareQuotations } = require('../analysis');
const { createMilestonePlan } = require('../milestones');
const { ah, httpError, parseJSON, notify, getModel, invalidateModel, loadRegionWithRates, today, addDays } = require('../helpers');

const router = express.Router();

const PROJECT_SELECT = `SELECT p.*, r.city, r.state, u.name AS customer_name FROM projects p
  JOIN regions r ON r.id = p.region_id JOIN users u ON u.id = p.customer_id`;

async function getProject(id) {
  const p = await db.get(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
  if (!p) throw httpError(404, 'Project not found.');
  return p;
}

async function awardedContractorId(project) {
  if (!project.awarded_bid_id) return null;
  const b = await db.get('SELECT contractor_id FROM bids WHERE id = ?', [project.awarded_bid_id]);
  return b ? b.contractor_id : null;
}

async function assertMember(req, project) {
  const cid = await awardedContractorId(project);
  const isOwner = req.user.id === project.customer_id;
  const isContractor = cid && req.user.id === cid;
  if (!isOwner && !isContractor && req.user.role !== 'admin') throw httpError(403, 'Only the customer and the awarded contractor can access this workspace.');
  return { isOwner, isContractor, contractorId: cid };
}

const BID_SELECT = `SELECT b.*, u.name AS contractor_name, u.city AS contractor_city, u.phone AS contractor_phone,
  pr.company, pr.rating, pr.rating_count, pr.verified, pr.experience_years, pr.projects_completed
  FROM bids b JOIN users u ON u.id = b.contractor_id LEFT JOIN profiles pr ON pr.user_id = b.contractor_id`;

// ---------- Project discovery / listing ----------
router.get('/projects', ah(async (req, res) => {
  const { mine, status, region_id, q, building_type } = req.query;
  const where = []; const params = [];
  if (mine && req.user) { where.push('p.customer_id = ?'); params.push(req.user.id); }
  else { where.push('p.status = ?'); params.push(status || 'open'); }
  if (region_id) { where.push('p.region_id = ?'); params.push(region_id); }
  if (building_type) { where.push('p.building_type = ?'); params.push(building_type); }
  if (q) { where.push('(LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(r.city) LIKE ?)'); const s = `%${String(q).toLowerCase()}%`; params.push(s, s, s); }
  const rows = await db.all(`SELECT p.*, r.city, r.state, u.name AS customer_name,
      (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id AND b.status <> 'withdrawn') AS bid_count
      FROM projects p JOIN regions r ON r.id = p.region_id JOIN users u ON u.id = p.customer_id
      WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 100`, params);
  if (req.user && req.user.role === 'contractor') {
    const my = await db.all('SELECT project_id, amount, status FROM bids WHERE contractor_id = ?', [req.user.id]);
    const m = Object.fromEntries(my.map((b) => [b.project_id, b]));
    rows.forEach((r) => { r.my_bid = m[r.id] || null; });
  }
  res.json(rows);
}));

router.post('/projects', requireAuth('customer'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.title || String(b.title).trim().length < 4) throw httpError(400, 'Give your project a short title (at least 4 characters).');
  const { region, rates } = await loadRegionWithRates(b.region_id);
  const est = estimate(b, region, rates, await getModel());
  const e = await db.run('INSERT INTO estimates (user_id, region_id, inputs, result, total) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, region.id, JSON.stringify(est.inputs), JSON.stringify(est), est.total]);
  const deadline = b.bid_deadline || addDays(today(), 14);
  const r = await db.run(`INSERT INTO projects (customer_id, title, description, building_type, region_id, location_text, plot_area,
      area_per_floor, floors, quality, basement, budget, estimate_id, estimated_cost, status, bid_deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  [req.user.id, b.title.trim(), b.description, est.inputs.buildingType, region.id, b.location_text, b.plot_area ? Number(b.plot_area) : null,
    est.inputs.areaPerFloor, est.inputs.floors, est.inputs.quality, est.inputs.basement ? 1 : 0, b.budget ? Number(b.budget) : null,
    e.insertId, est.total, deadline]);
  // Let verified contractors in the same city know.
  const local = await db.all(`SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.role = 'contractor' AND LOWER(u.city) = LOWER(?)`, [region.city]);
  for (const c of local) await notify(c.id, `New project in ${region.city}: ${b.title.trim()}`, `#/projects/${r.insertId}`);
  res.status(201).json({ id: r.insertId, estimate: est });
}));

router.get('/projects/:id', ah(async (req, res) => {
  const p = await getProject(req.params.id);
  const est = p.estimate_id ? await db.get('SELECT result FROM estimates WHERE id = ?', [p.estimate_id]) : null;
  const out = { project: p, estimate: est ? parseJSON(est.result) : null };
  const bidCount = await db.get("SELECT COUNT(*) AS n FROM bids WHERE project_id = ? AND status <> 'withdrawn'", [p.id]);
  out.bid_count = Number(bidCount.n);
  if (req.user) {
    if (req.user.id === p.customer_id || req.user.role === 'admin') out.bids = await db.all(`${BID_SELECT} WHERE b.project_id = ? ORDER BY b.amount`, [p.id]);
    if (req.user.role === 'contractor') out.my_bid = await db.get('SELECT * FROM bids WHERE project_id = ? AND contractor_id = ?', [p.id, req.user.id]);
    const cid = await awardedContractorId(p);
    out.is_member = req.user.id === p.customer_id || req.user.id === cid;
    if (cid) out.contractor = await db.get('SELECT u.id, u.name, u.phone, pr.company FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.id = ?', [cid]);
  }
  res.json(out);
}));

router.post('/projects/:id/cancel', requireAuth('customer'), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  if (p.customer_id !== req.user.id) throw httpError(403, 'Not your project.');
  if (!['open', 'awarded'].includes(p.status)) throw httpError(400, 'Only open or awarded projects can be cancelled.');
  await db.run("UPDATE projects SET status = 'cancelled' WHERE id = ?", [p.id]);
  res.json({ ok: true });
}));

// ---------- Bids / quotations ----------
router.post('/projects/:id/bids', requireAuth('contractor'), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  if (p.status !== 'open') throw httpError(400, 'This project is no longer accepting quotations.');
  const b = req.body || {};
  const material = Number(b.material_cost) || 0; const labour = Number(b.labour_cost) || 0; const other = Number(b.other_cost) || 0;
  const amount = Number(b.amount) || material + labour + other;
  const days = parseInt(b.timeline_days, 10);
  if (!(amount > 0)) throw httpError(400, 'Enter your quoted amount (or the material / labour / other split).');
  if (!(days > 0)) throw httpError(400, 'Enter a timeline in days.');
  const existing = await db.get('SELECT id FROM bids WHERE project_id = ? AND contractor_id = ?', [p.id, req.user.id]);
  if (existing) {
    await db.run(`UPDATE bids SET amount = ?, material_cost = ?, labour_cost = ?, other_cost = ?, timeline_days = ?, warranty_months = ?, notes = ?, status = 'submitted' WHERE id = ?`,
      [amount, material, labour, other, days, parseInt(b.warranty_months, 10) || 0, b.notes, existing.id]);
  } else {
    await db.run(`INSERT INTO bids (project_id, contractor_id, amount, material_cost, labour_cost, other_cost, timeline_days, warranty_months, notes)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [p.id, req.user.id, amount, material, labour, other, days, parseInt(b.warranty_months, 10) || 0, b.notes]);
  }
  await notify(p.customer_id, `${req.user.name} ${existing ? 'updated their' : 'sent a'} quotation for "${p.title}"`, `#/projects/${p.id}`);
  res.status(existing ? 200 : 201).json(await db.get('SELECT * FROM bids WHERE project_id = ? AND contractor_id = ?', [p.id, req.user.id]));
}));

router.post('/bids/:id/withdraw', requireAuth('contractor'), ah(async (req, res) => {
  const b = await db.get('SELECT * FROM bids WHERE id = ?', [req.params.id]);
  if (!b || b.contractor_id !== req.user.id) throw httpError(404, 'Quotation not found.');
  if (b.status !== 'submitted') throw httpError(400, 'Only pending quotations can be withdrawn.');
  await db.run("UPDATE bids SET status = 'withdrawn' WHERE id = ?", [b.id]);
  res.json({ ok: true });
}));

router.get('/projects/:id/compare', requireAuth(), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  if (p.customer_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Only the project owner can compare quotations.');
  const est = p.estimate_id ? parseJSON((await db.get('SELECT result FROM estimates WHERE id = ?', [p.estimate_id]))?.result) : null;
  const bids = await db.all(`${BID_SELECT} WHERE b.project_id = ?`, [p.id]);
  res.json({ project: p, estimate: est, ...compareQuotations(p, est, bids) });
}));

router.post('/projects/:id/award', requireAuth('customer'), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  if (p.customer_id !== req.user.id) throw httpError(403, 'Not your project.');
  if (p.status !== 'open') throw httpError(400, 'This project has already been awarded or closed.');
  const bid = await db.get("SELECT * FROM bids WHERE id = ? AND project_id = ? AND status = 'submitted'", [req.body?.bid_id, p.id]);
  if (!bid) throw httpError(400, 'Choose a valid quotation to award.');
  await db.run("UPDATE bids SET status = 'accepted' WHERE id = ?", [bid.id]);
  await db.run("UPDATE bids SET status = 'rejected' WHERE project_id = ? AND id <> ? AND status = 'submitted'", [p.id, bid.id]);
  await db.run("UPDATE projects SET status = 'awarded', awarded_bid_id = ? WHERE id = ?", [bid.id, p.id]);

  // Auto-generate a milestone plan from the estimate's phase split, scaled to the awarded amount & timeline.
  const est = p.estimate_id ? parseJSON((await db.get('SELECT result FROM estimates WHERE id = ?', [p.estimate_id]))?.result) : null;
  await createMilestonePlan(p.id, bid, est);
  await notify(bid.contractor_id, `Congratulations! Your quotation for "${p.title}" was accepted.`, `#/workspace/${p.id}`);
  const others = await db.all("SELECT contractor_id FROM bids WHERE project_id = ? AND status = 'rejected'", [p.id]);
  for (const o of others) await notify(o.contractor_id, `"${p.title}" was awarded to another contractor.`, `#/projects/${p.id}`);
  res.json({ ok: true });
}));

// ---------- Project management workspace ----------
router.get('/projects/:id/workspace', requireAuth(), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  const who = await assertMember(req, p);
  const bid = p.awarded_bid_id ? await db.get(`${BID_SELECT} WHERE b.id = ?`, [p.awarded_bid_id]) : null;
  const milestones = await db.all('SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order, id', [p.id]);
  const expenses = await db.all(`SELECT e.*, m.title AS milestone_title, u.name AS by_name FROM expenses e
                                   LEFT JOIN milestones m ON m.id = e.milestone_id LEFT JOIN users u ON u.id = e.created_by
                                  WHERE e.project_id = ? ORDER BY e.spent_on DESC, e.id DESC`, [p.id]);
  const updates = await db.all(`SELECT pu.*, u.name, u.role FROM project_updates pu JOIN users u ON u.id = pu.user_id
                                 WHERE pu.project_id = ? ORDER BY pu.id DESC LIMIT 50`, [p.id]);
  const contract = bid ? Number(bid.amount) : Number(p.estimated_cost);
  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const budgetTotal = milestones.reduce((s, m) => s + Number(m.budget), 0) || contract;
  const progress = milestones.length ? Math.round(milestones.reduce((s, m) => s + Number(m.budget) * Number(m.progress), 0) / budgetTotal) : 0;
  const spentByMilestone = {};
  expenses.forEach((e) => { if (e.milestone_id) spentByMilestone[e.milestone_id] = (spentByMilestone[e.milestone_id] || 0) + Number(e.amount); });
  milestones.forEach((m) => { m.spent = spentByMilestone[m.id] || 0; });

  // Simple risk alerts for decision support.
  const alerts = [];
  const earned = (progress / 100) * contract;
  if (spent > earned * 1.15 && spent > contract * 0.05) alerts.push({ level: 'high', text: `Spending (₹${Math.round(spent).toLocaleString('en-IN')}) is running ahead of work completed (~₹${Math.round(earned).toLocaleString('en-IN')}). Review expenses.` });
  milestones.filter((m) => m.status !== 'done' && m.due_date && m.due_date < today()).forEach((m) => alerts.push({ level: 'medium', text: `"${m.title}" is past its due date (${m.due_date}).` }));
  milestones.filter((m) => m.spent > Number(m.budget) * 1.1).forEach((m) => alerts.push({ level: 'medium', text: `"${m.title}" is ${Math.round((m.spent / m.budget - 1) * 100)}% over its budget.` }));
  if (spent > contract) alerts.push({ level: 'high', text: 'Total spending has exceeded the contract value.' });

  res.json({ project: p, bid, milestones, expenses, updates, role: who.isOwner ? 'customer' : 'contractor',
    summary: { contract, spent, remaining: contract - spent, progress, earned: Math.round(earned) }, alerts });
}));

router.post('/projects/:id/start', requireAuth(), ah(async (req, res) => {
  const p = await getProject(req.params.id); await assertMember(req, p);
  if (p.status !== 'awarded') throw httpError(400, 'Project must be awarded before it can start.');
  await db.run("UPDATE projects SET status = 'in_progress' WHERE id = ?", [p.id]);
  await db.run('INSERT INTO project_updates (project_id, user_id, message) VALUES (?, ?, ?)', [p.id, req.user.id, 'Work has started on site.']);
  res.json({ ok: true });
}));

router.put('/milestones/:id', requireAuth(), ah(async (req, res) => {
  const m = await db.get('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
  if (!m) throw httpError(404, 'Milestone not found.');
  const p = await getProject(m.project_id); await assertMember(req, p);
  let progress = Math.max(0, Math.min(100, parseInt(req.body?.progress ?? m.progress, 10) || 0));
  let status = req.body?.status || (progress >= 100 ? 'done' : progress > 0 ? 'in_progress' : 'pending');
  if (status === 'done') progress = 100;
  await db.run('UPDATE milestones SET progress = ?, status = ?, due_date = COALESCE(?, due_date) WHERE id = ?', [progress, status, req.body?.due_date || null, m.id]);
  if (status !== m.status) {
    await db.run('INSERT INTO project_updates (project_id, user_id, message) VALUES (?, ?, ?)',
      [p.id, req.user.id, `Milestone "${m.title}" marked ${status.replace('_', ' ')} (${progress}%).`]);
    if (p.status === 'awarded') await db.run("UPDATE projects SET status = 'in_progress' WHERE id = ?", [p.id]);
  }
  res.json(await db.get('SELECT * FROM milestones WHERE id = ?', [m.id]));
}));

router.post('/projects/:id/expenses', requireAuth(), ah(async (req, res) => {
  const p = await getProject(req.params.id); await assertMember(req, p);
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!b.description || !(amount > 0)) throw httpError(400, 'Enter a description and a positive amount.');
  await db.run('INSERT INTO expenses (project_id, milestone_id, description, category, amount, spent_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [p.id, b.milestone_id || null, b.description, b.category || 'material', amount, b.spent_on || today(), req.user.id]);
  res.status(201).json({ ok: true });
}));

router.delete('/expenses/:id', requireAuth(), ah(async (req, res) => {
  const e = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
  if (!e) throw httpError(404, 'Expense not found.');
  const p = await getProject(e.project_id); await assertMember(req, p);
  await db.run('DELETE FROM expenses WHERE id = ?', [e.id]);
  res.json({ ok: true });
}));

router.post('/projects/:id/updates', requireAuth(), ah(async (req, res) => {
  const p = await getProject(req.params.id); const who = await assertMember(req, p);
  const msg = String(req.body?.message || '').trim();
  if (!msg) throw httpError(400, 'Write an update first.');
  await db.run('INSERT INTO project_updates (project_id, user_id, message) VALUES (?, ?, ?)', [p.id, req.user.id, msg]);
  await notify(who.isOwner ? who.contractorId : p.customer_id, `New update on "${p.title}"`, `#/workspace/${p.id}`);
  res.status(201).json({ ok: true });
}));

// Completing a project closes the loop: actual cost feeds the AI model; the customer rates the contractor.
router.post('/projects/:id/complete', requireAuth('customer'), ah(async (req, res) => {
  const p = await getProject(req.params.id);
  if (p.customer_id !== req.user.id) throw httpError(403, 'Not your project.');
  if (!['awarded', 'in_progress'].includes(p.status)) throw httpError(400, 'Only active projects can be completed.');
  const b = req.body || {};
  const spent = await db.get('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE project_id = ?', [p.id]);
  const bid = await db.get('SELECT * FROM bids WHERE id = ?', [p.awarded_bid_id]);
  const actual = Number(b.actual_cost) || Number(spent.s) || Number(bid?.amount) || Number(p.estimated_cost);
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 5));
  await db.run("UPDATE projects SET status = 'completed', actual_cost = ? WHERE id = ?", [actual, p.id]);
  await db.run("UPDATE milestones SET status = 'done', progress = 100 WHERE project_id = ?", [p.id]);
  const totalArea = Number(p.area_per_floor) * Number(p.floors);
  await db.run('INSERT INTO historical_projects (region_id, building_type, total_area, floors, quality, cost_per_sqft, year, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [p.region_id, p.building_type, totalArea, p.floors, p.quality, Math.round(actual / totalArea), new Date().getFullYear(), 'buildbid-completed']);
  invalidateModel();
  if (bid) {
    await db.run('INSERT INTO reviews (project_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [p.id, req.user.id, bid.contractor_id, rating, b.comment]);
    const agg = await db.get('SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?', [bid.contractor_id]);
    await db.run('UPDATE profiles SET rating = ?, rating_count = ?, projects_completed = projects_completed + 1 WHERE user_id = ?',
      [Math.round(Number(agg.a) * 100) / 100, Number(agg.n), bid.contractor_id]);
    await notify(bid.contractor_id, `"${p.title}" was marked complete and you received a ${rating}★ rating.`, `#/workspace/${p.id}`);
  }
  res.json({ ok: true, actual_cost: actual });
}));

module.exports = router;
