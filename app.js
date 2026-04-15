/* ═══════════════════════════════════════════
   FALL I LOVE — app.js v3
   Firebase prefix: fil_  (no collision)
═══════════════════════════════════════════ */
'use strict';

const FIREBASE_CONFIG = {
  apiKey:'AIzaSyDLPAktzLmpfNX9XUmw9i_B2P2I3XPwOLs',
  authDomain:'viccybank.firebaseapp.com',
  databaseURL:'https://viccybank-default-rtdb.firebaseio.com',
  projectId:'viccybank',
  storageBucket:'viccybank.firebasestorage.app',
  messagingSenderId:'328465601734',
  appId:'1:328465601734:web:ae8d6bee3683be60629b32'
};
const CL_CLOUD  = 'dbgxllxdb';
const CL_PRESET = 'efootball_screenshots';
const APP_URL   = window.location.origin + window.location.pathname.replace(/\/$/,'');

const DB_USERS   = 'fil_users';
const DB_CONVS   = 'fil_convs';
const DB_MSGS    = 'fil_msgs';
const DB_MATCHES = 'fil_matches';

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.database();

/* ── STATE ── */
let ME = null, CONV_ID = null, MSGS_REF = null, CONV_SUB = null;
let TAB = 'chats', ALL_CONVS = {}, MATCH_Q = [], MATCH_I = 0;
let PENDING_IMG = null, DEFERRED_INSTALL = null;
let SEL_GROUP = {}, REG = {}, PHONE_OPTS = [];

/* ══════════════════════════════════
   BOOT
══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  auth.onAuthStateChanged(async user => {
    if (user) {
      const snap = await db.ref(`${DB_USERS}/${user.uid}`).once('value').catch(() => null);
      if (snap && snap.exists()) {
        ME = snap.val();
        hideSplash();
        enterApp();
      } else {
        hideSplash();
        showAuth('register');
      }
    } else {
      ME = null;
      hideSplash();
      showAuth('login');
    }
  });
});

function hideSplash() {
  const s = g('splash');
  if (!s) return;
  s.classList.add('out');
  setTimeout(() => s.remove(), 750);
}

/* ══════════════════════════════════
   PWA
══════════════════════════════════ */
function initPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  const iOS  = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const droid= /android/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode:standalone)').matches || navigator.standalone;
  if (standalone) return;
  if (iOS && !sessionStorage.getItem('ios-dismissed')) {
    setTimeout(() => g('ios-banner').classList.add('show'), 2200);
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); DEFERRED_INSTALL = e;
    if (!sessionStorage.getItem('ap-dismissed')) {
      setTimeout(() => g('android-popup').classList.add('show'), 2600);
    }
  });
}
function dismissIOS() { g('ios-banner').classList.remove('show'); sessionStorage.setItem('ios-dismissed','1'); }
function installAndroid() {
  if (!DEFERRED_INSTALL) return;
  DEFERRED_INSTALL.prompt();
  DEFERRED_INSTALL.userChoice.then(() => { DEFERRED_INSTALL = null; g('android-popup').classList.remove('show'); });
}
function dismissAndroid() { g('android-popup').classList.remove('show'); sessionStorage.setItem('ap-dismissed','1'); }

