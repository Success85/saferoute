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
  if (!first)                { setFErr('r-first',  'r-first-err',   'First name is required');    ok = false; }
  if (!last)                 { setFErr('r-last',   'r-last-err',    'Last name is required');     ok = false; }
  if (!email)                { setFErr('r-email',  'r-email-err',   'Email is required');         ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFErr('r-email','r-email-err','Invalid email address'); ok = false; }
  if (!pass)                 { setFErr('r-pass',   'r-pass-err',    'Password is required');      ok = false; }
  else if (pass.length < 8)  { setFErr('r-pass',   'r-pass-err',    'Minimum 8 characters');      ok = false; }
  if (!confirm)              { setFErr('r-confirm','r-confirm-err', 'Please confirm password');    ok = false; }
  else if (pass !== confirm) { setFErr('r-confirm','r-confirm-err', 'Passwords do not match');     ok = false; }
  if (!ok) return;

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
  if (!email)                { setFErr('l-email','l-email-err','Email is required');    ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFErr('l-email','l-email-err','Invalid email'); ok = false; }
  if (!pass)                 { setFErr('l-pass', 'l-pass-err', 'Password is required'); ok = false; }
  if (!ok) return;

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
  const s = getSession();
  if (s) { closeAuth(); applySession(); }
  else   document.getElementById('auth-overlay').style.display = 'flex';
});