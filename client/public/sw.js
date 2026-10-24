const CACHE_NAME = 'black-library-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && !key.startsWith('audio-cache-')) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const AUDIO_CACHE_NAME = 'audio-cache-v1';

async function handleAudioStreamFetch(request) {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(request.url, { ignoreSearch: true });

    if (!cachedResponse) {
      return fetch(request);
    }

    const rangeHeader = request.headers.get('Range');
    if (!rangeHeader) {
      return cachedResponse;
    }

    const arrayBuffer = await cachedResponse.arrayBuffer();
    const bytes = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(bytes[0], 10) || 0;
    const end = bytes[1] ? parseInt(bytes[1], 10) : arrayBuffer.byteLength - 1;

    const sliced = arrayBuffer.slice(start, end + 1);
    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(sliced.byteLength),
        'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
      },
    });
  } catch {
    return fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Audio stream requests: check offline audio cache with Range (206) support
  if (url.pathname.startsWith('/api/stream/')) {
    event.respondWith(handleAudioStreamFetch(event.request));
    return;
  }

  // 2. Never cache other API routes or non-GET requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') || event.request.method !== 'GET') {
    return;
  }

  // 2. Navigation / HTML requests: strictly NETWORK-FIRST to ensure fresh app bundles load
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3. Static hashed assets (JS/CSS/SVG): Cache-First with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
