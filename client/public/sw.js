/* Insight service worker: makes the app installable and shows daily reminders. No offline caching. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // network only

self.addEventListener('push', (e) => {
  let d = { title: 'Insight', body: 'Your 5 minutes are ready.', url: '/daily' };
  try { d = { ...d, ...e.data.json() }; } catch { /* plain text or empty */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url }, tag: 'insight-daily' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
