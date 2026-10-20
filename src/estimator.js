// BuildBid Cost Estimation Engine
// ------------------------------------------------------------------
// Two models are combined:
//  1. Rule-based quantity take-off: standard Indian thumb-rule quantities per sq ft
//     of built-up area x current regional material & labour rates from the database.
//  2. A data-driven model: ridge-regularised linear regression trained on historical
//     project costs (seed sample + every completed BuildBid project) predicting cost/sq ft.
// The final figure blends both (weight grows with the amount of historical data) and is
// returned with a full human-readable breakdown, a low-high range and a confidence level.

const QUALITY = {
  basic: { idx: 0, label: 'Basic', finish: 0.75, labour: 0.9, steelRate: 1.0 },
  standard: { idx: 1, label: 'Standard', finish: 1.0, labour: 1.0, steelRate: 1.0 },
  premium: { idx: 2, label: 'Premium', finish: 1.75, labour: 1.2, steelRate: 1.05 },
};

const PHASES = [
  { key: 'foundation', label: 'Foundation & substructure' },
  { key: 'structure', label: 'RCC frame & superstructure' },
  { key: 'masonry', label: 'Brickwork & plastering' },
  { key: 'finishing', label: 'Flooring, painting & finishing' },
  { key: 'openings', label: 'Doors & windows' },
  { key: 'mep', label: 'Electrical & plumbing (MEP)' },
];

// qty = quantity per sq ft of built-up area for a standard G/G+1 residential building.
// kind: structural items are not affected by finish quality; finish items are.
// split: share of the item's cost that falls in each construction phase.
const ITEMS = [
  { key: 'cement', qty: 0.4, kind: 'structural', split: { foundation: 0.25, structure: 0.45, masonry: 0.3 } },
  { key: 'steel', qty: 4.0, kind: 'structural', split: { foundation: 0.3, structure: 0.7 } },
  { key: 'sand', qty: 1.8, kind: 'structural', split: { foundation: 0.15, structure: 0.35, masonry: 0.5 } },
  { key: 'aggregate', qty: 1.35, kind: 'structural', split: { foundation: 0.35, structure: 0.65 } },
  { key: 'bricks', qty: 8, kind: 'structural', split: { masonry: 1 } },
  { key: 'tiles', qty: 1.3, kind: 'finish', split: { finishing: 1 } },
  { key: 'paint', qty: 0.18, kind: 'finish', split: { finishing: 1 } },
  { key: 'doors_windows', qty: 1, kind: 'finish', split: { openings: 1 } },
  { key: 'electrical', qty: 1, kind: 'finish', split: { mep: 1 } },
  { key: 'plumbing', qty: 1, kind: 'finish', split: { mep: 1 } },
  { key: 'waterproofing', qty: 1, kind: 'structural', split: { foundation: 0.4, finishing: 0.6 } },
];

const LABOUR_SPLIT = { foundation: 0.15, structure: 0.35, masonry: 0.2, finishing: 0.2, openings: 0.03, mep: 0.07 };
const CONTINGENCY = 0.05;
const DESIGN_FEES = 0.04;

const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

function normaliseInputs(raw) {
  const areaPerFloor = Number(raw.area_per_floor ?? raw.areaPerFloor);
  const floors = Math.max(1, Math.min(40, parseInt(raw.floors, 10) || 1));
  const quality = QUALITY[raw.quality] ? raw.quality : 'standard';
  const buildingType = raw.building_type === 'commercial' ? 'commercial' : 'residential';
  const basement = raw.basement === true || raw.basement === 1 || raw.basement === '1' || raw.basement === 'true';
  if (!Number.isFinite(areaPerFloor) || areaPerFloor < 100 || areaPerFloor > 200000) {
    const err = new Error('Area per floor must be between 100 and 2,00,000 sq ft.');
    err.status = 400; throw err;
  }
  return { areaPerFloor, floors, quality, buildingType, basement, totalArea: areaPerFloor * floors };
}

