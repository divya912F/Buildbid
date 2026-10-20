/* Professional discovery, materials & rates, tenders */
(() => {
  const { route, app, api, state, esc, inr, inrShort, num, date, daysLeft, cap, stars, verifiedTag, icon, regionOptions, defaultRegionId,
    onSubmit, toast, modal, go, $, $$, CATEGORY_LABELS } = BB;

  // ---------- Professionals ----------
  route('/professionals', async (p, q) => {
    const regions = await BB.regions();
    const cats = Object.entries(CATEGORY_LABELS).filter(([k]) => k !== 'supplier');
    app().innerHTML = `
      <div class="page-head"><div><h1>Find contractors & professionals</h1><p>Verified contractors, engineers, architects and skilled tradespeople, with ratings from real projects.</p></div></div>
      <div class="tabs" id="catTabs"><a href="#/professionals?${new URLSearchParams({ ...q, category: '' })}" class="${!q.category ? 'active' : ''}">All</a>
        ${cats.map(([k, l]) => `<a href="#/professionals?${new URLSearchParams({ ...q, category: k })}" class="${q.category === k ? 'active' : ''}">${l}s</a>`).join('')}</div>
      <form class="filters" id="ff">
        <input type="search" name="q" placeholder="Search name, company or skill" value="${esc(q.q || '')}">
        <select name="city"><option value="">All cities</option>${regions.map((r) => `<option ${q.city === r.city ? 'selected' : ''}>${esc(r.city)}</option>`).join('')}</select>
        <select name="sort"><option value="">Best rated</option><option value="experience" ${q.sort === 'experience' ? 'selected' : ''}>Most experienced</option><option value="rate" ${q.sort === 'rate' ? 'selected' : ''}>Lowest day rate</option></select>
        <label class="check" style="margin:0"><input type="checkbox" name="verified" ${q.verified === '1' ? 'checked' : ''}> Verified only</label>
        <button class="btn secondary" type="submit">Apply</button>
      </form>
      <div id="plist" class="grid g3"><div class="loading">Loading…</div></div>`;
    $('#ff').onsubmit = (e) => { e.preventDefault(); const d = BB.formData(e.target); go('#/professionals?' + new URLSearchParams({ ...d, verified: d.verified ? '1' : '', category: q.category || '' })); };
    const list = await api('/professionals?' + new URLSearchParams(q));
    $('#plist').innerHTML = list.length ? list.map((x) => `
      <div class="card pro-card">
        <div class="top"><span class="avatar lg">${esc(BB.initials(x.name))}</span>
          <div style="min-width:0"><h3><a href="#/professionals/${x.id}">${esc(x.company || x.name)}</a></h3>
            <div class="meta"><span>${esc(CATEGORY_LABELS[x.category] || cap(x.category))}</span>${verifiedTag(x.verified)}</div>
            <div class="meta"><span>${icon('pin', 14)} ${esc(x.city)}</span><span>${x.experience_years} yrs</span></div></div></div>
        <div class="skills">${esc(x.skills || '')}</div>
        <div class="foot"><span>${Number(x.rating_count) ? `${stars(x.rating)} ${Number(x.rating).toFixed(1)} <small>(${x.rating_count})</small>` : '<small>New on BuildBid</small>'}</span>
          <span>${x.day_rate ? `<b>${inr(x.day_rate)}</b><small>/day</small>` : `<small>${x.projects_completed} projects</small>`}</span></div>
        <a class="btn secondary sm" href="#/professionals/${x.id}">View profile</a>
      </div>`).join('') : '<div class="card empty" style="grid-column:1/-1"><h3>No one matches these filters</h3><p>Try another city or category.</p></div>';
  }, 'professionals');

  route('/professionals/:id', async ({ id }) => {
    const { profile: x, reviews } = await api(`/professionals/${id}`);
    const canHire = state.user && state.user.id !== x.id;
    app().innerHTML = `
      <a class="crumb" href="#/professionals">← All professionals</a>
      <div class="split">
        <div class="stack">
          <div class="card">
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><span class="avatar lg">${esc(BB.initials(x.name))}</span>
              <div><h1 style="margin:0">${esc(x.company || x.name)}</h1><div class="meta"><span>${esc(CATEGORY_LABELS[x.category] || cap(x.category))}</span>${x.company ? `<span>${esc(x.name)}</span>` : ''}<span>${icon('pin', 14)} ${esc(x.city)}</span>${verifiedTag(x.verified)}</div></div></div>
            <p>${esc(x.bio || '')}</p>
            <dl class="kv"><dt>Skills</dt><dd>${esc(x.skills || '—')}</dd><dt>Experience</dt><dd>${x.experience_years} years</dd>
              <dt>Projects done</dt><dd>${x.projects_completed}</dd>${x.day_rate ? `<dt>Day rate</dt><dd>${inr(x.day_rate)}</dd>` : ''}
              ${x.licence_no ? `<dt>Licence / Reg. no.</dt><dd>${esc(x.licence_no)}</dd>` : ''}</dl>
          </div>
          <div class="card"><div class="card-head"><h3>Reviews</h3>${Number(x.rating_count) ? `<span>${stars(x.rating)} <b>${Number(x.rating).toFixed(1)}</b> <small>from ${x.rating_count} clients</small></span>` : ''}</div>
            ${reviews.length ? reviews.map((r) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)">${stars(r.rating)} <b>${esc(r.reviewer)}</b> <small>${r.project ? '· ' + esc(r.project) : ''} · ${date(r.created_at)}</small><p style="margin:4px 0 0">${esc(r.comment || '')}</p></div>`).join('')
    : `<p class="muted">${Number(x.rating_count) ? `Rated ${Number(x.rating).toFixed(1)}/5 by ${x.rating_count} clients before joining BuildBid. Written reviews appear after projects completed on the platform.` : 'No reviews yet.'}</p>`}
          </div>
        </div>
        <div class="stack sticky">
          <div class="card"><h3>Contact</h3>
            ${state.user ? `<dl class="kv" style="grid-template-columns:70px 1fr"><dt>Phone</dt><dd>${esc(x.phone || '—')}</dd><dt>Email</dt><dd style="word-break:break-all">${esc(x.email || '—')}</dd></dl>` : '<p class="muted">Log in to see contact details.</p>'}
            ${canHire ? '<button class="btn" id="hireBtn" style="width:100%;margin-top:14px">Send enquiry</button>' : !state.user ? `<a class="btn" style="width:100%" href="#/login?next=${encodeURIComponent(location.hash)}">Log in to contact</a>` : ''}
          </div>
        </div>
      </div>`;
    const hb = $('#hireBtn');
    if (hb) {
      hb.onclick = async () => {
        let projects = [];
        if (state.user.role === 'customer') projects = (await api('/projects?mine=1')).filter((p) => !['completed', 'cancelled'].includes(p.status));
        modal(`<h2>Enquiry to ${esc(x.company || x.name)}</h2>
          <form id="hf">${projects.length ? `<div class="field"><label>Related project</label><select name="project_id"><option value="">None</option>${projects.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div>` : ''}
            <div class="field"><label>Message</label><textarea name="message" rows="4" required placeholder="Describe the work, location and when you need it."></textarea></div>
            <div class="btn-row"><button class="btn" type="submit">Send enquiry</button><button class="btn secondary" type="button" data-close>Cancel</button></div></form>`, (card, close) => {
          onSubmit($('#hf', card), async (d) => { await api('/hire-requests', { method: 'POST', body: { ...d, to_user: x.id } }); close(); toast('Enquiry sent — they will be notified'); });
        });
      };
    }
  }, 'professionals');

  // ---------- Materials ----------
  route('/materials', async (p, q) => {
    const regionId = q.region_id || await defaultRegionId();
    const [{ region, rates }, products] = await Promise.all([api(`/regions/${regionId}/rates`), api(`/materials?region_id=${regionId}`)]);
    app().innerHTML = `
      <div class="page-head"><div><h1>Materials & local rates</h1><p>Reference rates used by the estimator, cross-checked with live prices from suppliers in ${esc(region.city)}.</p></div>
        <form id="rf" style="min-width:220px"><select name="region_id" aria-label="City">${await regionOptions(regionId)}</select></form></div>
      <div class="split wide-left">
        <div class="card">
          <div class="card-head"><h3>Reference rates — ${esc(region.city)}, ${esc(region.state)}</h3><small>Labour: ${inr(region.labour_rate_sqft)}/sq ft</small></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Material</th><th>Unit</th><th class="num">Reference</th><th class="num">Best supplier price</th><th>Updated</th></tr></thead>
            <tbody>${rates.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="num">${inr(r.rate)}</td>
              <td class="num">${r.market ? `${inr(r.market.min_price)} <small>(${r.market.offers})</small>` : '<small class="muted">—</small>'}</td><td><small>${date(r.updated_at)}</small></td></tr>`).join('')}</tbody>
          </table></div>
          <p class="muted" style="font-size:12.5px;margin:12px 0 0">${esc(rates[0] ? rates[0].source : '')}</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Supplier listings</h3>${state.user && state.user.role === 'supplier' ? '<a class="btn sm" href="#/dashboard">Manage my listings</a>' : ''}</div>
          ${products.length ? products.map((x) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--line)">
              <div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(x.brand ? x.brand + ' — ' : '')}${esc(x.name)}</b><b style="white-space:nowrap">${inr(x.price)}<small>/${esc(x.unit)}</small></b></div>
              <div class="meta"><span>${esc(x.company || x.supplier_name)}</span>${verifiedTag(x.verified)}${x.min_order ? `<span>Min. ${esc(x.min_order)}</span>` : ''}
                ${x.vs_reference_pct !== null ? `<span class="badge ${x.vs_reference_pct <= 0 ? 'green' : 'amber'}">${x.vs_reference_pct > 0 ? '+' : ''}${x.vs_reference_pct}% vs ref.</span>` : ''}</div>
              ${x.supplier_phone ? `<small>📞 ${esc(x.supplier_phone)}</small>` : ''}
            </div>`).join('') : `<div class="empty"><p>No suppliers listed in ${esc(region.city)} yet.</p></div>`}
          ${!state.user ? '<p class="muted" style="font-size:13px;margin-top:10px">Log in to see supplier phone numbers.</p>' : ''}
        </div>
      </div>`;
    $('#rf select').onchange = (e) => go('#/materials?region_id=' + e.target.value);
  }, 'materials');

  // ---------- Tenders ----------
  route('/tenders', async (p, q) => {
    const states = [...new Set((await BB.regions()).map((r) => r.state))].sort();
    app().innerHTML = `
      <div class="page-head"><div><h1>Tender discovery</h1><p>Government, institutional and private construction tenders in one place. Save the ones you want to bid on.</p></div></div>
      <div class="banner">These are <b>sample listings</b> that show how tenders appear on BuildBid. In production this feed is populated from official portals (CPPP, GeM and state e-procurement sites) — always download the official document from the source before bidding.</div>
      <form class="filters" id="tf">
        <input type="search" name="q" placeholder="Search title, organisation or location" value="${esc(q.q || '')}">
        <select name="type"><option value="">All types</option>${['government', 'institutional', 'private'].map((t) => `<option value="${t}" ${q.type === t ? 'selected' : ''}>${cap(t)}</option>`).join('')}</select>
        <select name="state"><option value="">All states</option>${states.map((s) => `<option ${q.state === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        ${state.user ? `<label class="check" style="margin:0"><input type="checkbox" name="saved" ${q.saved === '1' ? 'checked' : ''}> Saved only</label>` : ''}
        <button class="btn secondary" type="submit">Filter</button>
      </form>
      <div id="tlist"><div class="loading">Loading…</div></div>`;
    $('#tf').onsubmit = (e) => { e.preventDefault(); const d = BB.formData(e.target); go('#/tenders?' + new URLSearchParams({ ...d, saved: d.saved ? '1' : '' })); };
    const list = await api('/tenders?' + new URLSearchParams(q));
    $('#tlist').innerHTML = list.length ? list.map((t) => {
      const dl = daysLeft(t.closing_date);
      return `<div class="list-item tender">
        <div style="min-width:0"><div class="btn-row" style="gap:6px;margin-bottom:6px"><span class="badge ${t.tender_type === 'government' ? 'navy' : t.tender_type === 'institutional' ? '' : 'gray'}">${cap(t.tender_type)}</span><span class="badge gray">${esc(t.category || '')}</span>${Number(t.is_sample) ? '<span class="badge amber">Sample</span>' : ''}</div>
          <h3>${esc(t.title)}</h3>
          <div class="meta"><span>${esc(t.organization)}</span><span>${icon('pin', 14)} ${esc(t.location)}, ${esc(t.state)}</span><span>Source: ${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(t.source_name)}</a>` : esc(t.source_name)}</span></div></div>
        <div class="right">
          <small>Estimated value</small><div class="amount">${t.value_estimate ? inrShort(t.value_estimate) : '—'}</div>
          ${t.emd ? `<small>EMD ${inrShort(t.emd)}</small><br>` : ''}
          <span class="days" style="color:${dl <= 7 ? 'var(--red)' : 'var(--green)'}">${dl >= 0 ? `${dl} day${dl === 1 ? '' : 's'} left` : 'Closed'}</span> <small>· ${date(t.closing_date)}</small>
          ${state.user ? `<div style="margin-top:8px"><button class="btn ${t.saved ? '' : 'secondary'} sm" data-save="${t.id}">${icon('bookmark', 15)} ${t.saved ? 'Saved' : 'Save'}</button></div>` : ''}
        </div></div>`;
    }).join('') : '<div class="card empty"><h3>No tenders match</h3><p>Try clearing filters.</p></div>';
    $$('[data-save]').forEach((b) => {
      b.onclick = async () => {
        if (!state.user) return go('#/login');
        const r = await api(`/tenders/${b.dataset.save}/bookmark`, { method: 'POST' });
        b.className = `btn ${r.saved ? '' : 'secondary'} sm`; b.innerHTML = `${icon('bookmark', 15)} ${r.saved ? 'Saved' : 'Save'}`;
        toast(r.saved ? 'Tender saved' : 'Removed from saved');
      };
    });
  }, 'tenders');
})();
