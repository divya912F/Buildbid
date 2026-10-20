/* Projects: discovery, posting, detail + quotations, comparison & award */
(() => {
  const { route, app, api, state, esc, inr, inrShort, num, date, ago, daysLeft, cap, stars, statusBadge, verifiedTag, icon,
    regionOptions, onSubmit, needLogin, toast, modal, go, $, $$ } = BB;

  const projectMeta = (p) => `<div class="meta">
    <span>${icon('pin', 15)} ${esc(p.location_text || p.city)}</span>
    <span>${num(Number(p.area_per_floor) * Number(p.floors))} sq ft · ${p.floors} floor${p.floors > 1 ? 's' : ''}</span>
    <span>${cap(p.quality)} · ${cap(p.building_type)}</span>
    ${p.bid_deadline && p.status === 'open' ? `<span>${icon('clock', 15)} Quotes due ${date(p.bid_deadline)}</span>` : ''}
  </div>`;

  // ---------- Discovery ----------
  route('/projects', async (p, q) => {
    const isContractor = state.user && state.user.role === 'contractor';
    app().innerHTML = `
      <div class="page-head"><div><h1>${isContractor ? 'Find projects to bid on' : 'Open projects'}</h1>
        <p>${isContractor ? 'Projects posted by homeowners and businesses that are accepting quotations. Each comes with an AI cost estimate so you can price competitively.' : 'Projects currently accepting quotations from contractors.'}</p></div>
        ${state.user && state.user.role === 'customer' ? '<a class="btn" href="#/projects/new">+ Post a project</a>' : ''}
      </div>
      <form class="filters" id="pf">
        <input type="search" name="q" placeholder="Search title, description or city" value="${esc(q.q || '')}">
        <select name="region_id">${await regionOptions(q.region_id, { any: true })}</select>
        <select name="building_type"><option value="">All types</option><option value="residential" ${q.building_type === 'residential' ? 'selected' : ''}>Residential</option><option value="commercial" ${q.building_type === 'commercial' ? 'selected' : ''}>Commercial</option></select>
        <button class="btn secondary" type="submit">Filter</button>
      </form>
      <div id="plist"><div class="loading">Loading…</div></div>`;
    $('#pf').onsubmit = (e) => { e.preventDefault(); const d = new URLSearchParams(BB.formData(e.target)); go('#/projects?' + d); };
    const list = await api('/projects?' + new URLSearchParams(q));
    $('#plist').innerHTML = list.length ? list.map((x) => `
      <div class="list-item with-thumb">
        <a class="thumb" href="#/projects/${x.id}" aria-hidden="true" tabindex="-1">${BB.building({ floors: x.floors, area: x.area_per_floor, quality: x.quality, type: x.building_type, basement: Number(x.basement), stages: BB.stagesFromStatus(x.status), fit: true })}</a>
        <div class="body">
          <h3><a href="#/projects/${x.id}">${esc(x.title)}</a></h3>
          ${projectMeta(x)}
          <p class="muted" style="margin:8px 0 0;font-size:14px">${esc((x.description || '').slice(0, 160))}${(x.description || '').length > 160 ? '…' : ''}</p>
        </div>
        <div class="right">
          <small>AI estimate</small><div class="amount">${inrShort(x.estimated_cost)}</div>
          <div style="margin:6px 0"><span class="badge gray">${x.bid_count} quotation${x.bid_count == 1 ? '' : 's'}</span></div>
          ${x.my_bid ? `<span class="badge green">You quoted ${inrShort(x.my_bid.amount)}</span>` : isContractor ? `<a class="btn sm" href="#/projects/${x.id}">Submit quotation</a>` : ''}
        </div>
      </div>`).join('') : '<div class="card empty"><h3>No matching projects</h3><p>Try a different city or clear the filters.</p></div>';
  }, 'projects');

  // ---------- Post a project ----------
  route('/projects/new', async (p, q) => {
    if (needLogin(['customer'])) return;
    app().innerHTML = `
      <a class="crumb" href="#/dashboard">← Dashboard</a>
      <div class="page-head"><div><h1>Post a project for quotations</h1><p>Describe what you want to build. We attach an AI cost estimate so contractors quote realistically and you can judge every quotation.</p></div></div>
      <div class="split">
        <form class="card" id="npf">
          <div class="field"><label for="title">Project title</label><input id="title" name="title" required minlength="4" placeholder="e.g. G+1 family home in Sector 62"></div>
          <div class="field"><label for="description">What needs to be built? <span class="hint">(rooms, scope, drawings available, special needs)</span></label><textarea id="description" name="description" rows="4"></textarea></div>
          <div class="grid-form">
            <div class="field"><label for="location_text">Site location</label><input id="location_text" name="location_text" placeholder="Locality, city"></div>
            <div class="field"><label for="plot_area">Plot area <span class="hint">(sq ft, optional)</span></label><input id="plot_area" name="plot_area" type="number" min="0"></div>
          </div>
          ${await BB.estimateFields(q)}
          <div class="grid-form">
            <div class="field"><label for="budget">Your budget <span class="hint">(₹, optional)</span></label><input id="budget" name="budget" type="number" min="0" step="10000"></div>
            <div class="field"><label for="bid_deadline">Quotations due by</label><input id="bid_deadline" name="bid_deadline" type="date"></div>
          </div>
          <button class="btn lg" type="submit">Post project & invite quotations</button>
        </form>
        <div class="sticky" id="preview"><div class="card empty"><h3>Live estimate</h3><p>Fill in area and floors to preview the cost.</p></div></div>
      </div>`;
    const form = $('#npf');
    const dl = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10); form.bid_deadline.value = dl;
    let t;
    const preview = async () => {
      const d = BB.formData(form);
      if (!(Number(d.area_per_floor) >= 100)) return;
      try {
        const e = await api('/estimates', { method: 'POST', body: { ...d, save: false } });
        const budget = Number(d.budget);
        $('#preview').innerHTML = BB.renderEstimate(e, { compact: true }) + (budget > 0 ? `<div class="alert ${budget < e.range.low ? 'high' : 'info'}" style="margin-top:14px">${budget < e.range.low
          ? `Your budget is ${Math.round((1 - budget / e.total) * 100)}% below the estimate. Consider Basic quality, fewer floors or a phased build.`
          : budget > e.range.high ? 'Your budget comfortably covers the estimated cost.' : 'Your budget is within the estimated range.'}</div>` : '');
      } catch { /* ignore while typing */ }
    };
    form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 350); });
    preview();
    onSubmit(form, async (d) => {
      const r = await api('/projects', { method: 'POST', body: d });
      toast('Project posted! Contractors in your city have been notified.');
      go(`#/projects/${r.id}`);
    });
  }, 'projects');

  // ---------- Project detail ----------
  route('/projects/:id', async ({ id }) => {
    const d = await api(`/projects/${id}`);
    const p = d.project; const u = state.user;
    const isOwner = u && u.id === p.customer_id;
    const isContractor = u && u.role === 'contractor';
    const est = d.estimate;

    let side = '';
    if (isOwner) {
      side = `<div class="card"><h3>Quotations</h3>
        <div class="stat" style="box-shadow:none;margin:10px 0"><div class="k">Received</div><div class="v">${d.bid_count}</div></div>
        ${p.status === 'open' && d.bid_count ? `<a class="btn" style="width:100%" href="#/projects/${p.id}/compare">Compare & award</a>` : ''}
        ${p.status === 'open' && !d.bid_count ? '<p class="muted">Contractors in your city have been notified. Quotations will appear here.</p>' : ''}
        ${['awarded', 'in_progress', 'completed'].includes(p.status) ? `<a class="btn" style="width:100%" href="#/workspace/${p.id}">Open project workspace</a>` : ''}
        ${['open', 'awarded'].includes(p.status) ? '<button class="btn ghost" id="cancelP" style="width:100%;margin-top:8px">Cancel project</button>' : ''}
      </div>
      <div class="card"><h3>Find professionals</h3><p class="muted" style="font-size:14px">Need an architect for drawings or a structural engineer to check the design?</p>
        <a class="btn secondary" href="#/professionals?city=${encodeURIComponent(p.city)}">Browse ${esc(p.city)} professionals</a></div>`;
    } else if (isContractor) {
      const b = d.my_bid;
      side = p.status === 'open' ? `<form class="card" id="bidForm">
          <h3>${b ? 'Update your quotation' : 'Submit your quotation'}</h3>
          <p class="muted" style="font-size:13.5px">AI estimate for reference: <b>${inr(p.estimated_cost)}</b>. Itemised quotes score higher with customers.</p>
          <div class="field"><label>Material cost (₹)</label><input name="material_cost" type="number" min="0" step="1000" value="${b ? b.material_cost : ''}"></div>
          <div class="field"><label>Labour cost (₹)</label><input name="labour_cost" type="number" min="0" step="1000" value="${b ? b.labour_cost : ''}"></div>
          <div class="field"><label>Other / overheads (₹)</label><input name="other_cost" type="number" min="0" step="1000" value="${b ? b.other_cost : ''}"></div>
          <div class="field"><label>Total quotation (₹)</label><input name="amount" type="number" min="1" step="1000" required value="${b ? b.amount : ''}"></div>
          <div class="grid-form">
            <div class="field"><label>Timeline (days)</label><input name="timeline_days" type="number" min="1" required value="${b ? b.timeline_days : est ? est.timeline_months * 30 : ''}"></div>
            <div class="field"><label>Warranty (months)</label><input name="warranty_months" type="number" min="0" value="${b ? b.warranty_months : 12}"></div>
          </div>
          <div class="field"><label>Notes for the customer</label><textarea name="notes" rows="3" placeholder="Brands, inclusions, exclusions, payment terms">${esc(b ? b.notes : '')}</textarea></div>
          <div id="bidHint" class="alert info" hidden></div>
          <button class="btn" type="submit" style="width:100%">${b ? 'Update quotation' : 'Send quotation'}</button>
          ${b && b.status === 'submitted' ? '<button class="btn ghost" type="button" id="withdraw" style="width:100%;margin-top:6px">Withdraw quotation</button>' : ''}
        </form>`
        : `<div class="card"><h3>Quotations closed</h3><p class="muted">This project is ${cap(p.status)}.</p>${b ? `<p>Your quotation: <b>${inr(b.amount)}</b> ${statusBadge(b.status)}</p>` : ''}
            ${d.is_member ? `<a class="btn" href="#/workspace/${p.id}">Open workspace</a>` : ''}</div>`;
    } else if (!u) {
      side = `<div class="card"><h3>Are you a contractor?</h3><p class="muted">Log in to submit a quotation for this project.</p><a class="btn" href="#/login?next=${encodeURIComponent(location.hash)}">Log in to quote</a></div>`;
    }

    app().innerHTML = `
      <a class="crumb" href="${isOwner ? '#/dashboard' : '#/projects'}">← ${isOwner ? 'Dashboard' : 'All projects'}</a>
      <div class="page-head"><div><h1>${esc(p.title)}</h1>${projectMeta(p)}</div>${statusBadge(p.status)}</div>
      <div class="split">
        <div class="stack">
          <div class="card"><h3>Project details</h3><p style="white-space:pre-line">${esc(p.description || 'No description provided.')}</p>
            <dl class="kv"><dt>Posted by</dt><dd>${esc(p.customer_name)} · ${ago(p.created_at)}</dd>
              ${p.plot_area ? `<dt>Plot area</dt><dd>${num(p.plot_area)} sq ft</dd>` : ''}
              <dt>Built-up area</dt><dd>${num(p.area_per_floor)} sq ft × ${p.floors} floor(s)${Number(p.basement) ? ' + basement' : ''}</dd>
              ${p.budget && (isOwner || isContractor) ? `<dt>Customer budget</dt><dd>${inr(p.budget)}</dd>` : ''}
              ${d.contractor ? `<dt>Contractor</dt><dd>${esc(d.contractor.company || d.contractor.name)}</dd>` : ''}
            </dl></div>
          ${est ? BB.renderEstimate(est, { compact: !isOwner && !isContractor, stages: p.status === 'completed' ? null : BB.stagesFromStatus(p.status), caption: p.status === 'completed' ? '<b>Completed</b>' : p.status === 'open' ? '<b>Blueprint</b> waiting for a contractor' : '<b>Under construction</b>' }) : ''}
        </div>
        <div class="stack sticky">${side}</div>
      </div>`;

    const cancel = $('#cancelP');
    if (cancel) cancel.onclick = async () => { if (!confirm('Cancel this project? Contractors will no longer be able to quote.')) return; await api(`/projects/${p.id}/cancel`, { method: 'POST' }); toast('Project cancelled'); BB.render(); };

    const bf = $('#bidForm');
    if (bf) {
      const sync = (e) => {
        const parts = ['material_cost', 'labour_cost', 'other_cost'].map((n) => Number(bf[n].value) || 0);
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum > 0 && e && e.target.name !== 'amount') bf.amount.value = sum;
        const amt = Number(bf.amount.value); const hint = $('#bidHint');
        if (amt > 0) {
          const dev = ((amt - p.estimated_cost) / p.estimated_cost) * 100;
          hint.hidden = false;
          hint.className = `alert ${Math.abs(dev) > 25 ? 'high' : Math.abs(dev) > 12 ? '' : 'info'}`;
          hint.textContent = `${Math.abs(dev).toFixed(1)}% ${dev >= 0 ? 'above' : 'below'} the AI estimate. ${dev < -25 ? 'Customers will see this flagged as a high-risk quote.' : dev > 25 ? 'Customers will see this flagged as overpriced.' : 'Looks reasonable.'}`;
        }
      };
      bf.addEventListener('input', sync); sync();
      onSubmit(bf, async (data) => { await api(`/projects/${p.id}/bids`, { method: 'POST', body: data }); toast('Quotation sent to the customer'); BB.render(); });
      const w = $('#withdraw'); if (w) w.onclick = async () => { if (!confirm('Withdraw your quotation?')) return; await api(`/bids/${d.my_bid.id}/withdraw`, { method: 'POST' }); toast('Quotation withdrawn'); BB.render(); };
    }
  }, 'projects');

  // ---------- Compare & award ----------
  route('/projects/:id/compare', async ({ id }) => {
    if (needLogin(['customer', 'admin'])) return;
    const d = await api(`/projects/${id}/compare`);
    const p = d.project;
    if (!d.bids.length) { app().innerHTML = `<a class="crumb" href="#/projects/${id}">← Back to project</a><div class="card empty"><h3>No quotations yet</h3><p>You'll be notified as soon as contractors respond.</p></div>`; return; }
    const ring = (s) => `<div class="score-ring" style="background:conic-gradient(var(--blue) ${s * 3.6}deg, #e6edf8 0)"><div style="background:#fff;width:50px;height:50px;border-radius:50%;display:grid;place-items:center">${Math.round(s)}</div></div>`;
    const S = d.summary; const reco = d.recommendation;
    const canAward = p.status === 'open';
    // Simple price chart: estimate band vs each quote
    const max = Math.max(S.highest, d.estimate ? d.estimate.range.high : 0) * 1.05;
    const pct = (v) => (v / max) * 100;

    app().innerHTML = `
      <a class="crumb" href="#/projects/${id}">← ${esc(p.title)}</a>
      <div class="page-head"><div><h1>Compare quotations</h1><p>Each quotation is checked against the AI estimate of <b>${inr(S.estimate)}</b>, then scored on price (40%), contractor rating (25%), timeline (20%) and verification/experience (15%).</p></div></div>

      ${reco ? `<div class="reco" style="margin-bottom:18px"><div><h3>Recommended: ${esc(reco.contractor)}</h3><div class="muted">${esc(reco.reasons.join(' · '))}</div></div>
        ${canAward ? `<button class="btn success" data-award="${reco.bid_id}">Award to ${esc(reco.contractor.split(' ')[0])}</button>` : statusBadge(p.status)}</div>` : ''}

      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><h3>Price position</h3><small>Shaded band = AI estimate range</small></div>
        <div class="bars">
          ${d.bids.map((b) => `<div class="bar-row"><span>${esc(b.contractor_name)}</span><div class="track" style="overflow:visible">${d.estimate ? `<div class="band" style="left:${pct(d.estimate.range.low)}%;width:${pct(d.estimate.range.high) - pct(d.estimate.range.low)}%"></div>` : ''}<div class="fill" style="width:${pct(b.amount)}%;background:${b.risk_level === 'High' ? 'var(--red)' : b.risk_level === 'Medium' ? '#e59400' : 'var(--blue)'}"></div></div><span class="val">${inrShort(b.amount)}</span></div>`).join('')}
        </div>
      </div>

      <div class="grid g${Math.min(3, d.bids.length)}">
        ${d.bids.map((b, i) => `
          <div class="cmp-card ${reco && reco.bid_id === b.id ? 'best' : ''}">
            ${reco && reco.bid_id === b.id ? '<span class="ribbon badge green">★ Best overall</span>' : ''}
            <div style="display:flex;gap:12px;align-items:center;justify-content:space-between">
              <div style="min-width:0"><h3 style="margin:0">${esc(b.company || b.contractor_name)}</h3>
                <div class="meta"><span>${esc(b.contractor_name)}</span>${verifiedTag(b.verified)}</div>
                <div style="font-size:13px">${Number(b.rating_count) ? `${stars(b.rating)} <small>${Number(b.rating).toFixed(1)} (${b.rating_count})</small>` : '<small class="muted">No ratings yet</small>'}</div></div>
              ${ring(b.scores.total)}
            </div>
            <hr style="margin:14px 0">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="amount" style="font-size:22px;font-weight:800;color:var(--navy)">${inr(b.amount)}</span>
              <span class="badge ${b.risk_level === 'High' ? 'red' : b.risk_level === 'Medium' ? 'amber' : 'green'}">${b.risk_level} risk</span></div>
            <div class="meta" style="margin-top:4px"><span>${b.deviation_pct >= 0 ? '+' : ''}${b.deviation_pct}% vs estimate</span><span>${b.timeline_days} days</span><span>${b.warranty_months || 0} mo warranty</span></div>
            ${Number(b.material_cost) ? `<div class="meta" style="margin-top:4px"><span>Material ${inrShort(b.material_cost)}</span><span>Labour ${inrShort(b.labour_cost)}</span><span>Other ${inrShort(b.other_cost)}</span></div>` : ''}
            <div class="mini-bars">
              ${['price', 'rating', 'timeline', 'trust'].map((k) => `<div><span>${cap(k)}</span><div class="track"><div class="fill" style="width:${b.scores[k]}%"></div></div><span>${b.scores[k]}</span></div>`).join('')}
            </div>
            <ul class="flags">${b.flags.map((f) => `<li class="${f.level}">${esc(f.text)}</li>`).join('')}</ul>
            ${b.notes ? `<p style="font-size:13.5px;margin:10px 0 0;color:var(--ink-2)"><b>Notes:</b> ${esc(b.notes)}</p>` : ''}
            <div class="btn-row" style="margin-top:14px">
              ${canAward && b.status === 'submitted' ? `<button class="btn ${i === 0 ? '' : 'secondary'} sm" data-award="${b.id}">Award contract</button>` : statusBadge(b.status)}
              <a class="btn ghost sm" href="#/professionals/${b.contractor_id}">View profile</a>
            </div>
          </div>`).join('')}
      </div>`;

    $$('[data-award]').forEach((btn) => {
      btn.onclick = () => {
        const b = d.bids.find((x) => String(x.id) === btn.dataset.award);
        modal(`<h2>Award contract?</h2><p>You're awarding <b>${esc(p.title)}</b> to <b>${esc(b.company || b.contractor_name)}</b> for <b>${inr(b.amount)}</b> over ${b.timeline_days} days.</p>
          ${b.risk_level !== 'Low' ? `<div class="alert ${b.risk_level === 'High' ? 'high' : ''}">This quotation is marked <b>${b.risk_level} risk</b>. Review the flags before awarding.</div>` : ''}
          <p class="muted" style="font-size:14px">Other contractors will be informed, and a milestone plan will be created in your project workspace.</p>
          <div class="btn-row"><button class="btn success" id="confirmAward">Confirm award</button><button class="btn secondary" data-close>Cancel</button></div>`, (card, close) => {
          $('#confirmAward', card).onclick = async () => {
            try { await api(`/projects/${p.id}/award`, { method: 'POST', body: { bid_id: b.id } }); close(); toast('Contract awarded — milestone plan created'); go(`#/workspace/${p.id}`); } catch (e) { toast(e.message, 'error'); }
          };
        });
      };
    });
  }, 'projects');
})();