// ---------- Rule-based estimate ----------
function ruleBasedEstimate(inp, region, rates) {
  const q = QUALITY[inp.quality];
  const rateMap = Object.fromEntries(rates.map((r) => [r.material_key, r]));
  // Taller buildings need more steel/concrete per sq ft; commercial frames are heavier.
  const heightFactor = 1 + 0.035 * Math.max(0, inp.floors - 2);
  const typeFactor = inp.buildingType === 'commercial' ? 1.12 : 1;
  // A basement adds roughly 1.3x a floor's worth of structural work plus extra waterproofing.
  const basementArea = inp.basement ? inp.areaPerFloor * 1.3 : 0;

  const phaseTotals = Object.fromEntries(PHASES.map((p) => [p.key, 0]));
  const materials = [];

  for (const item of ITEMS) {
    const r = rateMap[item.key];
    if (!r) continue;
    const structural = item.kind === 'structural';
    const areaForItem = inp.totalArea + (structural ? basementArea : 0);
    let qty = item.qty * areaForItem;
    if (structural && ['cement', 'steel', 'aggregate'].includes(item.key)) qty *= heightFactor * typeFactor;
    if (item.key === 'waterproofing' && inp.basement) qty += inp.areaPerFloor * 1.5; // tanking of basement walls
    let rate = Number(r.rate);
    if (!structural) rate *= q.finish;
    if (item.key === 'steel') rate *= q.steelRate;
    const cost = qty * rate;
    materials.push({
      key: item.key, name: r.name, unit: r.unit,
      quantity: round(qty, r.unit === 'bag' || r.unit === 'nos' ? 0 : 1),
      rate: round(rate, 2), cost: round(cost), source: r.source,
    });
    for (const [ph, share] of Object.entries(item.split)) phaseTotals[ph] += cost * share;
  }

  const labourArea = inp.totalArea + basementArea;
  const labourCost = labourArea * Number(region.labour_rate_sqft) * q.labour * (inp.buildingType === 'commercial' ? 1.08 : 1);
  for (const [ph, share] of Object.entries(LABOUR_SPLIT)) phaseTotals[ph] += labourCost * share;

  const materialCost = materials.reduce((s, m) => s + m.cost, 0);
  const subtotal = materialCost + labourCost;
  return { materials, labourCost, materialCost, subtotal, phaseTotals };
}

// ---------- Data-driven model (ridge regression, closed form) ----------
function features(totalArea, floors, qualityIdx, regionIndex, isCommercial) {
  return [1, Math.log(totalArea), floors, qualityIdx, regionIndex, isCommercial ? 1 : 0];
}

function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length; const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue; const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function trainModel(history) {
  if (!history || history.length < 12) return null;
  const raw = history.map((h) => features(Number(h.total_area), Number(h.floors), QUALITY[h.quality]?.idx ?? 1, Number(h.region_index), h.building_type === 'commercial'));
  // Standardise features so the ridge penalty treats them equally.
  const k0 = raw[0].length; const mean = Array(k0).fill(0); const std = Array(k0).fill(1);
  for (let a = 1; a < k0; a++) {
    mean[a] = raw.reduce((s, r) => s + r[a], 0) / raw.length;
    std[a] = Math.sqrt(raw.reduce((s, r) => s + (r[a] - mean[a]) ** 2, 0) / raw.length) || 1;
  }
  const X = raw.map((r) => r.map((v, a) => (a === 0 ? 1 : (v - mean[a]) / std[a])));
  const y = history.map((h) => Number(h.cost_per_sqft));
  const k = X[0].length; const lambda = 1.0;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0)); const Xty = Array(k).fill(0);
  X.forEach((row, i) => { for (let a = 0; a < k; a++) { Xty[a] += row[a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b]; } });
  for (let a = 1; a < k; a++) XtX[a][a] += lambda; // don't regularise the intercept
  const w = solve(XtX, Xty);
  if (!w) return null;
  const preds = X.map((row) => row.reduce((s, v, i) => s + v * w[i], 0));
  const residuals = preds.map((p, i) => y[i] - p);
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const meanY = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const r2 = 1 - residuals.reduce((s, r) => s + r * r, 0) / ssTot;
  // Convert back to weights on the original feature scale (easier to read & apply).
  const weights = w.map((v, a) => (a === 0 ? v - w.slice(1).reduce((s, wi, j) => s + (wi * mean[j + 1]) / std[j + 1], 0) : v / std[a]));
  return { weights, rmse, r2, n: history.length };
}

