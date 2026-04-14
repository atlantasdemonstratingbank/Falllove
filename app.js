/* ═══════════════════════════════════════════
   FALL I LOVE — app.js
   Firebase: viccybank | Prefix: fil_
═══════════════════════════════════════════ */

// ── CONFIG ──
const FB = {
  apiKey:            'AIzaSyDLPAktzLmpfNX9XUmw9i_B2P2I3XPwOLs',
  authDomain:        'viccybank.firebaseapp.com',
  databaseURL:       'https://viccybank-default-rtdb.firebaseio.com',
  projectId:         'viccybank',
  storageBucket:     'viccybank.firebasestorage.app',
  messagingSenderId: '328465601734',
  appId:             '1:328465601734:web:ae8d6bee3683be60629b32'
};
const CDN_CLOUD  = 'dbgxllxdb';
const CDN_PRESET = 'efootball_screenshots';
const APP_URL    = window.location.origin + window.location.pathname.replace(/\/$/, '');

// ── FIREBASE ──
firebase.initializeApp(FB);
const auth = firebase.auth();
const db   = firebase.database();

// DB path helper — all data prefixed with fil_
const REF = {
  users:  (uid)     => db.ref('fil_users/' + uid),
  allUsers:          () => db.ref('fil_users'),
  convs:             () => db.ref('fil_convs'),
  conv:   (id)      => db.ref('fil_convs/' + id),
  msgs:   (id)      => db.ref('fil_msgs/' + id),
  msg:    (id, mid) => db.ref(`fil_msgs/${id}/${mid}`),
  reacts: (id, mid) => db.ref(`fil_msgs/${id}/${mid}/reactions`),
  matches:           () => db.ref('fil_matches'),
  match:  (uid)     => db.ref('fil_matches/' + uid),
};

// ── STATE ──
let me            = null;   // Firebase user object
let myProfile     = null;   // fil_users profile
let currentConvId = null;
let msgsRef       = null;
let convListener  = null;
let allConvs      = {};
let currentChip   = 'all';
let selectedPeople = {};     // for group creation
let pendingImgUrl  = null;
let deferredPrompt = null;   // Android install
let matchQueue     = [];
let currentMatchIdx = 0;
let currentNavTab  = 'chats';
let selectedFIL    = '';

// ── SPLASH ──
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) { splash.style.opacity = '0'; splash.style.transition = 'opacity 0.4s'; setTimeout(() => splash.remove(), 400); }
  }, 1800);
});

// ── PWA / INSTALL ──
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Show Android modal after 3s if not installed
  setTimeout(() => {
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      const modal = document.getElementById('android-install-modal');
      if (modal) modal.style.display = 'flex';
    }
  }, 3000);
});

function triggerAndroidInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
  }
  dismissAndroidInstall();
}
function dismissAndroidInstall() {
  const m = document.getElementById('android-install-modal');
  if (m) m.style.display = 'none';
}

// iOS banner
function checkIOS() {
  const isIOS   = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const inApp   = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const shown   = localStorage.getItem('fil_ios_banner');
  if (isIOS && !inApp && !shown) {
    const banner = document.getElementById('ios-banner');
    if (banner) banner.style.display = 'flex';
  }
}
function dismissIOSBanner() {
  const b = document.getElementById('ios-banner');
  if (b) b.style.display = 'none';
  localStorage.setItem('fil_ios_banner', '1');
}

// ── SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── THEME ──
(function() {
  const saved = localStorage.getItem('fil_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fil_theme', next);
}

// ── FIL NUMBER GENERATION ──
function genFILNumber() {
  // Format: +1 XXX XXX XXXX  (10 digits after +1)
  const a = String(Math.floor(200 + Math.random() * 800));
  const b = String(Math.floor(100 + Math.random() * 900));
  const c = String(Math.floor(1000 + Math.random() * 9000));
  return `+1 ${a} ${b} ${c}`;
}

function renderFILSuggestions() {
  const container = document.getElementById('fil-suggestions');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const num = genFILNumber();
    const btn = document.createElement('button');
    btn.className = 'fil-suggestion-btn';
    btn.textContent = num;
    btn.onclick = () => selectFIL(num, btn);
    container.appendChild(btn);
  }
}

