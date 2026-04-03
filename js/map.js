'use strict';
/* 
   map.js — Leaflet init, tap-to-pick, ORS route drawing,
            crime dot markers with full popups
 */

const MAP = {
  lmap:         null,
  tile:         null,
  routeLayer:   null,
  altLayer1:    null,
  altLabel1:    null,
  mainLabel:    null,
  _mainGJ:      null,
  crimeMarkers: [],
  originMk:     null,
  destMk:       null,
};

/* Route colors */
const MAIN_COLOR = '#144491';
const ALT1_COLOR = '#95b11b';

/* INIT  */
function initMap() {
  MAP.lmap = L.map('map', {
    center:      CFG.LA_CENTER,
    zoom:        12,
    zoomControl: false,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(MAP.lmap);
  MAP.lmap.attributionControl.setPrefix(
    '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> | ' +
    '<a href="https://carto.com">CARTO</a> | LAPD Open Data'
  );
  applyTile();

  MAP.lmap.on('click', async e => {
    const { lat, lng } = e.latlng;
    const lbl = await reverseGeocode(lat, lng);

    const container = document.createElement('div');
    container.style.cssText = 'font-family:Outfit,sans-serif;padding:4px 2px;min-width:210px';
    container.innerHTML = `
      <div style="font-size:.78rem;font-weight:600;color:var(--text);margin-bottom:4px;line-height:1.4">${xss(lbl)}</div>
      <div style="font-size:.7rem;color:var(--text2);margin-bottom:10px">Set this location as:</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button id="pick-origin" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;padding:7px 12px;font-family:Outfit,sans-serif;font-size:.75rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px">
          <span>📍</span> Set as Origin
        </button>
        <button id="pick-dest" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;border-radius:6px;padding:7px 12px;font-family:Outfit,sans-serif;font-size:.75rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px">
          <span>🏁</span> Set as Destination
        </button>
        <button id="pick-cancel" style="background:transparent;color:var(--text3);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-family:Outfit,sans-serif;font-size:.72rem;cursor:pointer">
          Cancel
        </button>
      </div>`;

    const popup = L.popup({ maxWidth: 260, closeButton: false })
      .setLatLng([lat, lng])
      .setContent(container)
      .openOn(MAP.lmap);

    setTimeout(() => {
      document.getElementById('pick-origin')?.addEventListener('click', () => {
        MAP.lmap.closePopup();
        APP.originLL = { lat, lng }; APP.originLabel = lbl;
        placePinOrigin(lat, lng);
        setVal('o-inp', lbl); setVal('mo-inp', lbl);
        document.getElementById('map-hint').classList.add('gone');
        setText('map-status', `Origin set: ${lbl}`);
        toast('Origin set ✓', 'success');
      });
      document.getElementById('pick-dest')?.addEventListener('click', () => {
        MAP.lmap.closePopup();
        APP.destLL = { lat, lng }; APP.destLabel = lbl;
        placePinDest(lat, lng);
        setVal('d-inp', lbl); setVal('md-inp', lbl);
        document.getElementById('map-hint').classList.add('gone');
        setText('map-status', `Destination set: ${lbl}`);
        toast('Destination set ✓', 'success');
      });
      document.getElementById('pick-cancel')?.addEventListener('click', () => {
        MAP.lmap.closePopup();
      });
    }, 50);
  });
}

function applyTile() {
  if (MAP.tile) MAP.lmap.removeLayer(MAP.tile);
  MAP.tile = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 20 }
  ).addTo(MAP.lmap);
}

/* REVERSE GEOCODE */
async function reverseGeocode(lat, lng) {
  try {
    const url = `${CFG.NOM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'SafeRouteLA/1.0' } });
    if (!r.ok) throw new Error();
    const d = await r.json();
    const a = d.address || {};
    const parts = [a.road || a.pedestrian, a.suburb || a.city || a.town || a.county].filter(Boolean);
    return parts.join(', ') || d.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/* PIN ICONS */
function makePin(letter, color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:46px;display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${color};border:3px solid #fff;box-shadow:0 4px 18px ${color}99;
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:#fff;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:.05em">${letter}</span>
      </div>
      <div style="width:2px;height:10px;background:${color};opacity:.7;margin-top:-1px;border-radius:0 0 2px 2px"></div>
    </div>`,
    iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -48],
  });
}

