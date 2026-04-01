'use strict';
/* ═══════════════════════════════════════════════════════════════
   map.js — Leaflet init, tap-to-pick, ORS route drawing,
            crime dot markers with full popups
═══════════════════════════════════════════════════════════════ */

const MAP = {
  lmap:         null,
  tile:         null,
  routeLayer:   null,
  crimeMarkers: [],
  originMk:     null,
  destMk:       null,
  tapCount:     0,
};

/* ── INIT ─────────────────────────────────────────────────────── */
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

  // Tap to set origin → dest
  MAP.lmap.on('click', async e => {
    const { lat, lng } = e.latlng;
    MAP.tapCount++;

    if (MAP.tapCount === 1) {
      APP.originLL = { lat, lng };
      placePinOrigin(lat, lng);
      const lbl = await reverseGeocode(lat, lng);
      APP.originLabel = lbl;
      setVal('o-inp',  lbl);
      setVal('mo-inp', lbl);
      setText('map-status', `Origin set: ${lbl} — tap again for destination`);
      toast('Origin set ✓ — now tap the destination', 'info');
      document.getElementById('map-hint').classList.add('gone');
    } else if (MAP.tapCount >= 2) {
      APP.destLL = { lat, lng };
      placePinDest(lat, lng);
      const lbl = await reverseGeocode(lat, lng);
      APP.destLabel = lbl;
      setVal('d-inp',  lbl);
      setVal('md-inp', lbl);
      MAP.tapCount = 0;
      setText('map-status', `Destination set: ${lbl} — click ANALYZE`);
      toast('Destination set ✓ — click ANALYZE to run', 'success');
    }
  });
}

function applyTile() {
  const dark = document.documentElement.dataset.theme === 'dark';
  if (MAP.tile) MAP.lmap.removeLayer(MAP.tile);
  MAP.tile = L.tileLayer(
    dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 20 }
  ).addTo(MAP.lmap);
}

/* ── REVERSE GEOCODE ──────────────────────────────────────────── */
async function reverseGeocode(lat, lng) {
  try {
    const url = `${CFG.NOM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const r = await fetch(url, { headers:{ 'Accept-Language':'en-US', 'User-Agent':'SafeRouteLA/1.0' } });
    if (!r.ok) throw new Error();
    const d = await r.json();
    const a = d.address || {};
    const parts = [a.road || a.pedestrian, a.suburb || a.city || a.town || a.county].filter(Boolean);
    return parts.join(', ') || d.display_name?.split(',').slice(0,3).join(',') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/* ── PIN ICONS ────────────────────────────────────────────────── */
function makePin(letter, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:46px;display:flex;flex-direction:column;align-items:center;pointer-events:none
    ">
      <div style="
        width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${color};border:3px solid #fff;
        box-shadow:0 4px 18px ${color}99;
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="transform:rotate(45deg);color:#fff;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:.05em">${letter}</span>
      </div>
      <div style="width:2px;height:10px;background:${color};opacity:.7;margin-top:-1px;border-radius:0 0 2px 2px"></div>
    </div>`,
    iconSize:   [36, 46],
    iconAnchor: [18, 46],
    popupAnchor:[0, -48],
  });
}

function placePinOrigin(lat, lng) {
  if (MAP.originMk) MAP.lmap.removeLayer(MAP.originMk);
  MAP.originMk = L.marker([lat, lng], { icon: makePin('A', '#10b981') })
    .addTo(MAP.lmap)
    .bindPopup(`<div class="cpop"><div class="cpop-hdr"><div class="cpop-dot" style="background:#10b981"></div><div class="cpop-title">📍 Origin</div></div><div class="cpop-row"><i class="fa-solid fa-location-dot"></i><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div></div>`, { maxWidth:220 });
}

function placePinDest(lat, lng) {
  if (MAP.destMk) MAP.lmap.removeLayer(MAP.destMk);
  MAP.destMk = L.marker([lat, lng], { icon: makePin('B', '#f59e0b') })
    .addTo(MAP.lmap)
    .bindPopup(`<div class="cpop"><div class="cpop-hdr"><div class="cpop-dot" style="background:#f59e0b"></div><div class="cpop-title">🏁 Destination</div></div><div class="cpop-row"><i class="fa-solid fa-location-dot"></i><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div></div>`, { maxWidth:220 });
}

/* ── DRAW ROUTE via OpenRouteService ──────────────────────────── */
async function drawRouteORS(origin, dest) {
  if (MAP.routeLayer) { MAP.lmap.removeLayer(MAP.routeLayer); MAP.routeLayer = null; }

  try {
    const url = `${CFG.ORS_BASE}/v2/directions/driving-car/geojson`;
    const body = {
      coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]],
      preference:  'recommended',
      units:       'km',
    };
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Authorization': CFG.ORS_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!r.ok) throw new Error(`ORS ${r.status}`);
    const gj = await r.json();
    const props = gj.features?.[0]?.properties?.summary || {};
    const km  = (props.distance || 0).toFixed(1);
    const min = Math.round((props.duration || 0) / 60);

    // Draw the route polyline
    MAP.routeLayer = L.geoJSON(gj, {
      style: {
        color:   '#f59e0b',
        weight:  6,
        opacity: .88,
        dashArray: null,
      },
    }).addTo(MAP.lmap);

    // Also draw a glow layer
    L.geoJSON(gj, {
      style: { color: '#f59e0b', weight: 14, opacity: .12 },
    }).addTo(MAP.lmap);

    MAP.lmap.fitBounds(MAP.routeLayer.getBounds().pad(0.2));
    return { km, min, ok: true };

  } catch (err) {
    // Fallback: straight line
    console.warn('ORS failed, using straight line fallback:', err.message);
    MAP.routeLayer = L.polyline(
      [[origin.lat, origin.lng], [dest.lat, dest.lng]],
      { color:'#f59e0b', weight:4, opacity:.7, dashArray:'8,6' }
    ).addTo(MAP.lmap);
    MAP.lmap.fitBounds(MAP.routeLayer.getBounds().pad(0.25));

    const distKm = haversine(origin.lat, origin.lng, dest.lat, dest.lng).toFixed(1);
    return { km: distKm, min: Math.round(distKm * 2), ok: false };
  }
}