/* ══════════════════════════════════
   AUTH
══════════════════════════════════ */
function showAuth(tab) {
  g('auth-screen').classList.add('show');
  g('app').classList.remove('show');
  switchAuthTab(tab || 'login');
}
function switchAuthTab(tab) {
  qsa('.atab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  g('login-sec').style.display  = tab === 'login'    ? '' : 'none';
  g('reg-sec').style.display    = tab === 'register' ? '' : 'none';
  hideErr();
  if (tab === 'register') goStep(1);
}
function showErr(msg) { const e = g('auth-err'); e.textContent = msg; e.classList.add('show'); }
function hideErr()    { g('auth-err').classList.remove('show'); }

/* LOGIN */
async function doLogin() {
  const email = val('l-email'), pass = val('l-pass');
  if (!email || !pass) return showErr('Enter email and password.');
  const btn = g('l-btn'); setBtn(btn,'Signing in…',true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    showErr(authErr(e.code));
    setBtn(btn,'Sign In',false);
  }
}

/* REGISTER — 3 steps */
function goStep(n) {
  qsa('.reg-step').forEach((el,i) => el.classList.toggle('on', i+1 === n));
  qsa('.step-pip').forEach((p,i) => {
    p.classList.remove('now','done');
    if (i+1 === n)  p.classList.add('now');
    if (i+1 < n)    p.classList.add('done');
  });
  hideErr();
}

async function regNext1() {
  const name = val('r-name').trim();
  const user = val('r-user').trim().toLowerCase().replace(/\s+/g,'');
  if (!name) return showErr('Enter your full name.');
  if (!user || !/^[a-z0-9_]+$/.test(user)) return showErr('Username: letters, numbers, underscores only.');
  const btn = g('r-n1'); setBtn(btn,'Checking…',true);
  try {
    const snap = await db.ref(DB_USERS).orderByChild('username').equalTo(user).once('value');
    if (snap.exists()) { setBtn(btn,'Continue',false); return showErr('Username already taken.'); }
  } catch(e) { /* DB rules may block, proceed */ }
  REG.name = name; REG.username = user;
  setBtn(btn,'Continue',false);
  goStep(2);
}
function regNext2() {
  const email = val('r-email'), pass = val('r-pass');
  if (!email) return showErr('Enter your email address.');
  if (pass.length < 6) return showErr('Password must be at least 6 characters.');
  if (!g('r-terms').checked) return showErr('Accept the Terms & Privacy Policy to continue.');
  REG.email = email; REG.pass = pass;
  PHONE_OPTS = genPhones(5);
  renderPhones();
  goStep(3);
}
async function doRegister() {
  if (!REG.phone) return showErr('Select a phone number.');
  const btn = g('r-finish'); setBtn(btn,'Creating…',true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(REG.email, REG.pass);
    const uid = cred.user.uid;
    const profile = { uid, email:REG.email, name:REG.name, username:REG.username, phone:REG.phone, bio:'', photoURL:'', online:true, createdAt:Date.now() };
    await db.ref(`${DB_USERS}/${uid}`).set(profile);
    ME = profile;
  } catch(e) {
    showErr(authErr(e.code, e.message));
    setBtn(btn,'Create Account',false);
  }
}

function authErr(code, msg) {
  const m = {
    'auth/user-not-found':'No account with that email.',
    'auth/wrong-password':'Incorrect password.',
    'auth/invalid-credential':'Incorrect email or password.',
    'auth/email-already-in-use':'Email already in use — try signing in.',
    'auth/invalid-email':'Invalid email address.',
    'auth/too-many-requests':'Too many attempts — please wait.',
    'auth/weak-password':'Password too weak (min 6 chars).',
    'auth/network-request-failed':'Network error. Check connection.',
    'auth/operation-not-allowed':'Email/password auth not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
  };
  return m[code] || (code ? '['+code+'] '+(msg||'Error') : 'Something went wrong.');
}

function doLogout() {
  if (ME) db.ref(`${DB_USERS}/${ME.uid}/online`).set(false);
  auth.signOut();
}

/* Phone generation */
function genPhones(n) {
  return Array.from({length:n}, () => {
    const a = rnd(200,999), b = rnd(100,999), c = rnd(1000,9999);
    return `+1 ${a} ${b} ${c}`;
  });
}
function rnd(lo, hi) { return Math.floor(Math.random()*(hi-lo+1))+lo; }

function renderPhones() {
  const w = g('phone-opts'); w.innerHTML = '';
  PHONE_OPTS.forEach((num,i) => {
    const d = document.createElement('div');
    d.className = 'phone-opt'+(i===0?' sel':'');
    d.innerHTML = `<span class="phone-opt-n">${num}</span><span class="phone-opt-r"></span>`;
    d.onclick = () => selPhone(i);
    w.appendChild(d);
  });
  REG.phone = PHONE_OPTS[0];
  g('phone-disp').textContent = PHONE_OPTS[0];
}
function selPhone(idx) {
  qsa('.phone-opt').forEach((el,i) => el.classList.toggle('sel', i===idx));
  REG.phone = PHONE_OPTS[idx];
  g('phone-disp').textContent = PHONE_OPTS[idx];
}
function refreshPhones() { PHONE_OPTS = genPhones(5); renderPhones(); }

/* ══════════════════════════════════
   ENTER APP
══════════════════════════════════ */
async function enterApp() {
  g('auth-screen').classList.remove('show');
  g('app').classList.add('show');
  renderFooter();
  db.ref(`${DB_USERS}/${ME.uid}/online`).set(true);
  db.ref(`${DB_USERS}/${ME.uid}/online`).onDisconnect().set(false);
  listenConvs();
  loadSuggestions();
  loadMatchQueue();
  checkLink();
  setTab('chats');
}

function renderFooter() {
  const av = g('foot-av'), nm = g('foot-nm'), ph = g('foot-ph');
  nm.textContent = ME.name || 'You';
  ph.textContent = ME.phone || '';
  renderAv(av, ME.name, ME.photoURL);
}

/* ══════════════════════════════════
   TABS
══════════════════════════════════ */
function setTab(tab) {
  TAB = tab;
  qsa('.sbn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  qsa('.sb-panel').forEach(p => p.classList.toggle('on', p.dataset.panel === tab));
  if (tab === 'match') loadMatchQueue();
}

/* ══════════════════════════════════
   CONVERSATIONS LISTENER
══════════════════════════════════ */
function listenConvs() {
  if (CONV_SUB) db.ref(DB_CONVS).off('value', CONV_SUB);
  CONV_SUB = db.ref(DB_CONVS).orderByChild('updatedAt').on('value', snap => {
    ALL_CONVS = {};
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        if (d.members && d.members[ME.uid]) ALL_CONVS[c.key] = { id:c.key, ...d };
      });
    }
    renderConvList();
  });
}

