/* ═══════════════════════════════════════════
   FALL I LOVE — app.js
   Firebase prefix: fil_
   All DB paths use fil_ to avoid collisions
═══════════════════════════════════════════ */
'use strict';

/* ── CONFIG ── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDLPAktzLmpfNX9XUmw9i_B2P2I3XPwOLs',
  authDomain:        'viccybank.firebaseapp.com',
  databaseURL:       'https://viccybank-default-rtdb.firebaseio.com',
  projectId:         'viccybank',
  storageBucket:     'viccybank.firebasestorage.app',
  messagingSenderId: '328465601734',
  appId:             '1:328465601734:web:ae8d6bee3683be60629b32'
};
const CL_CLOUD  = 'dbgxllxdb';
const CL_PRESET = 'efootball_screenshots';
const APP_URL   = window.location.origin + window.location.pathname.replace(/\/$/, '');

/* ── DB PATHS (all prefixed fil_) ── */
const DB_USERS   = 'fil_users';
const DB_CONVS   = 'fil_conversations';
const DB_MSGS    = 'fil_messages';
const DB_MATCHES = 'fil_matches';

/* ── FIREBASE INIT ── */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.database();

/* ── STATE ── */
let ME          = null;   // current user profile
let currentConv = null;   // active conversation id
let msgListener = null;   // active messages listener
let convSub     = null;   // conversations listener
let currentTab  = 'chats';
let allConvs    = {};
let matchQueue  = [];
let matchIndex  = 0;
let pendingImg  = null;
let deferredInstall = null; // Android PWA prompt
let selectedForGroup = {};
let regStep     = 1;
let regData     = {};
let phoneOptions = [];

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  setTimeout(() => hideSplash(), 1200);

  auth.onAuthStateChanged(async user => {
    if (user) {
      ME = { uid: user.uid };
      const snap = await db.ref(`${DB_USERS}/${user.uid}`).once('value');
      if (snap.exists()) {
        ME = snap.val();
        enterApp();
      } else {
        // Auth exists but no profile — show register step 1 to collect profile
        showAuth('register');
      }
    } else {
      ME = null;
      showAuth('login');
    }
  });
});

function hideSplash() {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hidden'); setTimeout(() => s.remove(), 700); }
}

/* ══════════════════════════════════════════
   PWA / INSTALL
══════════════════════════════════════════ */
function initPWA() {
  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  if (isStandalone) return; // already installed

  if (isIOS) {
    const dismissed = sessionStorage.getItem('ios-banner-dismissed');
    if (!dismissed) {
      setTimeout(() => document.getElementById('ios-banner').classList.add('visible'), 2000);
    }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    if (isAndroid || (!isIOS && !isAndroid)) {
      const dismissed = sessionStorage.getItem('android-install-dismissed');
      if (!dismissed) {
        setTimeout(() => document.getElementById('android-install').classList.add('visible'), 2500);
      }
    }
  });
}

function dismissIOS() {
  document.getElementById('ios-banner').classList.remove('visible');
  sessionStorage.setItem('ios-banner-dismissed', '1');
}

function installAndroid() {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
      deferredInstall = null;
      document.getElementById('android-install').classList.remove('visible');
    });
  }
}

function dismissAndroid() {
  document.getElementById('android-install').classList.remove('visible');
  sessionStorage.setItem('android-install-dismissed', '1');
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
function showAuth(tab) {
  document.getElementById('auth-screen').classList.add('visible');
  document.getElementById('app').classList.remove('visible');
  switchAuthTab(tab || 'login');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('login-section').style.display  = tab === 'login'    ? '' : 'none';
  document.getElementById('reg-section').style.display    = tab === 'register' ? '' : 'none';
  hideAuthError();
  if (tab === 'register') goRegStep(1);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.add('visible');
}
function hideAuthError() { document.getElementById('auth-error').classList.remove('visible'); }

/* ── LOGIN ── */
async function doLogin() {
  const email = v('login-email');
  const pass  = v('login-pass');
  if (!email || !pass) return showAuthError('Please enter your email and password.');
  const btn = document.getElementById('login-btn');
  setBtn(btn, 'Signing in…', true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    console.error(e);
    showAuthError(fmtAuthErr(e.code, e.message));
    setBtn(btn, 'Sign In', false);
  }
}

/* ── REGISTER — Multi-step ── */
function goRegStep(n) {
  regStep = n;
  document.querySelectorAll('.reg-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 === n) dot.classList.add('active');
    else if (i + 1 < n) dot.classList.add('done');
  });
  hideAuthError();
}

