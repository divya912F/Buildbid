/* Project management workspace: milestones, expenses, updates, alerts */
(() => {
  const { route, app, api, esc, inr, inrShort, date, ago, cap, statusBadge, needLogin, onSubmit, toast, modal, go, $, $$ } = BB;

  route('/workspace/:id', async ({ id }) => {
    if (needLogin()) return;
    const w = await api(`/projects/${id}/workspace`);
    const p = w.project; const s = w.summary;
    const active = ['awarded', 'in_progress'].includes(p.status);
    const isCustomer = w.role === 'customer';
    const spentPct = s.contract ? Math.round((s.spent / s.contract) * 100) : 0;

    app().innerHTML = `
      <a class="crumb" href="#/dashboard">← Dashboard</a>
      <div class="page-head">
        <div><h1>${esc(p.title)}</h1>
          <div class="meta"><span>${esc(p.location_text || p.city)}</span><span>Contractor: <b>${esc(w.bid ? (w.bid.company || w.bid.contractor_name) : '—')}</b></span><span>Customer: <b>${esc(p.customer_name)}</b></span></div></div>
        <div class="btn-row">${statusBadge(p.status)}
          ${p.status === 'awarded' ? '<button class="btn" id="startBtn">Mark work started</button>' : ''}
          ${isCustomer && active ? '<button class="btn success" id="completeBtn">Mark project complete</button>' : ''}
          <a class="btn secondary" href="#/projects/${p.id}">Project details</a></div>
      </div>

      <div class="ws-top">
        <div class="sheet"><div class="caption"><b>On site now</b> ${s.progress}% complete</div>${BB.building({ floors: p.floors, area: p.area_per_floor, quality: p.quality, type: p.building_type, basement: Number(p.basement), crane: p.status !== 'completed', dims: true, animate: true, stages: p.status === 'completed' ? {} : BB.stagesFromMilestones(w.milestones) })}
          <div class="legend"><span><i style="background:#8DB4F5;opacity:.6"></i>Planned</span><span><i style="background:#B9C0C9"></i>Concrete frame</span><span><i style="background:#B07A62"></i>Brickwork</span><span><i style="background:#24456F;border:1px solid #fff"></i>Windows fitted</span><span><i style="background:#EEF0EC"></i>Plastered & painted</span></div></div>
        <div class="stats">
        <div class="stat"><div class="k">Contract value</div><div class="v">${inrShort(s.contract)}</div><div class="s">${w.bid ? `${w.bid.timeline_days} days · ${w.bid.warranty_months || 0} mo warranty` : ''}</div></div>
        <div class="stat"><div class="k">Work completed</div><div class="v">${s.progress}%</div><div class="progress" style="margin-top:8px"><div style="width:${s.progress}%"></div></div></div>
        <div class="stat"><div class="k">Spent so far</div><div class="v">${inrShort(s.spent)}</div><div class="s">${spentPct}% of contract</div></div>
        <div class="stat"><div class="k">Remaining</div><div class="v" style="${s.remaining < 0 ? 'color:var(--red)' : ''}">${inrShort(s.remaining)}</div><div class="s">value of work done ≈ ${inrShort(s.earned)}</div></div>
${w.alerts.length ? `<div style="grid-column:1/-1">${w.alerts.map((a) => `<div class="alert ${a.level === 'high' ? 'high' : ''}">⚠ ${esc(a.text)}</div>`).join('')}</div>`
    : active ? '<div class="alert info" style="grid-column:1/-1">✓ No budget or schedule risks detected right now.</div>' : ''}
      </div>
      </div>


      <div class="split wide-left">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Milestones</h3><small>Budget split from the AI phase estimate</small></div>
            ${w.milestones.map((m) => `
              <div class="milestone ${m.status}">
                <div class="tick">${m.status === 'done' ? '✓' : ''}</div>
                <div style="min-width:0"><div class="mt">${esc(m.title)}</div>
                  <div class="meta"><span>Budget ${inrShort(m.budget)}</span><span style="${m.spent > m.budget ? 'color:var(--red);font-weight:600' : ''}">Spent ${inrShort(m.spent)}</span><span>Due ${date(m.due_date)}</span></div></div>
                <div>${active ? `<div style="display:flex;gap:8px;align-items:center"><input type="range" min="0" max="100" step="5" value="${m.progress}" data-ms="${m.id}" aria-label="Progress of ${esc(m.title)}"><b style="width:42px;text-align:right" data-pv="${m.id}">${m.progress}%</b></div>`
    : `<div class="progress"><div style="width:${m.progress}%"></div></div><small>${m.progress}%</small>`}</div>
              </div>`).join('') || '<p class="muted">No milestones yet.</p>'}
          </div>

          <div class="card">
            <div class="card-head"><h3>Expenses</h3><small>${w.expenses.length} entries</small></div>
            ${active ? `<form id="expForm" class="exp-form">
              <div><label>Description</label><input name="description" required placeholder="e.g. Cement 100 bags"></div>
              <div><label>Amount (₹)</label><input name="amount" type="number" min="1" required></div>
              <div><label>Category</label><select name="category"><option>material</option><option>labour</option><option>equipment</option><option>professional</option><option>other</option></select></div>
              <div><label>Milestone</label><select name="milestone_id"><option value="">—</option>${w.milestones.map((m) => `<option value="${m.id}" ${m.status === 'in_progress' ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></div>
              <button class="btn" type="submit">Add</button>
            </form>` : ''}
            <div class="table-wrap"><table>
              <thead><tr><th>Date</th><th>Description</th><th>Milestone</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead>
              <tbody>${w.expenses.map((e) => `<tr><td>${date(e.spent_on)}</td><td>${esc(e.description)}<br><small>by ${esc(e.by_name || '—')}</small></td><td><small>${esc(e.milestone_title || '—')}</small></td><td>${esc(cap(e.category))}</td><td class="num">${inr(e.amount)}</td>
                <td>${active ? `<button class="btn ghost sm" data-del="${e.id}" aria-label="Delete expense">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No expenses recorded yet.</td></tr>'}</tbody>
              ${w.expenses.length ? `<tfoot><tr><td colspan="4">Total spent</td><td class="num">${inr(s.spent)}</td><td></td></tr></tfoot>` : ''}
            </table></div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <h3>Site updates</h3>
            ${active ? `<form id="updForm" style="margin-bottom:10px"><textarea name="message" rows="2" required placeholder="Share progress, ask a question, note a decision…"></textarea><button class="btn sm" type="submit" style="margin-top:8px">Post update</button></form>` : ''}
            <ul class="feed">${w.updates.map((u) => `<li><span class="avatar">${esc(BB.initials(u.name))}</span><div><span class="who">${esc(u.name)}</span> <small>${ago(u.created_at)}</small><div>${esc(u.message)}</div></div></li>`).join('') || '<li class="muted">No updates yet.</li>'}</ul>
          </div>
          ${p.status === 'completed' ? `<div class="card"><h3>Completed</h3><p>Final cost: <b>${inr(p.actual_cost)}</b> (${p.actual_cost > s.contract ? '+' : ''}${(((p.actual_cost - s.contract) / s.contract) * 100).toFixed(1)}% vs contract).</p><p class="muted" style="font-size:14px">This project's actual cost now helps improve BuildBid's estimates for ${esc(p.city)}.</p></div>` : ''}
        </div>
      </div>`;

    // Milestone sliders (save on release)
    $$('input[data-ms]').forEach((r) => {
      r.oninput = () => { $(`[data-pv="${r.dataset.ms}"]`).textContent = r.value + '%'; };
      r.onchange = async () => { try { await api(`/milestones/${r.dataset.ms}`, { method: 'PUT', body: { progress: Number(r.value) } }); toast('Progress saved'); BB.render(); } catch (e) { toast(e.message, 'error'); } };
    });
    const ef = $('#expForm'); if (ef) onSubmit(ef, async (d) => { await api(`/projects/${id}/expenses`, { method: 'POST', body: d }); toast('Expense added'); BB.render(); });
    $$('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this expense?')) return; await api(`/expenses/${b.dataset.del}`, { method: 'DELETE' }); BB.render(); }; });
    const uf = $('#updForm'); if (uf) onSubmit(uf, async (d) => { await api(`/projects/${id}/updates`, { method: 'POST', body: d }); toast('Update posted'); BB.render(); });
    const sb = $('#startBtn'); if (sb) sb.onclick = async () => { await api(`/projects/${id}/start`, { method: 'POST' }); toast('Project marked as started'); BB.render(); };
    const cb = $('#completeBtn');
    if (cb) {
      cb.onclick = () => modal(`<h2>Complete project</h2><p class="muted">Confirm the final cost and rate your contractor. The actual cost (anonymised) improves future estimates.</p>
        <form id="cf"><div class="field"><label>Final cost paid (₹)</label><input name="actual_cost" type="number" min="1" value="${Math.round(Math.max(s.spent, s.contract))}" required></div>
          <div class="field"><label>Rate ${esc(w.bid ? (w.bid.company || w.bid.contractor_name) : 'the contractor')}</label>
            <div class="seg" style="grid-template-columns:repeat(5,1fr)">${[1, 2, 3, 4, 5].map((n) => `<input type="radio" id="r${n}" name="rating" value="${n}" ${n === 5 ? 'checked' : ''}><label for="r${n}" style="text-align:center">${n}★</label>`).join('')}</div></div>
          <div class="field"><label>Review <span class="hint">(optional)</span></label><textarea name="comment" rows="3"></textarea></div>
          <div class="btn-row"><button class="btn success" type="submit">Complete project</button><button class="btn secondary" type="button" data-close>Cancel</button></div></form>`, (card, close) => {
        onSubmit($('#cf', card), async (d) => { await api(`/projects/${id}/complete`, { method: 'POST', body: d }); close(); toast('Project completed — thank you for the review!'); BB.render(); });
      });
    }
  }, null);
})();
