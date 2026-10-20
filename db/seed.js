// Demo / starter data for BuildBid.
// All rates are INDICATIVE 2026 figures for demonstration — replace them with the latest
// CPWD DSR / State PWD SOR values and live supplier prices before real-world use.
// People, companies, projects and tenders below are fictional sample records.
const db = require('../src/db');
const { hashPassword } = require('../src/auth');
const { ruleBasedEstimate, estimate, trainModel, normaliseInputs } = require('../src/estimator');
const { createMilestonePlan } = require('../src/milestones');
const { addDays, today } = require('../src/helpers');

// Deterministic pseudo-random generator so every install gets identical demo data.
let seed = 20261019;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rand(); return (u - 3) / Math.sqrt(0.5); };

const REGIONS = [
  ['Delhi', 'Delhi', 480, 1.10], ['Noida', 'Uttar Pradesh', 450, 1.05], ['Lucknow', 'Uttar Pradesh', 400, 0.95],
  ['Meerut', 'Uttar Pradesh', 390, 0.93], ['Shamli', 'Uttar Pradesh', 365, 0.88], ['Mumbai', 'Maharashtra', 600, 1.30],
  ['Pune', 'Maharashtra', 500, 1.12], ['Bengaluru', 'Karnataka', 520, 1.18], ['Hyderabad', 'Telangana', 470, 1.08],
  ['Chennai', 'Tamil Nadu', 500, 1.12], ['Kolkata', 'West Bengal', 430, 1.00], ['Jaipur', 'Rajasthan', 410, 0.96],
  ['Ahmedabad', 'Gujarat', 440, 1.02], ['Patna', 'Bihar', 370, 0.90],
];

// key, name, unit, base rate (Rs), how strongly the rate follows the regional cost index
const MATERIALS = [
  ['cement', 'Cement (OPC 53 grade)', 'bag', 400, 0.3],
  ['steel', 'TMT steel bars (Fe 500D)', 'kg', 66, 0.15],
  ['sand', 'Sand (river / M-sand)', 'cft', 60, 0.8],
  ['aggregate', 'Coarse aggregate (20 mm)', 'cft', 52, 0.7],
  ['bricks', 'Bricks (first-class clay)', 'nos', 9, 0.6],
  ['tiles', 'Vitrified floor tiles', 'sqft', 60, 0.4],
  ['paint', 'Paint incl. putty & primer', 'litre', 300, 0.2],
  ['doors_windows', 'Doors & windows (frames, shutters, glazing)', 'sqft BUA', 160, 0.6],
  ['electrical', 'Electrical wiring, switches & fittings', 'sqft BUA', 120, 0.5],
  ['plumbing', 'Plumbing & sanitary fittings', 'sqft BUA', 130, 0.5],
  ['waterproofing', 'Waterproofing & misc. works', 'sqft BUA', 60, 0.5],
];
const RATE_SOURCE = 'Indicative 2026 rate (seed) — verify with CPWD DSR / local market';