async function regNext1() {
  const name = v('reg-name').trim();
  const user = v('reg-username').trim().toLowerCase().replace(/\s+/g, '');
  if (!name) return showAuthError('Enter your full name.');
  if (!user || !/^[a-z0-9_]+$/.test(user)) return showAuthError('Username: letters, numbers, underscores only.');
  const btn = document.getElementById('reg-next1');
  setBtn(btn, 'Checking…', true);
  const snap = await db.ref(DB_USERS).orderByChild('username').equalTo(user).once('value').catch(() => null);
  if (snap && snap.exists()) { setBtn(btn, 'Continue', false); return showAuthError('Username taken.'); }
  regData.name = name; regData.username = user;
  setBtn(btn, 'Continue', false);
  goRegStep(2);
}

function regNext2() {
  const email = v('reg-email');
  const pass  = v('reg-pass');
  if (!email) return showAuthError('Enter your email address.');
  if (pass.length < 6) return showAuthError('Password must be at least 6 characters.');
  const terms = document.getElementById('reg-terms').checked;
  if (!terms) return showAuthError('Please accept the Terms & Privacy Policy to continue.');
  regData.email = email; regData.pass = pass;
  // Generate phone number options
  phoneOptions = generatePhoneOptions(5);
  renderPhoneOptions();
  goRegStep(3);
}

function generatePhoneOptions(count) {
  const nums = [];
  for (let i = 0; i < count; i++) {
    const area = Math.floor(Math.random() * 800) + 200;
    const mid  = Math.floor(Math.random() * 900) + 100;
    const end  = Math.floor(Math.random() * 9000) + 1000;
    nums.push(`+1 ${area} ${mid} ${end}`);
  }
  return nums;
}

function renderPhoneOptions() {
  const wrap = document.getElementById('phone-options');
  wrap.innerHTML = '';
  phoneOptions.forEach((num, i) => {
    const div = document.createElement('div');
    div.className = 'phone-alt' + (i === 0 ? ' selected' : '');
    div.dataset.index = i;
    div.innerHTML = `
      <span class="phone-alt-num">${num}</span>
      <span class="phone-alt-check">${i === 0 ? '✓' : ''}</span>`;
    div.onclick = () => selectPhone(i);
    wrap.appendChild(div);
  });
  regData.phone = phoneOptions[0];
  document.getElementById('selected-phone-display').textContent = phoneOptions[0];
}

function selectPhone(idx) {
  document.querySelectorAll('.phone-alt').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
    el.querySelector('.phone-alt-check').textContent = i === idx ? '✓' : '';
  });
  regData.phone = phoneOptions[idx];
  document.getElementById('selected-phone-display').textContent = phoneOptions[idx];
}

function refreshPhoneOptions() {
  phoneOptions = generatePhoneOptions(5);
  renderPhoneOptions();
}

async function doRegister() {
  if (!regData.phone) return showAuthError('Select a phone number.');
  const btn = document.getElementById('reg-finish');
  setBtn(btn, 'Creating account…', true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(regData.email, regData.pass);
    const uid = cred.user.uid;
    const profile = {
      uid, email: regData.email, name: regData.name,
      username: regData.username, phone: regData.phone,
      bio: '', photoURL: '', online: true,
      createdAt: Date.now()
    };
    await db.ref(`${DB_USERS}/${uid}`).set(profile);
    ME = profile;
  } catch(e) {
    console.error(e);
    showAuthError(fmtAuthErr(e.code, e.message));
    setBtn(btn, 'Create Account', false);
  }
}

function fmtAuthErr(code, msg) {
  const map = {
    'auth/user-not-found':          'No account with that email.',
    'auth/wrong-password':          'Incorrect password.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/email-already-in-use':    'Email already in use. Try signing in.',
    'auth/invalid-email':           'Invalid email address.',
    'auth/too-many-requests':       'Too many attempts — wait a moment.',
    'auth/weak-password':           'Password too weak (min 6 chars).',
    'auth/network-request-failed':  'Network error. Check connection.',
    'auth/operation-not-allowed':   'Email/password auth not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
  };
  return map[code] || (code ? '[' + code + '] ' + (msg||'Error') : 'Something went wrong.');
}

function doLogout() {
  if (ME) db.ref(`${DB_USERS}/${ME.uid}/online`).set(false);
  auth.signOut();
}

/* ══════════════════════════════════════════
   ENTER APP
══════════════════════════════════════════ */
async function enterApp() {
  document.getElementById('auth-screen').classList.remove('visible');
  document.getElementById('app').classList.add('visible');
  renderMyFooter();
  // Online presence
  db.ref(`${DB_USERS}/${ME.uid}/online`).set(true);
  db.ref(`${DB_USERS}/${ME.uid}/online`).onDisconnect().set(false);
  // Start listeners
  listenConversations();
  loadSuggestions();
  loadMatchQueue();
  // Shareable link
  checkIncomingLink();
  // Set active tab
  setTab('chats');
}

function renderMyFooter() {
  const av = document.getElementById('footer-avatar');
  const nm = document.getElementById('footer-name');
  const ph = document.getElementById('footer-phone');
  nm.textContent = ME.name || 'You';
  ph.textContent = ME.phone || '';
  if (ME.photoURL) av.innerHTML = `<img src="${ME.photoURL}" alt=""/>`;
  else av.textContent = (ME.name || '?')[0].toUpperCase();
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('visible', p.dataset.panel === tab));
  if (tab === 'match') loadMatchQueue();
}