function selectFIL(num, btn) {
  selectedFIL = num;
  document.getElementById('fil-number-display').textContent = num;
  document.querySelectorAll('.fil-suggestion-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
}

function refreshFILNumber() {
  const num = genFILNumber();
  selectedFIL = num;
  document.getElementById('fil-number-display').textContent = num;
  document.querySelectorAll('.fil-suggestion-btn').forEach(b => b.classList.remove('selected'));
  renderFILSuggestions();
}

// ── AUTH TABS ──
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : '';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  hideAuthError();
  if (!isLogin) {
    selectedFIL = genFILNumber();
    document.getElementById('fil-number-display').textContent = selectedFIL;
    renderFILSuggestions();
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.style.display = 'block';
}
function hideAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// ── LOGIN ──
async function doLogin() {
  const id   = document.getElementById('login-id').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!id || !pass) return showAuthError('Please fill in all fields.');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    let email = id;
    // If it looks like a FIL number (+1...), look up email
    if (id.startsWith('+')) {
      const clean = id.replace(/\s/g, '');
      const snap = await REF.allUsers().orderByChild('filNumber').equalTo(clean).once('value');
      if (!snap.exists()) { showAuthError('No account found with that FIL number.'); btn.disabled=false; btn.textContent='Sign In'; return; }
      const data = Object.values(snap.val())[0];
      email = data.email;
    }
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    console.error('Login error:', e);
    showAuthError(authErr(e.code));
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

// ── REGISTER ──
async function doRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const email    = document.getElementById('reg-email').value.trim();
  const pass     = document.getElementById('reg-pass').value;
  const agreed   = document.getElementById('terms-agree').checked;

  if (!name || !username || !email || !pass) return showAuthError('Please fill all fields.');
  if (pass.length < 6) return showAuthError('Password must be at least 6 characters.');
  if (!agreed) return showAuthError('Please agree to the Terms & Privacy Policy.');
  if (!selectedFIL) { selectedFIL = genFILNumber(); }

  const filClean = selectedFIL.replace(/\s/g, '');

  const btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    // Check username uniqueness
    const uSnap = await REF.allUsers().orderByChild('username').equalTo(username).once('value');
    if (uSnap.exists()) { showAuthError('Username @' + username + ' is taken. Try another.'); btn.disabled=false; btn.textContent='Create Account'; return; }

    // Check FIL number uniqueness
    const fSnap = await REF.allUsers().orderByChild('filNumber').equalTo(filClean).once('value');
    if (fSnap.exists()) {
      // Auto generate new one
      selectedFIL = genFILNumber();
      document.getElementById('fil-number-display').textContent = selectedFIL;
    }

    const cred = await auth.createUserWithEmailAndPassword(email, pass);

    await REF.users(cred.user.uid).set({
      uid:       cred.user.uid,
      name,
      username,
      email,
      filNumber: selectedFIL.replace(/\s/g, ''),
      filDisplay: selectedFIL,
      bio:       '',
      photoURL:  '',
      createdAt: Date.now(),
      online:    true,
      lastSeen:  Date.now()
    });

  } catch(e) {
    console.error('Register error:', e);
    const detail = e.message ? e.message.replace('Firebase: ', '').replace(/ \(auth\/[^)]+\)/,'') : '';
    showAuthError(authErr(e.code) + (detail ? '\n' + detail : ''));
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

function authErr(code) {
  const m = {
    'auth/user-not-found':         'No account with that email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/email-already-in-use':   'Email already in use.',
    'auth/invalid-email':          'Invalid email address.',
    'auth/too-many-requests':      'Too many attempts. Please wait.',
    'auth/weak-password':          'Password too weak (min 6 chars).',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/operation-not-allowed':  'Email sign-in not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
    'auth/configuration-not-found':'Firebase Auth not configured properly.',
  };
  return m[code] || (code ? '[' + code + ']' : 'Something went wrong. Please try again.');
}

// ── LOGOUT ──
function doLogout() {
  if (me) REF.users(me.uid).update({ online: false, lastSeen: Date.now() });
  auth.signOut();
}

// ── AUTH STATE ──
auth.onAuthStateChanged(async user => {
  if (user) {
    me = user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    await initApp();
  } else {
    me = null; myProfile = null;
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    checkIOS();
  }
});

// ── INIT APP ──
async function initApp() {
  // Online presence
  REF.users(me.uid).update({ online: true });
  REF.users(me.uid).onDisconnect().update({ online: false, lastSeen: Date.now() });

  // Load my profile
  const snap = await REF.users(me.uid).once('value');
  myProfile = snap.val() || {};
  updateMyStrip();

  // Start listening convs
  listenConvs();

  // Load match queue
  loadMatchQueue();

  // Load people suggestions
  loadPeopleSuggestions();

  // Handle deep link
  handleDeepLink();

  // iOS banner
  checkIOS();
}