function placePinOrigin(lat, lng) {
  if (MAP.originMk) MAP.lmap.removeLayer(MAP.originMk);
  MAP.originMk = L.marker([lat, lng], { icon: makePin('A', '#10b981') })
    .addTo(MAP.lmap)
    .bindPopup(`<div class="cpop"><div class="cpop-hdr"><div class="cpop-dot" style="background:#10b981"></div><div class="cpop-title">📍 Origin</div></div><div class="cpop-row"><i class="fa-solid fa-location-dot"></i><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div></div>`, { maxWidth: 220 });
}

function placePinDest(lat, lng) {
  if (MAP.destMk) MAP.lmap.removeLayer(MAP.destMk);
  MAP.destMk = L.marker([lat, lng], { icon: makePin('B', '#f59e0b') })
    .addTo(MAP.lmap)
    .bindPopup(`<div class="cpop"><div class="cpop-hdr"><div class="cpop-dot" style="background:#f59e0b"></div><div class="cpop-title">🏁 Destination</div></div><div class="cpop-row"><i class="fa-solid fa-location-dot"></i><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div></div>`, { maxWidth: 220 });
}

/* ORS FETCH HELPER */
async function fetchORSRoute(origin, dest, preference) {
  const r = await fetch(`${CFG.ORS_BASE}/v2/directions/driving-car/geojson`, {
    method:  'POST',
    headers: { 'Authorization': CFG.ORS_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]],
      preference,
      units: 'km',
    }),
  });
  if (!r.ok) throw new Error(`ORS ${r.status}`);
  return r.json();
}

/* DRAW MAIN ROUTE */
async function drawRouteORS(origin, dest) {
  if (MAP.routeLayer) { MAP.lmap.removeLayer(MAP.routeLayer); MAP.routeLayer = null; }
  if (MAP.mainLabel)  { MAP.lmap.removeLayer(MAP.mainLabel);  MAP.mainLabel  = null; }
  MAP._mainGJ = null;

  try {
    const gj    = await fetchORSRoute(origin, dest, 'recommended');
    const props = gj.features?.[0]?.properties?.summary || {};
    const km    = (props.distance || 0).toFixed(1);
    const min   = Math.round((props.duration || 0) / 60);

    // Glow layer
    L.geoJSON(gj, { style: { color: MAIN_COLOR, weight: 14, opacity: .15 } }).addTo(MAP.lmap);

    // Main route line
    MAP.routeLayer = L.geoJSON(gj, {
      style: { color: MAIN_COLOR, weight: 6, opacity: .9 },
    }).addTo(MAP.lmap);

    // ── Store GeoJSON BEFORE returning so _mainRouteLabel can use it ──
    MAP._mainGJ = gj;

    MAP.lmap.fitBounds(MAP.routeLayer.getBounds().pad(0.2));
    return { km, min, ok: true };

  } catch (err) {
    console.warn('ORS main route failed, fallback:', err.message);

    MAP.routeLayer = L.polyline(
      [[origin.lat, origin.lng], [dest.lat, dest.lng]],
      { color: MAIN_COLOR, weight: 4, opacity: .7, dashArray: '8,6' }
    ).addTo(MAP.lmap);

    // Synthetic midpoint so label still renders on fallback
    MAP._mainGJ = {
      features: [{ geometry: { coordinates: [
        [origin.lng, origin.lat],
        [(origin.lng + dest.lng) / 2, (origin.lat + dest.lat) / 2],
        [dest.lng, dest.lat],
      ]}}]
    };

    MAP.lmap.fitBounds(MAP.routeLayer.getBounds().pad(0.25));
    const distKm = haversine(origin.lat, origin.lng, dest.lat, dest.lng).toFixed(1);
    return { km: distKm, min: Math.round(distKm * 2), ok: false };
  }
}

