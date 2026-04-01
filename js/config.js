'use strict';
/* ═══════════════════════════════════════════════════════════════
   config.js — API keys, endpoints, crime classifiers
   API Keys are provided in assignment comment section per spec.
═══════════════════════════════════════════════════════════════ */

const CFG = {
  // LAPD Socrata SODA
  LAPD_URL:      'https://data.lacity.org/resource/2nrs-mtv8.json',
  SOCRATA_TOKEN: 'SFhMqkxpfa6sNoop9uq0Hd67I',
  DATAGOV_TOKEN: 'twFAnZFlGFmESjd8vKBRLpPfEWslzbz34FJsggy3',

  // OpenRouteService (routing)
  ORS_KEY:  'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjllNmJhNThjZTNlZTRkYTFhN2NmODc3MjNkMTA0ODllIiwiaCI6Im11cm11cjY0In0=',
  ORS_BASE: 'https://api.openrouteservice.org',

  // Nominatim (geocoding — no key needed)
  NOM_BASE: 'https://nominatim.openstreetmap.org',

  // LA bounds
  LA_CENTER: [34.0522, -118.2437],
  LA_BOUNDS: { minLat: 33.7, maxLat: 34.37, minLng: -118.75, maxLng: -118.15 },
};

/* Crime keyword classifiers */
const VIOLENT_KW = [
  'HOMICIDE','MURDER','ASSAULT','ROBBERY','RAPE','KIDNAPPING',
  'SHOOTING','STABBING','BATTERY','ARSON','CARJACKING','LYNCHING',
  'HUMAN TRAFFICKING','MANSLAUGHTER','BRANDISH WEAPON','CRIMINAL THREATS',
];
const PROPERTY_KW = [
  'BURGLARY','THEFT','STOLEN','SHOPLIFTING','VANDALISM','FRAUD',
  'EMBEZZLEMENT','EXTORTION','FORGERY','PICKPOCKET','PURSE','VEHICLE - STOLEN',
  'MOTOR VEHICLE','TRESPASSING','RECEIVING STOLEN PROPERTY',
];

function classifyCrime(desc) {
  const u = (desc || '').toUpperCase();
  if (VIOLENT_KW.some(k => u.includes(k)))  return 'violent';
  if (PROPERTY_KW.some(k => u.includes(k))) return 'property';
  return 'other';
}
