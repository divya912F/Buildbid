/* AI cost estimation */
(() => {
  const { route, app, api, esc, inr, inrShort, num, regionOptions, defaultRegionId, onSubmit, $, cap } = BB;

  // Shared estimate inputs (used by the estimator and by "post a project").
  BB.estimateFields = async (v = {}) => `
    <div class="grid-form">
      <div class="field"><label for="region_id">City / region</label><select id="region_id" name="region_id" required>${await regionOptions(v.region_id || await defaultRegionId())}</select></div>
      <div class="field"><label for="area_per_floor">Built-up area per floor <span class="hint">(sq ft)</span></label><input id="area_per_floor" name="area_per_floor" type="number" min="100" max="200000" step="10" value="${esc(v.area_per_floor || 1200)}" required></div>
      <div class="field"><label for="floors">Number of floors <span class="hint">(incl. ground)</span></label><input id="floors" name="floors" type="number" min="1" max="40" value="${esc(v.floors || 2)}" required></div>
      <div class="field"><label>&nbsp;</label><label class="check" style="padding:10px 0"><input type="checkbox" name="basement" ${v.basement ? 'checked' : ''}> Include a basement</label></div>
      <div class="field full"><label>Construction quality</label>
        <div class="seg">
          ${[['basic', 'Basic', 'Economical, durable finishes'], ['standard', 'Standard', 'Branded materials, vitrified tiles'], ['premium', 'Premium', 'Marble/granite, premium fittings']]
    .map(([k, l, d]) => `<input type="radio" id="q_${k}" name="quality" value="${k}" ${(v.quality || 'standard') === k ? 'checked' : ''}><label for="q_${k}">${l}<small class="muted">${d}</small></label>`).join('')}
        </div></div>
      <div class="field full"><label>Building type</label>
        <div class="seg two">
          ${[['residential', 'Residential', 'House, villa, builder floor'], ['commercial', 'Commercial', 'Shops, offices, mixed use']]
    .map(([k, l, d]) => `<input type="radio" id="t_${k}" name="building_type" value="${k}" ${(v.building_type || 'residential') === k ? 'checked' : ''}><label for="t_${k}">${l}<small class="muted">${d}</small></label>`).join('')}
        </div></div>
    </div>`;

  // Full estimate report (shared with project pages).
  BB.renderEstimate = (e, { compact = false, stages = null, caption = null } = {}) => {
    const maxPhase = Math.max(...e.phases.map((p) => p.cost));
    const ml = e.models && e.models.ml;
    const conf = { High: 'green', Medium: 'amber', Low: 'red' }[e.confidence] || '';
    const drawing = BB.building({ floors: e.inputs.floors, area: e.inputs.areaPerFloor, quality: e.inputs.quality, type: e.inputs.buildingType,
      basement: e.inputs.basement, dims: true, animate: !compact, stages: stages || undefined });
    return `
      <div class="est-hero"><div class="sheet"><div class="caption">${caption || `<b>As built</b> ${esc(cap(e.inputs.quality))} ${esc(e.inputs.buildingType)}`}</div>${drawing}</div>
      <div class="est-total">
        <div class="label">Estimated construction cost · ${esc(e.inputs.region)}</div>
        <div class="big">${inrShort(e.total)}</div>
        <div class="range">Likely range ${inrShort(e.range.low)} – ${inrShort(e.range.high)} &nbsp;<span class="badge ${conf}">${esc(e.confidence)} confidence</span></div>
        <div class="kpis">
          <div><b>${inr(e.per_sqft)}</b><span>per sq ft</span></div>
          <div><b>${num(e.inputs.totalArea)} sq ft</b><span>${e.inputs.floors} floor${e.inputs.floors > 1 ? 's' : ''} · ${cap(e.inputs.quality)}</span></div>
          <div><b>~${e.timeline_months} months</b><span>typical build time</span></div>
        </div>
      </div></div>

      <div class="card">
        <div class="card-head"><h3>Phase-wise cost</h3><small>${inr(e.subtotal)} before contingency & fees</small></div>
        <div class="bars">
          ${e.phases.map((p) => `<div class="bar-row"><span>${esc(p.label)}</span><div class="track"><div class="fill" style="width:${(p.cost / maxPhase) * 100}%"></div></div><span class="val">${inrShort(p.cost)} <small>${p.share}%</small></span></div>`).join('')}
        </div>
      </div>

      ${compact ? '' : `<div class="card">
        <div class="card-head"><h3>Material & labour breakdown</h3><small>Quantities by standard thumb rules</small></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Cost</th></tr></thead>
          <tbody>
            ${e.materials.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${num(m.quantity)} ${esc(m.unit)}</td><td class="num">${inr(m.rate)}</td><td class="num">${inr(m.cost)}</td></tr>`).join('')}
            <tr><td>Labour (contract rate)</td><td class="num">${num(e.inputs.totalArea)} sq ft</td><td class="num">—</td><td class="num">${inr(e.labour)}</td></tr>
            <tr><td>Contingency</td><td class="num"></td><td class="num">5%</td><td class="num">${inr(e.contingency)}</td></tr>
            <tr><td>Design & supervision</td><td class="num"></td><td class="num">4%</td><td class="num">${inr(e.design_fees)}</td></tr>
          </tbody>
          <tfoot><tr><td>Total</td><td></td><td></td><td class="num">${inr(e.total)}</td></tr></tfoot>
        </table></div>
      </div>

      <div class="card">
        <h3>How this estimate was made</h3>
        <div class="model-box">
          <p><b>1. Quantity take-off:</b> standard material quantities per sq ft × the latest stored rates for ${esc(e.inputs.region)} gives <b>${inr(e.models.rule_based_per_sqft)}/sq ft</b>.</p>
          ${ml ? `<p><b>2. Data model:</b> a regression trained on ${ml.samples} past projects (area, floors, quality, regional cost index, building type; R² ${ml.r2}) predicts <b>${inr(ml.per_sqft)}/sq ft</b>.</p>
          <p style="margin:0"><b>3. Blend:</b> ${Math.round((1 - ml.weight) * 100)}% take-off + ${Math.round(ml.weight * 100)}% data model = <b>${inr(e.per_sqft)}/sq ft</b>. The range widens when the two disagree or the model's error is high.</p>`
    : '<p style="margin:0">Not enough historical projects yet for the data model — showing the take-off estimate only.</p>'}
        </div>
        <ul class="notes" style="margin-top:12px">${e.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>`}`;
  };

  route('/estimate', async (p, q) => {
    app().innerHTML = `
      <div class="page-head"><div><h1>AI construction cost estimator</h1>
        <p>Enter a few details about your building to get a phase-wise cost, material quantities and a realistic range — using current local rates.</p></div></div>
      <div class="split form-left">
        <form class="card sticky no-print" id="estForm"><div class="sheet plan-preview"><div class="caption"><b>Blueprint</b> updates as you type</div><div id="planDraw"></div></div>${await BB.estimateFields(q)}<button class="btn build lg" type="submit" style="width:100%">Calculate estimate</button></form>
        <div id="estOut" class="stack"><div class="card empty"><h3>Your estimate will appear here</h3><p>Adjust the blueprint on the left, then calculate. A 1,200 sq ft, two-floor house is a good place to start.</p></div></div>
      </div>`;
    const form = $('#estForm');
    const drawPlan = () => {
      const d = BB.formData(form);
      $('#planDraw').innerHTML = BB.building({ floors: d.floors, area: d.area_per_floor, quality: d.quality, type: d.building_type, basement: d.basement, dims: true,
        stages: { foundation: 0, structure: 0, masonry: 0, openings: 0, finishing: 0 } });
    };
    form.addEventListener('input', drawPlan); drawPlan();
    const run = async (data) => {
      const e = await api('/estimates', { method: 'POST', body: data });
      const qs = new URLSearchParams({ region_id: data.region_id, area_per_floor: data.area_per_floor, floors: data.floors, quality: data.quality, building_type: data.building_type, basement: data.basement ? 1 : '' });
      $('#estOut').innerHTML = BB.renderEstimate(e) + `
        <div class="btn-row no-print">
          <a class="btn" href="#/projects/new?${qs}">Get quotations from contractors</a>
          <button class="btn secondary" onclick="window.print()">Print / save as PDF</button>
          <a class="btn ghost" href="#/materials?region_id=${data.region_id}">See local material prices</a>
        </div>`;
      if (window.innerWidth < 980) $('#estOut').scrollIntoView({ behavior: 'smooth' });
    };
    onSubmit(form, run);
    if (q.area_per_floor) run(BB.formData(form)).catch((e) => BB.toast(e.message, 'error'));
  }, 'estimate');
})();