/* ══════════════════════════════════════════
   CONVERSATIONS
══════════════════════════════════════════ */
function listenConversations() {
  if (convSub) db.ref(DB_CONVS).off('value', convSub);
  convSub = db.ref(DB_CONVS).orderByChild('updatedAt').on('value', snap => {
    allConvs = {};
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        if (d.members && d.members[ME.uid]) allConvs[c.key] = { id: c.key, ...d };
      });
    }
    renderConvList();
    renderSuggestions();
  });
}

function renderConvList(filter) {
  const wrap = document.getElementById('conv-list');
  let list = Object.values(allConvs).sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0));
  if (filter) {
    const q = filter.toLowerCase();
    list = list.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-panel"><div class="empty-panel-icon">💬</div>No conversations yet.<br/>Search for people or use the Match tab.</div>`;
    return;
  }
  wrap.innerHTML = '';
  list.forEach(conv => {
    const me = conv.members[ME.uid];
    const unread = (conv.unread && conv.unread[ME.uid]) || 0;
    // For DMs, show partner's info stored in partnerInfo
    let displayName = conv.name || 'Chat';
    let displayPhoto = conv.photoURL || '';
    if (conv.type === 'dm' && conv.partnerInfo && conv.partnerInfo[ME.uid]) {
      displayName = conv.partnerInfo[ME.uid].name || displayName;
      displayPhoto = conv.partnerInfo[ME.uid].photoURL || displayPhoto;
    }
    const lastPreview = conv.lastMessage
      ? (conv.lastMessage.startsWith('[img]') ? '📷 Photo' : conv.lastMessage)
      : 'Say hello 👋';
    const div = document.createElement('div');
    div.className = 'conv-item' + (conv.id === currentConv ? ' active' : '');
    div.onclick = () => openConversation(conv.id);
    div.innerHTML = `
      <div class="avatar">${avatarHTML(displayName, displayPhoto)}</div>
      <div class="conv-info">
        <div class="conv-name">${esc(displayName)}</div>
        <div class="conv-preview">${esc(lastPreview)}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${fmtTime(conv.updatedAt)}</span>
        ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>`;
    wrap.appendChild(div);
  });
}

/* ══════════════════════════════════════════
   SUGGESTIONS
══════════════════════════════════════════ */
async function loadSuggestions() {
  // Load random users I haven't chatted with yet
  const snap = await db.ref(DB_USERS).limitToLast(30).once('value');
  if (!snap.exists()) return;
  const existingPartners = new Set(
    Object.values(allConvs)
      .filter(c => c.type === 'dm')
      .map(c => Object.keys(c.members).find(id => id !== ME.uid))
      .filter(Boolean)
  );
  const users = [];
  snap.forEach(c => {
    const u = c.val();
    if (u.uid === ME.uid) return;
    if (existingPartners.has(u.uid)) return;
    users.push(u);
  });
  // Shuffle
  users.sort(() => Math.random() - 0.5);
  renderSuggestionsUI(users.slice(0, 5));
}

