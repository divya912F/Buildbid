// Builds a milestone plan from the estimate's phase split, scaled to the awarded amount & timeline.
const db = require('./db');
const { PHASES } = require('./estimator');
const { addDays, today } = require('./helpers');

const ORDER = ['foundation', 'structure', 'masonry', 'mep', 'openings', 'finishing'];
const DURATION_SHARE = { foundation: 0.15, structure: 0.35, masonry: 0.15, mep: 0.1, openings: 0.07, finishing: 0.18 };

async function createMilestonePlan(projectId, bid, estimate, startDate = today()) {
  const phases = estimate?.phases?.length ? estimate.phases : PHASES.map((ph) => ({ ...ph, share: 100 / PHASES.length }));
  const totalShare = phases.reduce((s, ph) => s + Number(ph.share), 0);
  let elapsed = 0; let i = 0;
  for (const key of ORDER) {
    const ph = phases.find((x) => x.key === key); if (!ph) continue;
    elapsed += DURATION_SHARE[key] * Number(bid.timeline_days);
    await db.run('INSERT INTO milestones (project_id, title, phase, budget, due_date, status, progress, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [projectId, ph.label, key, Math.round((Number(bid.amount) * Number(ph.share)) / totalShare), addDays(startDate, elapsed), 'pending', i++]);
  }
}

module.exports = { createMilestonePlan };