function renderConvList(filter) {
  const wrap = g('conv-list');
  let list = Object.values(ALL_CONVS).sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0));
  if (filter) {
    const q = filter.toLowerCase();
    list = list.filter(c => (c.name||'').toLowerCase().includes(q));
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="sb-empty"><div class="sb-empty-ic">💬</div><p>No conversations yet.<br/>Search or use Match.</p></div>`;
    return;
  }
  wrap.innerHTML = '';
  list.forEach(conv => {
    let dName = conv.name || 'Chat', dPhoto = conv.photoURL || '';
    if (conv.type === 'dm' && conv.pi && conv.pi[ME.uid]) {
      dName  = conv.pi[ME.uid].name  || dName;
      dPhoto = conv.pi[ME.uid].photo || dPhoto;
    }
    const unread = (conv.unread && conv.unread[ME.uid]) || 0;
    const prev = conv.lastMsg
      ? (conv.lastMsg.startsWith('[img]') ? '📷 Photo' : conv.lastMsg)
      : 'Say hello 👋';
    const div = document.createElement('div');
    div.className = 'conv-row' + (conv.id === CONV_ID ? ' on' : '');
    div.onclick = () => openConv(conv.id);
    div.innerHTML = `
      <div class="av av-md" id="cav-${conv.id}"></div>
      <div class="conv-inf">
        <div class="conv-nm">${esc(dName)}</div>
        <div class="conv-pv">${esc(prev)}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${fmtTime(conv.updatedAt)}</span>
        ${unread ? `<span class="conv-badge">${unread}</span>` : ''}
      </div>`;
    wrap.appendChild(div);
    renderAv(div.querySelector(`#cav-${conv.id}`), dName, dPhoto);
  });
}

/* ══════════════════════════════════
   SUGGESTIONS
══════════════════════════════════ */
async function loadSuggestions() {
  const snap = await db.ref(DB_USERS).limitToLast(30).once('value').catch(() => null);
  if (!snap) return;
  const existP = new Set(
    Object.values(ALL_CONVS)
      .filter(c => c.type === 'dm')
      .map(c => Object.keys(c.members||{}).find(id => id !== ME.uid))
      .filter(Boolean)
  );
  const users = [];
  snap.forEach(c => {
    const u = c.val();
    if (u.uid === ME.uid || existP.has(u.uid)) return;
    users.push(u);
  });
  users.sort(() => Math.random() - 0.5);
  const strip = g('sug-strip'), row = g('sug-row');
  if (!users.length) { strip.style.display = 'none'; return; }
  strip.style.display = '';
  row.innerHTML = '';
  users.slice(0,8).forEach(u => {
    const chip = document.createElement('div');
    chip.className = 'sug-chip';
    chip.onclick = () => { startDM(u.uid); };
    chip.innerHTML = `<div class="av av-sm" id="sgav-${u.uid}"></div><span class="sug-chip-nm">${esc(u.name)}</span>`;
    row.appendChild(chip);
    renderAv(chip.querySelector(`#sgav-${u.uid}`), u.name, u.photoURL);
  });
}

/* ══════════════════════════════════
   OPEN CONVERSATION
══════════════════════════════════ */
async function openConv(id) {
  CONV_ID = id;
  db.ref(`${DB_CONVS}/${id}/unread/${ME.uid}`).set(0);
  renderConvList(g('sb-si').value);

  const snap = await db.ref(`${DB_CONVS}/${id}`).once('value');
  const conv = snap.val(); if (!conv) return;

  let dName = conv.name || 'Chat', dPhoto = conv.photoURL || '';
  if (conv.type === 'dm' && conv.pi && conv.pi[ME.uid]) {
    dName  = conv.pi[ME.uid].name  || dName;
    dPhoto = conv.pi[ME.uid].photo || dPhoto;
  }

  g('ch-nm').textContent = dName;
  g('ch-sub').textContent = conv.type === 'group' ? `${Object.keys(conv.members||{}).length} members` : 'Offline';
  g('ch-sub').className = 'ch-sub';
  renderAv(g('chat-av'), dName, dPhoto, conv.type === 'group');

  if (conv.type === 'dm') {
    const partner = Object.keys(conv.members).find(id => id !== ME.uid);
    if (partner) {
      db.ref(`${DB_USERS}/${partner}/online`).on('value', s => {
        const el = g('ch-sub'); if (!el) return;
        el.textContent = s.val() ? 'Online' : 'Offline';
        el.className = 'ch-sub' + (s.val() ? ' online' : '');
      });
    }
  }

  g('chat-empty').style.display = 'none';
  g('chat-view').style.display = 'flex';
  g('chat-pane').classList.add('shown');
  g('sidebar').classList.add('hidden');

  if (MSGS_REF) MSGS_REF.off();
  const area = g('msgs-area');
  area.innerHTML = '';
  MSGS_REF = db.ref(`${DB_MSGS}/${id}`);
  MSGS_REF.on('child_added', s => { renderMsg(s.key, s.val(), conv); scrollBot(); });
  MSGS_REF.on('child_changed', s => {
    const el = qs(`[data-mid="${s.key}"]`);
    if (el) { const re = el.querySelector('.b-reacts'); if (re) renderReacts(re, s.key, s.val().reactions||{}); }
  });
}