function updateMyStrip() {
  if (!myProfile) return;
  renderAvatarEl(document.getElementById('my-avatar-strip'), myProfile);
  document.getElementById('my-name-strip').textContent = myProfile.name || 'Me';
  document.getElementById('my-fil-strip').textContent  = myProfile.filDisplay || myProfile.filNumber || '—';
}

// ── NAVIGATION TABS ──
function setNavTab(tab) {
  currentNavTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('nav-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

function setChip(chip) {
  currentChip = chip;
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  document.getElementById('chip-' + chip).classList.add('active');
  renderConvs(document.getElementById('conv-search').value);
}

// ── CONVERSATIONS ──
function listenConvs() {
  if (convListener) { REF.convs().off('value', convListener); }
  convListener = REF.convs().orderByChild('updatedAt').on('value', snap => {
    allConvs = {};
    if (snap.exists()) {
      snap.forEach(child => {
        const c = child.val();
        if (c.members && c.members[me.uid]) {
          allConvs[child.key] = { id: child.key, ...c };
        }
      });
    }
    renderConvs(document.getElementById('conv-search') ? document.getElementById('conv-search').value : '');
  });
}

function filterConversations(val) { renderConvs(val); }

function renderConvs(filter) {
  const list = document.getElementById('conv-list');
  let items = Object.values(allConvs).sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  if (currentChip === 'dms')    items = items.filter(c => c.type === 'dm');
  if (currentChip === 'groups') items = items.filter(c => c.type === 'group');
  if (filter && filter.trim()) {
    const q = filter.toLowerCase();
    items = items.filter(c =>
      (c.name||'').toLowerCase().includes(q) ||
      (c.filDisplay||'').includes(q) ||
      (c.filNumber||'').replace(/\s/g,'').includes(q.replace(/\s/g,''))
    );
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-list-msg">No conversations yet.<br/>Start one with the ✏️ button above.</div>`;
    return;
  }
  list.innerHTML = '';
  items.forEach(conv => {
    // For DMs, show the partner's name
    let displayName = conv.name;
    let displayPhoto = conv.photoURL;
    if (conv.type === 'dm' && conv.partnerInfo && conv.partnerInfo[me.uid]) {
      displayName  = conv.partnerInfo[me.uid].name || displayName;
      displayPhoto = conv.partnerInfo[me.uid].photoURL || displayPhoto;
    }

    const unread = (conv.unread && conv.unread[me.uid]) || 0;
    const preview = conv.lastMessage ? (conv.lastMessage.startsWith('[img]') ? '📷 Photo' : conv.lastMessage) : '';
    const div = document.createElement('div');
    div.className = 'conv-item' + (conv.id === currentConvId ? ' active' : '');
    div.onclick = () => openConv(conv.id);
    div.innerHTML = `
      <div class="avatar md">${conv.type === 'group' ? '👥' : avatarHTML(displayName||'?', displayPhoto||'')}</div>
      <div class="conv-item-info">
        <div class="conv-item-name">${esc(displayName || 'Untitled')}</div>
        <div class="conv-item-preview">${esc(preview.slice(0,60))}</div>
      </div>
      <div class="conv-item-meta">
        <span class="conv-item-time">${fmtTime(conv.updatedAt)}</span>
        ${unread > 0 ? `<span class="badge">${unread}</span>` : ''}
      </div>`;
    list.appendChild(div);
  });
}

// ── OPEN CONVERSATION ──
async function openConv(convId) {
  currentConvId = convId;
  REF.conv(convId + '/unread/' + me.uid).set(0);
  renderConvs(document.getElementById('conv-search').value);

  const snap = await REF.conv(convId).once('value');
  const conv = snap.val();
  if (!conv) return;

  let displayName  = conv.name;
  let displayPhoto = conv.photoURL;
  if (conv.type === 'dm' && conv.partnerInfo && conv.partnerInfo[me.uid]) {
    displayName  = conv.partnerInfo[me.uid].name || displayName;
    displayPhoto = conv.partnerInfo[me.uid].photoURL || displayPhoto;
  }

  // Update header
  document.getElementById('chat-name').textContent = displayName || 'Chat';
  const av = document.getElementById('chat-avatar');
  av.innerHTML = conv.type === 'group' ? '👥' : avatarHTML(displayName||'?', displayPhoto||'');

  if (conv.type === 'dm') {
    const otherId = Object.keys(conv.members).find(id => id !== me.uid);
    if (otherId) {
      REF.users(otherId).child('online').on('value', s => {
        const el = document.getElementById('chat-status');
        if (!el) return;
        el.textContent = s.val() ? 'Online' : 'Offline';
        el.className = 'chat-topbar-status' + (s.val() ? ' online' : '');
      });
    }
  } else {
    document.getElementById('chat-status').textContent = Object.keys(conv.members||{}).length + ' members';
    document.getElementById('chat-status').className = 'chat-topbar-status';
  }

  // Messages
  if (msgsRef) msgsRef.off();
  document.getElementById('messages-area').innerHTML = '';
  msgsRef = REF.msgs(convId);
  msgsRef.on('child_added', snap => {
    renderMsg(snap.key, snap.val(), conv);
    scrollBottom();
  });
  msgsRef.on('child_changed', snap => {
    const el = document.querySelector(`[data-mid="${snap.key}"] .bubble-reactions`);
    if (el) renderReacts(el, snap.key, snap.val().reactions || {});
  });

  // Show chat
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chat-view').style.display = 'flex';
  document.querySelectorAll('.static-page').forEach(p => p.style.display = 'none');

  // Mobile
  document.getElementById('main-area').classList.add('on');
  document.getElementById('sidebar').classList.add('off');
}

function backToSidebar() {
  document.getElementById('main-area').classList.remove('on');
  document.getElementById('sidebar').classList.remove('off');
}

// ── RENDER MESSAGE ──
function renderMsg(mid, msg, conv) {
  const area = document.getElementById('messages-area');
  const isMe = msg.senderId === me.uid;

  // Date divider
  const dStr = new Date(msg.timestamp).toDateString();
  const lastDD = area.querySelector('.date-divider[data-d="' + dStr + '"]');
  if (!lastDD) {
    const dd = document.createElement('div');
    dd.className = 'date-divider'; dd.dataset.d = dStr;
    dd.textContent = fmtDate(msg.timestamp);
    area.appendChild(dd);
  }

  const group = document.createElement('div');
  group.className = 'msg-group ' + (isMe ? 'me' : 'them');
  group.dataset.mid = mid;

  if (!isMe && conv.type === 'group') {
    const sn = document.createElement('div');
    sn.className = 'msg-sender'; sn.textContent = msg.senderName || 'User';
    group.appendChild(sn);
  }

  const row = document.createElement('div');
  row.className = 'msg-row';

  if (!isMe) {
    const av = document.createElement('div');
    av.className = 'msg-avatar-sm';
    av.innerHTML = avatarHTML(msg.senderName||'?', msg.senderPhoto||'');
    row.appendChild(av);
  }

  const bWrap = document.createElement('div');
  bWrap.className = 'bubble-wrap';

  // Emoji picker
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  picker.id = 'ep-' + mid;
  ['❤️','😂','😮','👍','🙏','🔥'].forEach(em => {
    const s = document.createElement('span');
    s.className = 'emoji-opt'; s.textContent = em;
    s.onclick = e => { e.stopPropagation(); doReact(mid, em); picker.classList.remove('open'); };
    picker.appendChild(s);
  });

  const isImg = msg.text && msg.text.startsWith('[img]');
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isImg ? ' img-bubble' : '');

  if (isImg) {
    const img = document.createElement('img');
    img.src = msg.text.replace('[img]', '');
    img.className = 'bubble-img';
    img.loading = 'lazy';
    img.onclick = () => openLightbox(img.src);
    bubble.appendChild(img);
  } else {
    bubble.textContent = msg.text || '';
  }

  const reacts = document.createElement('div');
  reacts.className = 'bubble-reactions';
  renderReacts(reacts, mid, msg.reactions || {});

  // React trigger button
  const rt = document.createElement('button');
  rt.className = 'react-trigger'; rt.textContent = '☺'; rt.title = 'React';
  rt.onclick = e => { e.stopPropagation(); document.querySelectorAll('.emoji-picker.open').forEach(p => { if (p.id !== 'ep-'+mid) p.classList.remove('open'); }); picker.classList.toggle('open'); };

  bWrap.appendChild(picker);
  bWrap.appendChild(bubble);
  bWrap.appendChild(reacts);

  if (isMe) { row.appendChild(rt); row.appendChild(bWrap); }
  else       { row.appendChild(bWrap); row.appendChild(rt); }

  const t = document.createElement('span');
  t.className = 'msg-time'; t.textContent = fmtTime(msg.timestamp);

  group.appendChild(row);
  group.appendChild(t);
  area.appendChild(group);
}

function renderReacts(el, mid, reactions) {
  el.innerHTML = '';
  const counts = {}; const mine = {};
  Object.entries(reactions).forEach(([uid, em]) => {
    counts[em] = (counts[em]||0)+1;
    if (uid === me.uid) mine[em] = true;
  });
  Object.entries(counts).forEach(([em, n]) => {
    const pill = document.createElement('div');
    pill.className = 'react-pill' + (mine[em] ? ' mine' : '');
    pill.innerHTML = `${em}<span class="react-count">${n}</span>`;
    pill.onclick = () => doReact(mid, em);
    el.appendChild(pill);
  });
}

async function doReact(mid, emoji) {
  const ref = REF.reacts(currentConvId, mid).child(me.uid);
  const snap = await ref.once('value');
  if (snap.val() === emoji) ref.remove(); else ref.set(emoji);
}

// ── SEND MESSAGE ──
async function sendMessage() {
  const inp  = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text && !pendingImgUrl) return;
  if (!currentConvId) return;

  const content = pendingImgUrl ? '[img]' + pendingImgUrl : text;
  const prevText = pendingImgUrl ? '📷 Photo' : (text.length > 60 ? text.slice(0,60)+'…' : text);

  if (pendingImgUrl) cancelUpload();
  inp.value = ''; inp.style.height = '';

  const msgData = {
    text:        content,
    senderId:    me.uid,
    senderName:  myProfile.name || 'User',
    senderPhoto: myProfile.photoURL || '',
    timestamp:   Date.now()
  };
  REF.msgs(currentConvId).push(msgData);

  // Update conv meta
  const cs = await REF.conv(currentConvId).once('value');
  const cv = cs.val() || {};
  const unreadUpdate = {};
  Object.keys(cv.members||{}).forEach(uid => {
    if (uid !== me.uid) unreadUpdate[uid] = ((cv.unread||{})[uid]||0) + 1;
  });
  REF.conv(currentConvId).update({
    lastMessage: prevText,
    updatedAt:   Date.now(),
    unread:      { ...(cv.unread||{}), ...unreadUpdate }
  });
}

function msgKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoGrow(el) { el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }

// ── IMAGE HANDLING ──
function triggerImg() { document.getElementById('img-input').click(); }

async function handleImg(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  showToast('Compressing image…');
  const blob = await compressImg(file, 900, 900, 0.72);
  showToast('Uploading…');
  const url = await uploadCDN(blob);
  if (!url) return showToast('Upload failed.');
  pendingImgUrl = url;
  document.getElementById('upload-thumb').src = url;
  document.getElementById('upload-fname').textContent = file.name;
  document.getElementById('upload-preview').style.display = 'flex';
}

function cancelUpload() {
  pendingImgUrl = null;
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('upload-thumb').src = '';
}

async function compressImg(file, maxW, maxH, q) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = h*maxW/w; w = maxW; }
        if (h > maxH) { w = w*maxH/h; h = maxH; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(blob => res(blob || file), 'image/jpeg', q);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadCDN(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CDN_PRESET);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CDN_CLOUD}/image/upload`, { method:'POST', body:fd });
    const d = await r.json();
    return d.secure_url || null;
  } catch { return null; }
}

// ── NEW DM ──
async function openOrCreateDM(uid, userData) {
  const key = [me.uid, uid].sort().join('_dm_');
  const snap = await REF.conv(key).once('value');
  if (!snap.exists()) {
    const members = { [me.uid]: true, [uid]: true };
    await REF.conv(key).set({
      type:         'dm',
      name:         userData.name || 'User',
      photoURL:     userData.photoURL || '',
      members,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
      lastMessage:  '',
      unread:       { [me.uid]: 0, [uid]: 0 }
    });
    await REF.conv(key).child('partnerInfo').set({
      [me.uid]: { name: userData.name||'User', photoURL: userData.photoURL||'' },
      [uid]:    { name: myProfile.name||'User', photoURL: myProfile.photoURL||'' }
    });
  }
  closeModal('new-dm-modal');
  closeModal('new-group-modal');
  openConv(key);
}

// ── NEW GROUP ──
selectedPeople = {};
function openNewGroupModal() { selectedPeople = {}; document.getElementById('grp-selected').innerHTML = ''; openModal('new-group-modal'); }

async function createGroup() {
  const name = document.getElementById('grp-name').value.trim();
  if (!name) return showToast('Enter a group name.');
  if (Object.keys(selectedPeople).length === 0) return showToast('Add at least one member.');
  const members = { [me.uid]: true };
  Object.keys(selectedPeople).forEach(uid => { members[uid] = true; });
  const ref = REF.convs().push();
  await ref.set({ type:'group', name, photoURL:'', members, createdAt:Date.now(), updatedAt:Date.now(), lastMessage:'', unread:{} });
  closeModal('new-group-modal');
  openConv(ref.key);
}

// ── MATCH ──
async function loadMatchQueue() {
  matchQueue = []; currentMatchIdx = 0;
  const snap = await REF.allUsers().once('value');
  if (!snap.exists()) return;
  const myMatchData = (await REF.match(me.uid).once('value')).val() || {};
  snap.forEach(child => {
    const u = child.val();
    if (child.key === me.uid) return;
    if (myMatchData.skipped && myMatchData.skipped[child.key]) return;
    if (myMatchData.connected && myMatchData.connected[child.key]) return;
    matchQueue.push({ uid: child.key, ...u });
  });
  // Shuffle
  matchQueue.sort(() => Math.random() - 0.5);
  renderMatchCards();
}

function renderMatchCards() {
  const container = document.getElementById('match-cards');
  const actions   = document.getElementById('match-actions');
  container.innerHTML = '';

  if (!matchQueue.length) {
    container.innerHTML = '<div class="empty-list-msg">No more people to discover right now.<br/>Check back later! 🍂</div>';
    actions.style.display = 'none';
    return;
  }

  const visible = matchQueue.slice(currentMatchIdx, currentMatchIdx + 5);
  if (!visible.length) {
    container.innerHTML = '<div class="empty-list-msg">You\'ve seen everyone! Pull to refresh.</div>';
    actions.style.display = 'none';
    return;
  }

  visible.forEach((u, i) => {
    const card = document.createElement('div');
    card.className = 'match-card' + (i === 0 ? ' selected' : '');
    card.id = 'match-card-' + u.uid;
    card.onclick = () => {
      document.querySelectorAll('.match-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentMatchIdx = matchQueue.indexOf(u);
    };
    card.innerHTML = `
      <div class="avatar lg">${avatarHTML(u.name||'?', u.photoURL||'')}</div>
      <div class="match-card-info">
        <div class="match-card-name">${esc(u.name||'Unknown')}</div>
        <div class="match-card-fil">${u.filDisplay || u.filNumber || ''}</div>
        <div class="match-card-bio">${esc(u.bio || 'No bio yet.')}</div>
      </div>`;
    container.appendChild(card);
  });
  actions.style.display = 'flex';
}

async function swipeMatch(action) {
  if (currentMatchIdx >= matchQueue.length) return;
  const u = matchQueue[currentMatchIdx];
  if (!u) return;

  if (action === 'connect') {
    // Record connection
    await REF.match(me.uid).child('connected/' + u.uid).set(true);
    // Check if they also connected with me
    const theirSnap = await REF.match(u.uid).child('connected/' + me.uid).once('value');
    if (theirSnap.val()) {
      // Mutual match — open a DM
      await openOrCreateDM(u.uid, u);
      showToast('🎉 It\'s a match! Say hello!');
      return;
    } else {
      showToast('Connection sent! ❤');
    }
  } else {
    await REF.match(me.uid).child('skipped/' + u.uid).set(true);
  }

  currentMatchIdx++;
  renderMatchCards();
}

// ── PEOPLE / SUGGESTIONS ──
async function loadPeopleSuggestions() {
  const snap = await REF.allUsers().once('value');
  if (!snap.exists()) return;
  const people = [];
  snap.forEach(child => {
    if (child.key !== me.uid) people.push({ uid: child.key, ...child.val() });
  });
  people.sort(() => Math.random() - 0.5);
  renderPeopleList(people.slice(0, 20));
}

function renderPeopleList(people) {
  const list = document.getElementById('people-list');
  if (!people.length) { list.innerHTML = '<div class="empty-list-msg">No users found.</div>'; return; }
  list.innerHTML = '';
  people.forEach(u => {
    const div = document.createElement('div');
    div.className = 'person-item';
    div.innerHTML = `
      <div class="avatar md">${avatarHTML(u.name||'?', u.photoURL||'')}</div>
      <div class="person-info">
        <div class="person-name">${esc(u.name||'Unknown')}</div>
        <div class="person-fil">${u.filDisplay || u.filNumber || ''}</div>
        <div class="person-bio">${esc(u.bio || '')}</div>
      </div>
      <button class="msg-person-btn" onclick="openOrCreateDM('${u.uid}', ${JSON.stringify(u).replace(/'/g,"\\'")})">Message</button>`;
    list.appendChild(div);
  });
}

