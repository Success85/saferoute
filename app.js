/**
 * ================================================================
 *  LA SafeNav — app.js
 *  Data source: https://data.lacity.org/resource/2nrs-mtv8.json
 *  (LAPD Crime Data 2020–2024)
 *
 *  BUG FIX: S.originLatLng / S.destLatLng were only set when a
 *  user clicked an autocomplete suggestion. If they typed and
 *  pressed Analyze directly, both were null → "Please enter both"
 *  error every time.
 *
 *  FIX: resolveLocation() now geocodes the raw input text on the
 *  fly if coords aren't already stored, before runAnalysis starts.
 * ================================================================
 */

'use strict';

/* ── CONFIGURATION ─────────────────────────────────────── */
const API_ENDPOINT = 'https://data.lacity.org/resource/2nrs-mtv8.json';

const LA_CENTER = [34.0522, -118.2437];
const LA_BOUNDS = { minLat: 33.7, maxLat: 34.35, minLng: -118.7, maxLng: -118.15 };

const VIOLENT_KEYWORDS = [
  'HOMICIDE','MURDER','ASSAULT','ROBBERY','RAPE','KIDNAPPING',
  'SHOOTING','STABBING','BATTERY','ARSON','CARJACKING','LYNCHING',
  'HUMAN TRAFFICKING','MANSLAUGHTER',
];

const PROPERTY_KEYWORDS = [
  'BURGLARY','THEFT','STOLEN','SHOPLIFTING','VANDALISM','FRAUD',
  'EMBEZZLEMENT','EXTORTION','FORGERY','PICKPOCKET','PURSE',
  'VEHICLE - STOLEN','MOTOR VEHICLE',
];

/* ── STATE ─────────────────────────────────────────────── */
const S = {
  map:           null,
  tile:          null,
  routeCtrl:     null,
  crimeMarkers:  [],
  radiusKm:      1.5,
  showMarkers:   true,
  originLatLng:  null,
  destLatLng:    null,
  originMarker:  null,
  destMarker:    null,
  crimes:        [],
  filteredType:  'all',
  debounce:      {},
};

/* ================================================================
   MAP INIT
================================================================ */
function initMap() {
  S.map = L.map('map', {
    center: LA_CENTER,
    zoom: 12,
    zoomControl: false,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(S.map);

  S.map.attributionControl.setPrefix(
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
    '| <a href="https://carto.com/attributions">CARTO</a> ' +
    '| <a href="https://data.lacity.org/Public-Safety/Crime-Data-from-2020-to-2024/2nrs-mtv8">LAPD Open Data</a>'
  );

  applyTileLayer();
}

function applyTileLayer() {
  const dark = document.documentElement.dataset.theme === 'dark';
  if (S.tile) S.map.removeLayer(S.tile);
  S.tile = L.tileLayer(
    dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 20 }
  ).addTo(S.map);
}

/* ================================================================
   GEOCODING — Nominatim (Los Angeles bounded)
================================================================ */
async function geocode(query) {
  if (!query || query.trim().length < 3) return null;
  const { minLat, maxLat, minLng, maxLng } = LA_BOUNDS;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query + ', Los Angeles, CA');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);

  try {
    const r = await fetch(url.toString(), {
      headers: { 'Accept-Language': 'en-US', 'User-Agent': 'LASafeNav/2.0' },
    });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    const data = await r.json();
    return data.map(d => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      label: d.display_name,
    }));
  } catch (e) {
    showToast('Geocoding unavailable: ' + e.message, 'error');
    return null;
  }
}

/* ================================================================
   resolveLocation — THE CORE FIX
   ─────────────────────────────
   Returns existing S.originLatLng / S.destLatLng if already set
   (user clicked a suggestion). Otherwise geocodes the raw input
   text right now and stores + returns the best result.
   Returns null if the input is empty or geocoding totally fails.
================================================================ */
async function resolveLocation(inputId, stateKey) {
  // Already resolved from a suggestion click — use it directly
  if (S[stateKey]) return S[stateKey];

  const inp = document.getElementById(inputId);
  const raw = inp ? inp.value.trim() : '';

  if (!raw) return null;

  setInputState(inp, 'loading');
  const results = await geocode(raw);
  setInputState(inp, 'done');

  if (!results || results.length === 0) {
    setInputState(inp, 'error');
    showToast(`Could not find "${raw}" in Los Angeles. Try a more specific address.`, 'error');
    return null;
  }

  // Store best result and update input text to the short label
  const best = results[0];
  best.short = best.label.split(',').slice(0, 3).join(',');
  S[stateKey] = best;

  // Update the input to show the resolved short label
  if (inp) inp.value = best.short;

  return best;
}