function renderSuggestionsUI(users) {
  const wrap = document.getElementById('suggestions-wrap');
  if (!users.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="suggestions-label">People you may know</div>` +
    users.map(u => `
      <div class="suggestion-item">
        <div class="avatar avatar-sm">${avatarHTML(u.name, u.photoURL)}</div>
        <div class="suggestion-info">
          <div class="suggestion-name">${esc(u.name)}</div>
          <div class="suggestion-phone">${esc(u.phone || '')}</div>
        </div>
        <button class="suggestion-btn" onclick="startDMwith('${u.uid}')">Message</button>
      </div>`
    ).join('');
}

function renderSuggestions() { loadSuggestions(); }

/* ══════════════════════════════════════════
   OPEN CONVERSATION
══════════════════════════════════════════ */
async function openConversation(convId) {
  currentConv = convId;
  db.ref(`${DB_CONVS}/${convId}/unread/${ME.uid}`).set(0);
  renderConvList(document.getElementById('conv-search').value);

  const snap = await db.ref(`${DB_CONVS}/${convId}`).once('value');
  const conv = snap.val();
  if (!conv) return;

  let displayName = conv.name || 'Chat';
  let displayPhoto = conv.photoURL || '';
  if (conv.type === 'dm' && conv.partnerInfo && conv.partnerInfo[ME.uid]) {
    displayName = conv.partnerInfo[ME.uid].name || displayName;
    displayPhoto = conv.partnerInfo[ME.uid].photoURL || displayPhoto;
  }

  document.getElementById('chat-name').textContent = displayName;
  document.getElementById('chat-status').textContent = conv.type === 'group'
    ? Object.keys(conv.members||{}).length + ' members'
    : 'Offline';
  document.getElementById('chat-status').className = 'chat-header-sub';

  const chatAv = document.getElementById('chat-avatar');
  chatAv.innerHTML = conv.type === 'group' ? '👥' : avatarHTML(displayName, displayPhoto);

  // Online status for DM
  if (conv.type === 'dm') {
    const partnerUid = Object.keys(conv.members).find(id => id !== ME.uid);
    if (partnerUid) {
      db.ref(`${DB_USERS}/${partnerUid}/online`).on('value', s => {
        const el = document.getElementById('chat-status');
        if (!el) return;
        el.textContent = s.val() ? 'Online' : 'Offline';
        el.className = 'chat-header-sub' + (s.val() ? ' online' : '');
      });
    }
  }

  // Show chat view
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chat-view').classList.add('visible');
  document.getElementById('chat-area').classList.add('slide-in');
  document.getElementById('sidebar').classList.add('slide-out');

  // Listen messages
  if (msgListener) msgListener.off();
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  msgListener = db.ref(`${DB_MSGS}/${convId}`);
  msgListener.on('child_added', s => { renderMsg(s.key, s.val(), conv); scrollBottom(); });
  msgListener.on('child_changed', s => {
    const el = document.querySelector(`[data-msgid="${s.key}"]`);
    if (el) {
      const re = el.querySelector('.bubble-reactions');
      if (re) renderReactions(re, s.key, s.val().reactions || {});
    }
  });
}

function backToSidebar() {
  document.getElementById('chat-area').classList.remove('slide-in');
  document.getElementById('sidebar').classList.remove('slide-out');
}

/* ══════════════════════════════════════════
   RENDER MESSAGE
══════════════════════════════════════════ */
function renderMsg(id, msg, conv) {
  const area = document.getElementById('messages-area');
  const isMe = msg.senderId === ME.uid;

  // Date divider
  const dStr = new Date(msg.timestamp).toDateString();
  const last = area.querySelector('.date-divider:last-of-type');
  if (!last || last.dataset.date !== dStr) {
    const dd = document.createElement('div');
    dd.className = 'date-divider'; dd.dataset.date = dStr;
    dd.textContent = fmtDate(msg.timestamp);
    area.appendChild(dd);
  }

  const group = document.createElement('div');
  group.className = `msg-group ${isMe ? 'me' : 'them'}`;
  group.setAttribute('data-msgid', id);

  // Group sender name
  if (!isMe && conv.type === 'group') {
    const sn = document.createElement('div');
    sn.className = 'msg-sender';
    sn.textContent = msg.senderName || 'User';
    group.appendChild(sn);
  }

  const row = document.createElement('div');
  row.className = 'msg-row';

  // Avatar (them)
  if (!isMe) {
    const av = document.createElement('div');
    av.className = 'avatar avatar-sm';
    av.innerHTML = avatarHTML(msg.senderName || '?', msg.senderPhoto || '');
    row.appendChild(av);
  }

  // Bubble wrap
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';

  // Reaction picker
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.id = 'picker-' + id;
  ['❤️','😂','😮','👍','🙏','🔥','😍','💯'].forEach(em => {
    const s = document.createElement('span');
    s.className = 'react-em'; s.textContent = em;
    s.onclick = e => { e.stopPropagation(); addReaction(id, em); picker.classList.remove('open'); };
    picker.appendChild(s);
  });

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.text && msg.text.startsWith('[img]')) {
    const url = msg.text.slice(5);
    const img = document.createElement('img');
    img.src = url; img.className = 'bubble-img';
    img.loading = 'lazy';
    img.onclick = () => openLightbox(url);
    bubble.appendChild(img);
    bubble.style.padding = '6px';
    bubble.style.background = 'none';
    bubble.style.border = 'none';
  } else {
    bubble.textContent = msg.text || '';
  }

  const reactEl = document.createElement('div');
  reactEl.className = 'bubble-reactions';
  renderReactions(reactEl, id, msg.reactions || {});

  wrap.appendChild(picker);
  wrap.appendChild(bubble);
  wrap.appendChild(reactEl);

  // React trigger
  const trig = document.createElement('button');
  trig.className = 'react-trigger'; trig.textContent = '😊';
  trig.onclick = e => { e.stopPropagation(); togglePicker(id, wrap); };

  if (isMe) { row.appendChild(trig); row.appendChild(wrap); }
  else       { row.appendChild(wrap); row.appendChild(trig); }

  group.appendChild(row);

  const tm = document.createElement('span');
  tm.className = 'msg-time';
  tm.textContent = fmtTime(msg.timestamp);
  group.appendChild(tm);

  area.appendChild(group);
}

function renderReactions(el, msgId, reactions) {
  el.innerHTML = '';
  const counts = {}; const mine = {};
  Object.entries(reactions).forEach(([uid, em]) => {
    counts[em] = (counts[em] || 0) + 1;
    if (uid === ME.uid) mine[em] = true;
  });
  Object.entries(counts).forEach(([em, n]) => {
    const pill = document.createElement('div');
    pill.className = 'reaction-pill';
    pill.innerHTML = `${em} <span class="reaction-count">${n}</span>`;
    pill.onclick = () => addReaction(msgId, em);
    el.appendChild(pill);
  });
}

function togglePicker(id, wrap) {
  document.querySelectorAll('.reaction-picker.open').forEach(p => { if (p.id !== 'picker-'+id) p.classList.remove('open'); });
  wrap.querySelector('.reaction-picker').classList.toggle('open');
}

async function addReaction(msgId, em) {
  if (!currentConv) return;
  const ref = db.ref(`${DB_MSGS}/${currentConv}/${msgId}/reactions/${ME.uid}`);
  const s = await ref.once('value');
  if (s.val() === em) await ref.remove();
  else await ref.set(em);
}

/* ══════════════════════════════════════════
   SEND MESSAGE
══════════════════════════════════════════ */
async function sendMessage() {
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text && !pendingImg) return;
  if (!currentConv) return;

  let content = text;
  if (pendingImg) { content = '[img]' + pendingImg; clearUpload(); }

  const msg = {
    text: content, senderId: ME.uid,
    senderName: ME.name || 'You',
    senderPhoto: ME.photoURL || '',
    timestamp: Date.now()
  };
  db.ref(`${DB_MSGS}/${currentConv}`).push(msg);

  const preview = content.startsWith('[img]') ? '📷 Photo' : (text.length > 60 ? text.slice(0,60)+'…' : text);
  const cSnap = await db.ref(`${DB_CONVS}/${currentConv}`).once('value');
  const conv = cSnap.val() || {};
  const unreadUp = {};
  Object.keys(conv.members || {}).forEach(uid => {
    if (uid !== ME.uid) unreadUp[uid] = ((conv.unread && conv.unread[uid]) || 0) + 1;
  });
  db.ref(`${DB_CONVS}/${currentConv}`).update({
    lastMessage: preview, updatedAt: Date.now(),
    unread: { ...(conv.unread || {}), ...unreadUp }
  });

  inp.value = ''; inp.style.height = '';
}

function handleMsgKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoGrow(el) { el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 130) + 'px'; }

/* ══════════════════════════════════════════
   IMAGE UPLOAD
══════════════════════════════════════════ */
function triggerImgPick() { document.getElementById('img-file-input').click(); }

async function handleImgPick(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  showToast('Compressing…');
  const blob = await compressImg(file, 900, 900, 0.72);
  showToast('Uploading…');
  const url = await uploadCloudinary(blob);
  if (!url) return showToast('Upload failed.');
  pendingImg = url;
  document.getElementById('upload-thumb').src = url;
  document.getElementById('upload-fname').textContent = file.name;
  document.getElementById('upload-bar').classList.add('visible');
}

function clearUpload() {
  pendingImg = null;
  document.getElementById('upload-bar').classList.remove('visible');
  document.getElementById('upload-thumb').src = '';
}

async function compressImg(file, mW, mH, q) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        let {width: w, height: h} = img;
        if (w > mW) { h = h * mW / w; w = mW; }
        if (h > mH) { w = w * mH / h; h = mH; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => res(b || file), 'image/jpeg', q);
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

async function uploadCloudinary(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CL_PRESET);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CL_CLOUD}/image/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    return d.secure_url || null;
  } catch { return null; }
}

/* ══════════════════════════════════════════
   NEW DM
══════════════════════════════════════════ */
function openNewDM() {
  document.getElementById('dm-search').value = '';
  document.getElementById('dm-results').innerHTML = '';
  openModal('new-dm-modal');
}

async function startDMwith(uid) {
  const snap = await db.ref(`${DB_USERS}/${uid}`).once('value');
  if (!snap.exists()) return;
  const partner = snap.val();
  const key = [ME.uid, uid].sort().join('_');
  const existing = await db.ref(`${DB_CONVS}/${key}`).once('value');
  if (!existing.exists()) {
    await db.ref(`${DB_CONVS}/${key}`).set({
      type: 'dm', name: partner.name || 'User',
      photoURL: partner.photoURL || '',
      members: { [ME.uid]: true, [uid]: true },
      createdAt: Date.now(), updatedAt: Date.now(),
      lastMessage: '', unread: { [ME.uid]: 0, [uid]: 0 },
      partnerInfo: {
        [ME.uid]: { name: partner.name, photoURL: partner.photoURL || '' },
        [uid]:    { name: ME.name,      photoURL: ME.photoURL || '' }
      }
    });
  }
  closeModal('new-dm-modal');
  setTab('chats');
  openConversation(key);
}

/* ══════════════════════════════════════════
   USER SEARCH
══════════════════════════════════════════ */
async function searchUsers(query, containerId, multiSelect) {
  const wrap = document.getElementById(containerId);
  if (!query.trim()) { wrap.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const snap = await db.ref(DB_USERS).once('value');
  const results = [];
  if (snap.exists()) {
    snap.forEach(c => {
      const u = c.val();
      if (u.uid === ME.uid) return;
      if ((u.name||'').toLowerCase().includes(q) ||
          (u.username||'').toLowerCase().includes(q) ||
          (u.phone||'').replace(/\s/g,'').includes(q.replace(/\s/g,''))) {
        results.push(u);
      }
    });
  }
  wrap.innerHTML = '';
  if (!results.length) { wrap.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text3);font-size:0.84rem">No users found.</div>`; return; }
  results.slice(0, 8).forEach(u => {
    const div = document.createElement('div');
    if (multiSelect) {
      div.className = 'check-item';
      const checked = !!selectedForGroup[u.uid];
      div.innerHTML = `
        <input type="checkbox" id="ck-${u.uid}" ${checked?'checked':''}/>
        <div class="avatar avatar-sm">${avatarHTML(u.name,u.photoURL)}</div>
        <div>
          <div class="check-item-name">${esc(u.name)}</div>
          <div class="check-item-phone">${esc(u.phone||'')}</div>
        </div>`;
      div.onclick = () => toggleGroupMember(u);
    } else {
      div.className = 'user-result';
      div.innerHTML = `
        <div class="avatar avatar-sm">${avatarHTML(u.name,u.photoURL)}</div>
        <div>
          <div class="user-result-name">${esc(u.name)}</div>
          <div class="user-result-phone">${esc(u.phone||'')}</div>
        </div>`;
      div.onclick = () => startDMwith(u.uid);
    }
    wrap.appendChild(div);
  });
}