async function searchPeople(query) {
  if (!query.trim()) { loadPeopleSuggestions(); return; }
  const snap = await REF.allUsers().once('value');
  const results = [];
  if (snap.exists()) {
    snap.forEach(child => {
      if (child.key === me.uid) return;
      const u = child.val();
      const q = query.toLowerCase().replace(/\s/g,'');
      if ((u.name||'').toLowerCase().includes(query.toLowerCase()) ||
          (u.username||'').includes(query.toLowerCase()) ||
          (u.filNumber||'').replace(/\s/g,'').includes(q) ||
          (u.filDisplay||'').replace(/\s/g,'').includes(q)) {
        results.push({ uid: child.key, ...u });
      }
    });
  }
  renderPeopleList(results);
}

// ── USER SEARCH (for DM / Group modals) ──
async function searchUsers(query, resultsId, multi) {
  const container = document.getElementById(resultsId);
  if (!query.trim()) { container.innerHTML = ''; return; }
  const snap = await REF.allUsers().once('value');
  const results = [];
  if (snap.exists()) {
    snap.forEach(child => {
      if (child.key === me.uid) return;
      const u = child.val();
      const q = query.toLowerCase().replace(/\s/g,'');
      if ((u.name||'').toLowerCase().includes(query.toLowerCase()) ||
          (u.username||'').includes(q) ||
          (u.filNumber||'').replace(/\s/g,'').includes(q) ||
          (u.filDisplay||'').replace(/\s/g,'').includes(q)) {
        results.push({ uid: child.key, ...u });
      }
    });
  }
  container.innerHTML = '';
  if (!results.length) { container.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text4);font-size:0.85rem;">No users found.</div>'; return; }
  results.slice(0, 10).forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-result';
    if (multi) {
      const checked = !!selectedPeople[u.uid];
      div.innerHTML = `
        <div class="avatar sm">${avatarHTML(u.name||'?', u.photoURL||'')}</div>
        <div class="user-result-info">
          <div class="user-result-name">${esc(u.name||'?')}</div>
          <div class="user-result-fil">${u.filDisplay||u.filNumber||'@'+u.username}</div>
        </div>
        <div class="user-result-check"><input type="checkbox" id="chk-${u.uid}" ${checked?'checked':''}/></div>`;
      div.onclick = () => toggleGroupMember(u);
    } else {
      div.innerHTML = `
        <div class="avatar sm">${avatarHTML(u.name||'?', u.photoURL||'')}</div>
        <div class="user-result-info">
          <div class="user-result-name">${esc(u.name||'?')}</div>
          <div class="user-result-fil">${u.filDisplay||u.filNumber||'@'+u.username}</div>
        </div>`;
      div.onclick = () => openOrCreateDM(u.uid, u);
    }
    container.appendChild(div);
  });
}