function backToSidebar() {
  g('chat-pane').classList.remove('shown');
  g('sidebar').classList.remove('hidden');
}

/* ══════════════════════════════════
   RENDER MESSAGE
══════════════════════════════════ */
function renderMsg(id, msg, conv) {
  const area = g('msgs-area');
  const isOut = msg.senderId === ME.uid;

  // Date divider
  const dStr = new Date(msg.timestamp).toDateString();
  const last = area.querySelector('.date-sep:last-of-type');
  if (!last || last.dataset.d !== dStr) {
    const dd = document.createElement('div');
    dd.className = 'date-sep'; dd.dataset.d = dStr;
    dd.textContent = fmtDate(msg.timestamp);
    area.appendChild(dd);
  }

  const grp = document.createElement('div');
  grp.className = `msg-grp ${isOut ? 'out' : 'in'}`;
  grp.setAttribute('data-mid', id);

  if (!isOut && conv.type === 'group') {
    const snm = document.createElement('div');
    snm.className = 'msg-snm';
    snm.textContent = msg.senderName || 'User';
    grp.appendChild(snm);
  }

  const row = document.createElement('div');
  row.className = 'msg-row';

  // Avatar (in only)
  if (!isOut) {
    const av = document.createElement('div');
    av.className = 'av av-xs';
    renderAv(av, msg.senderName||'?', msg.senderPhoto||'');
    row.appendChild(av);
  }

  const wrap = document.createElement('div');
  wrap.className = 'bwrap';

  // Reaction picker
  const pick = document.createElement('div');
  pick.className = 'r-pick';
  pick.id = 'rp-'+id;
  ['❤️','😂','😮','👍','🙏','🔥','✨','💯'].forEach(em => {
    const s = document.createElement('span');
    s.className = 'r-em'; s.textContent = em;
    s.onclick = e => { e.stopPropagation(); addReaction(id, em); pick.classList.remove('show'); };
    pick.appendChild(s);
  });

  const bubble = document.createElement('div');
  if (msg.text && msg.text.startsWith('[img]')) {
    const url = msg.text.slice(5);
    bubble.className = 'bubble img-b';
    const img = document.createElement('img');
    img.src = url; img.className = 'b-photo'; img.loading = 'lazy';
    img.onclick = () => openLightbox(url);
    bubble.appendChild(img);
  } else {
    bubble.className = 'bubble';
    bubble.textContent = msg.text || '';
  }

  const reacts = document.createElement('div');
  reacts.className = 'b-reacts';
  renderReacts(reacts, id, msg.reactions || {});

  wrap.appendChild(pick);
  wrap.appendChild(bubble);
  wrap.appendChild(reacts);

  const trig = document.createElement('button');
  trig.className = 'r-trig'; trig.textContent = '😊';
  trig.onclick = e => { e.stopPropagation(); togglePicker(id, wrap); };

  if (isOut) { row.appendChild(trig); row.appendChild(wrap); }
  else        { row.appendChild(wrap); row.appendChild(trig); }

  grp.appendChild(row);

  const ts = document.createElement('span');
  ts.className = 'msg-ts';
  ts.textContent = fmtTime(msg.timestamp);
  grp.appendChild(ts);

  area.appendChild(grp);
}

function renderReacts(el, msgId, reactions) {
  el.innerHTML = '';
  const counts = {}, mine = {};
  Object.entries(reactions).forEach(([uid,em]) => {
    counts[em] = (counts[em]||0)+1;
    if (uid === ME.uid) mine[em] = true;
  });
  Object.entries(counts).forEach(([em,n]) => {
    const pill = document.createElement('div');
    pill.className = 'react-pill';
    pill.innerHTML = `${em} <span class="react-cnt">${n}</span>`;
    pill.onclick = () => addReaction(msgId, em);
    el.appendChild(pill);
  });
}

function togglePicker(id, wrap) {
  qsa('.r-pick.show').forEach(p => { if (p.id !== 'rp-'+id) p.classList.remove('show'); });
  wrap.querySelector('.r-pick').classList.toggle('show');
}

async function addReaction(msgId, em) {
  if (!CONV_ID) return;
  const ref = db.ref(`${DB_MSGS}/${CONV_ID}/${msgId}/reactions/${ME.uid}`);
  const s = await ref.once('value');
  if (s.val() === em) await ref.remove();
  else await ref.set(em);
}

