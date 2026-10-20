/* BuildBid building drawing: a parametric elevation that goes from blueprint (planned)
   to built, stage by stage. Used in the hero, estimator, workspace and project thumbnails.

   BB.building({
     floors, area, quality: 'basic'|'standard'|'premium', type: 'residential'|'commercial', basement,
     stages: { foundation, structure, masonry, openings, finishing }   // each 0..1
     crane, site, dims, animate, compact
   }) -> SVG string
*/
(() => {
  const C = {
    sheet: '#0F2C57', grid: 'rgba(255,255,255,.05)', grid2: 'rgba(255,255,255,.09)',
    plan: '#8DB4F5', ink: '#CFE0FF',
    concrete: '#B9C0C9', concreteSide: '#8E97A3', column: '#A3ACB7',
    brick: '#B07A62', brickSide: '#8D604C', mortar: 'rgba(0,0,0,.12)',
    paint: '#EEF0EC', paintSide: '#C9CEC9', trim: '#F2B705',
    glass: '#24456F', glassHi: '#5E8FCB', frame: '#F5F7FA', hole: '#0A1D3B',
    soil: '#163661', soilLine: '#2E5A94', footing: '#9AA3AE',
    scaffold: '#E3B23C', crane: '#F2B705', craneDark: '#B98A00', rebar: '#D08A4A', tank: '#1B2733',
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r = (n) => Math.round(n * 10) / 10;

  function building(o = {}) {
    const n = clamp(parseInt(o.floors, 10) || 1, 1, 40);
    const area = Number(o.area) || 1200;
    const quality = o.quality || 'standard';
    const commercial = o.type === 'commercial';
    const basement = !!o.basement && o.basement !== '0';
    const st = { foundation: 1, structure: 1, masonry: 1, openings: 1, finishing: 1, ...(o.stages || {}) };
    const W = 560; const H = 420; const ground = basement ? 318 : 334;
    const fh = Math.min(o.crane ? 44 : 50, (ground - 72) / (n + (o.crane ? 1.1 : 0.4)));
    const w = clamp(150 + Math.log2(Math.max(area, 300) / 600) * 46, 118, 290);
    const cx = o.crane ? 236 : 262;
    const x0 = cx - w / 2; const x1 = x0 + w;
    const dx = 24; const dy = -13;
    const cols = Math.max(3, Math.round(w / 52) + 1);
    const colX = Array.from({ length: cols }, (_, i) => x0 + (i * (w - 6)) / (cols - 1));
    const F = clamp(st.structure, 0, 1) * n;                 // floors framed (fractional)
    const Wl = Math.min(clamp(st.masonry, 0, 1) * n, Math.floor(F));
    const O = Math.min(clamp(st.openings, 0, 1) * n, Math.floor(Wl + 1e-9));
    const P = Math.min(clamp(st.finishing, 0, 1) * n, Math.floor(Wl + 1e-9));
    const full = F >= n - 1e-9 && P >= n - 1e-9;
    const topY = ground - n * fh;
    const anim = o.animate ? ' class="rise"' : '';
    const delay = (i) => (o.animate ? ` style="animation-delay:${120 + i * 110}ms"` : '');
    let s = '';

    // ---------- defs + sheet ----------
    const id = 'b' + Math.random().toString(36).slice(2, 7);
    s += `<defs>
      <pattern id="${id}g" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${C.grid}" stroke-width="1"/></pattern>
      <pattern id="${id}G" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="${C.grid2}" stroke-width="1"/></pattern>
      <pattern id="${id}s" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V9" stroke="${C.soilLine}" stroke-width="1.2"/></pattern>
      <pattern id="${id}k" width="12" height="6" patternUnits="userSpaceOnUse"><path d="M0 6H12M6 0V3M0 3H12M0 3V6M12 3V6" stroke="${C.mortar}" stroke-width=".8" fill="none"/></pattern>
    </defs>`;
    if (!o.bare) s += `<rect width="${W}" height="${H}" fill="${C.sheet}"/><rect width="${W}" height="${H}" fill="url(#${id}g)"/><rect width="${W}" height="${H}" fill="url(#${id}G)"/>`;
    const sx = o.bare ? -900 : 0; const sw = o.bare ? W + 1800 : W;

    // ---------- soil & foundation ----------
    s += `<rect x="${sx}" y="${ground}" width="${sw}" height="${H - ground}" fill="${C.soil}"/><rect x="${sx}" y="${ground}" width="${sw}" height="${H - ground}" fill="url(#${id}s)" opacity=".55"/>`;
    const fnd = clamp(st.foundation, 0, 1);
    const footTop = ground + (basement ? fh * 0.95 : 0) + 8;
    if (fnd < 1 && fnd > 0) s += `<path d="M${x0 - 18} ${ground} L${x0 - 6} ${footTop + 22} H${x1 + 6} L${x1 + 18} ${ground} Z" fill="${C.hole}" opacity=".7"/>`;
    if (basement) {
      if (fnd >= 0.6) s += `<rect x="${x0}" y="${ground}" width="${w}" height="${r(fh * 0.95)}" fill="${C.concrete}"/><rect x="${x0 + 6}" y="${ground + 4}" width="${w - 12}" height="${r(fh * 0.95 - 8)}" fill="${C.hole}" opacity=".55"/>`;
      else s += `<rect x="${x0}" y="${ground}" width="${w}" height="${r(fh * 0.95)}" fill="none" stroke="${C.plan}" stroke-dasharray="4 3"/>`;
    }
    const builtFootings = Math.round(fnd * cols);
    colX.forEach((x, i) => {
      const built = i < builtFootings;
      const d = `M${r(x - 12)} ${r(footTop + 18)} H${r(x + 18)} L${r(x + 11)} ${r(footTop + 6)} H${r(x - 5)} Z`;
      s += built ? `<path d="${d}" fill="${C.footing}"/><rect x="${r(x)}" y="${ground}" width="6" height="${r(footTop + 6 - ground)}" fill="${C.column}"/>`
        : `<path d="${d}" fill="none" stroke="${C.plan}" stroke-dasharray="3 3"/>`;
    });
    if (fnd >= 1) s += `<rect x="${x0 - 2}" y="${ground - 5}" width="${w + 4}" height="6" fill="${C.concrete}"/>`; // plinth beam

    // ---------- floors ----------
    const winStyle = { basic: { ww: 0.42, wh: 0.4 }, standard: { ww: 0.52, wh: 0.46 }, premium: { ww: 0.74, wh: 0.6 } }[quality] || { ww: 0.52, wh: 0.46 };
    for (let i = 0; i < n; i++) {
      const yb = ground - i * fh; const yt = yb - fh;
      const framed = i + 1 <= F + 1e-9; const partial = !framed && i < F;
      const walled = i + 1 <= Wl + 1e-9; const glazed = i + 1 <= O + 1e-9; const painted = i + 1 <= P + 1e-9;
      let g = '';
      if (!framed && !partial) {
        // Planned floor: blueprint outline
        g += `<rect x="${r(x0)}" y="${r(yt)}" width="${r(w)}" height="${r(fh)}" fill="none" stroke="${C.plan}" stroke-width="1.1" stroke-dasharray="5 4"/>`;
        g += `<path d="M${r(x1)} ${r(yt)} l${dx} ${dy} V${r(yb + dy)} L${r(x1)} ${r(yb)}" fill="none" stroke="${C.plan}" stroke-width="1" stroke-dasharray="5 4" opacity=".7"/>`;
        if (fh >= 14) for (let b = 0; b < cols - 1; b++) {
          const bx = colX[b] + 6; const bw = colX[b + 1] - colX[b] - 6;
          g += `<rect x="${r(bx + bw * (1 - winStyle.ww) / 2)}" y="${r(yt + fh * 0.28)}" width="${r(bw * winStyle.ww)}" height="${r(fh * winStyle.wh)}" fill="none" stroke="${C.plan}" stroke-width=".8" stroke-dasharray="2 3" opacity=".75"/>`;
        }
        s += `<g${anim}${delay(i)}>${g}</g>`;
        continue;
      }
      if (partial) {
        // Columns rising, no slab yet, with rebar
        const hgt = fh * clamp((F - i) * 1.2, 0.35, 0.95);
        colX.forEach((x) => { g += `<rect x="${r(x)}" y="${r(yb - hgt)}" width="6" height="${r(hgt)}" fill="${C.column}"/><path d="M${r(x + 1.5)} ${r(yb - hgt)} v-7 M${r(x + 4.5)} ${r(yb - hgt)} v-7" stroke="${C.rebar}" stroke-width="1.1"/>`; });
        g += `<path d="M${r(x0)} ${r(yt)} H${r(x1)} l${dx} ${dy}" fill="none" stroke="${C.plan}" stroke-dasharray="5 4"/>`;
        s += `<g${anim}${delay(i)}>${g}</g>`;
        continue;
      }
      // Side face
      const sideFill = painted ? C.paintSide : walled ? C.brickSide : 'rgba(10,29,59,.55)';
      g += `<path d="M${r(x1)} ${r(yb)} V${r(yt)} l${dx} ${dy} V${r(yb + dy)} Z" fill="${sideFill}"/>`;
      // Front
      if (walled) {
        g += `<rect x="${r(x0)}" y="${r(yt)}" width="${r(w)}" height="${r(fh)}" fill="${painted ? C.paint : C.brick}"/>`;
        if (!painted) g += `<rect x="${r(x0)}" y="${r(yt)}" width="${r(w)}" height="${r(fh)}" fill="url(#${id}k)"/>`;
      } else {
        g += `<rect x="${r(x0)}" y="${r(yt)}" width="${r(w)}" height="${r(fh)}" fill="${C.hole}" opacity=".55"/>`;
        // Brickwork under way on this floor: courses rising from the slab
        const part = clamp(clamp(st.masonry, 0, 1) * n - i, 0, 1);
        if (part > 0.02) { const ph = fh * Math.max(0.25, part); g += `<rect x="${r(x0)}" y="${r(yb - ph)}" width="${r(w)}" height="${r(ph)}" fill="${C.brick}"/><rect x="${r(x0)}" y="${r(yb - ph)}" width="${r(w)}" height="${r(ph)}" fill="url(#${id}k)"/>`; }
      }
      // Frame (columns + slab) — visible until plastered
      if (!painted) colX.forEach((x) => { g += `<rect x="${r(x)}" y="${r(yt)}" width="6" height="${r(fh)}" fill="${C.column}"/>`; });
      g += `<rect x="${r(x0 - 3)}" y="${r(yt - 1)}" width="${r(w + 6)}" height="${r(Math.max(2.5, fh * 0.12))}" fill="${painted ? '#DADDD8' : C.concrete}"/>`;
      g += `<path d="M${r(x1 + 3)} ${r(yt - 1)} l${dx} ${dy} v${r(Math.max(2.5, fh * 0.12))} l${-dx} ${-dy} Z" fill="${C.concreteSide}"/>`;
      // Openings
      if (walled && fh >= 12) {
        if (commercial && i === 0) {
          const gx = x0 + 10; const gw = w - 20;
          g += glazed ? `<rect x="${r(gx)}" y="${r(yt + fh * 0.22)}" width="${r(gw)}" height="${r(fh * 0.74)}" fill="${C.glass}" stroke="${C.frame}" stroke-width="1.2"/>${[1, 2, 3].map((k) => `<path d="M${r(gx + (gw * k) / 4)} ${r(yt + fh * 0.22)} v${r(fh * 0.74)}" stroke="${C.frame}" stroke-width="1"/>`).join('')}<path d="M${r(gx + 4)} ${r(yt + fh * 0.3)} l14 -4" stroke="${C.glassHi}" stroke-width="2" opacity=".6"/>`
            : `<rect x="${r(gx)}" y="${r(yt + fh * 0.22)}" width="${r(gw)}" height="${r(fh * 0.74)}" fill="${C.hole}"/>`;
          if (painted) g += `<rect x="${r(x0)}" y="${r(yt + fh * 0.08)}" width="${r(w)}" height="${r(fh * 0.1)}" fill="${C.trim}"/>`;
        } else {
          for (let b = 0; b < cols - 1; b++) {
            const bx = colX[b] + 6; const bw = colX[b + 1] - colX[b] - 6;
            const wx = bx + (bw * (1 - winStyle.ww)) / 2; const wy = yt + fh * 0.28; const wW = bw * winStyle.ww; const wH = fh * winStyle.wh;
            const isDoor = i === 0 && b === Math.floor((cols - 1) / 2) && !commercial;
            if (isDoor) {
              const dw = Math.min(bw * 0.4, 22); const ddx = bx + (bw - dw) / 2;
              g += `<rect x="${r(ddx)}" y="${r(yt + fh * 0.3)}" width="${r(dw)}" height="${r(fh * 0.7)}" fill="${glazed ? '#6B4A33' : C.hole}"/>`;
              continue;
            }
            if (glazed) {
              g += `<rect x="${r(wx)}" y="${r(wy)}" width="${r(wW)}" height="${r(wH)}" fill="${C.glass}" stroke="${C.frame}" stroke-width="1.2"/>`;
              if (quality !== 'premium') g += `<path d="M${r(wx + wW / 2)} ${r(wy)} v${r(wH)}" stroke="${C.frame}" stroke-width=".9"/>`;
              g += `<path d="M${r(wx + 2)} ${r(wy + wH * 0.35)} l${r(Math.min(8, wW / 3))} -${r(wH * 0.25)}" stroke="${C.glassHi}" stroke-width="1.5" opacity=".7"/>`;
              if (painted && quality !== 'premium') g += `<rect x="${r(wx - 3)}" y="${r(wy + wH)}" width="${r(wW + 6)}" height="2.5" fill="#C9CEC9"/>`;
              if (painted && quality === 'premium' && i > 0) g += `<path d="M${r(wx - 4)} ${r(yb - 2)} h${r(wW + 8)} M${r(wx - 4)} ${r(yb - 9)} h${r(wW + 8)}" stroke="${C.frame}" stroke-width="1"/>`;
            } else {
              g += `<rect x="${r(wx)}" y="${r(wy)}" width="${r(wW)}" height="${r(wH)}" fill="${C.hole}"/>`;
            }
          }
        }
      }
      // Rebar starters on the current top slab while structure continues
      if (i + 1 === Math.floor(F) && F < n) colX.forEach((x) => { g += `<path d="M${r(x + 1.5)} ${r(yt - 1)} v-8 M${r(x + 4.5)} ${r(yt - 1)} v-8" stroke="${C.rebar}" stroke-width="1.1"/>`; });
      s += `<g${anim}${delay(i)}>${g}</g>`;
    }

    // ---------- roof ----------
    if (full) {
      const yt = topY;
      s += `<g${anim}${delay(n)}><rect x="${r(x0 - 3)}" y="${r(yt - 8)}" width="${r(w + 6)}" height="8" fill="#DADDD8"/><path d="M${r(x1 + 3)} ${r(yt - 8)} l${dx} ${dy} v8 l${-dx} ${-dy} Z" fill="${C.paintSide}"/>`;
      if (fh >= 12) {
        const tx = x0 + w * 0.7;
        s += `<rect x="${r(x0 + w * 0.12)}" y="${r(yt - 26)}" width="${r(Math.min(46, w * 0.25))}" height="18" fill="${C.paint}"/><rect x="${r(x0 + w * 0.12 + 6)}" y="${r(yt - 21)}" width="8" height="13" fill="${C.glass}"/>`;
        s += `<rect x="${r(tx)}" y="${r(yt - 22)}" width="20" height="14" rx="3" fill="${C.tank}"/><ellipse cx="${r(tx + 10)}" cy="${r(yt - 22)}" rx="10" ry="2.5" fill="#2C3B49"/><path d="M${r(tx + 3)} ${r(yt - 16)} h14 M${r(tx + 3)} ${r(yt - 12)} h14" stroke="#2C3B49"/>`;
      }
      s += '</g>';
    }

    // ---------- scaffolding (left side, on framed but unfinished floors) ----------
    const scafTop = Math.floor(F); const scafFrom = Math.floor(P);
    if (scafTop > scafFrom && !full) {
      const yA = ground - scafTop * fh - 8; const yB = ground - scafFrom * fh;
      const p1 = x0 - 16; const p2 = x0 - 6;
      let g = `<path d="M${p1} ${r(yB)} V${r(yA)} M${p2} ${r(yB)} V${r(yA)}" stroke="${C.scaffold}" stroke-width="1.6"/>`;
      for (let k = scafFrom; k <= scafTop; k++) { const y = ground - k * fh; g += `<path d="M${p1 - 2} ${r(y)} H${p2 + 4}" stroke="${C.scaffold}" stroke-width="1.6"/>`; if (k < scafTop) g += `<path d="M${p1} ${r(y)} L${p2} ${r(y - fh)}" stroke="${C.scaffold}" stroke-width=".9" opacity=".8"/>`; }
      s += `<g opacity=".9">${g}</g>`;
    }

    // ---------- tower crane ----------
    let craneTop = null;
    if (o.crane) {
      const mx = x1 + dx + 46; const mTop = clamp(topY - 46, 34, ground - 120); craneTop = mTop;
      let g = `<path d="M${mx} ${ground} V${mTop} M${mx + 10} ${ground} V${mTop}" stroke="${C.crane}" stroke-width="2"/>`;
      for (let y = ground; y > mTop + 10; y -= 12) g += `<path d="M${mx} ${y} L${mx + 10} ${y - 12} M${mx} ${y - 12} H${mx + 10}" stroke="${C.crane}" stroke-width="1"/>`;
      const jibL = Math.max(x0 - 10, 30); const jy = mTop;
      g += `<path d="M${jibL} ${jy} H${mx + 62} M${jibL} ${jy + 7} H${mx}" stroke="${C.crane}" stroke-width="1.8"/>`;
      for (let x = mx; x > jibL + 8; x -= 12) g += `<path d="M${x} ${jy + 7} L${x - 6} ${jy} L${x - 12} ${jy + 7}" stroke="${C.crane}" stroke-width=".9" fill="none"/>`;
      g += `<path d="M${mx + 5} ${jy - 22} L${jibL + 20} ${jy} M${mx + 5} ${jy - 22} L${mx + 58} ${jy} M${mx} ${jy} L${mx + 5} ${jy - 22} L${mx + 10} ${jy}" stroke="${C.crane}" stroke-width="1" fill="none"/>`;
      g += `<rect x="${mx + 40}" y="${jy + 1}" width="20" height="13" fill="${C.craneDark}"/><rect x="${mx - 2}" y="${jy + 7}" width="14" height="10" fill="${C.crane}"/><rect x="${mx + 1}" y="${jy + 9}" width="6" height="5" fill="${C.glass}"/>`;
      const hx = x0 + w * 0.35; const hookY = full ? topY - 40 : Math.max(jy + 30, ground - Math.ceil(F) * fh - 34);
      g += `<rect x="${r(hx - 5)}" y="${jy + 5}" width="10" height="5" fill="${C.craneDark}"/><path d="M${r(hx)} ${jy + 10} V${r(hookY)}" stroke="${C.ink}" stroke-width=".9"/>`;
      g += `<path d="M${r(hx - 3)} ${r(hookY)} h6 v4 a3 3 0 1 1 -3 3" stroke="${C.ink}" fill="none" stroke-width="1.2"/><path d="M${r(hx)} ${r(hookY + 10)} l-12 8 M${r(hx)} ${r(hookY + 10)} l12 8" stroke="${C.ink}" stroke-width=".8"/><rect x="${r(hx - 16)}" y="${r(hookY + 18)}" width="32" height="5" fill="${C.rebar}"/>`;
      s += `<g>${g}</g>`;
    }

    // ---------- site props, drawn as blueprint line art ----------
    if (o.site) {
      const gy = ground;
      s += `<g fill="none" stroke="${C.ink}" stroke-width="1.3" stroke-linejoin="round" opacity=".85">
        <rect x="34" y="${gy - 11}" width="60" height="10" rx="5"/><circle cx="40" cy="${gy - 6}" r="2.5"/><circle cx="88" cy="${gy - 6}" r="2.5"/>
        <path d="M40 ${gy - 11} v-12 h46 v12"/><path d="M66 ${gy - 23} v-16 h18 l2 16"/><path d="M70 ${gy - 35} h10 v8 h-10 z"/>
        <path d="M46 ${gy - 23} L26 ${gy - 52} L12 ${gy - 26}"/><path d="M12 ${gy - 26} l-6 6 h12 z"/>
        <path d="M${x1 + 8} ${gy} v-10 h40 v10 M${x1 + 8} ${gy - 5} h40 M${x1 + 18} ${gy - 10} v5 M${x1 + 28} ${gy - 5} v5 M${x1 + 38} ${gy - 10} v5 M${x1 + 13} ${gy - 15} h30 v5"/>
      </g>`;
    }

    // ---------- ground line ----------
    s += `<path d="M${sx} ${ground} H${sx + sw}" stroke="${C.ink}" stroke-width="1.4" opacity=".7"/>`;

    // ---------- dimensions (technical-drawing annotations) ----------
    if (o.dims) {
      const dxL = x0 - 40; const heightM = (n * 3.1).toFixed(n > 3 ? 0 : 1);
      s += `<g stroke="${C.ink}" stroke-width=".9" fill="${C.ink}" font-family="Archivo, system-ui, sans-serif" font-size="12">
        <path d="M${dxL} ${ground} V${r(topY)} M${dxL - 5} ${ground} h10 M${dxL - 5} ${r(topY)} h10"/>
        <text x="${dxL - 9}" y="${r((ground + topY) / 2 - 3)}" text-anchor="end" stroke="none" font-weight="700">${n === 1 ? 'G' : `G+${n - 1}`}</text>
        <text x="${dxL - 9}" y="${r((ground + topY) / 2 + 12)}" text-anchor="end" stroke="none">≈ ${heightM} m</text>
        <path d="M${r(x0)} ${H - 22} H${r(x1)} M${r(x0)} ${H - 27} v10 M${r(x1)} ${H - 27} v10"/>
        <text x="${r(cx)}" y="${H - 28}" text-anchor="middle" stroke="none">${Math.round(area).toLocaleString('en-IN')} sq ft per floor${basement ? ' + basement' : ''}</text>
      </g>`;
    }

    const label = full ? `Drawing of a completed ${n}-storey building` : F === 0 ? `Blueprint of a planned ${n}-storey building` : `Drawing of a ${n}-storey building under construction`;
    // Without a crane, crop empty sky so the building fills the sheet.
    let vx = 0; let vw = W;
    let vy = o.bare ? 0 : Math.max(0, Math.floor((craneTop !== null ? craneTop - 52 : topY - 64)));
    let vh = H - vy;
    if (o.fit) { // thumbnails: frame tightly around the building
      vx = Math.floor(x0 - 34); vw = Math.ceil(x1 + dx + 34 - vx);
      vy = Math.floor(topY - 40); vh = Math.ceil(footTop + 30 - vy);
      const minH = vw * 0.62; if (vh < minH) { vy -= Math.round(minH - vh); vh = Math.ceil(minH); }
    }
    return `<svg class="bldg"${o.bare ? ' style="overflow:visible"' : ''} viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }

  // Stage values from a project's milestones (workspace) or status (thumbnails).
  function stagesFromMilestones(ms) {
    const get = (k) => { const m = ms.find((x) => x.phase === k); return m ? Number(m.progress) / 100 : 0; };
    return { foundation: get('foundation'), structure: get('structure'), masonry: get('masonry'), openings: get('openings'), finishing: get('finishing') };
  }
  function stagesFromStatus(status) {
    if (status === 'completed') return {};
    if (status === 'in_progress') return { foundation: 1, structure: 0.6, masonry: 0.3, openings: 0, finishing: 0 };
    if (status === 'awarded') return { foundation: 0.3, structure: 0, masonry: 0, openings: 0, finishing: 0 };
    return { foundation: 0, structure: 0, masonry: 0, openings: 0, finishing: 0 };
  }

  window.BB = window.BB || {};
  Object.assign(window.BB, { building, stagesFromMilestones, stagesFromStatus });
})();

// Small traffic cone for empty states.
window.BB.cone = () => `<svg class="cone" width="54" height="54" viewBox="0 0 54 54" aria-hidden="true"><path d="M8 46h38v5H8z" fill="#14213d"/><path d="M22 6h10l11 40H11z" fill="#f2b705"/><path d="M19.2 18h15.6l2.2 8H17zM15.1 33h23.8l2 7H13.1z" fill="#fff"/></svg>`;
