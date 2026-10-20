/* Auth, role dashboards, profile, admin */
(() => {
  const { route, app, api, state, esc, inr, inrShort, num, date, ago, cap, stars, statusBadge, verifiedTag, regionOptions, defaultRegionId,
    needLogin, onSubmit, toast, go, setSession, $, $$, CATEGORY_LABELS } = BB;

  // ---------- Login ----------
  route('/login', async (p, q) => {
    if (state.user) return go('#/dashboard');
    app().innerHTML = `
      <div class="auth-wrap"><div class="card">
        <h1>Welcome back</h1><p class="muted">Log in to manage projects, quotations and enquiries.</p>
        <form id="lf"><div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn lg" type="submit" style="width:100%">Log in</button></form>
        <p style="margin:16px 0 0;text-align:center">New to BuildBid? <a href="#/register">Create an account</a></p>
        <hr><p class="muted" style="font-size:13.5px;margin:0">Demo: <code>priya@demo.in</code> (customer), <code>ravi@demo.in</code> (contractor), <code>om@demo.in</code> (supplier), <code>admin@buildbid.in</code> — password <code>demo123</code></p>
      </div></div>`;
    onSubmit($('#lf'), async (d) => {
      setSession(await api('/auth/login', { method: 'POST', body: d }));
      toast(`Welcome back, ${state.user.name.split(' ')[0]}!`);
      go(q.next ? decodeURIComponent(q.next) : '#/dashboard');
    });
  });

  // ---------- Register ----------
  const ROLE_CARDS = [
    ['customer', 'Homeowner / Customer', 'Estimate costs, collect quotations, manage your build'],
    ['contractor', 'Contractor', 'Discover projects and tenders, submit quotations'],
    ['professional', 'Engineer / Skilled professional', 'Architects, engineers, masons, plumbers, electricians…'],
    ['supplier', 'Material supplier', 'List materials and prices for your city'],
  ];
  route('/register', async (p, q) => {
    if (state.user) return go('#/dashboard');
    const role = q.role || 'customer';
    const regions = await BB.regions();
    app().innerHTML = `
      <div class="auth-wrap" style="max-width:640px"><div class="card">
        <h1>Create your BuildBid account</h1>
        <form id="rf">
          <div class="field"><label>I am a…</label><div class="seg two">${ROLE_CARDS.map(([k, l, d]) => `<input type="radio" id="role_${k}" name="role" value="${k}" ${role === k ? 'checked' : ''}><label for="role_${k}">${l}<small class="muted">${d}</small></label>`).join('')}</div></div>
          <div class="grid-form">
            <div class="field"><label>Full name</label><input name="name" required autocomplete="name"></div>
            <div class="field"><label>Phone</label><input name="phone" type="tel" pattern="[0-9+ ]{10,15}" placeholder="10-digit mobile"></div>
            <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
            <div class="field"><label>Password <span class="hint">(min. 6 characters)</span></label><input name="password" type="password" minlength="6" required autocomplete="new-password"></div>
            <div class="field full"><label>City</label><select name="city">${regions.map((r) => `<option>${esc(r.city)}</option>`).join('')}</select></div>
          </div>
          <div id="proFields"></div>
          <button class="btn lg" type="submit" style="width:100%">Create account</button>
        </form>
        <p style="margin:16px 0 0;text-align:center">Already registered? <a href="#/login">Log in</a></p>
      </div></div>`;
    const form = $('#rf');
    const renderPro = () => {
      const r = BB.formData(form).role;
      $('#proFields').innerHTML = r === 'customer' ? '' : `<div class="grid-form">
        ${r === 'professional' ? `<div class="field"><label>Profession</label><select name="category">${Object.entries(CATEGORY_LABELS).filter(([k]) => !['contractor', 'supplier'].includes(k)).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>${r === 'professional' ? 'Firm name <span class="hint">(optional)</span>' : 'Company / firm name'}</label><input name="company" ${r !== 'professional' ? 'required' : ''}></div>
        <div class="field"><label>Years of experience</label><input name="experience_years" type="number" min="0" max="60" value="0"></div>
        ${r === 'professional' ? '<div class="field"><label>Day rate (₹) <span class="hint">(optional)</span></label><input name="day_rate" type="number" min="0"></div>' : ''}
        <div class="field"><label>Licence / registration no. <span class="hint">(for verification)</span></label><input name="licence_no"></div>
        <div class="field full"><label>${r === 'supplier' ? 'Materials you supply' : 'Skills & services'}</label><input name="skills" placeholder="${r === 'supplier' ? 'Cement, TMT steel, bricks…' : 'e.g. RCC houses, renovation, waterproofing'}"></div>
      </div>`;
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'role') renderPro(); });
    renderPro();
    onSubmit(form, async (d) => {
      setSession(await api('/auth/register', { method: 'POST', body: d }));
      toast('Account created — welcome to BuildBid!');
      go(d.role === 'customer' ? '#/estimate' : '#/dashboard');
    });
  });

  // ---------- Dashboard ----------
  const enquiryList = (list) => list.length ? list.map((h) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(h.from_name)}</b>${statusBadge(h.status)}</div>
      <small>${ago(h.created_at)}${h.project_title ? ` · re: ${esc(h.project_title)}` : ''}${h.from_phone ? ` · 📞 ${esc(h.from_phone)}` : ''}</small>
      <p style="margin:4px 0 6px;font-size:14px">${esc(h.message || '')}</p>
      ${h.status === 'pending' ? `<div class="btn-row"><button class="btn sm" data-hire="${h.id}" data-st="accepted">Accept</button><button class="btn secondary sm" data-hire="${h.id}" data-st="declined">Decline</button></div>` : ''}
    </div>`).join('') : '<p class="muted">No enquiries yet.</p>';

  const profileCard = (pr) => `<div class="card">
    <div class="card-head"><h3>Your public profile</h3><a class="btn ghost sm" href="#/profile">Edit</a></div>
    <p style="margin:0 0 6px"><b>${esc(pr.company || state.user.name)}</b> ${verifiedTag(pr.verified)}</p>
    <div class="meta"><span>${esc(CATEGORY_LABELS[pr.category] || cap(pr.category))}</span><span>${pr.experience_years} yrs</span>
      <span>${Number(pr.rating_count) ? `${stars(pr.rating)} ${Number(pr.rating).toFixed(1)}` : 'No ratings yet'}</span></div>
    ${!Number(pr.verified) ? '<div class="alert" style="margin:12px 0 0">Verification pending. Add your licence/registration number to your profile — verified profiles rank higher and win more work.</div>' : ''}
    <a class="btn secondary sm" style="margin-top:12px" href="#/professionals/${state.user.id}">View as customers see it</a>
  </div>`;

  route('/dashboard', async () => {
    if (needLogin()) return;
    const d = await api('/dashboard');
    const u = state.user;
    const first = u.name.split(' ')[0];
    let html = '';

    if (u.role === 'customer') {
      const active = d.projects.filter((p) => ['awarded', 'in_progress'].includes(p.status));
      const quotes = d.projects.reduce((s, p) => s + Number(p.bid_count), 0);
      html = `
        <div class="page-head"><div><h1>Namaste, ${esc(first)}</h1><p>Your projects, quotations and builds in one place.</p></div>
          <div class="btn-row"><a class="btn secondary" href="#/estimate">New estimate</a><a class="btn" href="#/projects/new">+ Post a project</a></div></div>
        <div class="grid g4" style="margin-bottom:18px">
          <div class="stat"><div class="k">Projects</div><div class="v">${d.projects.length}</div></div>
          <div class="stat"><div class="k">Quotations received</div><div class="v">${quotes}</div></div>
          <div class="stat"><div class="k">Under construction</div><div class="v">${active.length}</div></div>
          <div class="stat"><div class="k">Saved estimates</div><div class="v">${d.estimates}</div></div>
        </div>
        <div class="split wide-left"><div>
          <h2>My projects</h2>
          ${d.projects.map((p) => `<div class="list-item with-thumb"><a class="thumb" href="#/projects/${p.id}" aria-hidden="true" tabindex="-1">${BB.building({ floors: p.floors, area: p.area_per_floor, quality: p.quality, type: p.building_type, basement: Number(p.basement), stages: BB.stagesFromStatus(p.status), fit: true })}</a><div class="body"><h3><a href="#/projects/${p.id}">${esc(p.title)}</a></h3>
              <div class="meta"><span>${esc(p.city)}</span><span>Estimate ${inrShort(p.estimated_cost)}</span><span>${p.bid_count} quotation${p.bid_count == 1 ? '' : 's'}</span><span>Posted ${date(p.created_at)}</span></div></div>
            <div class="right">${statusBadge(p.status)}<div style="margin-top:10px">
              ${p.status === 'open' && p.bid_count > 0 ? `<a class="btn sm" href="#/projects/${p.id}/compare">Compare ${p.bid_count} quotes</a>` : ''}
              ${['awarded', 'in_progress', 'completed'].includes(p.status) ? `<a class="btn sm" href="#/workspace/${p.id}">Workspace</a>` : ''}
              ${p.status === 'open' && !Number(p.bid_count) ? '<small>Waiting for quotations</small>' : ''}</div></div></div>`).join('')
        || '<div class="card empty"><h3>No projects yet</h3><p>Start with a free estimate, then post it to receive quotations.</p><a class="btn" href="#/estimate">Get an estimate</a></div>'}
        </div>
        <div class="stack"><div class="card"><h3>Enquiries you sent</h3>
          ${d.hires.length ? d.hires.map((h) => `<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px"><span><a href="#/professionals/${h.to_user}">${esc(h.to_name)}</a><br><small>${ago(h.created_at)}</small></span>${statusBadge(h.status)}</div>`).join('') : '<p class="muted">Find an engineer, architect or tradesperson in the directory.</p>'}
          <a class="btn secondary sm" style="margin-top:12px" href="#/professionals">Browse professionals</a></div></div>
        </div>`;
    } else if (u.role === 'contractor') {
      const won = d.bids.filter((b) => b.status === 'accepted').length;
      const pending = d.bids.filter((b) => b.status === 'submitted').length;
      html = `
        <div class="page-head"><div><h1>Namaste, ${esc(first)}</h1><p>${esc(d.profile && d.profile.company || '')}</p></div>
          <div class="btn-row"><a class="btn secondary" href="#/tenders">Browse tenders</a><a class="btn" href="#/projects">Find projects (${d.open_count} open)</a></div></div>
        <div class="grid g4" style="margin-bottom:18px">
          <div class="stat"><div class="k">Quotations sent</div><div class="v">${d.bids.length}</div></div>
          <div class="stat"><div class="k">Awaiting decision</div><div class="v">${pending}</div></div>
          <div class="stat"><div class="k">Won</div><div class="v">${won}</div><div class="s">${d.bids.length ? Math.round((won / d.bids.length) * 100) : 0}% win rate</div></div>
          <div class="stat"><div class="k">Active sites</div><div class="v">${d.active.filter((p) => p.status !== 'completed').length}</div></div>
        </div>
        <div class="split wide-left"><div class="stack">
          ${d.active.length ? `<div class="card"><h3>Your projects</h3>${d.active.map((p) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)"><span><b>${esc(p.title)}</b><br><small>${esc(p.city)} · ${statusBadge(p.status)}</small></span><a class="btn sm" href="#/workspace/${p.id}">Workspace</a></div>`).join('')}</div>` : ''}
          <div class="card"><h3>My quotations</h3><div class="table-wrap"><table>
            <thead><tr><th>Project</th><th class="num">Amount</th><th class="num">Days</th><th>Status</th></tr></thead>
            <tbody>${d.bids.map((b) => `<tr><td><a href="#/projects/${b.project_id}">${esc(b.title)}</a><br><small>${esc(b.city)} · ${date(b.created_at)}</small></td><td class="num">${inr(b.amount)}</td><td class="num">${b.timeline_days}</td><td>${statusBadge(b.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No quotations yet — find an open project to bid on.</td></tr>'}</tbody>
          </table></div></div>
        </div>
        <div class="stack">${profileCard(d.profile)}<div class="card"><h3>Enquiries</h3>${enquiryList(d.incoming_hires)}</div></div></div>`;
    } else if (u.role === 'professional') {
      html = `<div class="page-head"><div><h1>Namaste, ${esc(first)}</h1><p>Customers and contractors can find and contact you from the directory.</p></div></div>
        <div class="split wide-left"><div class="card"><h3>Enquiries</h3>${enquiryList(d.incoming_hires)}</div><div class="stack">${profileCard(d.profile)}</div></div>`;
    } else if (u.role === 'supplier') {
      html = `<div class="page-head"><div><h1>Namaste, ${esc(first)}</h1><p>Keep your prices current — buyers see how they compare with reference rates.</p></div></div>
        <div class="split wide-left"><div class="stack">
          <div class="card"><h3>My listings</h3><div class="table-wrap"><table>
            <thead><tr><th>Product</th><th>City</th><th class="num">Price</th><th>In stock</th><th></th></tr></thead>
            <tbody>${d.products.map((x) => `<tr><td>${esc(x.brand ? x.brand + ' — ' : '')}${esc(x.name)}<br><small>per ${esc(x.unit)}${x.min_order ? ` · min ${esc(x.min_order)}` : ''}</small></td><td>${esc(x.city)}</td>
              <td class="num"><input type="number" value="${x.price}" min="0" step="0.5" data-price="${x.id}" style="width:110px;text-align:right;padding:6px 8px" aria-label="Price"></td>
              <td><input type="checkbox" data-stock="${x.id}" ${Number(x.in_stock) ? 'checked' : ''} aria-label="In stock"></td>
              <td><button class="btn ghost sm" data-rm="${x.id}" aria-label="Remove">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No listings yet.</td></tr>'}</tbody></table></div></div>
          <form class="card" id="addP"><h3>Add a listing</h3><div class="grid-form">
            <div class="field"><label>Material type</label><select name="material_key"><option value="cement">Cement</option><option value="steel">TMT steel</option><option value="sand">Sand</option><option value="aggregate">Aggregate</option><option value="bricks">Bricks</option><option value="tiles">Tiles</option><option value="paint">Paint</option><option value="plumbing">Plumbing</option><option value="">Other</option></select></div>
            <div class="field"><label>Product name</label><input name="name" required placeholder="e.g. OPC 53 grade cement"></div>
            <div class="field"><label>Brand</label><input name="brand"></div>
            <div class="field"><label>Unit</label><input name="unit" required placeholder="bag / kg / cft / nos"></div>
            <div class="field"><label>Price (₹ per unit)</label><input name="price" type="number" min="0" step="0.01" required></div>
            <div class="field"><label>City</label><select name="region_id">${await regionOptions(await defaultRegionId())}</select></div>
            <div class="field full"><label>Minimum order <span class="hint">(optional)</span></label><input name="min_order"></div>
          </div><button class="btn" type="submit">Add listing</button></form>
        </div><div class="stack">${profileCard(d.profile)}<div class="card"><h3>Enquiries</h3>${enquiryList(d.incoming_hires)}</div></div></div>`;
    } else if (u.role === 'admin') {
      html = `<div class="page-head"><div><h1>Admin</h1><p>Verify professionals and keep construction rates current.</p></div><a class="btn" href="#/admin/rates">Update rates</a></div>
        <div class="card"><h3>Pending verification (${d.pending.length})</h3><div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Type</th><th>City</th><th>Licence / Reg.</th><th>Exp.</th><th></th></tr></thead>
          <tbody>${d.pending.map((x) => `<tr><td><a href="#/professionals/${x.id}">${esc(x.company || x.name)}</a><br><small>${esc(x.email)}</small></td><td>${esc(CATEGORY_LABELS[x.category] || x.category)}</td><td>${esc(x.city || '')}</td><td>${esc(x.licence_no || '—')}</td><td>${x.experience_years} yrs</td>
            <td><button class="btn sm success" data-verify="${x.id}">Verify</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Everyone is verified.</td></tr>'}</tbody></table></div></div>`;
    }
    html += `<p style="margin-top:28px"><button class="btn ghost" id="logout">Log out</button></p>`;
    app().innerHTML = html;

    $('#logout').onclick = () => { setSession(null); toast('Logged out'); go('#/'); };
    $$('[data-hire]').forEach((b) => { b.onclick = async () => { await api(`/hire-requests/${b.dataset.hire}`, { method: 'PUT', body: { status: b.dataset.st } }); toast(`Enquiry ${b.dataset.st}`); BB.render(); }; });
    $$('[data-verify]').forEach((b) => { b.onclick = async () => { await api(`/admin/verify/${b.dataset.verify}`, { method: 'POST', body: {} }); toast('Profile verified'); BB.render(); }; });
    $$('[data-price]').forEach((i) => { i.onchange = async () => { await api(`/materials/${i.dataset.price}`, { method: 'PUT', body: { price: Number(i.value) } }); toast('Price updated'); }; });
    $$('[data-stock]').forEach((i) => { i.onchange = async () => { await api(`/materials/${i.dataset.stock}`, { method: 'PUT', body: { in_stock: i.checked } }); toast(i.checked ? 'Marked in stock' : 'Marked out of stock'); }; });
    $$('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirm('Remove this listing?')) return; await api(`/materials/${b.dataset.rm}`, { method: 'DELETE' }); BB.render(); }; });
    const ap = $('#addP'); if (ap) onSubmit(ap, async (data) => { await api('/materials', { method: 'POST', body: data }); toast('Listing added'); BB.render(); });
  }, 'dashboard');

  // ---------- Profile ----------
  route('/profile', async () => {
    if (needLogin()) return;
    const { user: u, profile: pr } = await api('/me');
    const regions = await BB.regions();
    app().innerHTML = `<a class="crumb" href="#/dashboard">← Dashboard</a>
      <div class="auth-wrap" style="max-width:680px"><form class="card" id="pf"><h1>Edit profile</h1>
        <div class="grid-form">
          <div class="field"><label>Name</label><input name="name" value="${esc(u.name)}" required></div>
          <div class="field"><label>Phone</label><input name="phone" value="${esc(u.phone || '')}"></div>
          <div class="field full"><label>City</label><select name="city">${regions.map((r) => `<option ${r.city === u.city ? 'selected' : ''}>${esc(r.city)}</option>`).join('')}</select></div>
          ${pr ? `
          ${u.role === 'professional' ? `<div class="field"><label>Profession</label><select name="category">${Object.entries(CATEGORY_LABELS).filter(([k]) => !['contractor', 'supplier'].includes(k)).map(([k, l]) => `<option value="${k}" ${pr.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
          <div class="field"><label>Company / firm</label><input name="company" value="${esc(pr.company || '')}"></div>
          <div class="field"><label>Experience (years)</label><input name="experience_years" type="number" min="0" value="${pr.experience_years || 0}"></div>
          <div class="field"><label>Day rate (₹)</label><input name="day_rate" type="number" min="0" value="${pr.day_rate || ''}"></div>
          <div class="field"><label>Licence / registration no.</label><input name="licence_no" value="${esc(pr.licence_no || '')}"></div>
          <div class="field full"><label>Skills & services</label><input name="skills" value="${esc(pr.skills || '')}"></div>
          <div class="field full"><label>About</label><textarea name="bio" rows="4">${esc(pr.bio || '')}</textarea></div>` : ''}
        </div><button class="btn" type="submit">Save profile</button></form></div>`;
    onSubmit($('#pf'), async (d) => {
      const r = await api('/me', { method: 'PUT', body: d });
      state.user = r.user; localStorage.setItem('bb_user', JSON.stringify(r.user)); BB.setSession({ token: state.token, user: r.user });
      toast('Profile saved'); go('#/dashboard');
    });
  });

  // ---------- Admin: rate management ----------
  route('/admin/rates', async (p, q) => {
    if (needLogin(['admin'])) return;
    const regionId = q.region_id || (await BB.regions())[0].id;
    const { region, rates } = await api(`/regions/${regionId}/rates`);
    app().innerHTML = `<a class="crumb" href="#/dashboard">← Admin</a>
      <div class="page-head"><div><h1>Construction rates</h1><p>Update rates from the latest CPWD DSR / State PWD SOR or market surveys. New estimates use them immediately.</p></div>
        <select id="rg" style="width:auto">${await regionOptions(regionId)}</select></div>
      <div class="card"><div class="card-head"><h3>${esc(region.city)}, ${esc(region.state)}</h3>
        <span>Labour ₹/sq ft <input id="labour" type="number" value="${region.labour_rate_sqft}" style="width:100px;padding:6px 8px"> <button class="btn sm" id="saveLabour">Save</button></span></div>
        <div class="table-wrap"><table><thead><tr><th>Material</th><th>Unit</th><th class="num">Rate (₹)</th><th>Source note</th><th>Updated</th><th></th></tr></thead>
        <tbody>${rates.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="num"><input type="number" step="0.01" value="${r.rate}" data-rate="${r.id}" style="width:110px;text-align:right;padding:6px 8px"></td>
          <td><input data-src="${r.id}" placeholder="e.g. CPWD DSR 2025, item 5.1" style="padding:6px 8px"></td><td><small>${date(r.updated_at)}</small></td><td><button class="btn sm secondary" data-save="${r.id}">Save</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#rg').onchange = (e) => go('#/admin/rates?region_id=' + e.target.value);
    $('#saveLabour').onclick = async () => { try { await api(`/regions/${regionId}`, { method: 'PUT', body: { labour_rate_sqft: Number($('#labour').value) } }); BB.state.regions = null; toast('Labour rate saved'); } catch (e) { toast(e.message, 'error'); } };
    $$('[data-save]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.save;
        try { await api(`/rates/${id}`, { method: 'PUT', body: { rate: Number($(`[data-rate="${id}"]`).value), source: $(`[data-src="${id}"]`).value || undefined } }); toast('Rate saved'); BB.render(); } catch (e) { toast(e.message, 'error'); }
      };
    });
  });
})();