/* Visual state feedback on inputs during geocoding */
function setInputState(inp, state) {
  if (!inp) return;
  inp.classList.remove('inp-loading', 'inp-error', 'inp-ok');
  if (state === 'loading') inp.classList.add('inp-loading');
  if (state === 'error')   inp.classList.add('inp-error');
  if (state === 'done')    inp.classList.add('inp-ok');
}

/* ================================================================
   AUTOCOMPLETE
   ─────────────
   When user CLICKS a suggestion sets S.originLatLng/destLatLng
   immediately (fast path). resolveLocation() above handles the
   case where they don't click a suggestion.
================================================================ */
function setupAC(inputId, suggId, onPick) {
  const inp = document.getElementById(inputId);
  const box = document.getElementById(suggId);

  // Clear stored coords when user starts retyping
  inp.addEventListener('input', () => {
    // Invalidate stored coords so resolveLocation geocodes fresh
    if (inputId === 'origin-input') S.originLatLng = null;
    if (inputId === 'dest-input')   S.destLatLng   = null;
    inp.classList.remove('inp-loading', 'inp-error', 'inp-ok');

    clearTimeout(S.debounce[inputId]);
    const q = inp.value.trim();
    if (q.length < 3) { closeSugg(box); return; }
    S.debounce[inputId] = setTimeout(async () => {
      const res = await geocode(q);
      renderSugg(box, res, inp, onPick);
    }, 380);
  });

  inp.addEventListener('keydown', e => { if (e.key === 'Escape') closeSugg(box); });
  document.addEventListener('click', e => {
    if (!inp.contains(e.target) && !box.contains(e.target)) closeSugg(box);
  });
}

function renderSugg(box, results, inp, onPick) {
  box.innerHTML = '';
  if (!results || results.length === 0) { closeSugg(box); return; }
  results.slice(0, 5).forEach(r => {
    const el = document.createElement('div');
    el.className = 'sugg-item';
    const short = r.label.split(',').slice(0, 3).join(',');
    el.innerHTML = `<i class="fa-solid fa-location-dot"></i><span>${xss(short)}</span>`;
    el.addEventListener('click', () => {
      inp.value = short;
      closeSugg(box);
      inp.classList.remove('inp-loading', 'inp-error');
      inp.classList.add('inp-ok');
      onPick({ ...r, short });
    });
    box.appendChild(el);
  });
  box.classList.add('open');
}

function closeSugg(box) { box.classList.remove('open'); box.innerHTML = ''; }

/* ================================================================
   ROUTING — OSRM via Leaflet Routing Machine
================================================================ */
function drawRoute(o, d) {
  if (S.routeCtrl) { S.map.removeControl(S.routeCtrl); S.routeCtrl = null; }

  try {
    S.routeCtrl = L.Routing.control({
      waypoints: [L.latLng(o.lat, o.lng), L.latLng(d.lat, d.lng)],
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: () => null,
      lineOptions: {
        styles: [
          { color: '#63b3ed', weight: 5, opacity: .85 },
          { color: '#1e3a5f', weight: 9, opacity: .18 },
        ],
        addWaypoints: false,
      },
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
    }).addTo(S.map);

    S.routeCtrl.on('routesfound', e => {
      const rt = e.routes[0];
      const km  = (rt.summary.totalDistance / 1000).toFixed(1);
      const min = Math.round(rt.summary.totalTime / 60);
      setText('route-dist', `${km} km distance`);
      setText('route-time', `${min} min drive`);
    });

    S.routeCtrl.on('routingerror', () => {
      showToast('OSRM routing failed. Route overlay skipped; scoring continues.', 'warn');
    });
  } catch (err) {
    showToast('Route error: ' + err.message, 'error');
  }
}

