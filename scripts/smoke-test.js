// End-to-end smoke test against a running BuildBid server (fresh demo data).
//   npm start   (in one terminal)
//   npm test    (in another)          BASE_URL defaults to http://localhost:3000
const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
let passed = 0;

async function call(method, path, body, token) {
  const res = await fetch(BASE + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
function check(cond, label, extra) {
  if (!cond) { console.error(`✗ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); process.exit(1); }
  passed++; console.log(`✓ ${label}`);
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: 'demo123' })).data.token;

(async () => {
  check((await call('GET', '/health')).data.ok, 'server healthy');
  const regions = (await call('GET', '/regions')).data;
  check(regions.length >= 10, `${regions.length} regions loaded`);
  const noida = regions.find((r) => r.city === 'Noida');

  const est = (await call('POST', '/estimates', { region_id: noida.id, area_per_floor: 1000, floors: 2, quality: 'standard' })).data;
  check(est.total > 2500000 && est.total < 6000000, `estimate ₹${est.total} (₹${est.per_sqft}/sq ft, ${est.confidence} confidence)`);
  check(Math.abs(est.phases.reduce((s, p) => s + p.cost, 0) - est.subtotal) < 50, 'phase breakdown adds up to subtotal');
  check((await call('POST', '/estimates', { region_id: noida.id, area_per_floor: 5, floors: 1 })).status === 400, 'invalid area rejected');

  check((await call('POST', '/auth/login', { email: 'priya@demo.in', password: 'nope' })).status === 401, 'wrong password rejected');
  const priya = await login('priya@demo.in');
  const ravi = await login('ravi@demo.in');
  const imran = await login('imran@demo.in');

  const mine = (await call('GET', '/projects?mine=1', null, priya)).data;
  const home = mine.find((p) => p.title.includes('Sector 62'));
  check(home && home.bid_count === 4, 'customer sees own project with 4 quotations');

  const cmp = (await call('GET', `/projects/${home.id}/compare`, null, priya)).data;
  const low = cmp.bids.find((b) => b.contractor_name === 'Deepak Saini');
  check(low.risk_level === 'High', 'suspiciously low quotation flagged as high risk');
  check(cmp.recommendation && cmp.recommendation.contractor !== 'Deepak Saini', `recommended: ${cmp.recommendation.contractor}`);
  check((await call('GET', `/projects/${home.id}/compare`, null, ravi)).status === 403, 'contractor cannot see competing quotations');

  const created = await call('POST', '/projects', { title: 'Test house', region_id: noida.id, area_per_floor: 900, floors: 1, quality: 'basic' }, priya);
  check(created.status === 201, 'customer posts a new project');
  const pid = created.data.id;
  check((await call('POST', '/projects', { title: 'Nope', region_id: noida.id, area_per_floor: 900, floors: 1 }, ravi)).status === 403, 'contractor cannot post projects');

  const open = (await call('GET', '/projects', null, ravi)).data;
  check(open.some((p) => p.id === pid), 'contractor discovers the open project');
  const bid = await call('POST', `/projects/${pid}/bids`, { material_cost: 1000000, labour_cost: 500000, other_cost: 50000, timeline_days: 200, warranty_months: 12 }, ravi);
  check(bid.status === 201 && bid.data.amount === 1550000, 'contractor submits itemised quotation');
  const bid2 = await call('POST', `/projects/${pid}/bids`, { amount: 1700000, timeline_days: 220 }, imran);
  check(bid2.status === 201, 'second contractor quotes');

  check((await call('POST', `/projects/${pid}/award`, { bid_id: bid.data.id }, priya)).data.ok, 'customer awards the project');
  const ws = (await call('GET', `/projects/${pid}/workspace`, null, ravi)).data;
  check(ws.milestones.length === 6, 'milestone plan auto-generated');
  check((await call('GET', `/projects/${pid}/workspace`, null, imran)).status === 403, 'losing bidder has no workspace access');

  await call('PUT', `/milestones/${ws.milestones[0].id}`, { progress: 100 }, ravi);
  await call('POST', `/projects/${pid}/expenses`, { description: 'Cement 200 bags', amount: 80000, milestone_id: ws.milestones[0].id }, ravi);
  await call('POST', `/projects/${pid}/updates`, { message: 'Foundation complete' }, ravi);
  const ws2 = (await call('GET', `/projects/${pid}/workspace`, null, priya)).data;
  check(ws2.summary.progress > 0 && ws2.summary.spent === 80000 && ws2.updates.length >= 2, `progress ${ws2.summary.progress}%, spent ₹${ws2.summary.spent}`);

  const before = (await call('GET', '/model')).data.samples;
  check((await call('POST', `/projects/${pid}/complete`, { actual_cost: 1600000, rating: 5, comment: 'Great work' }, priya)).data.ok, 'project completed & contractor rated');
  check((await call('GET', '/model')).data.samples === before + 1, 'completed project fed back into the AI model');

  check((await call('GET', '/professionals?category=mason')).data.length >= 2, 'professional discovery by category');
  const anita = (await call('GET', '/professionals?q=desai')).data[0];
  check((await call('POST', '/hire-requests', { to_user: anita.id, message: 'Need structural drawings' }, priya)).status === 201, 'hire request sent');
  check((await call('GET', `/materials?region_id=${noida.id}`)).data.length > 0, 'supplier materials listed with reference rates');
  const tenders = (await call('GET', '/tenders?state=Uttar Pradesh')).data;
  check(tenders.length > 0, `${tenders.length} UP tenders`);
  check((await call('POST', `/tenders/${tenders[0].id}/bookmark`, null, ravi)).data.saved === true, 'tender bookmarked');
  check((await call('GET', '/dashboard', null, ravi)).data.active.length >= 1, 'contractor dashboard shows awarded work');
  check((await call('GET', '/notifications', null, ravi)).data.length > 0, 'notifications delivered');

  console.log(`\nAll ${passed} checks passed.`);
})().catch((e) => { console.error('Smoke test crashed:', e.message); process.exit(1); });
