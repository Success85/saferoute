'use strict';
/* 
   api.js — LAPD Socrata SODA fetch, Nominatim geocoding,
            autocomplete dropdowns
*/

/* FORWARD GEOCODE (Nominatim)  */
async function geocodeForward(query) {
  if (!query || query.trim().length < 3) return null;
  const { minLat, maxLat, minLng, maxLng } = CFG.LA_BOUNDS;
  const url = `${CFG.NOM_BASE}/search?q=${encodeURIComponent(query + ', Los Angeles, CA')}&format=json&limit=6&countrycodes=us&bounded=1&viewbox=${minLng},${maxLat},${maxLng},${minLat}`;
  try {
    const r = await fetch(url, { headers:{ 'Accept-Language':'en-US', 'User-Agent':'SafeRouteLA/1.0' } });
    if (!r.ok) throw new Error();
    const data = await r.json();
    return data.map(d => ({
      lat:   parseFloat(d.lat),
      lng:   parseFloat(d.lon),
      label: d.display_name,
      short: d.display_name.split(',').slice(0,3).join(','),
    }));
  } catch { return null; }
}

/* LAPD CRIME FETCH  */
async function fetchCrimes(oLL, dLL, radiusKm) {
  // Correct degree buffer: 1° ≈ 111km
  const pad    = Math.max(radiusKm / 111, 0.025);
  const minLat = (Math.min(oLL.lat, dLL.lat) - pad).toFixed(7);
  const maxLat = (Math.max(oLL.lat, dLL.lat) + pad).toFixed(7);
  const minLng = (Math.min(oLL.lng, dLL.lng) - pad).toFixed(7);
  const maxLng = (Math.max(oLL.lng, dLL.lng) + pad).toFixed(7);

  const b = CFG.LA_BOUNDS;
  if (+minLat > b.maxLat || +maxLat < b.minLat || +minLng > b.maxLng || +maxLng < b.minLng) {
    toast('Locations appear outside Los Angeles — LAPD data covers LA only.', 'warn');
  }

  // Build URL as plain string — URLSearchParams encodes $ as %24 which Socrata ignores
  const where = [
    'lat IS NOT NULL', 'lon IS NOT NULL',
    "lat != '0.0'", "lon != '0.0'",
    `lat > ${minLat}`, `lat < ${maxLat}`,
    `lon > ${minLng}`, `lon < ${maxLng}`,
    "date_occ >= '2020-01-01T00:00:00'",
  ].join(' AND ');

  const fields = 'dr_no,date_occ,time_occ,crm_cd_desc,area_name,premis_desc,weapon_desc,vict_sex,vict_age,vict_descent,status_desc,part_1_2,location,lat,lon';

  const url = CFG.LAPD_URL
    + `?$$app_token=${CFG.SOCRATA_TOKEN}`
    + `&$limit=1000`
    + `&$order=date_occ DESC`
    + `&$where=${encodeURIComponent(where)}`
    + `&$select=${encodeURIComponent(fields)}`;

  const r = await fetch(url, { mode:'cors', headers:{ Accept:'application/json' } });
  if (!r.ok) { const t = await r.text(); throw new Error(`LAPD API ${r.status}: ${t.slice(0,200)}`); }
  const raw = await r.json();
  if (!Array.isArray(raw)) throw new Error('Unexpected API response');

  const crimes = raw.map(normalizeRecord).filter(c =>
    c.lat && c.lng && !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0
  );
  return crimes;
}

/* NORMALIZE RECORD */
function normalizeRecord(r) {
  const lat  = parseFloat(r.lat ?? 0);
  const lng  = parseFloat(r.lon ?? 0);
  const desc = (r.crm_cd_desc ?? 'UNKNOWN').trim().toUpperCase();
  const date = r.date_occ ? new Date(r.date_occ) : null;
  let timeStr = '';
  if (r.time_occ?.length >= 3) {
    const t = r.time_occ.padStart(4,'0');
    timeStr = `${t.slice(0,2)}:${t.slice(2,4)}`;
  }
  const cat = classifyCrime(desc);
  return {
    id:       r.dr_no     ?? '',
    lat, lng, date, timeStr, desc, cat,
    area:     r.area_name    ?? '',
    premis:   r.premis_desc  ?? '',
    weapon:   r.weapon_desc  ?? '',
    victSex:  r.vict_sex     ?? '',
    victAge:  parseInt(r.vict_age ?? 0) || 0,
    victDesc: r.vict_descent ?? '',
    status:   r.status_desc  ?? '',
    part:     r.part_1_2     ?? '',
    address:  r.location     ?? '',
  };
}

/* AUTOCOMPLETE */
const AC_DEBOUNCE = {};

function setupAC(inputId, dropId, onPick) {
  const inp = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  if (!inp || !drop) return;

  inp.addEventListener('input', () => {
    // Clear stored coords when user retypes
    if (inputId.includes('o-') || inputId.includes('mo-')) APP.originLL = null;
    if (inputId.includes('d-') || inputId.includes('md-')) APP.destLL   = null;

    clearTimeout(AC_DEBOUNCE[inputId]);
    const q = inp.value.trim();
    if (q.length < 3) { closeDrop(drop); return; }
    AC_DEBOUNCE[inputId] = setTimeout(async () => {
      const res = await geocodeForward(q);
      renderDrop(drop, res, inp, onPick);
    }, 360);
  });

  inp.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrop(drop); });
  document.addEventListener('click', e => {
    if (!inp.contains(e.target) && !drop.contains(e.target)) closeDrop(drop);
  });
}

function renderDrop(drop, results, inp, onPick) {
  drop.innerHTML = '';
  if (!results?.length) { closeDrop(drop); return; }
  results.slice(0,5).forEach(r => {
    const el = document.createElement('div');
    el.className = 'sdrop-item';
    el.innerHTML = `<i class="fa-solid fa-location-dot"></i><span>${xss(r.short)}</span>`;
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      inp.value = r.short;
      closeDrop(drop);
      if (onPick) onPick(r);
    });
    drop.appendChild(el);
  });
  drop.classList.add('open');
}
function closeDrop(drop) { drop?.classList.remove('open'); if(drop) drop.innerHTML=''; }

/* GPS */
async function useGPS() {
  if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
  toast('Requesting GPS…', 'info');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      APP.originLL = { lat, lng };
      placePinOrigin(lat, lng);
      MAP.lmap.flyTo([lat, lng], 14, { duration:1 });
      const lbl = await reverseGeocode(lat, lng);
      APP.originLabel = lbl;
      setVal('o-inp',  lbl);
      setVal('mo-inp', lbl);
      MAP.tapCount = 1;
      document.getElementById('map-hint').classList.add('gone');
      toast('Origin set to your location', 'success');
    },
    err => toast('GPS error: ' + err.message, 'error')
  );
}