async function seed_() {
  // ---- Regions & material rates ----
  const regions = [];
  for (const [city, state, labour, idx] of REGIONS) {
    const r = await db.run('INSERT INTO regions (city, state, labour_rate_sqft, region_index) VALUES (?, ?, ?, ?)', [city, state, labour, idx]);
    const region = { id: r.insertId, city, state, labour_rate_sqft: labour, region_index: idx };
    region.rates = [];
    for (const [key, name, unit, base, elasticity] of MATERIALS) {
      const jitter = 1 + (rand() - 0.5) * 0.06;
      const rate = Math.round(base * (1 + (idx - 1) * elasticity) * jitter * (base < 20 ? 100 : 1)) / (base < 20 ? 100 : 1);
      await db.run('INSERT INTO material_rates (region_id, material_key, name, unit, rate, source) VALUES (?, ?, ?, ?, ?, ?)', [region.id, key, name, unit, rate, RATE_SOURCE]);
      region.rates.push({ material_key: key, name, unit, rate, source: RATE_SOURCE });
    }
    regions.push(region);
  }
  const R = Object.fromEntries(regions.map((r) => [r.city, r]));

  // ---- Historical projects (synthetic training sample, inflation-adjusted to 2026) ----
  for (let i = 0; i < 120; i++) {
    const region = pick(regions);
    const commercial = rand() < 0.2;
    const floors = commercial ? 2 + Math.floor(rand() * 5) : 1 + Math.floor(rand() * 4);
    const quality = pick(['basic', 'standard', 'standard', 'premium']);
    const inp = normaliseInputs({ area_per_floor: Math.round(600 + rand() * 2400), floors, quality, building_type: commercial ? 'commercial' : 'residential' });
    const rule = ruleBasedEstimate(inp, region, region.rates);
    const perSqft = (rule.subtotal * 1.09) / inp.totalArea * (1 + gauss() * 0.07) * (1 + 0.03 * (rand() - 0.3));
    await db.run('INSERT INTO historical_projects (region_id, building_type, total_area, floors, quality, cost_per_sqft, year, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [region.id, inp.buildingType, inp.totalArea, floors, quality, Math.round(perSqft), 2024 + Math.floor(rand() * 3), 'seed-sample']);
  }

  // ---- Users ----
  const pw = hashPassword('demo123');
  const addUser = async (name, email, role, city, phone, profile) => {
    const r = await db.run('INSERT INTO users (name, email, password_hash, role, phone, city) VALUES (?, ?, ?, ?, ?, ?)', [name, email, pw, role, phone, city]);
    if (profile) {
      await db.run(`INSERT INTO profiles (user_id, category, company, skills, experience_years, bio, day_rate, licence_no, rating, rating_count, projects_completed, verified)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.insertId, profile.category, profile.company || null, profile.skills || null, profile.exp || 0, profile.bio || null, profile.day_rate || null,
        profile.licence || null, profile.rating || 0, profile.count || 0, profile.done || 0, profile.verified ? 1 : 0]);
    }
    return r.insertId;
  };

  await addUser('BuildBid Admin', 'admin@buildbid.in', 'admin', 'Delhi', '9000000000');
  const priya = await addUser('Priya Sharma', 'priya@demo.in', 'customer', 'Noida', '9810000001');
  const rahul = await addUser('Rahul Verma', 'rahul@demo.in', 'customer', 'Lucknow', '9810000002');
  const amit = await addUser('Amit Tyagi', 'amit@demo.in', 'customer', 'Meerut', '9810000003');

  const C = {};
  const contractors = [
    ['Ravi Sharma', 'ravi@demo.in', 'Noida', 'Sharma Constructions', 'Residential houses, RCC framed structures, turnkey G+3', 15, 4.6, 23, 41, true, 'Turnkey residential contractor serving Noida & Greater Noida since 2011.'],
    ['Sunil Gupta', 'sunil@demo.in', 'Delhi', 'Shree Ganesh Builders', 'Builder floors, renovation, commercial fit-outs', 12, 4.3, 17, 30, true, 'Builder-floor and renovation specialists across Delhi NCR.'],
    ['Imran Khan', 'imran@demo.in', 'Lucknow', 'Awadh Infra Projects', 'Villas, duplexes, premium finishing', 10, 4.7, 14, 22, true, 'Premium independent homes and villas in Lucknow.'],
    ['Vikas Chaudhary', 'vikas@demo.in', 'Meerut', 'Doaba BuildTech', 'Residential, rental floors, schools', 9, 4.1, 11, 19, true, 'West UP contractor for residential and institutional buildings.'],
    ['Deepak Saini', 'deepak@demo.in', 'Noida', 'QuickBuild Solutions', 'Low-cost construction, labour contracts', 2, 0, 0, 1, false, 'New contractor offering budget construction.'],
    ['Arjun Rao', 'arjun@demo.in', 'Bengaluru', 'Kaveri Constructions', 'Independent houses, apartments, green buildings', 14, 4.5, 26, 38, true, 'IGBC-aware residential builder in Bengaluru.'],
    ['Srinivas Reddy', 'srinivas@demo.in', 'Hyderabad', 'Deccan Homes', 'G+2 houses, commercial complexes', 11, 4.4, 15, 25, true, 'Residential and small commercial projects across Hyderabad.'],
    ['Nitin Patil', 'nitin@demo.in', 'Mumbai', 'Konkan Civil Works', 'Redevelopment, RCC, waterproofing', 18, 4.2, 20, 44, true, 'Society redevelopment and structural repair specialists.'],
    ['Mahesh Agarwal', 'mahesh@demo.in', 'Jaipur', 'Pink City Builders', 'Houses, stone cladding, heritage-style facades', 13, 4.5, 12, 27, true, 'Residential builder known for stone work and facades.'],
    ['Rakesh Kumar', 'rakesh@demo.in', 'Patna', 'Ganga Nirman', 'Residential, government civil works', 8, 4.0, 9, 15, true, 'Civil contractor for residential & public works in Bihar.'],
    ['Sandeep Malik', 'sandeep@demo.in', 'Shamli', 'Shamli Nirman Co.', 'Houses, shops, boundary walls, farm buildings', 7, 4.3, 8, 16, true, 'Local contractor for Shamli, Kairana and nearby areas.'],
  ];
  for (const [name, email, city, company, skills, exp, rating, count, done, verified, bio] of contractors) {
    C[email] = await addUser(name, email, 'contractor', city, `98${Math.floor(10000000 + rand() * 89999999)}`,
      { category: 'contractor', company, skills, exp, rating, count, done, verified, bio, licence: verified ? `CL-${Math.floor(10000 + rand() * 89999)}` : null });
  }

  const pros = [
    ['Anita Desai', 'anita@demo.in', 'Noida', 'structural_engineer', 'Desai Structural Consultants', 'RCC design, structural audit, soil-bearing checks', 12, 2500, 4.8, 19],
    ['Karan Mehta', 'karan@demo.in', 'Delhi', 'architect', 'Studio KM Architects', 'Residential planning, 3D elevations, Vastu-aware layouts', 9, 3000, 4.6, 15],
    ['Pooja Singh', 'pooja@demo.in', 'Lucknow', 'civil_engineer', null, 'Site supervision, BOQ preparation, quality checks', 6, 1800, 4.5, 10],
    ['Harish Bhatt', 'harish@demo.in', 'Meerut', 'civil_engineer', 'Bhatt Engineering', 'Estimation, approvals, site supervision', 11, 1600, 4.4, 9],
    ['Ramesh Yadav', 'ramesh@demo.in', 'Noida', 'mason', null, 'Brickwork, plastering, tiling', 16, 1100, 4.5, 31],
    ['Mohd. Salim', 'salim@demo.in', 'Lucknow', 'mason', null, 'Brickwork, stone masonry, plaster', 20, 1000, 4.7, 28],
    ['Suresh Pal', 'suresh@demo.in', 'Shamli', 'mason', null, 'Brickwork, plaster, flooring', 12, 900, 4.3, 12],
    ['Gurpreet Singh', 'gurpreet@demo.in', 'Delhi', 'plumber', null, 'CPVC/UPVC lines, sanitary fittings, water tanks', 10, 1000, 4.4, 22],
    ['Ajay Kumar', 'ajay@demo.in', 'Noida', 'electrician', null, 'House wiring, DB panels, earthing, solar rooftop', 8, 1000, 4.6, 18],
    ['Naveen Joshi', 'naveen@demo.in', 'Meerut', 'electrician', null, 'Wiring, inverter & solar connections', 6, 850, 4.2, 7],
    ['Babu Lal', 'babulal@demo.in', 'Jaipur', 'carpenter', null, 'Doors, windows, modular kitchens, wardrobes', 18, 1100, 4.5, 16],
    ['Shankar Das', 'shankar@demo.in', 'Kolkata', 'painter', null, 'Interior & exterior painting, texture, waterproof coatings', 11, 850, 4.3, 13],
    ['Lakshmi Iyer', 'lakshmi@demo.in', 'Chennai', 'architect', 'Iyer Design Studio', 'Climate-responsive homes, interiors', 13, 3200, 4.7, 21],
    ['Farhan Ali', 'farhan@demo.in', 'Hyderabad', 'structural_engineer', null, 'Structural design, retrofitting', 9, 2400, 4.4, 8],
    ['Manoj Tiwari', 'manoj@demo.in', 'Patna', 'plumber', null, 'Plumbing, borewell connections, sanitary', 9, 800, 4.1, 6],
    ['Rohit Bansal', 'rohit@demo.in', 'Pune', 'civil_engineer', 'Bansal Projects', 'Project management, quantity surveying', 10, 2200, 4.5, 11],
  ];
  for (const [name, email, city, category, company, skills, exp, day, rating, count] of pros) {
    await addUser(name, email, 'professional', city, `97${Math.floor(10000000 + rand() * 89999999)}`,
      { category, company, skills, exp, day_rate: day, rating, count, done: count + Math.floor(rand() * 10), verified: rand() > 0.2,
        licence: ['architect', 'structural_engineer', 'civil_engineer'].includes(category) ? `REG-${Math.floor(10000 + rand() * 89999)}` : null,
        bio: `${exp} years of experience. ${skills}.` });
  }

  // ---- Suppliers & products ----
  const suppliers = [
    ['Om Prakash Jain', 'om@demo.in', 'Noida', 'Om Building Materials', ['cement', 'sand', 'aggregate', 'bricks']],
    ['Neha Agarwal', 'neha@demo.in', 'Lucknow', 'Lucknow Steel & Cement Traders', ['cement', 'steel']],
    ['Vijay Arora', 'vijay@demo.in', 'Delhi', 'Delhi Tiles & Sanitary Hub', ['tiles', 'plumbing', 'paint']],
    ['Mukesh Goyal', 'mukesh@demo.in', 'Meerut', 'Goyal Sariya Bhandar', ['steel', 'cement', 'bricks']],
    ['Anil Mittal', 'anil@demo.in', 'Shamli', 'Mittal Traders', ['cement', 'steel', 'bricks', 'sand']],
  ];
  const brands = { cement: ['UltraTech', 'ACC', 'Shree', 'Ambuja'], steel: ['TATA Tiscon', 'JSW Neosteel', 'SAIL', 'Kamdhenu'], tiles: ['Kajaria', 'Somany', 'Johnson'], paint: ['Asian Paints', 'Berger', 'Nerolac'], plumbing: ['Astral', 'Supreme', 'Jaquar'] };
  for (const [name, email, city, company, keys] of suppliers) {
    const sid = await addUser(name, email, 'supplier', city, `99${Math.floor(10000000 + rand() * 89999999)}`,
      { category: 'supplier', company, skills: keys.join(', '), exp: 5 + Math.floor(rand() * 15), rating: 4 + Math.round(rand() * 8) / 10, count: 5 + Math.floor(rand() * 30), verified: true, bio: `Supplier of ${keys.join(', ')} in ${city}.` });
    const region = R[city];
    for (const key of keys) {
      const ref = region.rates.find((r) => r.material_key === key);
      const bList = brands[key] || [null];
      for (const brand of bList.slice(0, key === 'cement' || key === 'steel' ? 2 : 1)) {
        const price = Math.round(ref.rate * (0.94 + rand() * 0.12) * (ref.rate < 20 ? 100 : 1)) / (ref.rate < 20 ? 100 : 1);
        const unit = key === 'plumbing' ? 'set' : ref.unit;
        const label = key === 'plumbing' ? 'CPVC pipes & fittings (per bathroom set)' : ref.name;
        await db.run('INSERT INTO supplier_products (supplier_id, region_id, material_key, name, brand, unit, price, min_order, in_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
          [sid, region.id, key, label, brand, unit, key === 'plumbing' ? 18500 : price, key === 'bricks' ? '5,000 nos' : key === 'steel' ? '500 kg' : key === 'cement' ? '50 bags' : null]);
      }
    }
  }

  // ---- Projects, quotations & a live project workspace ----
  const histRows = await db.all(`SELECT h.*, r.region_index FROM historical_projects h JOIN regions r ON r.id = h.region_id`);
  const model = trainModel(histRows);
  const makeProject = async (customer, city, data, status = 'open') => {
    const region = R[city];
    const est = estimate(data, region, region.rates, model);
    const e = await db.run('INSERT INTO estimates (user_id, region_id, inputs, result, total) VALUES (?, ?, ?, ?, ?)', [customer, region.id, JSON.stringify(est.inputs), JSON.stringify(est), est.total]);
    const p = await db.run(`INSERT INTO projects (customer_id, title, description, building_type, region_id, location_text, plot_area, area_per_floor, floors, quality, basement, budget, estimate_id, estimated_cost, status, bid_deadline)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customer, data.title, data.description, est.inputs.buildingType, region.id, data.location_text, data.plot_area, est.inputs.areaPerFloor, est.inputs.floors,
      est.inputs.quality, est.inputs.basement ? 1 : 0, data.budget, e.insertId, est.total, status, addDays(today(), data.deadline || 14)]);
    return { id: p.insertId, est };
  };
  const addBid = async (projectId, est, contractor, factor, days, warranty, notes, matShare = 0.62, status = 'submitted') => {
    const amount = Math.round((est.total * factor) / 1000) * 1000;
    const material = Math.round(amount * matShare / 1000) * 1000;
    const labour = Math.round(amount * (0.93 - matShare) / 1000) * 1000;
    const r = await db.run(`INSERT INTO bids (project_id, contractor_id, amount, material_cost, labour_cost, other_cost, timeline_days, warranty_months, notes, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [projectId, contractor, amount, material, labour, amount - material - labour, days, warranty, notes, status]);
    return { id: r.insertId, amount, timeline_days: days };
  };

  const p1 = await makeProject(priya, 'Noida', {
    title: 'G+1 family home in Sector 62', description: 'Two-storey independent house on a 150 sq yd plot: 3BHK on ground, 2BHK on first floor, open terrace. Need complete civil + finishing work. Architect drawings ready.',
    location_text: 'Sector 62, Noida', plot_area: 1350, area_per_floor: 1200, floors: 2, quality: 'standard', budget: 4800000, deadline: 12,
  });
  await addBid(p1.id, p1.est, C['ravi@demo.in'], 1.03, 300, 12, 'Turnkey with UltraTech cement, TATA Tiscon steel, Kajaria tiles. Weekly progress photos.', 0.6);
  await addBid(p1.id, p1.est, C['sunil@demo.in'], 1.09, 270, 12, 'Includes elevation cladding and modular electrical points. Can start in 2 weeks.', 0.61);
  await addBid(p1.id, p1.est, C['deepak@demo.in'], 0.66, 180, 0, 'Lowest price guaranteed. Material as per availability.', 0.42);
  await addBid(p1.id, p1.est, C['vikas@demo.in'], 1.22, 330, 24, 'Premium brands throughout, 2-year structural warranty, dedicated site engineer.', 0.63);

  const p2 = await makeProject(rahul, 'Lucknow', {
    title: 'Shop on ground floor + 2 floors residence', description: 'Commercial shop frontage on ground floor with two residential floors above. Corner plot on main road.',
    location_text: 'Indira Nagar, Lucknow', plot_area: 1800, area_per_floor: 1500, floors: 3, quality: 'standard', building_type: 'commercial', budget: 7500000, deadline: 18,
  });
  await addBid(p2.id, p2.est, C['imran@demo.in'], 0.98, 360, 12, 'Includes shutter, shop flooring and separate staircase for residence.', 0.62);
  await addBid(p2.id, p2.est, C['vikas@demo.in'], 1.06, 390, 12, 'Can arrange fire NOC consultant.', 0.6);

  await makeProject(amit, 'Meerut', {
    title: 'G+2 rental floors in Shastri Nagar', description: 'Three identical 2BHK rental floors with parking stilt not required. Budget-conscious but durable finishes.',
    location_text: 'Shastri Nagar, Meerut', plot_area: 1100, area_per_floor: 1000, floors: 3, quality: 'basic', budget: 4200000, deadline: 20,
  });
  await makeProject(priya, 'Shamli', {
    title: 'Ancestral house rebuild — single storey', description: 'Demolish old structure (separately contracted) and build a new single-storey 3BHK with provision for a future first floor.',
    location_text: 'Shamli town', plot_area: 2000, area_per_floor: 1600, floors: 1, quality: 'standard', budget: 3000000, deadline: 25,
  });

  // An awarded, in-progress project to demonstrate project management.
  const p5 = await makeProject(rahul, 'Lucknow', {
    title: 'Duplex villa in Gomti Nagar', description: 'Premium G+1 duplex with double-height living room, Italian marble in living areas and modular kitchen.',
    location_text: 'Gomti Nagar Extension, Lucknow', plot_area: 2400, area_per_floor: 1800, floors: 2, quality: 'premium', budget: 9500000,
  }, 'in_progress');
  const won = await addBid(p5.id, p5.est, C['imran@demo.in'], 1.01, 420, 24, 'Turnkey premium package; marble and fittings as per client selection.', 0.62, 'accepted');
  await addBid(p5.id, p5.est, C['vikas@demo.in'], 1.12, 450, 12, 'Premium package.', 0.6, 'rejected');
  await db.run('UPDATE projects SET awarded_bid_id = ? WHERE id = ?', [won.id, p5.id]);
  const start = addDays(today(), -95);
  await createMilestonePlan(p5.id, won, p5.est, start);
  const ms = await db.all('SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order', [p5.id]);
  const progress = [[100, 'done'], [55, 'in_progress'], [10, 'in_progress']];
  for (let i = 0; i < progress.length; i++) await db.run('UPDATE milestones SET progress = ?, status = ? WHERE id = ?', [progress[i][0], progress[i][1], ms[i].id]);
  const exp = [
    [ms[0].id, 'Excavation & anti-termite treatment', 'labour', 0.08, -90], [ms[0].id, 'Cement 420 bags (UltraTech)', 'material', 0.18, -85],
    [ms[0].id, 'TMT steel 6.2 t for footings & plinth beam', 'material', 0.35, -82], [ms[0].id, 'Foundation labour — final bill', 'labour', 0.3, -60],
    [ms[1].id, 'Steel 8 t for columns & slab', 'material', 0.28, -45], [ms[1].id, 'Ready-mix concrete M25 — ground slab', 'material', 0.2, -30],
    [ms[1].id, 'Shuttering hire & labour', 'labour', 0.12, -20], [ms[2].id, 'Bricks 18,000 nos', 'material', 0.15, -8],
  ];
  for (const [mid, desc, cat, share, day] of exp) {
    const m = ms.find((x) => x.id === mid);
    await db.run('INSERT INTO expenses (project_id, milestone_id, description, category, amount, spent_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p5.id, mid, desc, cat, Math.round((Number(m.budget) * share) / 100) * 100, addDays(today(), day), C['imran@demo.in']]);
  }
  const updates = [
    [C['imran@demo.in'], 'Work has started on site. Bhoomi pujan done, excavation in progress.', -95],
    [rahul, 'Please share the soil test report before footing concrete.', -88],
    [C['imran@demo.in'], 'Soil test report uploaded to the shared drive. Footings concreted, curing for 7 days.', -80],
    [C['imran@demo.in'], 'Ground floor slab cast today. De-shuttering after 14 days.', -30],
    [C['imran@demo.in'], 'First-floor columns done; brickwork started on ground floor.', -6],
  ];
  for (const [uid, msg, day] of updates) {
    await db.run('INSERT INTO project_updates (project_id, user_id, message, created_at) VALUES (?, ?, ?, ?)', [p5.id, uid, msg, `${addDays(today(), day)} 10:00:00`]);
  }
  await db.run('INSERT INTO reviews (project_id, reviewer_id, reviewee_id, rating, comment) VALUES (NULL, ?, ?, 5, ?)', [amit, C['vikas@demo.in'], 'Finished my parents\' house on time and within budget.']);

  // ---- Tenders (sample listings that mirror the kind of notices found on official portals) ----
  const T = [
    ['Construction of G+2 Community Health Centre building', 'Public Works Department (sample)', 'government', 'Healthcare building', 'Shamli', 'Uttar Pradesh', 48500000, 970000, 21, 'UP e-Tender portal', 'https://etender.up.nic.in'],
    ['Construction of boundary wall and approach road for Government Inter College', 'Rural Engineering Department (sample)', 'government', 'Roads & boundary wall', 'Muzaffarnagar', 'Uttar Pradesh', 6200000, 124000, 12, 'UP e-Tender portal', 'https://etender.up.nic.in'],
    ['Repair & renovation of staff quarters (Type II & III)', 'Central Public Works Department (sample)', 'government', 'Repair & renovation', 'New Delhi', 'Delhi', 18700000, 374000, 16, 'CPPP — eprocure.gov.in', 'https://eprocure.gov.in/eprocure/app'],
    ['Construction of 2-storey Panchayat Bhawan', 'Zila Panchayat (sample)', 'government', 'Public building', 'Meerut', 'Uttar Pradesh', 9800000, 196000, 9, 'UP e-Tender portal', 'https://etender.up.nic.in'],
    ['Construction of academic block extension (G+3)', 'State Technical University (sample)', 'institutional', 'Educational building', 'Lucknow', 'Uttar Pradesh', 126000000, 2520000, 30, 'Institution tender page', 'https://eprocure.gov.in/eprocure/app'],
    ['Hostel block civil & MEP works — 200 rooms', 'National Institute (sample)', 'institutional', 'Hostel', 'Patna', 'Bihar', 214000000, 4280000, 35, 'CPPP — eprocure.gov.in', 'https://eprocure.gov.in/eprocure/app'],
    ['Construction of Anganwadi centres (cluster of 6)', 'Women & Child Development Dept. (sample)', 'government', 'Public building', 'Jaipur', 'Rajasthan', 7400000, 148000, 14, 'Rajasthan e-Procurement', 'https://eproc.rajasthan.gov.in'],
    ['Waterproofing and terrace treatment of office complex', 'Public Sector Bank — Premises Dept. (sample)', 'institutional', 'Repair & renovation', 'Mumbai', 'Maharashtra', 3600000, 72000, 8, 'GeM — gem.gov.in', 'https://gem.gov.in'],
    ['Construction of cement concrete internal roads & drains', 'Municipal Corporation (sample)', 'government', 'Roads & drainage', 'Noida', 'Uttar Pradesh', 15300000, 306000, 11, 'UP e-Tender portal', 'https://etender.up.nic.in'],
    ['Construction of primary school building (G+1) with toilets', 'Samagra Shiksha (sample)', 'government', 'Educational building', 'Hyderabad', 'Telangana', 11200000, 224000, 19, 'Telangana e-Procurement', 'https://tender.telangana.gov.in'],
    ['Private: Construction of 40-bed nursing home (G+3)', 'Private hospital trust (sample)', 'private', 'Healthcare building', 'Ghaziabad', 'Uttar Pradesh', 52000000, null, 24, 'BuildBid private tender', null],
    ['Private: Warehouse with PEB shed, 25,000 sq ft', 'Logistics company (sample)', 'private', 'Industrial', 'Bengaluru', 'Karnataka', 38000000, null, 17, 'BuildBid private tender', null],
  ];
  for (const [title, org, type, cat, loc, state, value, emd, days, src, url] of T) {
    await db.run(`INSERT INTO tenders (title, organization, tender_type, category, location, state, value_estimate, emd, closing_date, source_name, source_url, description, is_sample)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [title, org, type, cat, loc, state, value, emd, addDays(today(), days), src, url,
      'Sample listing for demonstration. Always download the official tender document and corrigenda from the issuing portal before bidding.']);
  }
}

module.exports = { seed: seed_ };
