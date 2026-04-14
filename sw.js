/* ═══════════════════════════════════════════
   FALL I LOVE — sw.js (Service Worker)
═══════════════════════════════════════════ */
const CACHE = 'fil-v1';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for Firebase & Cloudinary
  if (e.request.url.includes('firebasedatabase') ||
      e.request.url.includes('googleapis.com/identitytoolkit') ||
      e.request.url.includes('cloudinary.com')) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || fetch(e.request)))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Fall I Love', {
      body:  data.body  || 'You have a new message.',
      icon:  './icon-192.png',
      badge: './icon-192.png',
      data:  { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || './'));
});
