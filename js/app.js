'use strict';
/* ═══════════════════════════════════════════════════════════════
   app.js — Global state, boot, analysis flow, tabs, UI helpers
═══════════════════════════════════════════════════════════════ */

const APP = {
  originLL:    null,
  destLL:      null,
  originLabel: '',
  destLabel:   '',
  crimes:      [],
  refDate:     null,
  showMarkers: true,
  radiusKm:    1.5,
  lastScore:   null,
};

/* ── BOOT ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const msgs = ['Initializing…', 'Loading map tiles…', 'Connecting to LAPD API…', 'Ready.'];
  const fill = document.getElementById('boot-fill');
  const msg  = document.getElementById('boot-msg');
  for (let i = 0; i < msgs.length; i++) {
    if (fill) fill.style.width = `${((i+1)/msgs.length)*100}%`;
    if (msg)  msg.textContent  = msgs[i];
    await sleep(i === 0 ? 200 : 380);
  }

  const theme = localStorage.getItem('saferoute_theme') || 'dark';
  document.documentElement.dataset.theme = theme;

  initMap();

  setupAC('o-inp', 'o-drop', r => {
    APP.originLL = r; APP.originLabel = r.short;
    placePinOrigin(r.lat, r.lng);
    MAP.lmap.flyTo([r.lat, r.lng], 14, { duration: 1 });
    document.getElementById('map-hint').classList.add('gone');
  });
  setupAC('d-inp', 'd-drop', r => {
    APP.destLL = r; APP.destLabel = r.short;
    placePinDest(r.lat, r.lng);
    document.getElementById('map-hint').classList.add('gone');
  });
  setupAC('mo-inp', 'mo-drop', r => {
    APP.originLL = r; APP.originLabel = r.short;
    setVal('o-inp', r.short); placePinOrigin(r.lat, r.lng);
  });
  setupAC('md-inp', 'md-drop', r => {
    APP.destLL = r; APP.destLabel = r.short;
    setVal('d-inp', r.short); placePinDest(r.lat, r.lng);
  });

  document.getElementById('gps-btn')?.addEventListener('click', useGPS);

  ['o-inp','d-inp','mo-inp','md-inp'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { syncMob(); runAnalysis(); }
    });
  });

  await sleep(200);
  document.getElementById('boot-screen').classList.add('out');
  switchPanel('dashboard');
  document.getElementById('fab-markers').classList.add('active');
  toast('SafeRoute LA ready — type addresses or tap the map.', 'success');
});

/* ── THEME ────────────────────────────────────────────────────── */
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('saferoute_theme', next);
  applyTile();
}

/* ── TABS ─────────────────────────────────────────────────────── */
function switchPanel(name) {
  ['dashboard','incidents','routes','saved'].forEach(n => {
    document.getElementById(`ptab-${n}`)?.classList.toggle('active', n === name);
    const p = document.getElementById(`p-${n}`);
    if (p) p.style.display = n === name ? 'block' : 'none';
  });
  const empty = document.getElementById('p-empty');
  if (empty) empty.style.display = 'none';
  if (name === 'incidents' && APP.crimes.length) renderIncidents(APP.crimes, APP.refDate);
  if (name === 'saved') loadSavedRoutes();
}
function showSavedTab() { switchPanel('saved'); closeUserMenu(); }

/* ── MOBILE ───────────────────────────────────────────────────── */
function toggleMob() {
  document.getElementById('mob-panel')?.classList.toggle('open');
  document.getElementById('ham-b')?.classList.toggle('open');
}
function syncMob() {
  const mo = document.getElementById('mo-inp')?.value.trim();
  const md = document.getElementById('md-inp')?.value.trim();
  if (mo) { setVal('o-inp', mo); if (!APP.originLL) APP.originLabel = mo; }
  if (md) { setVal('d-inp', md); if (!APP.destLL)   APP.destLabel   = md; }
}
function swapInputs() {
  const oi = document.getElementById('o-inp');
  const di = document.getElementById('d-inp');
  if (!oi || !di) return;
  [oi.value, di.value]             = [di.value, oi.value];
  [APP.originLL,    APP.destLL]    = [APP.destLL,    APP.originLL];
  [APP.originLabel, APP.destLabel] = [APP.destLabel, APP.originLabel];
  setVal('mo-inp', oi.value); setVal('md-inp', di.value);
  toast('Locations swapped.', 'info');
}