function toggleGroupMember(u) {
  if (selectedPeople[u.uid]) delete selectedPeople[u.uid];
  else selectedPeople[u.uid] = u;
  const chk = document.getElementById('chk-' + u.uid);
  if (chk) chk.checked = !!selectedPeople[u.uid];
  renderSelectedTags();
}

function renderSelectedTags() {
  const el = document.getElementById('grp-selected');
  el.innerHTML = '';
  Object.values(selectedPeople).forEach(u => {
    const tag = document.createElement('div');
    tag.className = 'sel-tag';
    tag.innerHTML = `${esc(u.name)} <button onclick="toggleGroupMember(${JSON.stringify(u).replace(/'/g,'\\\'')})" >✕</button>`;
    el.appendChild(tag);
  });
}

// ── PROFILE ──
function openProfileModal() {
  if (!myProfile) return;
  renderAvatarEl(document.getElementById('profile-avatar-big'), myProfile);
  document.getElementById('prof-name').value = myProfile.name || '';
  document.getElementById('prof-bio').value  = myProfile.bio  || '';
  document.getElementById('prof-fil').textContent  = myProfile.filDisplay || myProfile.filNumber || '—';
  const link = APP_URL + '?dm=' + (myProfile.username || me.uid);
  document.getElementById('prof-link').textContent = link;
  openModal('profile-modal');
}