/*  DRAW SINGLE ALTERNATIVE ROUTE */
async function drawAltRoutes(origin, dest, scoreA) {
  clearAltRoutes();

  try {
    const gjA     = await fetchORSRoute(origin, dest, 'shortest');
    const coordsA = gjA.features[0].geometry.coordinates;

    L.geoJSON(gjA, { style: { color: ALT1_COLOR, weight: 12, opacity: .13 } }).addTo(MAP.lmap);
    MAP.altLayer1 = L.geoJSON(gjA, {
      style: { color: ALT1_COLOR, weight: 5, opacity: .88, dashArray: '14,6' },
    }).addTo(MAP.lmap);

    const midA    = coordsA[Math.floor(coordsA.length / 2)];
    MAP.altLabel1 = _scoreLabel(midA[1], midA[0], scoreA, ALT1_COLOR, '#fff', 'ALT ROUTE');

  } catch (err) {
    console.warn('ORS alt route failed, Bézier fallback:', err.message);
    const pts     = _bezier(origin, dest, 0.022, 40);
    MAP.altLayer1 = L.polyline(pts, { color: ALT1_COLOR, weight: 5, opacity: .85, dashArray: '14,6' }).addTo(MAP.lmap);
    const midA    = pts[Math.floor(pts.length / 2)];
    MAP.altLabel1 = _scoreLabel(midA[0], midA[1], scoreA, ALT1_COLOR, '#fff', 'ALT ROUTE');
  }
}

/* CLEAR ALT ROUTES */
function clearAltRoutes() {
  if (MAP.altLayer1) { MAP.lmap.removeLayer(MAP.altLayer1); MAP.altLayer1 = null; }
  if (MAP.altLabel1) { MAP.lmap.removeLayer(MAP.altLabel1); MAP.altLabel1 = null; }
}

/*  SCORE LABELS */
function _scoreLabel(lat, lng, score, bg, textColor, tag) {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:${bg};color:${textColor};font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:.12em;padding:5px 14px;border-radius:6px;box-shadow:0 3px 16px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.25);white-space:nowrap;border:2px solid rgba(255,255,255,.6);backdrop-filter:blur(4px);display:flex;align-items:center;gap:8px">
          <span style="background:rgba(255,255,255,.25);border-radius:4px;padding:1px 6px;font-size:11px;letter-spacing:.08em">${tag}</span>
          <span style="font-size:16px;letter-spacing:.06em">${score}%</span>
          <span style="font-size:10px;opacity:.85;letter-spacing:.1em">SAFE</span>
        </div>
        <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid ${bg};filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"></div>
      </div>`,
      iconAnchor: [60, 34],
    }),
    zIndexOffset: 1000,
  }).addTo(MAP.lmap);
}

function _mainRouteLabel(lat, lng, score) {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:${MAIN_COLOR};color:#fff;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:.12em;padding:5px 14px;border-radius:6px;box-shadow:0 3px 16px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.25);white-space:nowrap;border:2px solid rgba(255,255,255,.6);backdrop-filter:blur(4px);display:flex;align-items:center;gap:8px">
          <span style="background:rgba(255,255,255,.2);border-radius:4px;padding:1px 6px;font-size:11px;letter-spacing:.08em">MAIN ROUTE</span>
          <span style="font-size:16px;letter-spacing:.06em">${score}%</span>
          <span style="font-size:10px;opacity:.85;letter-spacing:.1em">SAFE</span>
        </div>
        <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid ${MAIN_COLOR};filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"></div>
      </div>`,
      iconAnchor: [60, 34],
    }),
    zIndexOffset: 1000,
  }).addTo(MAP.lmap);
}

/*  BÉZIER FALLBACK  */
function _bezier(origin, dest, latOffset, steps) {
  const ctrlLat = (origin.lat + dest.lat) / 2 + latOffset;
  const ctrlLng = (origin.lng + dest.lng) / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([
      u*u*origin.lat + 2*u*t*ctrlLat + t*t*dest.lat,
      u*u*origin.lng + 2*u*t*ctrlLng + t*t*dest.lng,
    ]);
  }
  return pts;
}

/*  CRIME MARKERS  */
function clearCrimeMarkers() {
  MAP.crimeMarkers.forEach(m => MAP.lmap.removeLayer(m));
  MAP.crimeMarkers = [];
}