/* ================================================================
   LAPD SODA API FETCH
================================================================ */
async function fetchCrimes(oLL, dLL) {
  const buf    = Math.max(S.radiusKm * 0.025, 0.025);
  const minLat = Math.min(oLL.lat, dLL.lat) - buf;
  const maxLat = Math.max(oLL.lat, dLL.lat) + buf;
  const minLng = Math.min(oLL.lng, dLL.lng) - buf;
  const maxLng = Math.max(oLL.lng, dLL.lng) + buf;

  if (minLat > LA_BOUNDS.maxLat || maxLat < LA_BOUNDS.minLat ||
      minLng > LA_BOUNDS.maxLng || maxLng < LA_BOUNDS.minLng) {
    showToast('Locations appear outside Los Angeles. This app uses LAPD data only.', 'warn');
  }

  setLoaderMsg('Querying LAPD Crime Database…');

  const where = [
    `lat IS NOT NULL`,
    `lon IS NOT NULL`,
    `lat != '0.0'`,
    `lon != '0.0'`,
    `lat > '${minLat}'`,
    `lat < '${maxLat}'`,
    `lon > '${minLng}'`,
    `lon < '${maxLng}'`,
    `date_occ >= '2020-01-01T00:00:00'`,
  ].join(' AND ');

  // FIX 1: Build URL as a plain string — NEVER use URLSearchParams for
  // Socrata $-prefixed params. URLSearchParams encodes $ as %24, so
  // $where becomes %24where which Socrata ignores → empty result / 403.
  // The $ characters MUST remain literal in the final URL string.
  // Only the VALUES (whereClause, selectFields) are encoded.
  const APP_TOKEN   = 'twFAnZFlGFmESjd8vKBRLpPfEWslzbz34FJsggy3';
  const selectFields = 'dr_no,date_occ,time_occ,crm_cd_desc,area_name,premis_desc,weapon_desc,vict_sex,vict_age,vict_descent,status_desc,part_1_2,location,lat,lon';

  const url = API_ENDPOINT
    + '?$$app_token=' + APP_TOKEN
    + '&$limit=1000'
    + '&$order=date_occ DESC'
    + '&$where=' + encodeURIComponent(where)
    + '&$select=' + encodeURIComponent(selectFields);

  try {
    const r = await fetch(url, {
      mode: 'cors',
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`API ${r.status}: ${txt.slice(0, 160)}`);
    }
    const raw = await r.json();

    const crimes = raw
      .map(normalizeRecord)
      .filter(c => c.lat && c.lng && !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0);

    setText('map-attr-text',
      `${crimes.length} LAPD incidents loaded · ` +
      `Box: ${minLat.toFixed(3)},${minLng.toFixed(3)} → ${maxLat.toFixed(3)},${maxLng.toFixed(3)} · ` +
      `data.lacity.org/resource/2nrs-mtv8`
    );

    return crimes;
  } catch (err) {
    showToast('LAPD API error: ' + err.message, 'error');
    console.error('fetchCrimes error', err);
    return [];
  }
}

function normalizeRecord(r) {
  const lat  = parseFloat(r.lat  ?? 0);
  const lng  = parseFloat(r.lon  ?? 0);
  const desc = (r.crm_cd_desc ?? 'UNKNOWN').trim().toUpperCase();
  const date = r.date_occ ? new Date(r.date_occ) : null;

  let timeStr = '';
  if (r.time_occ && r.time_occ.length >= 3) {
    const t = r.time_occ.padStart(4, '0');
    timeStr = `${t.slice(0,2)}:${t.slice(2,4)}`;
  }

  return {
    id:         r.dr_no ?? '',
    lat, lng,
    date,
    timeStr,
    desc,
    area:       r.area_name    ?? '',
    premis:     r.premis_desc  ?? '',
    weapon:     r.weapon_desc  ?? '',
    victSex:    r.vict_sex     ?? '',
    victAge:    parseInt(r.vict_age ?? 0) || 0,
    victDesc:   r.vict_descent ?? '',
    status:     r.status_desc  ?? '',
    part:       r.part_1_2     ?? '',
    address:    r.location     ?? '',
    isViolent:  VIOLENT_KEYWORDS.some(k => desc.includes(k)),
    isProperty: PROPERTY_KEYWORDS.some(k => desc.includes(k)),
  };
}

/* ================================================================
   SAFETY SCORING
================================================================ */
function scoreLocation(crimes, cLat, cLng) {
  const now   = Date.now();
  const radM  = S.radiusKm * 1000;
  let ded     = 0, total = 0, violent = 0, recent = 0;
  const areas = {};

  for (const c of crimes) {
    const distM   = haversine(cLat, cLng, c.lat, c.lng) * 1000;
    if (distM > radM) continue;
    total++;

    if (c.isViolent) violent++;
    const ageDays = c.date ? (now - c.date.getTime()) / 86400000 : Infinity;
    if (ageDays <= 90) recent++;

    let rec  = 0.5;
    if      (ageDays <= 30)  rec = 2.0;
    else if (ageDays <= 90)  rec = 1.4;
    else if (ageDays <= 365) rec = 1.0;

    let dist = 0.45;
    if      (distM < 200) dist = 1.0;
    else if (distM < 400) dist = 0.75;

    let tw = 1.5;
    if (c.isViolent)       tw = c.part === '1' ? 12 : 9;
    else if (c.isProperty) tw = 4;

    ded += tw * rec * dist;
    if (c.area) areas[c.area] = (areas[c.area] || 0) + 1;
  }

  const score   = Math.max(0, Math.min(100, Math.round(100 - ded)));
  const topArea = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  return { score, total, violent, recent, topArea };
}

