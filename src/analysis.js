// Quotation comparison, reasonableness checks, risk flags and recommendation.
const WEIGHTS = { price: 0.4, rating: 0.25, timeline: 0.2, trust: 0.15 };
const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

/**
 * @param {object} project  project row (estimated_cost, ...)
 * @param {object|null} estimate  parsed estimate result (material_total, labour, subtotal, timeline_months)
 * @param {Array} bids  rows joined with contractor profile (rating, rating_count, verified, experience_years, projects_completed)
 */
function compareQuotations(project, estimate, bids) {
  const active = bids.filter((b) => b.status !== 'withdrawn');
  if (!active.length) return { bids: [], recommendation: null, summary: null };

  const est = Number(project.estimated_cost) || (estimate && estimate.total) || null;
  const estMonths = estimate ? estimate.timeline_months : null;
  const estMaterialShare = estimate ? estimate.material_total / estimate.subtotal : 0.65;

  // Price reference: the lowest *reasonable* quote (suspiciously low quotes shouldn't set the bar).
  const reasonable = active.filter((b) => !est || Number(b.amount) >= est * 0.75);
  const minPrice = Math.min(...(reasonable.length ? reasonable : active).map((b) => Number(b.amount)));
  const minDays = Math.min(...active.map((b) => Number(b.timeline_days)));
  const amounts = active.map((b) => Number(b.amount));
  const median = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)];

  const analysed = active.map((b) => {
    const amount = Number(b.amount);
    const flags = [];
    let risk = 0;
    const deviation = est ? (amount - est) / est : null;

    if (deviation !== null) {
      if (deviation < -0.25) { flags.push({ level: 'high', text: `${Math.abs(round(deviation * 100))}% below the AI estimate — check for missing scope or low-grade materials.` }); risk += 3; }
      else if (deviation < -0.12) { flags.push({ level: 'medium', text: `${Math.abs(round(deviation * 100))}% below estimate — confirm specifications and material brands.` }); risk += 1; }
      else if (deviation > 0.25) { flags.push({ level: 'high', text: `${round(deviation * 100)}% above the AI estimate — likely overpriced; negotiate line items.` }); risk += 2; }
      else if (deviation > 0.12) { flags.push({ level: 'medium', text: `${round(deviation * 100)}% above estimate — ask for an itemised justification.` }); risk += 1; }
      else flags.push({ level: 'ok', text: 'Within a reasonable range of the AI estimate.' });
    }

    const parts = Number(b.material_cost) + Number(b.labour_cost) + Number(b.other_cost);
    if (parts > 0) {
      if (Math.abs(parts - amount) / amount > 0.02) { flags.push({ level: 'medium', text: 'Line items don\'t add up to the quoted total.' }); risk += 1; }
      const share = Number(b.material_cost) / amount;
      if (share < estMaterialShare - 0.15) { flags.push({ level: 'medium', text: `Material share is only ${round(share * 100)}% (typical ~${round(estMaterialShare * 100)}%) — materials may be under-specified.` }); risk += 1; }
    } else {
      flags.push({ level: 'medium', text: 'No cost breakdown given — ask for material/labour split.' }); risk += 1;
    }

    if (estMonths) {
      const months = Number(b.timeline_days) / 30;
      if (months < estMonths * 0.6) { flags.push({ level: 'medium', text: `Timeline of ${round(months, 1)} months is much shorter than the typical ${estMonths} — verify manpower plan.` }); risk += 1; }
      else if (months > estMonths * 1.5) { flags.push({ level: 'medium', text: `Timeline of ${round(months, 1)} months is long compared with the typical ${estMonths}.` }); risk += 1; }
    }
    if (!Number(b.verified)) { flags.push({ level: 'medium', text: 'Contractor not yet verified on BuildBid.' }); risk += 1; }
    if (Number(b.warranty_months) >= 12) flags.push({ level: 'ok', text: `${b.warranty_months}-month workmanship warranty offered.` });

    const priceScore = Math.min(100, (minPrice / amount) * 100) * (deviation !== null && deviation < -0.25 ? 0.6 : 1);
    const ratingScore = Number(b.rating_count) > 0 ? (Number(b.rating) / 5) * 100 : 55;
    const timelineScore = (minDays / Number(b.timeline_days)) * 100;
    const trustScore = Math.min(100, (Number(b.verified) ? 60 : 20) + Math.min(25, Number(b.experience_years || 0) * 2) + Math.min(15, Number(b.projects_completed || 0)));
    const score = priceScore * WEIGHTS.price + ratingScore * WEIGHTS.rating + timelineScore * WEIGHTS.timeline + trustScore * WEIGHTS.trust;

    return {
      ...b,
      deviation_pct: deviation === null ? null : round(deviation * 100, 1),
      vs_median_pct: round(((amount - median) / median) * 100, 1),
      scores: { price: round(priceScore), rating: round(ratingScore), timeline: round(timelineScore), trust: round(trustScore), total: round(score, 1) },
      risk_level: risk >= 3 ? 'High' : risk >= 2 ? 'Medium' : 'Low',
      flags,
    };
  }).sort((a, b) => b.scores.total - a.scores.total);

  const pick = analysed.find((b) => b.risk_level !== 'High') || analysed[0];
  const reasons = [];
  if (pick) {
    if (pick.deviation_pct !== null) reasons.push(`price is ${pick.deviation_pct >= 0 ? pick.deviation_pct + '% above' : Math.abs(pick.deviation_pct) + '% below'} the AI estimate`);
    if (Number(pick.rating_count) > 0) reasons.push(`rated ${Number(pick.rating).toFixed(1)}/5 by ${pick.rating_count} clients`);
    if (Number(pick.verified)) reasons.push('verified contractor');
    reasons.push(`${pick.timeline_days}-day timeline`);
  }

  return {
    bids: analysed,
    recommendation: pick ? { bid_id: pick.id, contractor: pick.contractor_name, score: pick.scores.total, reasons } : null,
    summary: {
      count: analysed.length,
      lowest: Math.min(...amounts), highest: Math.max(...amounts), median,
      estimate: est, weights: WEIGHTS,
    },
  };
}

module.exports = { compareQuotations, WEIGHTS };