/* ══════════════════════════════════
   SEND MESSAGE
══════════════════════════════════ */
async function sendMsg() {
  const ta = g('msg-ta');
  const text = ta.value.trim();
  if (!text && !PENDING_IMG) return;
  if (!CONV_ID) return;

  let content = text;
  if (PENDING_IMG) { content = '[img]'+PENDING_IMG; clearImg(); }

  const msg = {
    text: content,
    senderId: ME.uid,
    senderName: ME.name || 'You',
    senderPhoto: ME.photoURL || '',
    timestamp: Date.now()
  };
  db.ref(`${DB_MSGS}/${CONV_ID}`).push(msg);

  const prev = content.startsWith('[img]') ? '📷 Photo' : (text.length > 60 ? text.slice(0,60)+'…' : text);
  const cs = await db.ref(`${DB_CONVS}/${CONV_ID}`).once('value');
  const conv = cs.val() || {};
  const unread = {};
  Object.keys(conv.members||{}).forEach(uid => {
    if (uid !== ME.uid) unread[uid] = ((conv.unread||{})[uid]||0)+1;
  });
  db.ref(`${DB_CONVS}/${CONV_ID}`).update({ lastMsg:prev, updatedAt:Date.now(), unread:{...(conv.unread||{}), ...unread} });

  ta.value = ''; ta.style.height = '';
}

function msgKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function autoGrow(el) { el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 120)+'px'; }

/* ══════════════════════════════════
   IMAGE UPLOAD
══════════════════════════════════ */
function trigImg() { g('img-input').click(); }

async function handleImg(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  showToast('Compressing image…');
  const blob = await compressImg(file, 900, 900, 0.72);
  showToast('Uploading…');
  const url = await uploadCloud(blob);
  if (!url) return showToast('Upload failed.');
  PENDING_IMG = url;
  g('ip-thumb').src = url;
  g('ip-nm').textContent = file.name;
  g('img-prev').classList.add('show');
}

function clearImg() {
  PENDING_IMG = null;
  g('img-prev').classList.remove('show');
  g('ip-thumb').src = '';
}

async function compressImg(file, mW, mH, q) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => {
      const i = new Image();
      i.onload = () => {
        let {width:w, height:h} = i;
        if (w > mW) { h = h*mW/w; w = mW; }
        if (h > mH) { w = w*mH/h; h = mH; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(i,0,0,w,h);
        c.toBlob(b => res(b||file), 'image/jpeg', q);
      };
      i.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

async function uploadCloud(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CL_PRESET);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CL_CLOUD}/image/upload`, { method:'POST', body:fd });
    return (await r.json()).secure_url || null;
  } catch { return null; }
}

/* ══════════════════════════════════
   DM
══════════════════════════════════ */
function openDMModal() {
  g('dm-search').value = '';
  g('dm-results').innerHTML = '';
  openModal('dm-modal');
}

async function startDM(uid) {
  const snap = await db.ref(`${DB_USERS}/${uid}`).once('value');
  if (!snap.exists()) return;
  const partner = snap.val();
  const key = [ME.uid, uid].sort().join('_');
  const ex = await db.ref(`${DB_CONVS}/${key}`).once('value');
  if (!ex.exists()) {
    await db.ref(`${DB_CONVS}/${key}`).set({
      type:'dm', name:partner.name||'User', photoURL:partner.photoURL||'',
      members:{ [ME.uid]:true, [uid]:true },
      pi:{ [ME.uid]:{name:partner.name,photo:partner.photoURL||''}, [uid]:{name:ME.name,photo:ME.photoURL||''} },
      createdAt:Date.now(), updatedAt:Date.now(), lastMsg:'', unread:{[ME.uid]:0,[uid]:0}
    });
  }
  closeModal('dm-modal');
  setTab('chats');
  openConv(key);
}

/* ══════════════════════════════════
   USER SEARCH
══════════════════════════════════ */
async function searchUsers(query, containerId, multi) {
  const wrap = g(containerId);
  if (!query.trim()) { wrap.innerHTML = ''; return; }
  const q = query.toLowerCase();
  let snap;
  try { snap = await db.ref(DB_USERS).once('value'); } catch { return; }
  const results = [];
  if (snap) snap.forEach(c => {
    const u = c.val();
    if (u.uid === ME.uid) return;
    if ((u.name||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q) ||
        (u.phone||'').replace(/\s/g,'').includes(q.replace(/\s/g,''))) results.push(u);
  });
  wrap.innerHTML = '';
  if (!results.length) { wrap.innerHTML = `<div style="padding:16px;text-align:center;font-size:.83rem;color:var(--c-t4)">No users found.</div>`; return; }
  results.slice(0,8).forEach(u => {
    const div = document.createElement('div');
    if (multi) {
      div.className = 'ck-item';
      const chk = !!SEL_GROUP[u.uid];
      div.innerHTML = `<input type="checkbox" id="ck-${u.uid}" ${chk?'checked':''}/><div class="av av-sm" id="ckav-${u.uid}"></div><div><div class="ck-nm">${esc(u.name)}</div><div class="ck-ph">${esc(u.phone||'')}</div></div>`;
      div.onclick = () => toggleGroupMember(u);
    } else {
      div.className = 'u-row';
      div.innerHTML = `<div class="av av-sm" id="uav-${u.uid}"></div><div><div class="u-nm">${esc(u.name)}</div><div class="u-ph">${esc(u.phone||'')}</div></div>`;
      div.onclick = () => startDM(u.uid);
    }
    wrap.appendChild(div);
    const avEl = div.querySelector(`#ckav-${u.uid},#uav-${u.uid}`);
    if (avEl) renderAv(avEl, u.name, u.photoURL);
  });
}

