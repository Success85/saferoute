'use strict';
/* ═══════════════════════════════════════════════════════════════
   app.js — Global state, boot sequence, analysis flow,
            tabs, mobile menu, theme, UI helpers
═══════════════════════════════════════════════════════════════ */

/* ── GLOBAL APP STATE ─────────────────────────────────────────── */
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
  const fill  = document.getElementById('boot-fill');
  const msg   = document.getElementById('boot-msg');

  // Animate boot bar
  for (let i = 0; i < msgs.length; i++) {
    if (fill) fill.style.width = `${((i+1)/msgs.length)*100}%`;
    if (msg)  msg.textContent  = msgs[i];
    await sleep(i === 0 ? 200 : 380);
  }

  // Apply saved theme
  const theme = localStorage.getItem('saferoute_theme') || 'dark';
  document.documentElement.dataset.theme = theme;

  // Init map
  initMap();

  // Wire autocomplete — desktop
  setupAC('o-inp', 'o-drop', r => {
    APP.originLL = r; APP.originLabel = r.short;
    placePinOrigin(r.lat, r.lng);
    MAP.lmap.flyTo([r.lat, r.lng], 14, { duration: 1 });
    MAP.tapCount = 1;
    document.getElementById('map-hint').classList.add('gone');
  });
  setupAC('d-inp', 'd-drop', r => {
    APP.destLL = r; APP.destLabel = r.short;
    placePinDest(r.lat, r.lng);
    MAP.tapCount = 0;
    document.getElementById('map-hint').classList.add('gone');
  });
  // Mobile
  setupAC('mo-inp', 'mo-drop', r => {
    APP.originLL = r; APP.originLabel = r.short;
    setVal('o-inp', r.short);
    placePinOrigin(r.lat, r.lng); MAP.tapCount = 1;
  });
  setupAC('md-inp', 'md-drop', r => {
    APP.destLL = r; APP.destLabel = r.short;
    setVal('d-inp', r.short);
    placePinDest(r.lat, r.lng); MAP.tapCount = 0;
  });

  // GPS
  document.getElementById('gps-btn')?.addEventListener('click', useGPS);

  // Enter-key triggers analysis
  ['o-inp','d-inp','mo-inp','md-inp'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { syncMob(); runAnalysis(); }
    });
  });

  // Fade out boot screen
  await sleep(200);
  document.getElementById('boot-screen').classList.add('out');

  // Show panel — dashboard is default
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
  if (empty) empty.style.display = 'none'; // Hide once user switches tabs (may or may not have data)
  if (name === 'incidents' && APP.crimes.length) renderIncidents(APP.crimes, APP.refDate);
  if (name === 'saved') loadSavedRoutes();
}

function showSavedTab() { switchPanel('saved'); closeUserMenu(); }

/* ── MOBILE MENU ──────────────────────────────────────────────── */
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

/* ── SWAP INPUTS ──────────────────────────────────────────────── */
function swapInputs() {
  const oi = document.getElementById('o-inp');
  const di = document.getElementById('d-inp');
  if (!oi || !di) return;
  [oi.value, di.value]           = [di.value, oi.value];
  [APP.originLL, APP.destLL]     = [APP.destLL, APP.originLL];
  [APP.originLabel, APP.destLabel] = [APP.destLabel, APP.originLabel];
  setVal('mo-inp', oi.value);
  setVal('md-inp', di.value);
  toast('Locations swapped.', 'info');
}