function predictPerSqft(model, inp, regionIndex) {
  const x = features(inp.totalArea, inp.floors, QUALITY[inp.quality].idx, regionIndex, inp.buildingType === 'commercial');
  return x.reduce((s, v, i) => s + v * model.weights[i], 0);
}

// ---------- Public API ----------
function estimate(rawInputs, region, rates, model) {
  const inp = normaliseInputs(rawInputs);
  const rule = ruleBasedEstimate(inp, region, rates);
  const ruleTotal = rule.subtotal * (1 + CONTINGENCY + DESIGN_FEES);
  const rulePerSqft = ruleTotal / inp.totalArea;

  let ml = null; let blendWeight = 0; let perSqft = rulePerSqft;
  if (model) {
    const mlPerSqft = predictPerSqft(model, inp, Number(region.region_index));
    if (Number.isFinite(mlPerSqft) && mlPerSqft > 0) {
      blendWeight = Math.min(0.4, model.n / 250);
      perSqft = (1 - blendWeight) * rulePerSqft + blendWeight * mlPerSqft;
      ml = { per_sqft: round(mlPerSqft), rmse: round(model.rmse), r2: round(model.r2, 3), samples: model.n, weight: round(blendWeight, 2) };
    }
  }
  const scale = perSqft / rulePerSqft; // apply blend proportionally to every line so the breakdown still adds up
  const total = ruleTotal * scale;

  // Uncertainty: base +/-8% for rate volatility, widened by model disagreement & error.
  const disagreement = ml ? Math.abs(ml.per_sqft - rulePerSqft) / rulePerSqft : 0.1;
  const modelErr = ml ? ml.rmse / perSqft : 0.1;
  const spread = Math.min(0.25, 0.08 + disagreement * 0.5 + modelErr * 0.5);
  const confidence = spread < 0.11 ? 'High' : spread < 0.16 ? 'Medium' : 'Low';

  const materials = rule.materials.map((m) => ({ ...m, rate: round(m.rate * scale, 2), cost: round(m.cost * scale) }));
  const labour = round(rule.labourCost * scale);
  const materialTotal = materials.reduce((s, m) => s + m.cost, 0);
  const subtotal = materialTotal + labour;
  const phases = PHASES.map((p) => ({ key: p.key, label: p.label, cost: round(rule.phaseTotals[p.key] * scale) }));
  phases.forEach((p) => { p.share = round((p.cost / subtotal) * 100, 1); });

  const months = Math.round(3 + 2.2 * inp.floors + inp.totalArea / 2500 + (inp.basement ? 2 : 0) + (inp.quality === 'premium' ? 1 : 0));

  return {
    inputs: { ...inp, region: `${region.city}, ${region.state}`, region_id: region.id },
    total: round(total),
    per_sqft: round(perSqft),
    range: { low: round(total * (1 - spread)), high: round(total * (1 + spread)) },
    confidence,
    materials,
    labour,
    material_total: round(materialTotal),
    subtotal: round(subtotal),
    contingency: round(subtotal * CONTINGENCY),
    design_fees: round(subtotal * DESIGN_FEES),
    phases,
    timeline_months: months,
    models: { rule_based_per_sqft: round(rulePerSqft), ml },
    notes: [
      'Quantities use standard thumb rules per sq ft of built-up area; a detailed BOQ from your engineer will refine them.',
      `Rates are the latest stored for ${region.city}. Land, approvals, GST on services and interiors/furniture are excluded.`,
      `Includes ${CONTINGENCY * 100}% contingency and ${DESIGN_FEES * 100}% for design & supervision.`,
    ],
  };
}

module.exports = { estimate, trainModel, ruleBasedEstimate, normaliseInputs, QUALITY, PHASES, ITEMS };