function triggerProfilePic() { document.getElementById('profile-pic-input').click(); }

async function uploadProfilePic(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  showToast('Uploading photo…');
  const url = await uploadCDN(file);
  if (!url) return showToast('Upload failed.');
  await REF.users(me.uid).update({ photoURL: url });
  myProfile.photoURL = url;
  renderAvatarEl(document.getElementById('profile-avatar-big'), myProfile);
  renderAvatarEl(document.getElementById('my-avatar-strip'), myProfile);
  showToast('Photo updated!');
}

async function saveProfile() {
  const name = document.getElementById('prof-name').value.trim();
  const bio  = document.getElementById('prof-bio').value.trim();
  if (!name) return showToast('Name cannot be empty.');
  await REF.users(me.uid).update({ name, bio });
  myProfile.name = name; myProfile.bio = bio;
  document.getElementById('my-name-strip').textContent = name;
  closeModal('profile-modal');
  showToast('Profile saved!');
}

function shareMyLink() {
  const link = APP_URL + '?dm=' + (myProfile.username || me.uid);
  copyText(link);
}

// ── CHAT INFO ──
async function openChatInfo() {
  const snap = await REF.conv(currentConvId).once('value');
  const conv = snap.val();
  if (!conv) return;
  document.getElementById('chat-info-title').textContent = conv.type === 'group' ? 'Group Info' : 'Chat Info';
  let html = '';
  const link = APP_URL + '?chat=' + currentConvId;

  if (conv.type === 'group') {
    const uids = Object.keys(conv.members||{});
    html += `<div style="font-size:0.78rem;color:var(--text3);margin-bottom:12px;">${uids.length} members</div>`;
    for (const uid of uids) {
      const us = (await REF.users(uid).once('value')).val() || {};
      html += `<div class="chat-info-member">
        <div class="avatar sm">${avatarHTML(us.name||'?', us.photoURL||'')}</div>
        <div><div class="chat-info-member-name">${esc(us.name||'Unknown')}</div><div class="chat-info-member-fil">${us.filDisplay||us.filNumber||'@'+us.username}</div></div>
        ${uid === me.uid ? '<span style="margin-left:auto;font-size:0.72rem;color:var(--text4)">You</span>' : ''}
      </div>`;
    }
  }
  html += `<div style="margin-top:16px"><div style="font-size:0.72rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Share this chat</div>
    <div class="link-copy-row"><span class="link-text">${link}</span><button class="copy-btn" onclick="copyText('${link}')">Copy</button></div></div>`;
  document.getElementById('chat-info-body').innerHTML = html;
  openModal('chat-info-modal');
}

