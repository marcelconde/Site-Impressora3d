const APP_VERSION = 'forgecon-fresh-v20260604-1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        clearAllCaches().then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'CLEAR_APP_CACHE') {
        event.waitUntil(clearAllCaches());
    }
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith((async () => {
        if (event.request.mode === 'navigate') {
            await clearAllCaches();
        }

        try {
            return await fetch(event.request, { cache: 'reload' });
        } catch (error) {
            console.error(`[${APP_VERSION}] Erro de rede no Service Worker:`, error);
            throw error;
        }
    })());
});

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
}
