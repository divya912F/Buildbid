const db = require('./db');
const { trainModel } = require('./estimator');

// Wrap async route handlers so thrown errors reach Express's error handler.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function parseJSON(s, fallback = null) { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? fallback); } catch { return fallback; } }

async function notify(userId, message, link = null) {
  if (!userId) return;
  await db.run('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [userId, message.slice(0, 255), link]);
}

// The regression model is cached and retrained whenever new historical data arrives.
let cachedModel = null;
async function getModel() {
  if (cachedModel) return cachedModel;
  const history = await db.all(
    `SELECT h.total_area, h.floors, h.quality, h.building_type, h.cost_per_sqft, r.region_index
       FROM historical_projects h JOIN regions r ON r.id = h.region_id`);
  cachedModel = trainModel(history);
  return cachedModel;
}
function invalidateModel() { cachedModel = null; }

async function loadRegionWithRates(regionId) {
  const region = await db.get('SELECT * FROM regions WHERE id = ?', [regionId]);
  if (!region) throw httpError(400, 'Please choose a valid city / region.');
  const rates = await db.all('SELECT * FROM material_rates WHERE region_id = ? ORDER BY id', [regionId]);
  return { region, rates };
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(days)); return d.toISOString().slice(0, 10); };

module.exports = { ah, httpError, parseJSON, notify, getModel, invalidateModel, loadRegionWithRates, today, addDays };
