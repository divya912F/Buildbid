/* BuildBid front-end core: API client, session, router, formatting & UI helpers. */
window.BB = (() => {
  const state = {
    token: localStorage.getItem('bb_token') || null,
    user: JSON.parse(localStorage.getItem('bb_user') || 'null'),
    regions: null,
  };
  const routes = [];
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = () => $('#app');

  // ---------- API ----------
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401 && state.token && path !== '/auth/login') { setSession(null); }
    if (!res.ok) { const err = new Error((data && data.error) || `Request failed (${res.status})`); err.status = res.status; throw err; }
    return data;
  }

  function setSession(data) {
    if (data) { state.token = data.token; state.user = data.user; localStorage.setItem('bb_token', data.token); localStorage.setItem('bb_user', JSON.stringify(data.user)); }
    else { state.token = null; state.user = null; localStorage.removeItem('bb_token'); localStorage.removeItem('bb_user'); }
    renderNav();
  }

  async function regions() {
    if (!state.regions) state.regions = await api('/regions');
    return state.regions;
  }

  // ---------- Formatting ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('en-IN');
  const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
  function inrShort(n) {
    n = Number(n || 0); const a = Math.abs(n);
    if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
    if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return inr(n);
  }
  const parseDate = (s) => (s instanceof Date ? s : new Date(String(s).length <= 10 ? s + 'T00:00:00' : String(s).replace(' ', 'T')));
  const date = (s) => (s ? parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  function ago(s) {
    const d = (Date.now() - parseDate(s).getTime()) / 1000;
    if (d < 60) return 'just now'; if (d < 3600) return `${Math.floor(d / 60)} min ago`;
    if (d < 86400) return `${Math.floor(d / 3600)} h ago`; if (d < 86400 * 30) return `${Math.floor(d / 86400)} d ago`;
    return date(s);
  }
  const daysLeft = (s) => Math.ceil((parseDate(s).getTime() - Date.now()) / 86400000);
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const cap = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const stars = (r) => { const n = Math.round(Number(r) || 0); return `<span class="stars" aria-label="${Number(r).toFixed(1)} out of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };

  const CATEGORY_LABELS = {
    contractor: 'Contractor', civil_engineer: 'Civil Engineer', architect: 'Architect', structural_engineer: 'Structural Engineer',
    mason: 'Mason', plumber: 'Plumber', electrician: 'Electrician', carpenter: 'Carpenter', painter: 'Painter', supplier: 'Supplier',
  };
  const STATUS_BADGE = { open: 'green', awarded: '', in_progress: 'amber', completed: 'navy', cancelled: 'gray', submitted: '', accepted: 'green', rejected: 'gray', withdrawn: 'gray', pending: 'amber', declined: 'gray', done: 'green' };
  const statusBadge = (s) => `<span class="badge ${STATUS_BADGE[s] ?? ''} status">${esc(cap(s))}</span>`;
  const verifiedTag = (v) => (Number(v) ? '<span class="verified" title="Verified by BuildBid">✔ Verified</span>' : '');

  const ICONS = {
    estimate: '<path d="M4 4h16v16H4z M8 8h8 M8 12h3 M13 12h3 M8 16h3 M13 16h3" />',
    find: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
    bid: '<path d="m14 4 6 6-3 3-6-6zM11 7l-7 7 3 3 7-7M3 21h10"/>',
    compare: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    manage: '<path d="M9 4h6v3H9zM6 6H4v15h16V6h-2M8 12h8M8 16h5"/>',
    tender: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    material: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.5 5.5"/>',
    ai: '<path d="M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5 4 4 0 0 0 8 0 3 3 0 0 0 2-5 3 3 0 0 0-2-5V7a4 4 0 0 0-4-4zM12 3v18"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  };
  const icon = (name, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------- UI helpers ----------
  let toastTimer;
  function toast(msg, type = 'ok') {
    const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type === 'error' ? 'error' : ''}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }
  function modal(html, onMount) {
    const m = $('#modal'); const card = $('.modal-card', m);
    card.innerHTML = html; m.hidden = false;
    const close = () => { m.hidden = true; card.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.onclick = (e) => { if (e.target === m) close(); };
    $$('[data-close]', card).forEach((b) => { b.onclick = close; });
    const first = $('input, select, textarea, button', card); if (first) first.focus();
    if (onMount) onMount(card, close);
    return close;
  }
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    }
    return out;
  }
  // Submit helper: disables button, shows server errors as a toast.
  function onSubmit(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form); const label = btn && btn.innerHTML;
      if (btn) { btn.disabled = true; btn.innerHTML = 'Please wait…'; }
      try { await handler(formData(form), form); } catch (err) { toast(err.message, 'error'); } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = label; } }
    });
  }
  async function regionOptions(selected, { any = false } = {}) {
    const list = await regions();
    let html = any ? '<option value="">All cities</option>' : '';
    let lastState = null;
    for (const r of list) {
      if (r.state !== lastState) { if (lastState) html += '</optgroup>'; html += `<optgroup label="${esc(r.state)}">`; lastState = r.state; }
      html += `<option value="${r.id}" ${String(selected) === String(r.id) ? 'selected' : ''}>${esc(r.city)}</option>`;
    }
    return html + '</optgroup>';
  }
  async function defaultRegionId() {
    const list = await regions();
    const byCity = state.user && list.find((r) => r.city.toLowerCase() === String(state.user.city || '').toLowerCase());
    return (byCity || list.find((r) => r.city === 'Noida') || list[0]).id;
  }
  function needLogin(roles) {
    if (!state.user) { go('#/login?next=' + encodeURIComponent(location.hash)); return true; }
    if (roles && !roles.includes(state.user.role)) {
      app().innerHTML = `<div class="card empty"><h3>Not available for your account type</h3><p>This page is for ${roles.map(cap).join(' / ')} accounts.</p><a class="btn" href="#/dashboard">Go to dashboard</a></div>`;
      return true;
    }
    return false;
  }

  // ---------- Router ----------
  function route(pattern, handler, nav) {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ re, keys, handler, nav });
  }
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  const query = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

  async function render() {
    const path = (location.hash.slice(1) || '/').split('?')[0];
    $('#nav').classList.remove('open');
    for (const r of routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
      app().innerHTML = '<div class="loading">Loading…</div>';
      window.scrollTo(0, 0);
      try { await r.handler(params, query()); } catch (e) {
        app().innerHTML = `<div class="card empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn secondary" href="#/">Back to home</a></div>`;
      }
      document.title = `BuildBid — ${($('h1', app()) || {}).textContent || 'Construction made clear'}`;
      return;
    }
    app().innerHTML = '<div class="card empty"><h3>Page not found</h3><a class="btn" href="#/">Go home</a></div>';
  }

  // ---------- Nav & notifications ----------
  function renderNav() {
    const right = $('#navRight');
    if (!state.user) {
      right.innerHTML = '<a class="btn ghost" style="color:#fff" href="#/login">Log in</a><a class="btn light sm" href="#/register">Sign up</a>';
      return;
    }
    right.innerHTML = `<button class="bell" id="bell" aria-label="Notifications">${icon('bell', 18)}<span class="dot" id="bellDot" hidden></span></button>
      <a class="user-chip" href="#/dashboard" title="${esc(state.user.name)} (${esc(state.user.role)})"><span class="avatar">${esc(initials(state.user.name))}</span><span class="nm">${esc(state.user.name.split(' ')[0])}</span></a>`;
    $('#bell').onclick = toggleNotifications;
    refreshBell();
  }
  async function refreshBell() {
    if (!state.user) return;
    try {
      const list = await api('/notifications');
      const unread = list.filter((n) => !Number(n.is_read)).length;
      const dot = $('#bellDot'); if (dot) { dot.hidden = !unread; dot.textContent = unread > 9 ? '9+' : unread; }
      return list;
    } catch { return []; }
  }
  async function toggleNotifications(e) {
    e.stopPropagation();
    const existing = $('.notif-panel'); if (existing) { existing.remove(); return; }
    const list = await refreshBell();
    const panel = document.createElement('div'); panel.className = 'notif-panel';
    panel.innerHTML = list.length ? list.map((n) => `<a class="item ${Number(n.is_read) ? '' : 'unread'}" href="${esc(n.link || '#/dashboard')}">${esc(n.message)}<small>${ago(n.created_at)}</small></a>`).join('')
      : '<div class="empty">No notifications yet.</div>';
    document.body.appendChild(panel);
    const close = () => { panel.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
    if (list.some((n) => !Number(n.is_read))) { await api('/notifications/read', { method: 'POST' }); const dot = $('#bellDot'); if (dot) dot.hidden = true; }
  }

  function start() {
    $('#navToggle').onclick = () => { const n = $('#nav'); n.classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', n.classList.contains('open')); };
    renderNav();
    window.addEventListener('hashchange', render);
    render();
    setInterval(refreshBell, 60000);
  }

  return {
    state, api, setSession, regions, regionOptions, defaultRegionId, needLogin, route, go, query, render, start, refreshBell,
    $, $$, app, esc, num, inr, inrShort, date, ago, daysLeft, initials, cap, stars, statusBadge, verifiedTag, icon, toast, modal, formData, onSubmit,
    CATEGORY_LABELS,
  };
})();