function routeScore(oScore, dScore, allCrimes) {
  const density = Math.min(40, allCrimes.length * 0.25);
  const base    = (oScore * 0.35 + dScore * 0.35) + (50 - density) * 0.6;
  return Math.max(0, Math.min(100, Math.round(base)));
}

function riskLabel(score) {
  if (score >= 70) return { text: 'SAFE',      cls: 'b-safe'     };
  if (score >= 45) return { text: 'MODERATE',  cls: 'b-moderate' };
  return               { text: 'HIGH RISK', cls: 'b-danger'   };
}

/* ================================================================
   MARKER RENDERING
================================================================ */
function clearMarkers() {
  S.crimeMarkers.forEach(m => S.map.removeLayer(m));
  S.crimeMarkers = [];
}

function renderMarkers(crimes) {
  clearMarkers();
  if (!S.showMarkers) return;
  const lim = Math.min(crimes.length, 500);

  for (let i = 0; i < lim; i++) {
    const c    = crimes[i];
    const icon = incidentIcon(c);
    const m    = L.marker([c.lat, c.lng], { icon, opacity: .88 })
      .addTo(S.map)
      .bindPopup(incidentPopup(c), { maxWidth: 280 });
    S.crimeMarkers.push(m);
  }
}

function incidentIcon(c) {
  const now     = Date.now();
  const ageDays = c.date ? (now - c.date.getTime()) / 86400000 : 999;
  const color   = c.isViolent ? '#f43f5e' : c.isProperty ? '#f97316' : '#8b5cf6';
  const sz      = ageDays <= 30 ? 14 : ageDays <= 90 ? 11 : 8;
  const op      = ageDays <= 30 ? .95 : ageDays <= 90 ? .7 : .45;

  return L.divIcon({
    html: `<div style="
      width:${sz}px;height:${sz}px;border-radius:50%;
      background:${color};opacity:${op};
      border:2px solid rgba(255,255,255,.55);
      box-shadow:0 0 5px ${color}99;
    "></div>`,
    className: '',
    iconSize:   [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
}

function incidentPopup(c) {
  const ageDays = c.date ? Math.round((Date.now() - c.date.getTime()) / 86400000) : null;
  const ageStr  = ageDays === null ? '—' : ageDays === 0 ? 'Today' : `${ageDays}d ago`;
  const cat     = c.isViolent ? 'vi' : c.isProperty ? 'pr' : 'ot';
  const catTx   = c.isViolent ? 'Violent' : c.isProperty ? 'Property' : 'Other';
  const dateF   = c.date ? c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return `<div class="crime-popup">
    <div class="cp-header">
      <div class="cp-icon ${cat}"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <div class="cp-title">${xss(c.desc)}</div>
    </div>
    <div class="cp-rows">
      ${c.address ? `<div class="cp-row"><i class="fa-solid fa-map-pin"></i><span>${xss(c.address)}</span></div>` : ''}
      ${c.area    ? `<div class="cp-row"><i class="fa-solid fa-building-shield"></i><span>${xss(c.area)} Division</span></div>` : ''}
      ${c.premis  ? `<div class="cp-row"><i class="fa-solid fa-location-crosshairs"></i><span>${xss(c.premis)}</span></div>` : ''}
      ${c.weapon  ? `<div class="cp-row"><i class="fa-solid fa-gun"></i><span>${xss(c.weapon)}</span></div>` : ''}
      <div class="cp-row"><i class="fa-solid fa-clock"></i><span>${dateF}${c.timeStr ? ' · ' + c.timeStr : ''} (${ageStr})</span></div>
      <div class="cp-row"><i class="fa-solid fa-tag"></i>
        <span style="color:var(--${cat==='vi'?'violent':cat==='pr'?'property':'other'}-clr);font-weight:600">${catTx}</span>
      </div>
      ${c.status  ? `<div class="cp-row"><i class="fa-solid fa-gavel"></i><span>${xss(c.status)}</span></div>` : ''}
    </div>
  </div>`;
}

/* ================================================================
   DASHBOARD RENDERING
================================================================ */
function renderDashboard(crimes, oResult, dResult, rtScore) {
  const grid  = document.getElementById('dashboard-grid');
  const empty = document.getElementById('empty-state');
  grid.hidden = false;
  grid.style.display = 'grid';
  empty.style.display = 'none';

  document.querySelectorAll('.dash-card').forEach((c, i) => {
    c.style.animationDelay = `${i * 0.06}s`;
    c.classList.remove('fade-up');
    void c.offsetWidth;
    c.classList.add('fade-up');
  });

  renderScoreCard('origin', oResult);
  renderScoreCard('dest',   dResult);
  renderRouteCard(rtScore, crimes);
  renderBreakdown(crimes);
  renderDemographics(crimes);
  renderIncidents(crimes);
  renderWeapons(crimes);
  renderAreas(crimes);

  const dates = crimes.filter(c => c.date).map(c => c.date).sort((a, b) => a - b);
  if (dates.length) {
    const oldest = dates[0].toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const newest = dates[dates.length-1].toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    setText('route-period', `${oldest} – ${newest}`);
  }
  setText('route-incidents', `${crimes.length} total incidents`);
}

const ARC_LEN = 172;

function renderScoreCard(prefix, res) {
  const { score, total, violent, recent, topArea } = res;
  const { text, cls } = riskLabel(score);

  const arc = document.getElementById(`arc-${prefix}`);
  if (arc) {
    // FIX 2: SVG <path>.className is a read-only SVGAnimatedString getter.
    // Must use setAttribute('class', ...) — direct assignment throws.
    arc.setAttribute('class', `arc-fill risk-${cls.replace('b-','')}`);
    const fill = (score / 100) * ARC_LEN;
    requestAnimationFrame(() => {
      arc.style.strokeDasharray = `${fill} ${ARC_LEN + 10}`;
    });
  }

  animateNum(`${prefix}-score`, score, '');

  const badge = document.getElementById(`${prefix}-badge`);
  if (badge) { badge.textContent = text; badge.className = `risk-badge ${cls}`; }

  setText(`${prefix}-total`,   `${total} total incidents`);
  setText(`${prefix}-violent`, `${violent} violent crimes`);
  setText(`${prefix}-recent`,  `${recent} in last 90 days`);
  setText(`${prefix}-area`,    topArea ? `${topArea} Division` : '—');

  const scoreEl = document.getElementById(`${prefix}-score`);
  if (scoreEl) {
    scoreEl.style.color = score >= 70 ? 'var(--safe)' : score >= 45 ? 'var(--moderate)' : 'var(--danger)';
  }
}

function renderRouteCard(score, crimes) {
  const { text, cls } = riskLabel(score);
  animateNum('route-score', score, '');

  const rNum = document.getElementById('route-score');
  if (rNum) rNum.style.color = score >= 70 ? 'var(--safe)' : score >= 45 ? 'var(--moderate)' : 'var(--danger)';

  const badge = document.getElementById('route-badge');
  if (badge) { badge.textContent = text; badge.className = `risk-badge ${cls}`; }

  const fill = document.getElementById('route-bar-fill');
  if (fill) {
    fill.style.backgroundPosition = `${100 - score}% 0`;
    requestAnimationFrame(() => { fill.style.width = `${score}%`; });
  }
}

function renderBreakdown(crimes) {
  const counts = {};
  crimes.forEach(c => { counts[c.desc] = (counts[c.desc] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max    = sorted[0]?.[1] || 1;
  const el     = document.getElementById('breakdown-list');
  if (!el) return;

  if (sorted.length === 0) { el.innerHTML = '<p class="no-data-note">No crime data</p>'; return; }

  el.innerHTML = sorted.map(([label, count]) => {
    const pct   = Math.round((count / max) * 100);
    const color = VIOLENT_KEYWORDS.some(k => label.includes(k))
      ? 'var(--violent-clr)'
      : PROPERTY_KEYWORDS.some(k => label.includes(k))
        ? 'var(--property-clr)'
        : 'var(--other-clr)';
    return `<div class="breakdown-row">
      <div class="brow-label" title="${xss(label)}">${xss(capWords(label))}</div>
      <div class="brow-bar-bg"><div class="brow-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="brow-count mono">${count}</div>
    </div>`;
  }).join('');
}

function renderDemographics(crimes) {
  const gender = { M: 0, F: 0, X: 0 };
  crimes.forEach(c => {
    const s = (c.victSex || '').toUpperCase();
    if (s === 'M') gender.M++; else if (s === 'F') gender.F++; else gender.X++;
  });
  const gtotal = crimes.length || 1;
  const gEl    = document.getElementById('gender-bars');
  if (gEl) gEl.innerHTML = [
    { key: 'Male',    val: gender.M, color: '#63b3ed' },
    { key: 'Female',  val: gender.F, color: '#f9a8d4' },
    { key: 'Unknown', val: gender.X, color: '#9ca3af' },
  ].filter(g => g.val > 0).map(g => {
    const pct = Math.round((g.val / gtotal) * 100);
    return `<div class="demo-row">
      <div class="demo-key">${g.key}</div>
      <div class="demo-bar-bg"><div class="demo-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>
      <div class="demo-pct">${pct}%</div>
    </div>`;
  }).join('');

  const ages = { 'Under 18': 0, '18–25': 0, '26–40': 0, '41–60': 0, '60+': 0 };
  crimes.forEach(c => {
    const a = c.victAge;
    if (!a || a === 0) return;
    if (a < 18)       ages['Under 18']++;
    else if (a <= 25) ages['18–25']++;
    else if (a <= 40) ages['26–40']++;
    else if (a <= 60) ages['41–60']++;
    else              ages['60+']++;
  });
  const atotal    = Object.values(ages).reduce((a, b) => a + b, 0) || 1;
  const aEl       = document.getElementById('age-bars');
  const ageColors = ['#34d399','#63b3ed','#f59e0b','#f97316','#ef4444'];
  if (aEl) aEl.innerHTML = Object.entries(ages).map(([k, v], i) => {
    const pct = Math.round((v / atotal) * 100);
    return `<div class="demo-row">
      <div class="demo-key">${k}</div>
      <div class="demo-bar-bg"><div class="demo-bar-fill" style="width:${pct}%;background:${ageColors[i]}"></div></div>
      <div class="demo-pct">${pct}%</div>
    </div>`;
  }).join('');
}

function renderIncidents(crimes) {
  const type = S.filteredType;
  let list   = crimes.slice();
  if (type === 'violent')  list = list.filter(c => c.isViolent);
  if (type === 'property') list = list.filter(c => c.isProperty);
  list.sort((a, b) => (b.date || 0) - (a.date || 0));
  list = list.slice(0, 80);

  const el = document.getElementById('incidents-list');
  if (!el) return;

  if (list.length === 0) { el.innerHTML = '<p class="no-data-note">No incidents for this filter</p>'; return; }

  el.innerHTML = list.map(c => {
    const cat   = c.isViolent ? 'violent' : c.isProperty ? 'property' : 'other';
    const dateF = c.date ? c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
    const meta  = [c.area, c.premis].filter(Boolean).slice(0, 2).join(' · ');
    return `<div class="inc-row ${cat}-row">
      <div class="inc-dot ${cat}"></div>
      <div class="inc-body">
        <div class="inc-type">${xss(capWords(c.desc))}</div>
        ${meta ? `<div class="inc-meta">${xss(meta)}</div>` : ''}
      </div>
      <div class="inc-date">${dateF}</div>
    </div>`;
  }).join('');
}

function renderWeapons(crimes) {
  const counts = {};
  crimes.forEach(c => {
    if (!c.weapon) return;
    const w = capWords(c.weapon.replace(/\(.*?\)/g, '').trim());
    counts[w] = (counts[w] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max    = sorted[0]?.[1] || 1;
  const el     = document.getElementById('weapons-list');
  if (!el) return;

  if (sorted.length === 0) { el.innerHTML = '<p class="no-data-note">No weapon data in this area</p>'; return; }

  el.innerHTML = sorted.map(([w, n]) => {
    const pct = Math.round((n / max) * 100);
    return `<div class="weapon-row">
      <div class="weapon-name" title="${xss(w)}">${xss(w)}</div>
      <div class="weapon-bar-bg"><div class="weapon-bar-fill" style="width:${pct}%"></div></div>
      <div class="weapon-count mono">${n}</div>
    </div>`;
  }).join('');
}

function renderAreas(crimes) {
  const counts  = {};
  const violent = {};
  crimes.forEach(c => {
    if (!c.area) return;
    counts[c.area]  = (counts[c.area]  || 0) + 1;
    if (c.isViolent) violent[c.area] = (violent[c.area] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const el     = document.getElementById('area-list');
  if (!el) return;

  if (sorted.length === 0) { el.innerHTML = '<p class="no-data-note">No area data</p>'; return; }

  el.innerHTML = sorted.map(([area, total]) => {
    const vRatio = (violent[area] || 0) / total;
    const { cls } = riskLabel(Math.round(100 - vRatio * 200));
    return `<div class="area-row">
      <div class="area-name">${xss(area)}</div>
      <div class="area-count mono">${total} incidents</div>
      <div class="area-risk ${cls}">${vRatio > 0.2 ? 'HIGH' : vRatio > 0.08 ? 'MOD' : 'LOW'}</div>
    </div>`;
  }).join('');
}

/* ================================================================
   PLACE PINS
================================================================ */
function placePins() {
  if (S.originMarker) S.map.removeLayer(S.originMarker);
  if (S.destMarker)   S.map.removeLayer(S.destMarker);

  if (S.originLatLng) {
    S.originMarker = L.marker([S.originLatLng.lat, S.originLatLng.lng], { icon: pinIcon('#63b3ed') })
      .addTo(S.map)
      .bindPopup(`<div class="crime-popup"><div class="cp-header"><div class="cp-icon vi"><i class="fa-solid fa-location-dot"></i></div><div class="cp-title">Origin</div></div></div>`);
  }
  if (S.destLatLng) {
    S.destMarker = L.marker([S.destLatLng.lat, S.destLatLng.lng], { icon: pinIcon('#34d399') })
      .addTo(S.map)
      .bindPopup(`<div class="crime-popup"><div class="cp-header"><div class="cp-icon ot"><i class="fa-solid fa-flag-checkered"></i></div><div class="cp-title">Destination</div></div></div>`);
  }
}

function pinIcon(color) {
  return L.divIcon({
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${color};
      border:3px solid white;
      box-shadow:0 3px 12px rgba(0,0,0,.4);
    "></div>`,
    className: '',
    iconSize:   [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -20],
  });
}

/* ================================================================
   MAIN ANALYSIS FLOW
   ──────────────────
   KEY FIX: calls resolveLocation() for BOTH inputs before
   doing anything else. This handles the case where the user
   typed an address but never clicked a suggestion.
================================================================ */
async function runAnalysis() {
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;
  showLoader(true, 'Resolving locations…');

  try {
    // ── STEP 1: Resolve coordinates (geocode if not already set) ──
    setLoaderMsg('Geocoding origin…');
    const origin = await resolveLocation('origin-input', 'originLatLng');
    if (!origin) {
      showToast('Could not resolve origin address. Please try a different address in Los Angeles.', 'error');
      showLoader(false);
      btn.disabled = false;
      return;
    }

    setLoaderMsg('Geocoding destination…');
    const dest = await resolveLocation('dest-input', 'destLatLng');
    if (!dest) {
      showToast('Could not resolve destination address. Please try a different address in Los Angeles.', 'error');
      showLoader(false);
      btn.disabled = false;
      return;
    }

    // ── STEP 2: Place pins ──
    setLoaderMsg('Placing route markers…');
    placePins();

    // ── STEP 3: Draw route ──
    setLoaderMsg('Building route via OSRM…');
    drawRoute(origin, dest);
    await sleep(700);

    // ── STEP 4: Fetch crimes ──
    setLoaderMsg('Fetching LAPD crime records…');
    const crimes = await fetchCrimes(origin, dest);
    S.crimes = crimes;

    if (crimes.length === 0) {
      showToast(
        'No crime records found in this corridor. ' +
        'Try a longer radius or check that your addresses are within Los Angeles city limits.',
        'warn'
      );
    } else {
      setLoaderMsg(`Processing ${crimes.length} incidents…`);
    }

    await sleep(300);

    // ── STEP 5: Render markers ──
    renderMarkers(crimes);

    // ── STEP 6: Score ──
    setLoaderMsg('Computing safety scores…');
    const oRes = scoreLocation(crimes, origin.lat, origin.lng);
    const dRes = scoreLocation(crimes, dest.lat,   dest.lng);
    const rtSc = routeScore(oRes.score, dRes.score, crimes);

    // ── STEP 7: Dashboard ──
    renderDashboard(crimes, oRes, dRes, rtSc);

    showToast(
      `Analysis complete · ${crimes.length} incidents · Origin: ${oRes.score}/100 · Dest: ${dRes.score}/100`,
      rtSc >= 70 ? 'success' : rtSc >= 45 ? 'warn' : 'error'
    );

    document.getElementById('analysis-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('Analysis failed', err);
    showToast('Analysis error: ' + err.message, 'error');
  } finally {
    showLoader(false);
    btn.disabled = false;
  }
}

/* ================================================================
   CLEAR ALL
================================================================ */
function clearAll() {
  clearMarkers();
  if (S.routeCtrl)    { S.map.removeControl(S.routeCtrl); S.routeCtrl = null; }
  if (S.originMarker) { S.map.removeLayer(S.originMarker); S.originMarker = null; }
  if (S.destMarker)   { S.map.removeLayer(S.destMarker);   S.destMarker   = null; }

  S.originLatLng = null;
  S.destLatLng   = null;
  S.crimes       = [];

  const oInp = document.getElementById('origin-input');
  const dInp = document.getElementById('dest-input');
  if (oInp) { oInp.value = ''; oInp.classList.remove('inp-loading','inp-error','inp-ok'); }
  if (dInp) { dInp.value = ''; dInp.classList.remove('inp-loading','inp-error','inp-ok'); }

  const grid  = document.getElementById('dashboard-grid');
  const empty = document.getElementById('empty-state');
  if (grid)  { grid.hidden = true; grid.style.display = ''; }
  if (empty) empty.style.display = '';

  setText('map-attr-text', 'Enter origin & destination to fetch live LAPD crime data');
  showToast('Route and analysis cleared.', 'info');
}

/* ================================================================
   UI HELPERS
================================================================ */
function showLoader(v, msg) {
  const ov = document.getElementById('loading-overlay');
  ov.classList.toggle('gone', !v);
  if (msg) setLoaderMsg(msg);
}
function setLoaderMsg(m) {
  const el = document.getElementById('loader-msg');
  if (el) el.textContent = m;
}

function showToast(msg, type = 'info') {
  const c     = document.getElementById('toast-container');
  const icons = { info:'fa-circle-info', error:'fa-circle-exclamation', success:'fa-circle-check', warn:'fa-triangle-exclamation' };
  const t     = document.createElement('div');
  t.className = `toast t-${type === 'warn' ? 'warn' : type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${xss(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('t-out'); t.addEventListener('animationend', () => t.remove()); }, 5500);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateNum(id, target, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const dur   = 900;
  const t0    = performance.now();
  const tick  = now => {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * e) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = toRad(lat2 - lat1), dN = toRad(lng2 - lng1);
  const a  = Math.sin(dL/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dN/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toRad(d) { return d * Math.PI / 180; }

function capWords(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function xss(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ================================================================
   THEME
================================================================ */
function initTheme() {
  const saved = localStorage.getItem('lasafenav-theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('lasafenav-theme', t);
  if (S.map) applyTileLayer();
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

/* ================================================================
   BOOT
================================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initMap();
  await sleep(700);
  showLoader(false);

  // Autocomplete (fast path — sets coords immediately on suggestion click)
  setupAC('origin-input', 'origin-sugg', r => {
    S.originLatLng = r;
    S.map.flyTo([r.lat, r.lng], 14, { duration: 1 });
  });
  setupAC('dest-input', 'dest-sugg', r => {
    S.destLatLng = r;
  });

  // GPS
  document.getElementById('gps-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported', 'error'); return; }
    showToast('Requesting location…', 'info');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      S.originLatLng = { lat, lng, label: 'Current Location' };
      document.getElementById('origin-input').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      document.getElementById('origin-input').classList.add('inp-ok');
      S.map.flyTo([lat, lng], 14, { duration: 1 });
      showToast('Location set as origin.', 'success');
    }, err => showToast('GPS error: ' + err.message, 'error'));
  });

  // Swap
  document.getElementById('swap-btn').addEventListener('click', () => {
    const ov = document.getElementById('origin-input').value;
    const dv = document.getElementById('dest-input').value;
    document.getElementById('origin-input').value = dv;
    document.getElementById('dest-input').value   = ov;
    const tmp      = S.originLatLng;
    S.originLatLng = S.destLatLng;
    S.destLatLng   = tmp;
    showToast('Origin and destination swapped.', 'info');
  });

  // Analyze
  document.getElementById('analyze-btn').addEventListener('click', runAnalysis);

  // Enter key — triggers full analysis even without suggestion click
  ['origin-input', 'dest-input'].forEach(inputId => {
    document.getElementById(inputId).addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        closeSugg(document.getElementById(
          inputId === 'origin-input' ? 'origin-sugg' : 'dest-sugg'
        ));
        runAnalysis();
      }
    });
  });

  // Radius slider
  const slider = document.getElementById('radius-slider');
  const valEl  = document.getElementById('radius-val');
  slider.addEventListener('input', () => {
    S.radiusKm = parseFloat(slider.value);
    valEl.textContent = `${S.radiusKm.toFixed(1)} km`;
  });

  // Theme
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);

  // Map controls
  document.getElementById('btn-markers').addEventListener('click', function () {
    S.showMarkers = !S.showMarkers;
    this.classList.toggle('mc-active', S.showMarkers);
    S.showMarkers ? renderMarkers(S.crimes) : clearMarkers();
  });
  document.getElementById('btn-markers').classList.add('mc-active');

  document.getElementById('btn-clusters').addEventListener('click', function () {
    this.classList.toggle('mc-active');
    showToast('Cluster view coming soon.', 'info');
  });

  document.getElementById('btn-clear').addEventListener('click', clearAll);

  document.getElementById('btn-recenter').addEventListener('click', () => {
    S.map.flyTo(LA_CENTER, 12, { duration: 1.2 });
  });

  // Incident filter
  document.getElementById('filter-type').addEventListener('change', e => {
    S.filteredType = e.target.value;
    if (S.crimes.length) renderIncidents(S.crimes);
  });

  // Mobile search toggle
  document.getElementById('mobile-search-btn').addEventListener('click', () => {
    document.getElementById('search-bar-wrap').classList.toggle('mobile-open');
  });

  await sleep(300);
  showToast('LA SafeNav ready. Type any LA address and click Analyze.', 'success');
});