function renderCrimeMarkers(crimes, refDate) {
  clearCrimeMarkers();
  if (!APP.showMarkers) return;
  const limit = Math.min(crimes.length, 1000);
  const ref   = (refDate || new Date('2024-12-31')).getTime();

  for (let i = 0; i < limit; i++) {
    const c = crimes[i];
    if (!c.lat || !c.lng) continue;

    const cat     = c.cat || classifyCrime(c.desc);
    const color   = cat === 'violent' ? '#ff3b30' : cat === 'property' ? '#ff9500' : '#5856d6';
    const ageDays = c.date ? (ref - c.date.getTime()) / 86400000 : 999;
    const sz      = ageDays <= 30 ? 9 : ageDays <= 90 ? 7 : ageDays <= 365 ? 5 : 4;
    const op      = ageDays <= 30 ? 1 : ageDays <= 90 ? .85 : ageDays <= 365 ? .65 : .45;

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};opacity:${op};border:1.5px solid rgba(255,255,255,.65);box-shadow:0 0 7px ${color}aa;cursor:pointer"></div>`,
      iconSize: [sz, sz], iconAnchor: [sz/2, sz/2],
    });

    const dateF  = c.date ? c.date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : '—';
    const timeF  = c.timeStr || '';
    const sexMap = { M:'Male', F:'Female', X:'Unknown' };
    const sex    = sexMap[(c.victSex||'').toUpperCase()] || c.victSex || '';
    const victim = [sex, c.victAge > 0 ? `Age ${c.victAge}` : ''].filter(Boolean).join(' · ');
    const ageTxt = ageDays <= 0 ? 'Most recent' : `${Math.round(ageDays)}d before latest`;

    const popup = `<div class="cpop">
      <div class="cpop-hdr"><div class="cpop-dot" style="background:${color}"></div><div class="cpop-title">${xss(capWords(c.desc))}</div></div>
      <div class="cpop-row"><i class="fa-solid fa-calendar-day"></i><span>${dateF}${timeF ? ' · '+timeF : ''}</span></div>
      <div class="cpop-row"><i class="fa-solid fa-hourglass-half"></i><span>${ageTxt}</span></div>
      ${victim    ? `<div class="cpop-row"><i class="fa-solid fa-person"></i><span><b>Victim:</b> ${xss(victim)}</span></div>` : ''}
      ${c.address ? `<div class="cpop-row"><i class="fa-solid fa-map-pin"></i><span>${xss(c.address)}</span></div>` : ''}
      ${c.area    ? `<div class="cpop-row"><i class="fa-solid fa-building-shield"></i><span>${xss(c.area)} Division</span></div>` : ''}
      ${c.premis  ? `<div class="cpop-row"><i class="fa-solid fa-location-crosshairs"></i><span>${xss(capWords(c.premis))}</span></div>` : ''}
      ${c.weapon  ? `<div class="cpop-row"><i class="fa-solid fa-gun" style="color:${color}"></i><span style="color:${color}"><b>Weapon:</b> ${xss(capWords(c.weapon))}</span></div>` : ''}
      ${c.status  ? `<div class="cpop-row"><i class="fa-solid fa-gavel"></i><span>${xss(c.status)}</span></div>` : ''}
    </div>`;

    MAP.crimeMarkers.push(L.marker([c.lat, c.lng], { icon }).addTo(MAP.lmap).bindPopup(popup, { maxWidth: 260 }));
  }
}

/*  MAP CONTROLS  */
function toggleMarkers() {
  APP.showMarkers = !APP.showMarkers;
  document.getElementById('fab-markers')?.classList.toggle('active', APP.showMarkers);
  APP.showMarkers ? renderCrimeMarkers(APP.crimes, APP.refDate) : clearCrimeMarkers();
}

function recenter() {
  if (APP.originLL && APP.destLL) {
    MAP.lmap.fitBounds(L.latLngBounds(
      [[APP.originLL.lat, APP.originLL.lng], [APP.destLL.lat, APP.destLL.lng]]
    ).pad(0.3));
  } else {
    MAP.lmap.flyTo(CFG.LA_CENTER, 12, { duration: 1.2 });
  }
}

function updateRadius(v) {
  APP.radiusKm = parseFloat(v);
  setText('r-lbl', `${APP.radiusKm.toFixed(1)}km`);
}