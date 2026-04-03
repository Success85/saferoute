'use strict';
/* 
   auth.js — localStorage authentication
 */

const SESS_KEY  = 'saferoute_sess';
const USERS_KEY = 'saferoute_users';

const getUsers  = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; } };
const saveUsers = u  => localStorage.setItem(USERS_KEY, JSON.stringify(u));
const getSession= () => { try { return JSON.parse(localStorage.getItem(SESS_KEY)); } catch { return null; } };
const setSession= s  => localStorage.setItem(SESS_KEY, JSON.stringify(s));
const clearSession=()=> localStorage.removeItem(SESS_KEY);

function hashPw(p) {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.length; i++) h ^= p.charCodeAt(i), h = Math.imul(h, 0x01000193);
  return (h >>> 0).toString(16);
}

/* 
   SECURITY — XSS, HTML, Script, SQL injection protection
   Embedded inline — no external dependency
 */

// All dangerous patterns we detect and block
const _SEC = {
  script: [
    /<[a-z][\s\S]*?>/i,          
    /<\/[a-z]+>/i,                
    /javascript\s*:/i,           
    /vbscript\s*:/i,             
    /data\s*:\s*text\/html/i,     
    /on\w+\s*=/i,                 
    /expression\s*\(/i,         
    /\{\{[\s\S]*?\}\}/,          
    /\$\{[\s\S]*?\}/,           
    /<%[\s\S]*?%>/,            
    /&#x?[0-9a-f]+;/i,         
  ],
  sql: [
    /(\bSELECT\b[\s\S]+\bFROM\b|\bINSERT\b[\s\S]+\bINTO\b|\bDELETE\b[\s\S]+\bFROM\b|\bUPDATE\b[\s\S]+\bSET\b)/i,
    /\bUNION\b[\s\S]*\bSELECT\b/i,
    /\bDROP\b[\s\S]*\b(TABLE|DATABASE|SCHEMA)\b/i,
    /\bEXEC\b[\s\S]*?\(/i,
    /(\bOR\b|\bAND\b)\s+[\w'"]+\s*=\s*[\w'"]+/i,  
    /(--|#|\/\*|\*\/)[\s\S]*$/m,                    // SQL comment sequences
    /;\s*(DROP|DELETE|INSERT|UPDATE|SELECT|EXEC)\b/i,
    /\bXP_\w+/i,                                    
    /\bCAST\s*\([\s\S]+\bAS\b/i,                   
    /\bCONVERT\s*\(/i,                              
  ],
  proto: ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__lookupGetter__'],
};

// Returns true if string contains any dangerous pattern
function _isBad(s) {
  if (!s) return false;
  const str = String(s);
  if (_SEC.script.some(p => p.test(str))) return true;
  if (_SEC.sql.some(p => p.test(str)))    return true;
  if (_SEC.proto.some(k => str.toLowerCase().includes(k))) return true;
  return false;
}

// Returns a human-readable message explaining WHY the input is rejected
function _badMsg(s, fieldName) {
  const str = String(s || '');
  if (/<[a-z][\s\S]*?>/i.test(str) || /<\/[a-z]+>/i.test(str))
    return `${fieldName} cannot contain HTML tags like <b>, <script>, or <div>. Please enter plain text only.`;
  if (/javascript\s*:|vbscript\s*:|data\s*:\s*text/i.test(str))
    return `${fieldName} contains a disallowed protocol (javascript:, data:). Please enter a plain text value.`;
  if (/on\w+\s*=/i.test(str))
    return `${fieldName} contains an event handler (e.g. onerror=, onclick=). Please enter plain text only.`;
  if (/\bUNION\b[\s\S]*\bSELECT\b|\bDROP\b|\bINSERT\b|\bDELETE\b|\bEXEC\b/i.test(str))
    return `${fieldName} contains SQL keywords. Please enter a plain text value — no database commands allowed.`;
  if (/(--|#|\/\*|\*\/)/.test(str))
    return `${fieldName} contains SQL comment sequences (-- or /*). Please enter plain text only.`;
  if (/\{\{|\$\{|<%/.test(str))
    return `${fieldName} contains template injection syntax. Please enter plain text only.`;
  if (/&#x?[0-9a-f]+;/i.test(str))
    return `${fieldName} contains encoded characters that are not allowed. Please enter plain readable text.`;
  if (_SEC.proto.some(k => str.toLowerCase().includes(k)))
    return `${fieldName} contains a reserved keyword that is not allowed. Please enter a plain text value.`;
  return `${fieldName} contains invalid characters. Please enter plain text only — no special code or symbols.`;
}

// Sanitize localStorage reads — prevents prototype pollution from stored data
function _safeLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null) {
      _SEC.proto.forEach(k => { try { delete obj[k]; } catch{} });
    }
    return obj;
  } catch { return fallback; }
}

// Rate limiter — in-memory bucket, resets per window
const _RL = {};
function _limit(key, max, windowMs) {
  const now = Date.now();
  if (!_RL[key] || now - _RL[key].t > windowMs) _RL[key] = { n: 0, t: now };
  _RL[key].n++;
  const wait = Math.ceil((_RL[key].t + windowMs - now) / 1000);
  return { ok: _RL[key].n <= max, wait };
}

// Block paste of dangerous content on all auth inputs
function _watchAuthInputs() {
  ['l-email','l-pass','r-first','r-last','r-email','r-pass','r-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('paste', function(ev) {
      const txt = (ev.clipboardData || window.clipboardData).getData('text');
      if (_isBad(txt)) {
        ev.preventDefault();
        // Show error next to the field
        const errId = id.replace('l-','l-').replace('r-','r-') + '-err';
        const errEl = document.getElementById(errId) || document.getElementById(id.replace(/-\w+$/,'') + '-err');
        if (errEl) errEl.textContent = 'Pasted content contains unsafe characters and was blocked.';
        typeof toast === 'function' && toast('Pasted content was blocked — it contained unsafe characters.', 'warn');
      }
    });
    // Strip HTML tags silently on typing (don't alarm user for accidental <)
    el.addEventListener('input', function() {
      if (/<[a-z]/i.test(this.value) && _isBad(this.value)) {
        this.value = this.value.replace(/<[^>]*>/g, '');
      }
    });
  });
}
/* END SECURITY LAYER */

/* UI helpers */
function togglePw(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.innerHTML = ``;
}

function pwStrength(val) {
  const wrap = document.getElementById('pw-str');
  const bar  = document.getElementById('pw-bar');
  const lbl  = document.getElementById('pw-lbl');
  if (!wrap) return;
  if (!val) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  let s = 0;
  if (val.length >= 8)           s++;
  if (val.length >= 12)          s++;
  if (/[A-Z]/.test(val))         s++;
  if (/[0-9]/.test(val))         s++;
  if (/[^a-zA-Z0-9]/.test(val)) s++;
  const lvls = [
    { w:'20%', c:'#ef4444', t:'Very Weak' },
    { w:'40%', c:'#f97316', t:'Weak'      },
    { w:'60%', c:'#eab308', t:'Fair'      },
    { w:'80%', c:'#22c55e', t:'Good'      },
    { w:'100%',c:'#10b981', t:'Strong'    },
  ];
  const l = lvls[Math.min(s - 1, 4)] || lvls[0];
  bar.style.width = l.w; bar.style.background = l.c;
  lbl.textContent = l.t; lbl.style.color = l.c;
}

function switchAuthTab(tab) {
  ['login','signup'].forEach(t => {
    document.getElementById(`atab-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`form-${t}`)?.classList.toggle('active', t === tab);
  });
  clearAuthErrors();
}

function clearAuthErrors() {
  document.querySelectorAll('.ferr').forEach(e => e.textContent = '');
  document.querySelectorAll('.fw input').forEach(i => i.classList.remove('err','ok'));
}

function setFErr(inputId, errId, msg) {
  const inp = document.getElementById(inputId);
  const err = document.getElementById(errId);
  if (inp) { inp.classList.remove('ok'); inp.classList.add('err'); }
  if (err) err.textContent = msg;
}

function clearFErr(inputId, errId) {
  const inp = document.getElementById(inputId);
  const err = document.getElementById(errId);
  if (inp) { inp.classList.remove('err'); if (inp.value) inp.classList.add('ok'); }
  if (err) err.textContent = '';
}

function setBtnLoading(btnId, on) {
  const btn  = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  const lbl  = btn.querySelector('span');
  const spin = btn.querySelector('i.fa-spin');
  if (lbl)  lbl.style.opacity  = on ? '0' : '1';
  if (spin) spin.style.display = on ? 'inline' : 'none';
}

/* REGISTER */
async function doRegister(e) {
  e.preventDefault();
  clearAuthErrors();

  const first   = document.getElementById('r-first')?.value.trim()  || '';
  const last    = document.getElementById('r-last')?.value.trim()   || '';
  const email   = document.getElementById('r-email')?.value.trim().toLowerCase() || '';
  const pass    = document.getElementById('r-pass')?.value          || '';
  const confirm = document.getElementById('r-confirm')?.value       || '';

let ok = true;

  // Security: injection check on every field before any validation
  if (_isBad(first))   { setFErr('r-first',  'r-first-err',   _badMsg(first,   'First name')); ok = false; }
  else if (!first)     { setFErr('r-first',  'r-first-err',   'First name is required'); ok = false; }
  else if (!/^[a-zA-ZÀ-ÿ\s'\-\.]{1,80}$/.test(first)) { setFErr('r-first','r-first-err','First name can only contain letters, spaces, hyphens and apostrophes.'); ok = false; }

  if (_isBad(last))    { setFErr('r-last',   'r-last-err',    _badMsg(last,    'Last name'));  ok = false; }
  else if (!last)      { setFErr('r-last',   'r-last-err',    'Last name is required'); ok = false; }
  else if (!/^[a-zA-ZÀ-ÿ\s'\-\.]{1,80}$/.test(last))  { setFErr('r-last', 'r-last-err', 'Last name can only contain letters, spaces, hyphens and apostrophes.'); ok = false; }

  if (_isBad(email))   { setFErr('r-email',  'r-email-err',   _badMsg(email,   'Email')); ok = false; }
  else if (!email)     { setFErr('r-email',  'r-email-err',   'Email is required'); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setFErr('r-email','r-email-err','Please enter a valid email address — e.g. you@example.com'); ok = false; }
  else if (email.length > 254) { setFErr('r-email','r-email-err','Email address is too long.'); ok = false; }

  if (_isBad(pass))    { setFErr('r-pass',   'r-pass-err',    _badMsg(pass,    'Password')); ok = false; }
  else if (!pass)      { setFErr('r-pass',   'r-pass-err',    'Password is required'); ok = false; }
  else if (pass.length < 8)  { setFErr('r-pass','r-pass-err', 'Password must be at least 8 characters.'); ok = false; }
  else if (pass.length > 128){ setFErr('r-pass','r-pass-err', 'Password must be under 128 characters.'); ok = false; }
  else if (!/[A-Z]/.test(pass)) { setFErr('r-pass','r-pass-err','Password must include at least one uppercase letter.'); ok = false; }
  else if (!/[0-9]/.test(pass)) { setFErr('r-pass','r-pass-err','Password must include at least one number.'); ok = false; }

  if (!confirm)        { setFErr('r-confirm','r-confirm-err', 'Please confirm your password.'); ok = false; }
  else if (pass !== confirm) { setFErr('r-confirm','r-confirm-err','Passwords do not match.'); ok = false; }

  if (!ok) return;

  // Rate limit — max 3 registrations per 10 minutes
  const _rlR = _limit('register', 3, 10 * 60 * 1000);
  if (!_rlR.ok) {
    document.getElementById('r-err').textContent = `Too many registration attempts. Please wait ${_rlR.wait} seconds before trying again.`;
    return;
  }

  setBtnLoading('r-btn', true);
  await new Promise(r => setTimeout(r, 600));

  const users = getUsers();
  if (users[email]) {
    document.getElementById('r-err').textContent = 'An account with this email already exists.';
    setBtnLoading('r-btn', false);
    return;
  }

  users[email] = {
    firstName:  first,
    lastName:   last,
    hash:       hashPw(pass),
    createdAt:  new Date().toISOString(),
  };
  saveUsers(users);
  setSession({ email, firstName: first, lastName: last, guest: false });
  setBtnLoading('r-btn', false);
  closeAuth();
  applySession();
  toast(`Welcome, ${first}! Account created.`, 'success');
}

/* LOGIN */
async function doLogin(e) {
  e.preventDefault();
  clearAuthErrors();

  const email = document.getElementById('l-email')?.value.trim().toLowerCase() || '';
  const pass  = document.getElementById('l-pass')?.value || '';

  let ok = true;

  // Security: injection check before any auth logic
  if (_isBad(email)) { setFErr('l-email','l-email-err', _badMsg(email, 'Email')); ok = false; }
  else if (!email)   { setFErr('l-email','l-email-err','Email is required.'); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setFErr('l-email','l-email-err','Please enter a valid email address — e.g. you@example.com'); ok = false; }

  if (_isBad(pass))  { setFErr('l-pass','l-pass-err', _badMsg(pass, 'Password')); ok = false; }
  else if (!pass)    { setFErr('l-pass','l-pass-err','Password is required.'); ok = false; }
  else if (pass.length > 128) { setFErr('l-pass','l-pass-err','Password is too long.'); ok = false; }

  if (!ok) return;

  // Rate limit — max 5 login attempts per 2 minutes
  const _rlL = _limit('login', 5, 2 * 60 * 1000);
  if (!_rlL.ok) {
    document.getElementById('l-err').textContent = `Too many login attempts. Please wait ${_rlL.wait} seconds before trying again.`;
    return;
  }

  setBtnLoading('l-btn', true);
  await new Promise(r => setTimeout(r, 600));

  const users = getUsers();
  const user  = users[email];

  if (!user || user.hash !== hashPw(pass)) {
    document.getElementById('l-err').textContent = 'Email or password is incorrect.';
    setBtnLoading('l-btn', false);
    return;
  }

  setSession({ email, firstName: user.firstName, lastName: user.lastName, guest: false });
  setBtnLoading('l-btn', false);
  closeAuth();
  applySession();
  toast(`Welcome back, ${user.firstName}!`, 'success');
}

/*  GUEST AUTH */
function guestAccess() {
  setSession({ email: 'guest@saferoute.la', firstName: 'Guest', lastName: '', guest: true });
  closeAuth();
  applySession();
  toast('Continuing as guest.', 'info');
}

/*  LOGOUT  */
function doLogout() {
  clearSession();
  closeUserMenu();
  document.getElementById('auth-overlay').style.display = 'flex';
  toast('Signed out.', 'info');
}

/*  Apply session to UI  */
function applySession() {
  const s = getSession();
  if (!s) return;
  const init = ((s.firstName?.[0] || 'G') + (s.lastName?.[0] || '')).toUpperCase();
  const name = s.guest ? 'Guest' : `${s.firstName} ${s.lastName || ''}`.trim();
  setText('u-av',     init);
  setText('udd-av',   init);
  setText('u-nm',     s.firstName || 'Guest');
  setText('udd-name', name);
  setText('udd-email',s.email || '');
  loadSavedRoutes?.();
}

function closeAuth()     { document.getElementById('auth-overlay').style.display = 'none'; }
function toggleUserMenu(){ document.getElementById('user-dd')?.classList.toggle('open'); }
function closeUserMenu() { document.getElementById('user-dd')?.classList.remove('open'); }

document.addEventListener('click', e => {
  const wrap = document.getElementById('user-wrap');
  if (wrap && !wrap.contains(e.target)) closeUserMenu();
});

/* Boot: restore session on page load  */
document.addEventListener('DOMContentLoaded', () => {
  _watchAuthInputs();
  const s = getSession();
  if (s) { closeAuth(); applySession(); }
  else   document.getElementById('auth-overlay').style.display = 'flex';
});