function shareChatLink() {
  const link = APP_URL + '?chat=' + currentConvId;
  copyText(link);
}

// ── DEEP LINK ──
function handleDeepLink() {
  const p = new URLSearchParams(window.location.search);
  const dm   = p.get('dm');
  const chat = p.get('chat');
  history.replaceState(null, '', window.location.pathname);

  if (dm) {
    REF.allUsers().orderByChild('username').equalTo(dm).once('value').then(s => {
      if (s.exists()) {
        const uid = Object.keys(s.val())[0];
        if (uid !== me.uid) openOrCreateDM(uid, s.val()[uid]);
      } else {
        REF.users(dm).once('value').then(s2 => {
          if (s2.exists() && dm !== me.uid) openOrCreateDM(dm, s2.val());
        });
      }
    });
  }
  if (chat) {
    openConv(chat);
  }
}

// ── STATIC PAGES ──
function openPage(page) {
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chat-view').style.display   = 'none';
  document.querySelectorAll('.static-page').forEach(p => p.style.display = 'none');
  document.getElementById('page-' + page).style.display = 'flex';
  document.getElementById('main-area').classList.add('on');
  document.getElementById('sidebar').classList.add('off');
}
function closePage() {
  document.querySelectorAll('.static-page').forEach(p => p.style.display = 'none');
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('main-area').classList.remove('on');
  document.getElementById('sidebar').classList.remove('off');
}

// ── MODALS ──
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
  if (id === 'profile-modal') openProfileModal();
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
document.addEventListener('click', e => {
  document.querySelectorAll('.emoji-picker.open').forEach(p => p.classList.remove('open'));
  // Close modal on overlay click
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});

// ── LIGHTBOX ──
function openLightbox(url) {
  document.getElementById('lb-img').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}
function closeLightbox() { document.getElementById('lightbox').style.display = 'none'; }

// ── SCROLL ──
function scrollBottom() {
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}
document.addEventListener('DOMContentLoaded', () => {
  const area = document.getElementById('messages-area');
  const btn  = document.getElementById('scroll-btn');
  if (area && btn) {
    area.addEventListener('scroll', () => {
      const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      btn.classList.toggle('visible', !atBottom);
    });
  }
});

// ── TOAST ──
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── HELPERS ──
function avatarHTML(name, photoURL) {
  if (photoURL) return `<img src="${esc(photoURL)}" alt="" loading="lazy"/>`;
  const initials = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return initials;
}
function renderAvatarEl(el, data) {
  if (!el) return;
  if (data && data.photoURL) { el.innerHTML = `<img src="${esc(data.photoURL)}" alt=""/>`; }
  else { el.textContent = ((data && data.name)||'?')[0].toUpperCase(); }
}
function copyText(text) { navigator.clipboard.writeText(text).then(() => showToast('Copied!')); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if (now - d < 7*86400000) return d.toLocaleDateString([],{weekday:'short'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (new Date(now - 86400000).toDateString() === d.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{weekday:'long', month:'long', day:'numeric'});
}