/* ── CRIME MARKERS ────────────────────────────────────────────── */
function clearCrimeMarkers() {
  MAP.crimeMarkers.forEach(m => MAP.lmap.removeLayer(m));
  MAP.crimeMarkers = [];
}

function renderCrimeMarkers(crimes, refDate) {
  clearCrimeMarkers();
  if (!APP.showMarkers) return;
  const limit = Math.min(crimes.length, 500);
  const ref   = (refDate || new Date('2024-12-31')).getTime();

  for (let i = 0; i < limit; i++) {
    const c = crimes[i];
    if (!c.lat || !c.lng) continue;

    const cat     = c.cat || classifyCrime(c.desc);
    const color   = cat === 'violent' ? '#ff3b30' : cat === 'property' ? '#ff9500' : '#5856d6';
    const ageDays = c.date ? (ref - c.date.getTime()) / 86400000 : 999;
    const sz      = ageDays <= 30 ? 15 : ageDays <= 90 ? 12 : ageDays <= 365 ? 9 : 7;
    const op      = ageDays <= 30 ? 1  : ageDays <= 90 ? .85: ageDays <= 365 ? .65: .45;

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};opacity:${op};border:1.5px solid rgba(255,255,255,.65);box-shadow:0 0 7px ${color}aa;cursor:pointer"></div>`,
      iconSize:   [sz, sz],
      iconAnchor: [sz/2, sz/2],
    });

    // Popup content
    const dateF  = c.date ? c.date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : '—';
    const timeF  = c.timeStr || '';
    const sexMap = { M:'Male', F:'Female', X:'Unknown' };
    const sex    = sexMap[(c.victSex || '').toUpperCase()] || c.victSex || '';
    const victim = [sex, c.victAge > 0 ? `Age ${c.victAge}` : ''].filter(Boolean).join(' · ');
    const ageTxt = ageDays <= 0 ? 'Most recent' : `${Math.round(ageDays)}d before latest`;

    const popup = `<div class="cpop">
      <div class="cpop-hdr">
        <div class="cpop-dot" style="background:${color}"></div>
        <div class="cpop-title">${xss(capWords(c.desc))}</div>
      </div>
      <div class="cpop-row"><i class="fa-solid fa-calendar-day"></i><span>${dateF}${timeF ? ' · ' + timeF : ''}</span></div>
      <div class="cpop-row"><i class="fa-solid fa-hourglass-half"></i><span>${ageTxt}</span></div>
      ${victim  ? `<div class="cpop-row"><i class="fa-solid fa-person"></i><span><b>Victim:</b> ${xss(victim)}</span></div>` : ''}
      ${c.address ? `<div class="cpop-row"><i class="fa-solid fa-map-pin"></i><span>${xss(c.address)}</span></div>` : ''}
      ${c.area    ? `<div class="cpop-row"><i class="fa-solid fa-building-shield"></i><span>${xss(c.area)} Division</span></div>` : ''}
      ${c.premis  ? `<div class="cpop-row"><i class="fa-solid fa-location-crosshairs"></i><span>${xss(capWords(c.premis))}</span></div>` : ''}
      ${c.weapon  ? `<div class="cpop-row"><i class="fa-solid fa-gun" style="color:${color}"></i><span style="color:${color}"><b>Weapon:</b> ${xss(capWords(c.weapon))}</span></div>` : ''}
      ${c.status  ? `<div class="cpop-row"><i class="fa-solid fa-gavel"></i><span>${xss(c.status)}</span></div>` : ''}
    </div>`;

    const mk = L.marker([c.lat, c.lng], { icon }).addTo(MAP.lmap).bindPopup(popup, { maxWidth:260 });
    MAP.crimeMarkers.push(mk);
  }
}

/* ── MAP CONTROLS ─────────────────────────────────────────────── */
function toggleMarkers() {
  APP.showMarkers = !APP.showMarkers;
  const btn = document.getElementById('fab-markers');
  btn?.classList.toggle('active', APP.showMarkers);
  APP.showMarkers ? renderCrimeMarkers(APP.crimes, APP.refDate) : clearCrimeMarkers();
}

function recenter() {
  if (APP.originLL && APP.destLL) {
    const b = L.latLngBounds([[APP.originLL.lat, APP.originLL.lng],[APP.destLL.lat, APP.destLL.lng]]);
    MAP.lmap.fitBounds(b.pad(0.3));
  } else {
    MAP.lmap.flyTo(CFG.LA_CENTER, 12, { duration: 1.2 });
  }
}

function updateRadius(v) {
  APP.radiusKm = parseFloat(v);
  setText('r-lbl', `${APP.radiusKm.toFixed(1)}km`);
}
