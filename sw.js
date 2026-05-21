const CACHE_VERSION = 'forgecon-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(res => {
                const copy = res.clone();
                caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});
