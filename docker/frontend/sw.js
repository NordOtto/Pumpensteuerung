'use strict';
const CACHE = 'pumpe-v5';
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'
];

/* ── Generate PNG icon from SVG via OffscreenCanvas ── */
function generateIconPng(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
    <rect width="192" height="192" rx="40" fill="#1d4ed8"/>
    <path d="M32 108c16-24 32-24 48 0s32 24 48 0s32-24 48 0" stroke="white" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M32 84c16-24 32-24 48 0s32 24 48 0s32-24 48 0" stroke="white" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.6"/>
    <path d="M32 132c16-24 32-24 48 0s32 24 48 0s32-24 48 0" stroke="white" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.35"/>
  </svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  return createImageBitmap(blob, { resizeWidth: size, resizeHeight: size }).then(bmp => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, size, size);
    return canvas.convertToBlob({ type: 'image/png' });
  });
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip WebSocket and API requests
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;

  // Serve generated PNG icons
  const iconMatch = url.pathname.match(/^\/icon-(\d+)\.png$/);
  if (iconMatch) {
    const size = parseInt(iconMatch[1]);
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return generateIconPng(size).then(blob => {
          const resp = new Response(blob, { headers: { 'Content-Type': 'image/png' } });
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        });
      })
    );
    return;
  }

  // Navigation requests: always serve index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }

  // Other requests: network-first with cache fallback
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.status === 200) {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
