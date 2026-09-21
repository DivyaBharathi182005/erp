const CACHE = 'erp-v2';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/','index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('localhost:8000') || e.request.url.includes('/api')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'ERP College', body: 'New update' };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/vite.svg' }));
});