/* ══════════════════════════════════
   GROUP
══════════════════════════════════ */
function openGroupModal() {
  SEL_GROUP = {};
  g('grp-name').value = '';
  g('grp-msrch').value = '';
  g('grp-mresults').innerHTML = '';
  g('grp-selected').innerHTML = '';
  openModal('grp-modal');
}
function toggleGroupMember(u) {
  if (SEL_GROUP[u.uid]) delete SEL_GROUP[u.uid];
  else SEL_GROUP[u.uid] = u;
  const ck = g('ck-'+u.uid); if (ck) ck.checked = !!SEL_GROUP[u.uid];
  const sel = g('grp-selected');
  sel.innerHTML = Object.values(SEL_GROUP).map(s =>
    `<span style="background:var(--c-s3);border-radius:100px;padding:4px 10px;font-size:.76rem;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--c-b1)">${esc(s.name)}<span style="cursor:pointer;opacity:.5;font-size:.9rem" onclick="toggleGroupMember(${JSON.stringify(s)})">×</span></span>`
  ).join('');
}
async function createGroup() {
  const name = g('grp-name').value.trim();
  if (!name) return showToast('Enter a group name.');
  if (!Object.keys(SEL_GROUP).length) return showToast('Add at least one member.');
  const members = { [ME.uid]:true };
  Object.keys(SEL_GROUP).forEach(uid => { members[uid] = true; });
  const ref = db.ref(DB_CONVS).push();
  await ref.set({ type:'group',name,photoURL:'',members,createdAt:Date.now(),updatedAt:Date.now(),lastMsg:'',unread:{} });
  closeModal('grp-modal');
  setTab('chats');
  openConv(ref.key);
}

/* ══════════════════════════════════
   MATCH
══════════════════════════════════ */
async function loadMatchQueue() {
  const snap = await db.ref(DB_USERS).once('value').catch(() => null);
  const seenSnap = await db.ref(`${DB_MATCHES}/${ME.uid}/seen`).once('value').catch(() => null);
  const seen = seenSnap ? (seenSnap.val()||{}) : {};
  MATCH_Q = []; MATCH_I = 0;
  if (snap) snap.forEach(c => {
    const u = c.val();
    if (u.uid === ME.uid || seen[u.uid]) return;
    MATCH_Q.push(u);
  });
  MATCH_Q.sort(() => Math.random()-0.5);
  renderMatchCards();
}

function renderMatchCards() {
  const stack = g('match-stack');
  stack.innerHTML = '';
  if (MATCH_I >= MATCH_Q.length) {
    stack.innerHTML = `<div class="sb-empty" style="height:100%;justify-content:center"><div class="sb-empty-ic">✨</div><p>You've seen everyone!<br/>Check back later.</p></div>`;
    return;
  }
  for (let i = Math.min(MATCH_I+1, MATCH_Q.length-1); i >= MATCH_I; i--) {
    const u = MATCH_Q[i], isFront = i === MATCH_I;
    const card = document.createElement('div');
    card.className = 'mc ' + (isFront ? 'front' : 'back');
    card.id = 'mc-'+i;
    card.innerHTML = `
      <div class="mc-img">
        ${u.photoURL ? `<img src="${u.photoURL}" alt="" loading="lazy"/>` : '<span class="mc-ph">👤</span>'}
        <div class="mc-grad"></div>
        <div class="hint-L">Nope</div>
        <div class="hint-R">Connect</div>
        <div class="mc-ov">
          <div class="mc-name">${esc(u.name)}</div>
          <div class="mc-phone">${esc(u.phone||'')}</div>
          ${u.bio ? `<div class="mc-bio">${esc(u.bio)}</div>` : ''}
        </div>
      </div>`;
    stack.appendChild(card);
    if (isFront) enableSwipe(card, u);
  }
}

function enableSwipe(card, user) {
  if (!card) return;
  let sx = 0, dx = 0, dragging = false;
  const hL = card.querySelector('.hint-L'), hR = card.querySelector('.hint-R');
  const down = e => { sx = e.touches ? e.touches[0].clientX : e.clientX; dragging = true; };
  const move = e => {
    if (!dragging) return;
    dx = (e.touches ? e.touches[0].clientX : e.clientX) - sx;
    const rot = dx * 0.06;
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
    if (hL) hL.style.opacity = dx < -30 ? Math.min(1, (-dx-30)/60) : 0;
    if (hR) hR.style.opacity = dx > 30  ? Math.min(1, (dx-30)/60)  : 0;
  };
  const up = () => {
    if (!dragging) return; dragging = false;
    if (hL) hL.style.opacity = 0;
    if (hR) hR.style.opacity = 0;
    if (dx > 80)       doConnect(user);
    else if (dx < -80) doSkip(user);
    else { card.style.transition = 'transform .3s ease'; card.style.transform = ''; setTimeout(()=>card.style.transition='',320); }
    dx = 0;
  };
  card.addEventListener('mousedown', down);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  card.addEventListener('touchstart', down, {passive:true});
  card.addEventListener('touchmove', move, {passive:true});
  card.addEventListener('touchend', up);
}