/* ══════════════════════════════════════════
   GROUP CHAT
══════════════════════════════════════════ */
function openNewGroup() {
  selectedForGroup = {};
  document.getElementById('group-name-input').value = '';
  document.getElementById('group-member-search').value = '';
  document.getElementById('group-member-results').innerHTML = '';
  document.getElementById('group-selected').innerHTML = '';
  openModal('new-group-modal');
}

function toggleGroupMember(u) {
  if (selectedForGroup[u.uid]) delete selectedForGroup[u.uid];
  else selectedForGroup[u.uid] = u;
  const chk = document.getElementById('ck-' + u.uid);
  if (chk) chk.checked = !!selectedForGroup[u.uid];
  // Update selected chips
  const el = document.getElementById('group-selected');
  el.innerHTML = Object.values(selectedForGroup).map(s =>
    `<span style="background:var(--bg3);border-radius:100px;padding:4px 10px;font-size:0.78rem;display:inline-flex;align-items:center;gap:4px">
      ${esc(s.name)} <span style="cursor:pointer;opacity:0.5" onclick="toggleGroupMember(${JSON.stringify(s)})">×</span>
    </span>`
  ).join('');
}

async function createGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) return showToast('Enter a group name.');
  if (!Object.keys(selectedForGroup).length) return showToast('Add at least one member.');
  const members = { [ME.uid]: true };
  Object.keys(selectedForGroup).forEach(uid => { members[uid] = true; });
  const ref = db.ref(DB_CONVS).push();
  await ref.set({
    type: 'group', name, photoURL: '', members,
    createdAt: Date.now(), updatedAt: Date.now(),
    lastMessage: '', unread: {}
  });
  closeModal('new-group-modal');
  setTab('chats');
  openConversation(ref.key);
}

