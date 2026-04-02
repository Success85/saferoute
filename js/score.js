'use strict';
/* 
   score.js — Weighted safety scoring algorithm
   Uses dataset-relative dates (not Date.now()) so 2024 data
   scores correctly when running in 2026. Using 1000 data from the data source to improve speed and accuracy.
 */

const ARC_LEN = 157; // SVG arc path length

/*  HAVERSINE  */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dL = toRad(lat2 - lat1), dN = toRad(lng2 - lng1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dN / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(d) { return d * Math.PI / 180; }

/* COMPUTE DATASET MAX DATE */
function computeRefDate(crimes) {
  const times = crimes.filter(c => c.date).map(c => c.date.getTime());
  return times.length ? new Date(Math.max(...times)) : new Date('2024-12-31');
}

/* SCORE LOCATION  */
function scoreLocation(crimes, cLat, cLng, radiusKm, refDate) {
  const ref = (refDate || new Date('2024-12-31')).getTime();
  const radM = radiusKm * 1000;
  let ded = 0, total = 0, violent = 0, recent = 0;
  const areas = {};

  for (const c of crimes) {
    const distM = haversine(cLat, cLng, c.lat, c.lng) * 1000;
    if (distM > radM) continue;
    total++;

    if (c.cat === 'violent') violent++;
    const ageDays = c.date ? (ref - c.date.getTime()) / 86400000 : Infinity;
    if (ageDays <= 90) recent++;

    // Recency multiplier — relative to dataset's own dates
    let rec = 0.5;
    if (ageDays <= 30) rec = 2.0;
    else if (ageDays <= 90) rec = 1.5;
    else if (ageDays <= 180) rec = 1.2;
    else if (ageDays <= 365) rec = 1.0;

    // Distance decay
    let decay = 0.45;
    if (distM < 100) decay = 1.0;
    else if (distM < 200) decay = 0.9;
    else if (distM < 400) decay = 0.75;
    else if (distM < 600) decay = 0.60;

    // Crime weight
    let w = 1.5;
    if (c.cat === 'violent') w = c.part === '1' ? 14 : 10;
    else if (c.cat === 'property') w = 4.5;

    ded += w * rec * decay;
    if (c.area) areas[c.area] = (areas[c.area] || 0) + 1;
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - ded)));
  const topArea = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  return { score, total, violent, recent, topArea };
}

/*  ROUTE SCORE  */
function calcRouteScore(oScore, dScore, crimes) {
  const density = Math.min(45, crimes.length * 0.22);
  const base = oScore * 0.4 + dScore * 0.4 + (50 - density) * 0.5;
  return Math.max(0, Math.min(100, Math.round(base)));
}

/*  RISK LEVEL  */
function riskLevel(score) {
  if (score >= 75) return { label: 'SAFE', css: 'safe', color: '#10b981', emoji: '✅' };
  if (score >= 55) return { label: 'MODERATE', css: 'moderate', color: '#f59e0b', emoji: '⚠️' };
  if (score >= 35) return { label: 'CAUTION', css: 'danger', color: '#f97316', emoji: '🔶' };
  return { label: 'HIGH RISK', css: 'danger', color: '#ef4444', emoji: '🚨' };
}