function doSkip(user) {
  const card = g('mc-'+MATCH_I);
  if (card) card.classList.add('go-L');
  db.ref(`${DB_MATCHES}/${ME.uid}/seen/${user.uid}`).set(true);
  MATCH_I++;
  setTimeout(renderMatchCards, 400);
}
async function doConnect(user) {
  const card = g('mc-'+MATCH_I);
  if (card) card.classList.add('go-R');
  db.ref(`${DB_MATCHES}/${ME.uid}/seen/${user.uid}`).set(true);
  db.ref(`${DB_MATCHES}/${ME.uid}/connected/${user.uid}`).set(true);
  const theirSnap = await db.ref(`${DB_MATCHES}/${user.uid}/connected/${ME.uid}`).once('value').catch(()=>null);
  if (theirSnap && theirSnap.val()) {
    setTimeout(() => showMatchModal(user), 420);
  } else {
    MATCH_I++;
    setTimeout(renderMatchCards, 400);
    showToast('💫 Connection sent!');
  }
}
function showMatchModal(user) {
  g('mm-their').textContent = user.name;
  renderAv(g('mm-av1'), ME.name,   ME.photoURL);
  renderAv(g('mm-av2'), user.name, user.photoURL);
  g('match-modal').classList.add('show');
  startDM(user.uid);
}
function closeMatchModal() { g('match-modal').classList.remove('show'); MATCH_I++; setTimeout(renderMatchCards,400); }

/* ══════════════════════════════════
   PROFILE
══════════════════════════════════ */
async function openProfile() {
  const snap = await db.ref(`${DB_USERS}/${ME.uid}`).once('value');
  const d = snap.val()||{};
  g('prof-nm').value = d.name||'';
  g('prof-bio').value = d.bio||'';
  g('prof-phone').textContent = d.phone||'';
  const ring = g('prof-ring');
  ring.innerHTML = `<div class="hov">📷</div>`;
  if (d.photoURL) { const img = document.createElement('img'); img.src = d.photoURL; img.alt=''; ring.insertBefore(img, ring.firstChild); }
  else { const init = document.createElement('span'); init.style.cssText='font-size:2rem;font-weight:700'; init.textContent=(d.name||'?')[0].toUpperCase(); ring.insertBefore(init,ring.firstChild); }
  const link = `${APP_URL}?dm=${d.username||ME.uid}`;
  g('prof-link').textContent = link;
  openModal('prof-modal');
}
function trigProfPic() { g('prof-pic-in').click(); }
async function uploadProfPic(input) {
  const file = input.files[0]; if (!file) return;
  showToast('Uploading photo…');
  const url = await uploadCloud(file);
  if (!url) return showToast('Upload failed.');
  await db.ref(`${DB_USERS}/${ME.uid}/photoURL`).set(url);
  ME.photoURL = url; renderFooter();
  const ring = g('prof-ring');
  ring.innerHTML = `<img src="${url}" alt=""/><div class="hov">📷</div>`;
  showToast('Photo updated!');
}
async function saveProfile() {
  const name = g('prof-nm').value.trim(), bio = g('prof-bio').value.trim();
  if (!name) return showToast('Name cannot be empty.');
  await db.ref(`${DB_USERS}/${ME.uid}`).update({name,bio});
  ME.name = name; ME.bio = bio; renderFooter();
  closeModal('prof-modal');
  showToast('Profile saved!');
}
function copyProfLink() { navigator.clipboard.writeText(g('prof-link').textContent).then(()=>showToast('Link copied!')); }
function shareLink()    { const l=`${APP_URL}?dm=${ME.username||ME.uid}`; navigator.clipboard.writeText(l).then(()=>showToast('Link copied!')); }