/* ══════════════════════════════════════════
   MATCH SCREEN
══════════════════════════════════════════ */
async function loadMatchQueue() {
  const snap = await db.ref(DB_USERS).once('value');
  const seenSnap = await db.ref(`${DB_MATCHES}/${ME.uid}/seen`).once('value');
  const seen = seenSnap.val() || {};
  matchQueue = [];
  if (snap.exists()) {
    snap.forEach(c => {
      const u = c.val();
      if (u.uid === ME.uid) return;
      if (seen[u.uid]) return;
      matchQueue.push(u);
    });
  }
  matchQueue.sort(() => Math.random() - 0.5);
  matchIndex = 0;
  renderMatchCard();
}

function renderMatchCard() {
  const stack = document.getElementById('match-stack');
  stack.innerHTML = '';
  if (matchIndex >= matchQueue.length) {
    stack.innerHTML = `<div class="empty-panel" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div class="empty-panel-icon">✨</div>
      You've seen everyone!<br/>Check back later for new people.
    </div>`;
    return;
  }
  // Render top 2 cards
  for (let i = Math.min(matchIndex + 1, matchQueue.length - 1); i >= matchIndex; i--) {
    const u = matchQueue[i];
    const card = document.createElement('div');
    card.className = 'match-card';
    card.id = 'match-card-' + i;
    card.innerHTML = `
      <div class="match-card-img">
        ${u.photoURL ? `<img src="${u.photoURL}" alt=""/>` : '<span class="no-photo">👤</span>'}
        <div class="match-card-overlay"></div>
      </div>
      <div class="match-card-info">
        <div class="match-card-name">${esc(u.name)}</div>
        <div class="match-card-phone">${esc(u.phone || '')}</div>
        ${u.bio ? `<div class="match-card-bio">${esc(u.bio)}</div>` : ''}
      </div>`;
    stack.appendChild(card);
  }
  // Swipe support
  enableSwipe(document.getElementById('match-card-' + matchIndex), matchQueue[matchIndex]);
}

