/* Home / landing page */
(() => {
  const { route, app, api, esc, num, icon, state } = BB;

  const FEATURES = [
    ['estimate', 'AI cost estimation', 'Material quantities, regional rates, labour, phase-wise cost and a confidence range in seconds.', '#/estimate'],
    ['bid', 'Contractor bidding', 'Post your project once and receive itemised quotations from contractors in your city.', '#/projects'],
    ['compare', 'Quotation analysis', 'Every quote is checked against the AI estimate, scored and flagged for risk before you decide.', '#/projects'],
    ['people', 'Professional discovery', 'Find verified engineers, architects, masons, plumbers and electricians with ratings.', '#/professionals'],
    ['material', 'Material marketplace', 'Live supplier prices compared with reference rates for cement, steel, sand, bricks and more.', '#/materials'],
    ['manage', 'Project management', 'Auto-generated milestones, expense tracking, progress updates and budget alerts.', '#/dashboard'],
    ['tender', 'Tender discovery', 'Government and institutional construction tenders in one searchable, bookmarkable feed.', '#/tenders'],
    ['ai', 'Learns from every project', 'Completed projects feed actual costs back into the estimation model for each region.', '#/estimate'],
  ];

  route('/', async () => {
    const stats = await api('/stats').catch(() => null);
    app().innerHTML = `
      <div class="hero-wrap">
        <section class="hero">
          <div class="copy">
            <h1>Know what your building will cost before the first brick.</h1>
            <p>BuildBid prices your house with local material and labour rates, gets you quotations from verified contractors, and tracks the build until handover.</p>
            <div class="btn-row">
              <a class="btn build lg" href="#/estimate">Estimate my building</a>
              ${state.user ? '<a class="btn light lg" href="#/dashboard">Open my dashboard</a>' : '<a class="btn light lg" href="#/register">Create an account</a>'}
            </div>
            <p class="site-note">Rates for ${stats ? stats.regions : 14} cities, from Shamli to Bengaluru.</p>
          </div>
          <div class="art">${BB.building({ floors: 4, area: 1500, quality: 'standard', crane: true, site: true, animate: true, bare: true,
    stages: { foundation: 1, structure: 0.82, masonry: 0.5, openings: 0.25, finishing: 0.25 } })}</div>
        </section>
        <div class="hazard"></div>
      </div>

      <div class="stages" aria-label="How BuildBid works">
        ${[['Plan', 'Your requirements'], ['Estimate', 'AI cost & quantities'], ['Find', 'Engineers & trades'], ['Bid', 'Contractor quotations'], ['Compare', 'Risk-checked scores'], ['Manage', 'Milestones & spend']]
    .map(([t, d], i) => `<div><span class="dot">${i + 1}</span><b>${t}</b><small>${d}</small></div>`).join('')}
      </div>

      ${stats ? `<div class="stat-strip">
        <div><b>${num(stats.professionals)}</b><span>contractors & professionals</span></div>
        <div><b>${num(stats.open_projects)}</b><span>projects taking quotations</span></div>
        <div><b>${num(stats.tenders)}</b><span>tenders listed</span></div>
        <div><b>${num(stats.estimates)}</b><span>estimates generated</span></div>
      </div>` : ''}

      <div class="split wide-left" style="margin-bottom:26px">
        <div class="card">
          <h2>Everything a construction project needs</h2>
          <p class="muted">Each part works on its own, and they share data so every decision has numbers behind it.</p>
          <div class="grid g2" style="margin-top:18px">
            ${FEATURES.map(([ic, t, d, href]) => `<a class="feature" href="${href}" style="color:inherit;text-decoration:none"><span class="ic">${icon(ic)}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></a>`).join('')}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <h3>Today, building a house means…</h3>
            <ul class="problem-list">
              <li>Searching for an engineer</li><li>Searching for a contractor</li><li>Finding masons, plumbers, electricians</li>
              <li>Hunting for materials and comparing prices</li><li>Collecting quotations one by one</li><li>Guessing whether a quotation is reasonable</li>
              <li>Managing the project on paper and WhatsApp</li>
            </ul>
            <p style="margin:14px 0 0;font-weight:600;color:var(--navy)">BuildBid connects all of it in one workflow.</p>
          </div>
          ${state.user ? '' : `<div class="card">
            <h3>Try it with a demo account</h3>
            <p class="muted" style="font-size:14px">One click logs you in. Password for all demo accounts: <code>demo123</code></p>
            <div class="demo-accounts" id="demoAccounts">
              ${[['priya@demo.in', 'Customer', 'Priya — has quotations to compare'], ['rahul@demo.in', 'Customer', 'Rahul — project under construction'],
    ['ravi@demo.in', 'Contractor', 'Ravi — bids on projects'], ['anita@demo.in', 'Professional', 'Anita — structural engineer'],
    ['om@demo.in', 'Supplier', 'Om — building materials'], ['admin@buildbid.in', 'Admin', 'Rates & verification']]
    .map(([e, r, d]) => `<button data-email="${e}"><b>${r}</b>${esc(d)}</button>`).join('')}
            </div>
          </div>`}
        </div>
      </div>`;

    BB.$$('#demoAccounts button').forEach((b) => {
      b.onclick = async () => {
        try { BB.setSession(await api('/auth/login', { method: 'POST', body: { email: b.dataset.email, password: 'demo123' } })); BB.toast(`Logged in as ${BB.state.user.name}`); BB.go('#/dashboard'); } catch (e) { BB.toast(e.message, 'error'); }
      };
    });
  });
})();
