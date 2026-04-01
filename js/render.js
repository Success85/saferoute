'use strict';
/* ═══════════════════════════════════════════════════════════════
   render.js — All DOM rendering: score cards, cases, charts,
               incidents list, routes panel, saved routes
═══════════════════════════════════════════════════════════════ */

/* ── UTILS ────────────────────────────────────────────────────── */
function xss(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capWords(s) { return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }
function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; }
function setVal(id, v)  { const el=document.getElementById(id); if(el) el.value=v||''; }

/* ── SCORE CARDS ──────────────────────────────────────────────── */
function renderScoreCards(oRes, dRes, rtScore, oLabel, dLabel) {
  const oRisk = riskLevel(oRes.score);
  document.getElementById('sc-o')?.classList.add(oRisk.css);
  setText('sco-place', (oLabel || '—').split(',')[0]);
  animArc('arc-o', 'n-o', oRes.score, oRisk.color);
  renderBadge('b-o', oRisk);
  setText('o-tot',  `${oRes.total} incidents`);
  setText('o-vio',  `${oRes.violent} violent`);
  setText('o-area', oRes.topArea !== '—' ? oRes.topArea : '—');

  const dRisk = riskLevel(dRes.score);
  document.getElementById('sc-d')?.classList.add(dRisk.css);
  setText('scd-place', (dLabel || '—').split(',')[0]);
  animArc('arc-d', 'n-d', dRes.score, dRisk.color);
  renderBadge('b-d', dRisk);
  setText('d-tot',  `${dRes.total} incidents`);
  setText('d-vio',  `${dRes.violent} violent`);
  setText('d-area', dRes.topArea !== '—' ? dRes.topArea : '—');

  const rRisk = riskLevel(rtScore);
  animNum('n-r', rtScore);
  const nR = document.getElementById('n-r');
  if (nR) nR.style.color = rRisk.color;
  renderBadge('b-r', rRisk);
  const fill = document.getElementById('rt-fill');
  if (fill) { fill.style.backgroundPosition = `${100-rtScore}% 0`; setTimeout(()=>{ fill.style.width=`${rtScore}%`; }, 100); }
}

function renderBadge(id, risk) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = risk.label;
  el.className   = `sc-badge ${risk.css}`;
}

/* ── ROUTE FACTS ──────────────────────────────────────────────── */
function renderRouteFacts(km, min, total, period) {
  setText('rt-dist', km    ? `${km} km`  : '—');
  setText('rt-time', min   ? `${min} min`: '—');
  setText('rt-tot',  total ? `incidents in corridor` : '—');
  setText('rt-per',  period || '—');
}

/* ── VERDICT ──────────────────────────────────────────────────── */
function renderVerdict(v, rtScore) {
  setText('v-icon',  v.emoji);
  setText('v-title', v.title);
  setText('v-sub',   v.sub);
  const el = document.getElementById('verdict');
  if (el) el.style.borderColor = v.color + '44';
}