/* ── CLEAR ALL ────────────────────────────────────────────────── */
function clearAll() {
  if (MAP.routeLayer) { MAP.lmap.removeLayer(MAP.routeLayer); MAP.routeLayer = null; }
  if (MAP.originMk)   { MAP.lmap.removeLayer(MAP.originMk);  MAP.originMk = null; }
  if (MAP.destMk)     { MAP.lmap.removeLayer(MAP.destMk);    MAP.destMk   = null; }
  clearCrimeMarkers();
  APP.originLL = null; APP.destLL = null;
  APP.originLabel = ''; APP.destLabel = '';
  APP.crimes = []; APP.refDate = null;
  MAP.tapCount = 0;
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
    if (!q) { toast('Please enter an origin address or tap the map.', 'warn'); return; }
    showLoader(true, 'Geocoding origin…');
    const res = await geocodeForward(q);
    if (!res?.length) { hideLoader(); toast('Origin not found in Los Angeles. Try a more specific address.', 'error'); return; }
    APP.originLL = res[0]; APP.originLabel = res[0].short;
    placePinOrigin(res[0].lat, res[0].lng);
    MAP.tapCount = 1;
  }

  // ── Resolve destination ─────────────────────────────────────
  if (!APP.destLL) {
    const q = document.getElementById('d-inp')?.value.trim();
    if (!q) { hideLoader(); toast('Please enter a destination address.', 'warn'); return; }
    showLoader(true, 'Geocoding destination…');
    const res = await geocodeForward(q);
    if (!res?.length) { hideLoader(); toast('Destination not found in Los Angeles. Try a more specific address.', 'error'); return; }
    APP.destLL = res[0]; APP.destLabel = res[0].short;
    placePinDest(res[0].lat, res[0].lng);
    MAP.tapCount = 0;
  }

  document.getElementById('map-hint').classList.add('gone');

  const btn = document.getElementById('analyze-btn');
  if (btn) btn.disabled = true;

  // ── Draw route ──────────────────────────────────────────────
  showLoader(true, 'Calculating route via OpenRouteService…');
  const routeInfo = await drawRouteORS(APP.originLL, APP.destLL);
  const km  = routeInfo.km;
  const min = routeInfo.min;
  if (!routeInfo.ok) toast('ORS routing unavailable — using straight-line fallback.', 'warn');

  // ── Fetch LAPD data ─────────────────────────────────────────
  showLoader(true, 'Fetching LAPD crime data…');
  let crimes = [];
  try {
    crimes = await fetchCrimes(APP.originLL, APP.destLL, APP.radiusKm);
  } catch (err) {
    hideLoader();
    if (btn) btn.disabled = false;
    toast('LAPD API error: ' + err.message, 'error');
    console.error(err);
    return;
  }
  APP.crimes = crimes;

  // ── Compute dataset reference date ──────────────────────────
  APP.refDate = computeRefDate(crimes);
  const refLabel = APP.refDate.toLocaleDateString('en-US',{month:'short',year:'numeric'});

  // ── Score ────────────────────────────────────────────────────
  showLoader(true, `Scoring ${crimes.length} incidents…`);
  const oRes    = scoreLocation(crimes, APP.originLL.lat, APP.originLL.lng, APP.radiusKm, APP.refDate);
  const dRes    = scoreLocation(crimes, APP.destLL.lat,   APP.destLL.lng,   APP.radiusKm, APP.refDate);
  const rtScore = calcRouteScore(oRes.score, dRes.score, crimes);
  APP.lastScore = rtScore;

  // Period
  const dates  = crimes.filter(c=>c.date).map(c=>c.date).sort((a,b)=>a-b);
  const period = dates.length
    ? `${dates[0].toLocaleDateString('en-US',{month:'short',year:'numeric'})} – ${dates[dates.length-1].toLocaleDateString('en-US',{month:'short',year:'numeric'})}`
    : '—';

  // ── Render crime markers ─────────────────────────────────────
  renderCrimeMarkers(crimes, APP.refDate);

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
  renderRoutes(rtScore, crimes, km, min);

  // Stagger card animations
  document.querySelectorAll('.sc-card,.rt-card,.cc,.verdict').forEach((el,i) => {
    el.style.animationDelay = `${i*.04}s`;
    el.classList.remove('fu'); void el.offsetWidth; el.classList.add('fu');
  });

  hideLoader();
  if (btn) btn.disabled = false;

  const rl = riskLevel(rtScore);
  toast(
    `Analysis complete · ${crimes.length} incidents · Score: ${rtScore}/100 (${rl.label})`,
    rtScore >= 65 ? 'success' : rtScore >= 45 ? 'warn' : 'error'
  );

  document.getElementById('panel-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
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
  const tc    = document.getElementById('toasts');
  if (!tc) return;
  const el    = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}" style="flex-shrink:0;margin-top:1px"></i><span>${xss(msg)}</span>`;
  tc.appendChild(el);
  setTimeout(() => { el.classList.add('t-out'); el.addEventListener('animationend', () => el.remove()); }, 5500);
}

/* ── UTILS ────────────────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