function enableSwipe(card, user) {
  if (!card) return;
  let startX = 0, dx = 0;
  const onDown = e => { startX = (e.touches ? e.touches[0].clientX : e.clientX); };
  const onMove = e => {
    dx = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
  };
  const onUp = () => {
    if (dx > 80) doMatchConnect(user);
    else if (dx < -80) doMatchSkip(user);
    else { card.style.transform = ''; card.style.transition = 'transform 0.3s ease'; setTimeout(()=>card.style.transition='',300); }
    dx = 0;
  };
  card.addEventListener('mousedown', onDown);
  card.addEventListener('mousemove', onMove);
  card.addEventListener('mouseup', onUp);
  card.addEventListener('touchstart', onDown, {passive:true});
  card.addEventListener('touchmove', onMove, {passive:true});
  card.addEventListener('touchend', onUp);
}

function doMatchSkip(user) {
  const card = document.getElementById('match-card-' + matchIndex);
  if (card) { card.classList.add('swipe-left'); }
  db.ref(`${DB_MATCHES}/${ME.uid}/seen/${user.uid}`).set(true);
  matchIndex++;
  setTimeout(renderMatchCard, 380);
}

async function doMatchConnect(user) {
  const card = document.getElementById('match-card-' + matchIndex);
  if (card) { card.classList.add('swipe-right'); }
  db.ref(`${DB_MATCHES}/${ME.uid}/seen/${user.uid}`).set(true);

  // Check if they also connected with us (mutual match)
  const theirSnap = await db.ref(`${DB_MATCHES}/${user.uid}/connected/${ME.uid}`).once('value');
  db.ref(`${DB_MATCHES}/${ME.uid}/connected/${user.uid}`).set(true);

  if (theirSnap.val()) {
    // MUTUAL MATCH!
    setTimeout(() => showMatchModal(user), 400);
  } else {
    matchIndex++;
    setTimeout(renderMatchCard, 380);
    showToast('Connection sent! 💫');
  }
}

function showMatchModal(user) {
  document.getElementById('match-modal-their-name').textContent = user.name;
  const av1 = document.getElementById('match-modal-av1');
  const av2 = document.getElementById('match-modal-av2');
  av1.innerHTML = avatarHTML(ME.name, ME.photoURL);
  av2.innerHTML = avatarHTML(user.name, user.photoURL);
  document.getElementById('match-modal').classList.add('open');
  // Also start a DM
  startDMwith(user.uid);
}

function closeMatchModal() { document.getElementById('match-modal').classList.remove('open'); }

/* ══════════════════════════════════════════
   PROFILE
══════════════════════════════════════════ */
async function openProfile() {
  const snap = await db.ref(`${DB_USERS}/${ME.uid}`).once('value');
  const d = snap.val() || {};
  document.getElementById('prof-name').value  = d.name  || '';
  document.getElementById('prof-bio').value   = d.bio   || '';
  const circ = document.getElementById('prof-avatar-circle');
  circ.querySelector('.edit-overlay').innerHTML = '📷';
  if (d.photoURL) circ.innerHTML = `<img src="${d.photoURL}" alt=""/><div class="edit-overlay">📷</div>`;
  else circ.innerHTML = `<span style="font-size:2rem;font-weight:700">${(d.name||'?')[0].toUpperCase()}</span><div class="edit-overlay">📷</div>`;
  document.getElementById('prof-phone').textContent = d.phone || '';
  const link = `${APP_URL}?dm=${d.username || ME.uid}`;
  document.getElementById('prof-link').textContent = link;
  openModal('profile-modal');
}

function triggerProfPic() { document.getElementById('prof-pic-input').click(); }

async function uploadProfPic(input) {
  const file = input.files[0]; if (!file) return;
  showToast('Uploading photo…');
  const url = await uploadCloudinary(file);
  if (!url) return showToast('Upload failed.');
  await db.ref(`${DB_USERS}/${ME.uid}/photoURL`).set(url);
  ME.photoURL = url;
  renderMyFooter();
  const circ = document.getElementById('prof-avatar-circle');
  circ.innerHTML = `<img src="${url}" alt=""/><div class="edit-overlay">📷</div>`;
  showToast('Photo updated!');
}