/*  VERDICT TEXT  */
function buildVerdict(rtScore, oRes, dRes, crimes, destLabel) {
  const rl = riskLevel(rtScore);
  const d = (destLabel || 'destination').split(',')[0];
  let title, sub;
  // if (rtScore >= 75) {
  //   title = `Route to ${d} is relatively safe`;
  //   sub   = `${crimes.length} incidents in the corridor. Origin: ${oRes.score}/100 · Destination: ${dRes.score}/100. Standard precautions apply.`;
  // } else if (rtScore >= 55) {
  //   title = `Exercise caution on this route`;
  //   sub   = `${crimes.length} incidents detected (${oRes.violent + dRes.violent} violent). Stay alert, especially after dark.`;
  // } else if (rtScore >= 35) {
  //   title = `Notable crime activity along this corridor`;
  //   sub   = `${crimes.length} incidents — ${oRes.violent + dRes.violent} violent crimes. Consider alternate routes or travelling in daylight.`;
  // } else {
  //   title = `High-risk route — plan carefully`;
  //   sub   = `${crimes.length} incidents found (${oRes.violent + dRes.violent} violent). Strongly consider alternate routes or extra precautions.`;
  // }

  if (rtScore >= 75) {
    title = `Route to ${d} is relatively safe`;
    sub = `Incidents recent found — Origin: ${oRes.score}% · Destination: ${dRes.score}%. Standard precautions apply.`;
  } else if (rtScore >= 55) {
    title = `Exercise caution on this route`;
    sub = `${oRes.recent + dRes.recent} Incidents recent detected. Stay alert, especially after dark.`;
  } else if (rtScore >= 35) {
    title = `Notable crime activity along this corridor`;
    sub = `${oRes.recent + dRes.recent} Incidents recent found. Consider alternate routes.`;
  } else {
    title = `High-risk route — plan carefully`;
    sub = `${oRes.recent + dRes.recent} Incidents recent found. Strongly consider alternate routes or extra precautions.`;
  }

  return { title, sub, emoji: rl.emoji, color: rl.color };
}

/* TIPS  */
function buildTips(score) {
  const all = [
    { em: '🕐', t: 'Travel during daylight', d: 'Most incidents happen between 18:00–02:00. Arrive and depart in daylight when possible.' },
    { em: '📱', t: 'Share your itinerary', d: 'Tell someone your route, destination, and expected arrival time before you leave.' },
    { em: '💳', t: 'Avoid carrying cash visibly', d: 'Use contactless or card payments. Handling cash in public is a theft risk.' },
    { em: '🚗', t: 'Keep doors locked at stops', d: 'Lock doors and keep windows up at traffic stops in unfamiliar areas.' },
    { em: '📍', t: 'Share live location', d: 'Enable live location sharing with a trusted contact for the duration of your trip.' },
    { em: '🚦', t: 'Stick to busy streets', d: 'Avoid shortcuts through alleys, empty lots, or poorly lit streets.' },
    { em: '🏨', t: 'Research your destination', d: 'Check recent visitor reviews and local news for your destination neighbourhood.' },
    { em: '🚨', t: 'Know emergency numbers', d: 'LAPD non-emergency: (877) 275-5273 · Emergency: 911. Save these before you go.' },
  ];
  return all.slice(0, score >= 75 ? 3 : score >= 55 ? 4 : score >= 35 ? 5 : 6);
}

/*  ANIMATE SCORE NUMBER  */
function animNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const dur = 1000, t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/*  ANIMATE ARC */
function animArc(arcId, numId, score, color) {
  const arc = document.getElementById(arcId);
  const num = document.getElementById(numId);
  if (arc) {
    // Must use setAttribute — SVG .className is read-only SVGAnimatedString
    arc.setAttribute('style', `stroke:${color}`);
    const fill = (score / 100) * ARC_LEN;
    setTimeout(() => { arc.style.strokeDasharray = `${fill} ${ARC_LEN + 20}`; }, 80);
  }
  animNum(numId, score);
  if (num) num.style.color = color;
}

function filterRouteCrimes(crimes, originLL, destLL, radiusKm) {
  return crimes.filter(c => {
    if (!c.lat || !c.lng) return false;

    // Check distance from origin
    const dOrigin = haversine(originLL.lat, originLL.lng, c.lat, c.lng);
    if (dOrigin <= radiusKm) return true;

    // Check distance from destination
    const dDest = haversine(destLL.lat, destLL.lng, c.lat, c.lng);
    if (dDest <= radiusKm) return true;

    // Check distance from midpoints along the corridor
    // Sample 8 points evenly along the route line
    for (let i = 1; i <= 7; i++) {
      const t      = i / 8;
      const midLat = originLL.lat + (destLL.lat - originLL.lat) * t;
      const midLng = originLL.lng + (destLL.lng - originLL.lng) * t;
      const dMid   = haversine(midLat, midLng, c.lat, c.lng);
      if (dMid <= radiusKm) return true;
    }

    return false;
  });
}