/* ══════════════════════════════════
   CHAT INFO
══════════════════════════════════ */
async function openChatInfo() {
  if (!CONV_ID) return;
  const snap = await db.ref(`${DB_CONVS}/${CONV_ID}`).once('value');
  const conv = snap.val(); if (!conv) return;
  g('info-ttl').textContent = conv.type==='group' ? 'Group Info' : 'Chat Info';
  let html = '';
  if (conv.type === 'group') {
    html += `<p class="modal-sub">${Object.keys(conv.members||{}).length} members</p>`;
    for (const uid of Object.keys(conv.members||{})) {
      let uName = '?', uPhone = '', uPhoto = '';
      try { const us = await db.ref(`${DB_USERS}/${uid}`).once('value'); const u = us.val()||{}; uName=u.name||'?'; uPhone=u.phone||''; uPhoto=u.photoURL||''; } catch{}
      html += `<div class="mbr-row"><div class="av av-xs" id="mbav-${uid}"></div><div style="flex:1"><div style="font-size:.86rem;font-weight:600;color:var(--c-t1)">${esc(uName)}</div><div style="font-size:.7rem;color:var(--c-t3);font-family:monospace">${esc(uPhone)}</div></div>${uid===ME.uid?'<span style="font-size:.68rem;color:var(--c-t4)">You</span>':''}</div>`;
    }
    const lnk = `${APP_URL}?group=${CONV_ID}`;
    html += `<div style="margin-top:16px"><div class="lxs">Invite link</div><div class="share-box"><span class="share-url">${lnk}</span><button class="copy-btn" onclick="navigator.clipboard.writeText('${lnk}').then(()=>showToast('Copied!'))">Copy</button></div></div>`;
  } else {
    const lnk = `${APP_URL}?chat=${CONV_ID}`;
    html += `<div class="lxs">Shareable link</div><div class="share-box"><span class="share-url">${lnk}</span><button class="copy-btn" onclick="navigator.clipboard.writeText('${lnk}').then(()=>showToast('Copied!'))">Copy</button></div>`;
  }
  g('info-body').innerHTML = html;
  if (conv.type==='group') {
    for (const uid of Object.keys(conv.members||{})) {
      const mbav = g('mbav-'+uid);
      if (mbav) { try { const us = await db.ref(`${DB_USERS}/${uid}`).once('value'); const u=us.val()||{}; renderAv(mbav,u.name,u.photoURL); } catch{} }
    }
  }
  openModal('info-modal');
}
function shareChatLink() { const l=`${APP_URL}?chat=${CONV_ID}`; navigator.clipboard.writeText(l).then(()=>showToast('Chat link copied!')); }

/* ══════════════════════════════════
   INCOMING LINK
══════════════════════════════════ */
function checkLink() {
  const p = new URLSearchParams(window.location.search);
  const dm = p.get('dm');
  if (dm) {
    history.replaceState(null,'',window.location.pathname);
    db.ref(DB_USERS).orderByChild('username').equalTo(dm).once('value').then(snap => {
      if (snap.exists()) {
        const uid = Object.keys(snap.val())[0];
        if (uid !== ME.uid) startDM(uid);
      } else {
        db.ref(`${DB_USERS}/${dm}`).once('value').then(s => { if (s.exists() && dm !== ME.uid) startDM(dm); });
      }
    });
  }
}

/* ══════════════════════════════════
   SCROLL
══════════════════════════════════ */
function scrollBot() {
  const a = g('msgs-area'); if (a) a.scrollTop = a.scrollHeight;
}

/* ══════════════════════════════════
   MODALS
══════════════════════════════════ */
function openModal(id)  { g(id).classList.add('show'); }
function closeModal(id) { g(id).classList.remove('show'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-ov').forEach(o => {
    o.addEventListener('click', e => { if (e.target===o) o.classList.remove('show'); });
  });
  const area = g('msgs-area');
  if (area) {
    area.addEventListener('scroll', () => {
      const btn = g('scroll-btn');
      const atBot = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      btn && btn.classList.toggle('show', !atBot);
    });
  }
});

/* LEGAL */
function showLegal(which) {
  const p = g('legal-page'); p.classList.add('show');
  g('legal-terms').style.display   = which==='terms'   ? '' : 'none';
  g('legal-privacy').style.display = which==='privacy' ? '' : 'none';
}
function closeLegal() { g('legal-page').classList.remove('show'); }

/* LIGHTBOX */
function openLightbox(url) { g('lb-img').src = url; g('lightbox').classList.add('show'); }
function closeLightbox()   { g('lightbox').classList.remove('show'); }

/* THEME */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', cur==='light'?'dark':'light');
}

/* TOAST */
let _tt;
function showToast(msg) {
  const e = g('toast'); e.textContent = msg; e.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(()=>e.classList.remove('show'), 2800);
}

/* UTILS */
function g(id)     { return document.getElementById(id); }
function qs(sel)   { return document.querySelector(sel); }
function qsa(sel)  { return document.querySelectorAll(sel); }
function val(id)   { return (g(id)||{}).value||''; }
function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function setBtn(btn,label,dis) { if(btn){btn.textContent=label;btn.disabled=dis;} }

function renderAv(el, name, photo, isGroup) {
  if (!el) return;
  if (isGroup) { el.textContent = '👥'; return; }
  if (photo) { el.innerHTML = `<img src="${esc(photo)}" alt="" loading="lazy"/>`; return; }
  const init = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  el.textContent = init;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString()===now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if (now-d < 7*86400000) return d.toLocaleDateString([],{weekday:'short'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString()===now.toDateString()) return 'Today';
  if (new Date(now-86400000).toDateString()===d.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
}

// Close pickers on outside click
document.addEventListener('click', () => { qsa('.r-pick.show').forEach(p=>p.classList.remove('show')); });