async function saveProfile() {
  const name = document.getElementById('prof-name').value.trim();
  const bio  = document.getElementById('prof-bio').value.trim();
  if (!name) return showToast('Name cannot be empty.');
  await db.ref(`${DB_USERS}/${ME.uid}`).update({ name, bio });
  ME.name = name; ME.bio = bio;
  renderMyFooter();
  closeModal('profile-modal');
  showToast('Profile saved!');
}

function copyProfLink() {
  navigator.clipboard.writeText(document.getElementById('prof-link').textContent)
    .then(() => showToast('Link copied!'));
}

function shareMyLink() {
  const link = `${APP_URL}?dm=${ME.username || ME.uid}`;
  navigator.clipboard.writeText(link).then(() => showToast('Your link copied! Share with anyone.'));
}

/* ══════════════════════════════════════════
   CHAT INFO
══════════════════════════════════════════ */
async function openChatInfo() {
  if (!currentConv) return;
  const snap = await db.ref(`${DB_CONVS}/${currentConv}`).once('value');
  const conv = snap.val(); if (!conv) return;
  document.getElementById('info-title').textContent = conv.type === 'group' ? 'Group Info' : 'Chat Info';
  let html = '';
  if (conv.type === 'group') {
    html += `<p class="modal-sub">${Object.keys(conv.members||{}).length} members</p>`;
    for (const uid of Object.keys(conv.members||{})) {
      const us = await db.ref(`${DB_USERS}/${uid}`).once('value');
      const u = us.val() || {};
      html += `<div class="member-row">
        <div class="avatar avatar-sm">${avatarHTML(u.name,u.photoURL)}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.88rem">${esc(u.name||'?')}</div>
          <div style="font-size:0.74rem;color:var(--text3);font-family:monospace">${esc(u.phone||'')}</div>
        </div>
        ${uid === ME.uid ? '<span style="font-size:0.72rem;color:var(--text3)">You</span>' : ''}
      </div>`;
    }
    const link = `${APP_URL}?group=${currentConv}`;
    html += `<div style="margin-top:16px"><div class="label-xs">Group invite link</div>
      <div class="share-box"><span class="share-text">${link}</span>
      <button class="copy-btn" onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Copied!'))">Copy</button></div></div>`;
  } else {
    const link = `${APP_URL}?chat=${currentConv}`;
    html += `<div class="label-xs">Shareable link</div>
      <div class="share-box"><span class="share-text">${link}</span>
      <button class="copy-btn" onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Copied!'))">Copy</button></div>`;
  }
  document.getElementById('info-body').innerHTML = html;
  openModal('chat-info-modal');
}

function shareChatLink() {
  const link = `${APP_URL}?chat=${currentConv}`;
  navigator.clipboard.writeText(link).then(() => showToast('Chat link copied!'));
}

/* ══════════════════════════════════════════
   INCOMING LINK
══════════════════════════════════════════ */
function checkIncomingLink() {
  const p = new URLSearchParams(window.location.search);
  const dmTarget = p.get('dm');
  if (dmTarget) {
    history.replaceState(null, '', window.location.pathname);
    db.ref(DB_USERS).orderByChild('username').equalTo(dmTarget).once('value').then(snap => {
      if (snap.exists()) {
        const uid = Object.keys(snap.val())[0];
        if (uid !== ME.uid) startDMwith(uid);
      } else {
        db.ref(`${DB_USERS}/${dmTarget}`).once('value').then(s => {
          if (s.exists() && dmTarget !== ME.uid) startDMwith(dmTarget);
        });
      }
    });
  }
}

/* ══════════════════════════════════════════
   SCROLL
══════════════════════════════════════════ */
function scrollBottom() {
  const a = document.getElementById('messages-area');
  a.scrollTop = a.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
  const area = document.getElementById('messages-area');
  if (area) {
    area.addEventListener('scroll', () => {
      const btn = document.getElementById('scroll-bottom');
      const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      btn.classList.toggle('visible', !atBottom);
    });
  }
});

/* ══════════════════════════════════════════
   MODALS
══════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

/* ══════════════════════════════════════════
   LEGAL
══════════════════════════════════════════ */
function showLegal(which) {
  const page = document.getElementById('legal-page');
  page.classList.add('visible');
  document.getElementById('legal-content-' + which).style.display = '';
  document.getElementById('legal-content-' + (which === 'terms' ? 'privacy' : 'terms')).style.display = 'none';
}
function closeLegal() { document.getElementById('legal-page').classList.remove('visible'); }

/* ══════════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════════ */
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function v(id) { return (document.getElementById(id) || {}).value || ''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function avatarHTML(name, photo) {
  if (photo) return `<img src="${esc(photo)}" alt="" loading="lazy"/>`;
  const init = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return init;
}
function setBtn(btn, label, disabled) { btn.textContent = label; btn.disabled = disabled; }
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if (now - d < 7 * 86400000) return d.toLocaleDateString([],{weekday:'short'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (new Date(now-86400000).toDateString() === d.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
}

// Close reaction pickers on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.reaction-picker.open').forEach(p => p.classList.remove('open'));
});