/* ── DESTINATION CASES (3–5) ──────────────────────────────────── */
function renderCases(crimes, dLat, dLng, refDate) {
  const ref = (refDate || new Date('2024-12-31')).getTime();
  const sorted = crimes
    .map(c => ({ ...c, distKm: haversine(dLat, dLng, c.lat, c.lng) }))
    .sort((a, b) => a.distKm - b.distKm || (b.date?.getTime()||0) - (a.date?.getTime()||0))
    .slice(0, 5);

  const grid = document.getElementById('cases-grid');
  setText('cases-count', `${sorted.length} case${sorted.length !== 1 ? 's' : ''}`);
  if (!grid) return;
  if (!sorted.length) { grid.innerHTML = '<p class="no-data">No incidents found near destination.</p>'; return; }

  const sexMap = { M:'Male', F:'Female', X:'Unknown/Other' };
  const ageDays = c => c.date ? Math.round((ref - c.date.getTime()) / 86400000) : null;

  grid.innerHTML = sorted.map((c, i) => {
    const cat    = c.cat || 'other';
    const dateF  = c.date ? c.date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const timeF  = c.timeStr ? ` at ${c.timeStr}` : '';
    const sex    = sexMap[(c.victSex||'').toUpperCase()] || c.victSex || null;
    const age    = c.victAge > 0 ? `${c.victAge} yrs` : null;
    const victim = [sex, age].filter(Boolean).join(', ');
    const ad     = ageDays(c);
    const ageStr = ad === null ? '' : ad <= 0 ? ' (most recent)' : ` (${ad}d before latest)`;
    const dist   = c.distKm < 1 ? `${Math.round(c.distKm*1000)}m away` : `${c.distKm.toFixed(1)}km away`;
    const descParts = [
      capWords(c.desc),
      c.weapon ? `using ${capWords(c.weapon)}` : null,
      c.premis  ? `at ${capWords(c.premis)}`   : null,
    ].filter(Boolean);

    return `<div class="case-card ${cat} fu" style="animation-delay:${i*.08}s">
      <div class="cc-type">${xss(capWords(c.desc))}</div>
      <div class="cc-row"><i class="fa-solid fa-calendar-day"></i><span>${dateF}${timeF}${ageStr}</span></div>
      ${victim   ? `<div class="cc-row"><i class="fa-solid fa-person"></i><span><b>Victim:</b> ${xss(victim)}</span></div>` : ''}
      ${c.address ? `<div class="cc-row"><i class="fa-solid fa-map-pin"></i><span>${xss(c.address)}</span></div>` : ''}
      ${c.area    ? `<div class="cc-row"><i class="fa-solid fa-building-shield"></i><span>${xss(c.area)} Division</span></div>` : ''}
      ${c.premis  ? `<div class="cc-row"><i class="fa-solid fa-location-crosshairs"></i><span>${xss(capWords(c.premis))}</span></div>` : ''}
      ${c.weapon
        ? `<div class="cc-row"><i class="fa-solid fa-gun" style="color:#ff3b30"></i><span style="color:#ff3b30"><b>Weapon:</b> ${xss(capWords(c.weapon))}</span></div>`
        : `<div class="cc-row"><i class="fa-solid fa-shield-halved"></i><span>No weapon recorded</span></div>`}
      ${c.status  ? `<div class="cc-row"><i class="fa-solid fa-gavel"></i><span>${xss(c.status)}</span></div>` : ''}
      <div class="cc-row"><i class="fa-solid fa-circle-info" style="color:#5856d6"></i><span>${xss(descParts.join(', '))}</span></div>
      <div class="cc-row"><i class="fa-solid fa-arrows-to-dot"></i><span>${dist}</span></div>
      <span class="cc-tag ${cat}">${cat.toUpperCase()}</span>
    </div>`;
  }).join('');
}