/* ── CLEAR ALL ────────────────────────────────────────────────── */
function clearAll() {
  if (MAP.routeLayer) { MAP.lmap.removeLayer(MAP.routeLayer); MAP.routeLayer = null; }
  if (MAP.originMk)   { MAP.lmap.removeLayer(MAP.originMk);  MAP.originMk   = null; }
  if (MAP.destMk)     { MAP.lmap.removeLayer(MAP.destMk);    MAP.destMk     = null; }
  if (MAP.mainLabel)  { MAP.lmap.removeLayer(MAP.mainLabel); MAP.mainLabel  = null; }
  MAP._mainGJ = null;
  clearCrimeMarkers();
  clearAltRoutes();
  APP.originLL = null; APP.destLL = null;
  APP.originLabel = ''; APP.destLabel = '';
  APP.crimes = []; APP.refDate = null;
  ['o-inp','d-inp','mo-inp','md-inp'].forEach(id => setVal(id, ''));
  document.getElementById('map-hint')?.classList.remove('gone');
  const empt = document.getElementById('p-empty');
  if (empt) empt.style.display = '';
  switchPanel('dashboard');
  ['p-dashboard','p-incidents','p-routes','p-saved'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  setText('map-status', 'Enter locations or tap the map — LAPD 2020–2024');
  toast('Route cleared.', 'info');
}

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYSIS FLOW
══════════════════════════════════════════════════════════════ */
async function runAnalysis() {
  syncMob();

  // ── Resolve origin ──────────────────────────────────────────
  if (!APP.originLL) {
    const q = document.getElementById('o-inp')?.value.trim();
    if (!q) {
      showErrorModal('Missing Origin', 'Please enter an origin address.');
      return;
    }
    showLoader(true, 'Geocoding origin…');
    let res;
    try { res = await geocodeForward(q); } catch { res = null; }
    if (!res?.length) {
      hideLoader();
      showErrorModal('Origin Not Found', `"${q}" could not be found in Los Angeles.\n\nTry a more specific street address, neighbourhood, or landmark name.`);
      return;
    }
    APP.originLL = res[0]; APP.originLabel = res[0].short;
    placePinOrigin(res[0].lat, res[0].lng);
  }

  // ── Resolve destination ─────────────────────────────────────
  if (!APP.destLL) {
    const q = document.getElementById('d-inp')?.value.trim();
    if (!q) {
      hideLoader();
      showErrorModal('Missing Destination', 'Please enter a destination address.');
      return;
    }
    showLoader(true, 'Geocoding destination…');
    let res;
    try { res = await geocodeForward(q); } catch { res = null; }
    if (!res?.length) {
      hideLoader();
      showErrorModal('Destination Not Found', `"${q}" could not be found in Los Angeles.\n\nTry a more specific street address, neighbourhood, or landmark name.`);
      return;
    }
    APP.destLL = res[0]; APP.destLabel = res[0].short;
    placePinDest(res[0].lat, res[0].lng);
  }

  // ── Same location guard ─────────────────────────────────────
  if (APP.originLL && APP.destLL) {
    const dist = haversine(APP.originLL.lat, APP.originLL.lng, APP.destLL.lat, APP.destLL.lng);
    if (dist < 0.05) {
      hideLoader();
      showErrorModal('Same Location', 'Origin and destination appear to be the same place.\n\nPlease choose two different locations to assess a route between them.');
      return;
    }
  }

  // ── LA bounds check ─────────────────────────────────────────
  const laCheck = isRouteInLA(APP.originLL, APP.destLL);
  if (!laCheck.bothInLA) {
    hideLoader();
    if (!laCheck.originInLA) {
      if (MAP.originMk) { MAP.lmap.removeLayer(MAP.originMk); MAP.originMk = null; }
      APP.originLL = null; APP.originLabel = '';
      setVal('o-inp', ''); setVal('mo-inp', '');
    }
    if (!laCheck.destInLA) {
      if (MAP.destMk) { MAP.lmap.removeLayer(MAP.destMk); MAP.destMk = null; }
      APP.destLL = null; APP.destLabel = '';
      setVal('d-inp', ''); setVal('md-inp', '');
    }
    const who = !laCheck.originInLA && !laCheck.destInLA
      ? 'Both locations are'
      : !laCheck.originInLA
        ? 'Your origin is'
        : 'Your destination is';
    showErrorModal(
      'Outside Los Angeles',
      who + ' outside the area covered by LAPD crime data.\n\nThis app only analyzes routes within Los Angeles city limits. Please enter addresses within LA or any LA neighbourhood.'
    );
    return;
  }

  document.getElementById('map-hint').classList.add('gone');
  const btn = document.getElementById('analyze-btn');
  if (btn) btn.disabled = true;

  // ── Draw route ──────────────────────────────────────────────
  showLoader(true, 'Calculating route…');
  let routeInfo;
  try {
    routeInfo = await drawRouteORS(APP.originLL, APP.destLL);
  } catch (err) {
    hideLoader();
    if (btn) btn.disabled = false;
    showErrorModal('Routing Failed', 'Could not calculate a driving route between these locations.\n\nThis may mean the addresses are not on a road network. Please check both locations and try again.');
    return;
  }
  const { km, min } = routeInfo;
  if (!routeInfo.ok) toast('Routing service unavailable — using straight-line fallback.', 'warn');

  // ── Fetch LAPD data ─────────────────────────────────────────
  showLoader(true, 'Fetching LAPD crime data…');
  let crimes = [];
  try {
    crimes = await fetchCrimes(APP.originLL, APP.destLL, APP.radiusKm);
  } catch (err) {
    hideLoader();
    if (btn) btn.disabled = false;
    showErrorModal(
      'LAPD Data Unavailable',
      `Could not fetch crime data from the LAPD database.\n\nThis is usually a temporary issue. Please wait a moment and try again.\n\nDetails: ${err.message}`
    );
    return;
  }

  if (crimes.length === 0) {
    const oLbl = (APP.originLabel || '').toLowerCase();
    const dLbl = (APP.destLabel   || '').toLowerCase();
    const laKw = ['los angeles','hollywood','downtown','westwood','venice',
      'santa monica','compton','inglewood','burbank','pasadena','glendale',
      'torrance','long beach','culver','koreatown','silverlake','echo park',
      'highland','boyle heights','watts','crenshaw','wilshire','sunset',
      'broadway','figueroa','vermont','sepulveda','la brea','fairfax'];
    const looksLikeLA = laKw.some(k => oLbl.includes(k) || dLbl.includes(k));
    if (!looksLikeLA) {
      hideLoader();
      if (btn) btn.disabled = false;
      if (MAP.routeLayer) { MAP.lmap.removeLayer(MAP.routeLayer); MAP.routeLayer = null; }
      if (MAP.mainLabel)  { MAP.lmap.removeLayer(MAP.mainLabel);  MAP.mainLabel  = null; }
      if (MAP.originMk)   { MAP.lmap.removeLayer(MAP.originMk);  MAP.originMk   = null; }
      if (MAP.destMk)     { MAP.lmap.removeLayer(MAP.destMk);    MAP.destMk     = null; }
      APP.originLL = null; APP.destLL = null;
      APP.originLabel = ''; APP.destLabel = '';
      setVal('o-inp',''); setVal('d-inp',''); setVal('mo-inp',''); setVal('md-inp','');
      showErrorModal(
        'No LAPD Data Found',
        'No crime records were found for this route.\n\nThis means the locations are likely outside LAPD coverage. A score of 100% here is not meaningful — it simply means no data was found, not that the area is safe.\n\nPlease enter valid Los Angeles addresses and try again.'
      );
      return;
    }
    toast('No crime records found — this corridor may have very low activity.', 'info');
  }

  APP.crimes  = crimes;
  APP.refDate = computeRefDate(crimes);
  const refLabel = APP.refDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });

  // ── Score ────────────────────────────────────────────────────
  showLoader(true, 'Scoring incidents…');
  const oRes    = scoreLocation(crimes, APP.originLL.lat, APP.originLL.lng, APP.radiusKm, APP.refDate);
  const dRes    = scoreLocation(crimes, APP.destLL.lat,   APP.destLL.lng,   APP.radiusKm, APP.refDate);
  const rtScore = calcRouteScore(oRes.score, dRes.score, crimes);
  APP.lastScore = rtScore;

  const dates  = crimes.filter(c=>c.date).map(c=>c.date).sort((a,b)=>a-b);
  const period = dates.length
    ? `${dates[0].toLocaleDateString('en-US',{month:'short',year:'numeric'})} – ${dates[dates.length-1].toLocaleDateString('en-US',{month:'short',year:'numeric'})}`
    : '—';

  // ── Render markers ───────────────────────────────────────────
  renderCrimeMarkers(crimes, APP.refDate);

  // ── Place main route annotation ─────────────────────────────
  // MAP._mainGJ is now reliably set inside drawRouteORS (both try + catch)
  if (MAP._mainGJ) {
    const coords = MAP._mainGJ.features[0].geometry.coordinates;
    const mid    = coords[Math.floor(coords.length / 2)];
    if (MAP.mainLabel) { MAP.lmap.removeLayer(MAP.mainLabel); MAP.mainLabel = null; }
    MAP.mainLabel = _mainRouteLabel(mid[1], mid[0], rtScore);
  }

  // ── Show panels ──────────────────────────────────────────────
  document.getElementById('p-empty').style.display = 'none';
  ['p-dashboard','p-incidents','p-routes','p-saved'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === 'p-dashboard' ? 'block' : 'none';
  });
  switchPanel('dashboard');
  setText('map-status', `Latest: ${refLabel} · LAPD 2020–2024`);

  await sleep(60);

  // ── Render dashboard ─────────────────────────────────────────
  renderScoreCards(oRes, dRes, rtScore, APP.originLabel, APP.destLabel);
  renderRouteFacts(km, min, crimes.length, period);
  renderVerdict(buildVerdict(rtScore, oRes, dRes, crimes, APP.destLabel), rtScore);
  renderCases(crimes, APP.destLL.lat, APP.destLL.lng, APP.refDate);
  renderBreakdown(crimes);
  renderDemographics(crimes);
  renderWeapons(crimes);
  renderDistricts(crimes);
  renderTips(buildTips(rtScore));
  renderIncidents(crimes, APP.refDate);
  renderExportBar();
  renderRoutes(rtScore, crimes, km, min);

  document.querySelectorAll('.sc-card,.rt-card,.cc,.verdict').forEach((el, i) => {
    el.style.animationDelay = `${i*.04}s`;
    el.classList.remove('fu'); void el.offsetWidth; el.classList.add('fu');
  });

  hideLoader();
  if (btn) btn.disabled = false;

  const rl = riskLevel(rtScore);
  toast(
    `Analysis complete · Score: ${rtScore}/100 (${rl.label})`,
    rtScore >= 65 ? 'success' : rtScore >= 45 ? 'warn' : 'error'
  );
  document.getElementById('panel-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── ERROR MODAL ──────────────────────────────────────────────── */
function showErrorModal(title, message) {
  document.getElementById('err-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'err-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9000',
    'display:flex;align-items:center;justify-content:center',
    'background:rgba(0,0,0,.72);backdrop-filter:blur(6px)',
    'padding:20px',
  ].join(';');

  overlay.innerHTML = `
    <style>@keyframes errIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:none}}</style>
    <div style="background:var(--card);border:1px solid var(--bord2);border-top:3px solid #ef4444;border-radius:14px;padding:28px 26px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.6);font-family:'Outfit',sans-serif;animation:errIn .25s cubic-bezier(.16,1,.3,1)">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px">
        <div style="width:40px;height:40px;border-radius:50%;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ef4444;font-size:1.1rem">
          <i class="fa-solid fa-circle-exclamation"></i>
        </div>
        <div style="flex:1">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:.08em;color:var(--text);margin-bottom:8px">${xss(title)}</div>
          <div style="font-size:.82rem;color:var(--text2);line-height:1.7;white-space:pre-line">${xss(message)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:20px">
        <button id="err-dismiss" style="padding:9px 24px;border-radius:7px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:.95rem;letter-spacing:.1em;box-shadow:0 3px 12px rgba(239,68,68,.35)">
          DISMISS
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#err-dismiss').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

/* ── LOADER ───────────────────────────────────────────────────── */
function showLoader(_, msg) {
  const el = document.getElementById('g-loader');
  const m  = document.getElementById('g-loader-msg');
  if (el) el.style.display = 'flex';
  if (m && msg) m.textContent = msg;
}
function hideLoader() {
  const el = document.getElementById('g-loader');
  if (el) el.style.display = 'none';
}

/* ── TOAST ────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = { info:'fa-circle-info', success:'fa-circle-check', warn:'fa-triangle-exclamation', error:'fa-circle-exclamation' };
  const tc = document.getElementById('toasts');
  if (!tc) return;
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}" style="flex-shrink:0;margin-top:1px"></i><span>${xss(msg)}</span>`;
  tc.appendChild(el);
  setTimeout(() => { el.classList.add('t-out'); el.addEventListener('animationend', () => el.remove()); }, 5500);
}

/* ── UTILS ────────────────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }