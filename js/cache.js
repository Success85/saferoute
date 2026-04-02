'use strict';
/* 
   cache.js — API Response Caching
   Bonus feature: caches LAPD API responses in sessionStorage
   so repeated analyses of the same route are instant.

   Cache key = hash of origin+dest+radius
   Cache TTL = 10 minutes (within a session)
   Storage   = sessionStorage (cleared when tab closes)
*/

const CACHE_PREFIX = 'saferoute_cache_';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/*  Generate cache key from route parameters  */
function cacheKey(oLL, dLL, radiusKm) {
  const str = [
    oLL.lat.toFixed(4), oLL.lng.toFixed(4),
    dLL.lat.toFixed(4), dLL.lng.toFixed(4),
    radiusKm.toFixed(1),
  ].join('|');
  // Simple hash
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return CACHE_PREFIX + (h >>> 0).toString(16);
}

/*  Read from cache  */
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/*  Write to cache  */
function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    // sessionStorage full or unavailable — fail silently
    console.warn('Cache write failed:', e.message);
  }
}

/*  Clear all SafeRoute cache entries  */
function cacheClear() {
  const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => sessionStorage.removeItem(k));
  return keys.length;
}

/*  Cache stats for debugging  */
function cacheStats() {
  const keys    = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX));
  const entries = keys.map(k => {
    try {
      const { ts } = JSON.parse(sessionStorage.getItem(k));
      const age    = Math.round((Date.now() - ts) / 1000);
      return { key: k.replace(CACHE_PREFIX, ''), ageSec: age };
    } catch { return null; }
  }).filter(Boolean);
  return { count: entries.length, entries };
}

/*  Cached wrapper for fetchCrimes  */
async function fetchCrimesCached(oLL, dLL, radiusKm) {
  const key    = cacheKey(oLL, dLL, radiusKm);
  const cached = cacheGet(key);

  if (cached) {
    console.info(`Cache HIT — ${cached.length} crimes loaded from cache`);
    toast('Results loaded from cache — instant analysis ⚡', 'info');
    // Rehydrate Date objects (JSON serialization strips them)
    return cached.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : null,
    }));
  }

  console.info('Cache MISS — fetching from LAPD API');
  const crimes = await fetchCrimes(oLL, dLL, radiusKm);

  // Store with dates as ISO strings (JSON-serializable)
  const serializable = crimes.map(c => ({
    ...c,
    date: c.date ? c.date.toISOString() : null,
  }));
  cacheSet(key, serializable);

  return crimes;
}