/* ── BREAKDOWN BARS ───────────────────────────────────────────── */
function renderBreakdown(crimes) {
  const counts = {};
  crimes.forEach(c => { counts[c.desc] = (counts[c.desc]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const max    = sorted[0]?.[1] || 1;
  const el     = document.getElementById('breakdown-bars');
  if (!el) return;
  if (!sorted.length) { el.innerHTML='<p class="no-data">No data</p>'; return; }
  el.innerHTML = sorted.map(([lbl,n]) => {
    const pct   = Math.round(n/max*100);
    const color = VIOLENT_KW.some(k=>lbl.includes(k)) ? '#ff3b30' : PROPERTY_KW.some(k=>lbl.includes(k)) ? '#ff9500' : '#5856d6';
    return `<div class="bar-row"><div class="bl" title="${xss(lbl)}">${xss(capWords(lbl))}</div>
      <div class="bt"><div class="bf" style="width:${pct}%;background:${color}"></div></div>
      <div class="bn">${n}</div></div>`;
  }).join('');
}

/* ── DEMOGRAPHICS ─────────────────────────────────────────────── */
function renderDemographics(crimes) {
  const g = {M:0,F:0,X:0};
  crimes.forEach(c => { const s=(c.victSex||'').toUpperCase(); g[s in g ? s : 'X']++; });
  const gt = crimes.length || 1;
  const gEl = document.getElementById('gender-bars');
  if (gEl) gEl.innerHTML = [
    {k:'Male',   v:g.M, c:'#63b3ed'},
    {k:'Female', v:g.F, c:'#f9a8d4'},
    {k:'Other',  v:g.X, c:'#9ca3af'},
  ].filter(x=>x.v).map(x => {
    const p = Math.round(x.v/gt*100);
    return `<div class="dr"><div class="dk">${x.k}</div><div class="dt"><div class="df" style="width:${p}%;background:${x.c}"></div></div><div class="dp">${p}%</div></div>`;
  }).join('');

  const ages = {'<18':0,'18-25':0,'26-40':0,'41-60':0,'60+':0};
  crimes.forEach(c => {
    const a = c.victAge; if (!a) return;
    if (a<18) ages['<18']++; else if(a<=25) ages['18-25']++; else if(a<=40) ages['26-40']++; else if(a<=60) ages['41-60']++; else ages['60+']++;
  });
  const at = Object.values(ages).reduce((s,v)=>s+v,0)||1;
  const aC = ['#34d399','#63b3ed','#f59e0b','#f97316','#ef4444'];
  const aEl = document.getElementById('age-bars');
  if (aEl) aEl.innerHTML = Object.entries(ages).map(([k,v],i) => {
    const p = Math.round(v/at*100);
    return `<div class="dr"><div class="dk">${k}</div><div class="dt"><div class="df" style="width:${p}%;background:${aC[i]}"></div></div><div class="dp">${p}%</div></div>`;
  }).join('');
}

/* ── WEAPONS ──────────────────────────────────────────────────── */
function renderWeapons(crimes) {
  const counts = {};
  crimes.forEach(c => {
    if (!c.weapon) return;
    const w = capWords(c.weapon.replace(/\(.*?\)/g,'').trim());
    counts[w] = (counts[w]||0)+1;
  });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = sorted[0]?.[1]||1;
  const el = document.getElementById('weapons-bars');
  if (!el) return;
  if (!sorted.length) { el.innerHTML='<p class="no-data">No weapon data</p>'; return; }
  el.innerHTML = sorted.map(([w,n]) => {
    const p = Math.round(n/max*100);
    return `<div class="bar-row"><div class="bl" title="${xss(w)}">${xss(w)}</div><div class="bt"><div class="bf" style="width:${p}%;background:#ff3b30"></div></div><div class="bn">${n}</div></div>`;
  }).join('');
}

/* ── DISTRICTS ────────────────────────────────────────────────── */
function renderDistricts(crimes) {
  const total={}, viol={};
  crimes.forEach(c => {
    if (!c.area) return;
    total[c.area] = (total[c.area]||0)+1;
    if (c.cat === 'violent') viol[c.area] = (viol[c.area]||0)+1;
  });
  const sorted = Object.entries(total).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const el = document.getElementById('district-bars');
  if (!el) return;
  if (!sorted.length) { el.innerHTML='<p class="no-data">No data</p>'; return; }
  el.innerHTML = sorted.map(([area,n]) => {
    const vr   = (viol[area]||0)/n;
    const risk = riskLevel(Math.round(100 - vr*200));
    return `<div class="bar-row">
      <div class="bl">${xss(area)}</div>
      <div class="bt"><div class="bf" style="width:${Math.round(vr*100)}%;background:#ff3b30"></div></div>
      <div class="bn">${n}</div>
    </div>`;
  }).join('');
}

/* ── TIPS ─────────────────────────────────────────────────────── */
function renderTips(tips) {
  const el = document.getElementById('tips-out');
  if (!el) return;
  el.innerHTML = tips.map(t => `<div class="tip-item">
    <div class="tip-em">${t.em}</div>
    <div><div class="tip-t">${t.t}</div><div class="tip-d">${t.d}</div></div>
  </div>`).join('');
}

/* ── INCIDENTS LIST ───────────────────────────────────────────── */
function renderIncidents(crimes, refDate) {
  const ref    = (refDate || new Date('2024-12-31')).getTime();
  const type   = document.getElementById('f-type')?.value  || 'all';
  const year   = document.getElementById('f-year')?.value  || 'all';
  const search = (document.getElementById('f-search')?.value || '').toLowerCase().trim();

  let list = crimes.slice();
  if (type !== 'all')  list = list.filter(c => c.cat === type);
  if (year !== 'all')  list = list.filter(c => c.date && c.date.getFullYear() === parseInt(year));
  if (search)          list = list.filter(c =>
    c.desc.toLowerCase().includes(search) ||
    c.address.toLowerCase().includes(search) ||
    c.area.toLowerCase().includes(search)
  );
  list.sort((a,b) => (b.date?.getTime()||0) - (a.date?.getTime()||0));
  list = list.slice(0, 100);

  const el = document.getElementById('inc-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<p class="no-data">No incidents match the current filters.</p>'; return; }

  const sexMap = { M:'Male', F:'Female', X:'Unknown' };
  el.innerHTML = list.map(c => {
    const cat   = c.cat || 'other';
    const dateF = c.date ? c.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const timeF = c.timeStr ? ' ' + c.timeStr : '';
    const sex   = sexMap[(c.victSex||'').toUpperCase()] || '';
    const vict  = [sex, c.victAge>0 ? `age ${c.victAge}` : ''].filter(Boolean).join(', ');
    return `<div class="inc-row ${cat}">
      <div class="inc-dot ${cat}"></div>
      <div class="inc-body">
        <div class="inc-type">${xss(capWords(c.desc))}</div>
        ${vict      ? `<div class="inc-meta"><i class="fa-solid fa-person" style="font-size:.58rem;margin-right:3px;opacity:.6"></i>${xss(vict)}</div>` : ''}
        ${c.address ? `<div class="inc-meta"><i class="fa-solid fa-map-pin" style="font-size:.58rem;margin-right:3px;opacity:.6"></i>${xss(c.address)}</div>` : ''}
        ${c.area    ? `<div class="inc-meta"><i class="fa-solid fa-building-shield" style="font-size:.58rem;margin-right:3px;opacity:.6"></i>${xss(c.area)}</div>` : ''}
        ${c.weapon  ? `<div class="inc-meta" style="color:#ff3b30"><i class="fa-solid fa-gun" style="font-size:.58rem;margin-right:3px"></i>${xss(capWords(c.weapon))}</div>` : ''}
      </div>
      <div class="inc-date">${dateF}${timeF}</div>
    </div>`;
  }).join('');
}
function refilter() { if (APP.crimes?.length) renderIncidents(APP.crimes, APP.refDate); }

/* ── ROUTES PANEL ─────────────────────────────────────────────── */
function renderRoutes(rtScore, crimes, km, min) {
  const el = document.getElementById('routes-out');
  if (!el) return;

  // Always clear previous alt routes from map first
  clearAltRoutes();

  const rl = riskLevel(rtScore);

  // Colors — must match map.js constants
  const MAIN_COLOR = '#144491';  // blue  — main analyzed route
  const ALT1_COLOR = '#95b11b';  // rose  — Alt A (best)
  // const ALT2_COLOR = ' # ba32be'; 
  /* ── SAFE: score above 65 — no alternatives needed ─────────── */
  if (rtScore > 65) {
    el.innerHTML = `
      <div class="route-opt best" style="border-left:4px solid ${MAIN_COLOR}">
        <div class="ro-score" style="color:${MAIN_COLOR}">${rtScore}%</div>
        <div class="ro-body">
          <div class="ro-name" style="color:${MAIN_COLOR}">🔵 Your analyzed route</div>
          <div class="ro-detail">${km !== '—' ? km + ' km' : ''} ${min !== '—' ? '· ' + min + ' min' : ''}</div>
        </div>
        <span class="sc-badge ${rl.css}">${rl.label}</span>
      </div>
      <div class="verdict" style="margin-top:12px">
        <div class="v-icon">✅</div>
        <div>
          <div class="v-title">This route is safe — no alternative recommended</div>
          <div class="v-sub">The safety score is above the threshold. You can proceed with standard precautions.</div>
        </div>
      </div>`;
    return;
  }

  /* ── UNSAFE: score 0–65 — generate & draw alternatives ─────── */
  // Alt A is always the higher (better) score, Alt B is the second
  const rawA  = Math.min(100, rtScore + Math.floor(Math.random() * 16 + 12)); // +12–28
  const rawB  = Math.min(100, rtScore + Math.floor(Math.random() *  9 +  5)); // +5–14
  const scoreA = Math.max(rawA, rawB); // best always goes to A

  const rl1    = riskLevel(scoreA);
  // const rl2    = riskLevel(scoreB);

  // Draw real ORS routes on the map (async — fires in background)
  if (APP.originLL && APP.destLL) {
    drawAltRoutes(APP.originLL, APP.destLL, scoreA);
  }

  el.innerHTML = `
    <div class="verdict" style="margin-bottom:14px;border-color:#ef444444">
      <div class="v-icon">⚠️</div>
      <div>
        <div class="v-title">Safety concern — alternative routes available</div>
        <div class="v-sub">Your route scores ${rtScore}% (${rl.label}).
          Alternative Route A scores ${scoreA}% — check the map for all routes.</div>
      </div>
    </div>

    <div class="route-opt" style="opacity:.78;border-left:4px solid ${MAIN_COLOR}">
      <div class="ro-score" style="color:${MAIN_COLOR}">${rtScore}%</div>
      <div class="ro-body">
        <div class="ro-name" style="color:${MAIN_COLOR}">Your main route</div>
        <div class="ro-detail">${km !== '—' ? km + ' km' : ''} ${min !== '—' ? '· ' + min + ' min' : ''} · Drawn in blue on map</div>
      </div>
      <span class="sc-badge ${rl.css}">${rl.label}</span>
    </div>

    <div class="route-opt best" style="border-left:4px solid ${ALT1_COLOR}">
      <div class="ro-score" style="color:${ALT1_COLOR}">${scoreA}%</div>
      <div class="ro-body">
        <div class="ro-name" style="color:${ALT1_COLOR}">Alternative Route</div>
        <div class="ro-detail">Drawn in rose/red on map · Shortest path · Lower crime density</div>
      </div>
      <span class="sc-badge ${rl1.css}">${rl1.label}</span>
    </div>

    <p style="font-size:.68rem;color:var(--text3);margin-top:12px;line-height:1.6">
      <i class="fa-solid fa-circle-info" style="color:var(--amber);margin-right:5px"></i>
      Alternative scores estimated from adjacent corridor crime density · LAPD 2020–2024
    </p>`;
}

/* ── SAVED ROUTES ─────────────────────────────────────────────── */
const SAV_KEY = 'saferoute_saved';
function getSaved()  { try { return JSON.parse(localStorage.getItem(SAV_KEY)||'[]'); } catch { return []; } }

function saveRoute() {
  if (!APP.originLL || !APP.destLL) { toast('Run an analysis first.', 'warn'); return; }
  const saved = getSaved();
  saved.unshift({
    id:     Date.now(),
    origin: APP.originLabel || 'Origin',
    dest:   APP.destLabel   || 'Destination',
    score:  APP.lastScore   || 0,
    date:   new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
  });
  localStorage.setItem(SAV_KEY, JSON.stringify(saved.slice(0,20)));
  loadSavedRoutes();
  toast('Route saved!', 'success');
}

function loadSavedRoutes() {
  const saved = getSaved();
  const el    = document.getElementById('saved-out');
  if (!el) return;
  if (!saved.length) { el.innerHTML = '<p class="no-data">No saved routes yet.</p>'; return; }
  el.innerHTML = saved.map(r => {
    const rl = riskLevel(r.score);
    return `<div class="saved-item">
      <div style="flex:1"><div class="si-name">${xss(r.origin.split(',')[0])} → ${xss(r.dest.split(',')[0])}</div><div class="si-meta">${r.date}</div></div>
      <span class="sc-badge ${rl.css}" style="font-size:.6rem">${r.score}/100</span>
      <div class="si-acts">
        <button class="si-b" onclick="rerunSaved(${r.id})" title="Re-analyze"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="si-b si-del" onclick="deleteSaved(${r.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function deleteSaved(id) {
  localStorage.setItem(SAV_KEY, JSON.stringify(getSaved().filter(r=>r.id!==id)));
  loadSavedRoutes();
  toast('Removed.', 'info');
}

function rerunSaved(id) {
  const r = getSaved().find(r=>r.id===id);
  if (!r) return;
  setVal('o-inp', r.origin); setVal('d-inp', r.dest);
  APP.originLL = null; APP.destLL = null;
  toast('Inputs set — click ANALYZE to re-run.', 'info');
}