'use strict';
/* Self-destruct service worker:
   - löscht alle Caches
   - deregistriert sich selbst
   - lädt offene Clients neu
   Grund: alte SW-Versionen haben veraltetes Markup ausgeliefert. */

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      try { c.navigate(c.url); } catch {}
    }
  })());
});

self.addEventListener('fetch', () => { /* no-op, lass den Browser machen */ });
