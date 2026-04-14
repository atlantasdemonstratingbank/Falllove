const CACHE = 'fil-v1';
const ASSETS = ['./', './index.html', './app.css', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Fall I Love', body: 'You have a new message' };
  e.waitUntil(self.registration.showNotification(data.title || 'Fall I Love', {
    body: data.body || 'New message',
    icon: 'https://via.placeholder.com/192x192/0a0a0a/ffffff?text=FIL',
    badge: 'https://via.placeholder.com/72x72/0a0a0a/ffffff?text=FIL',
    tag: 'fil-msg',
    renotify: true,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
