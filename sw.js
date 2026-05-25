// Mudamos o nome para forçar o navegador a perceber que teve atualização
const CACHE_NAME = 'forgecon-sem-cache-v1';

// Força a instalação imediata do novo Service Worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Assim que ativar, apaga TODOS os caches antigos que estavam travando seu site
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    return caches.delete(cacheName);
                })
            );
        })
    );
    self.clients.claim();
});

// Intercepta as requisições e manda buscar direto da internet (rede) sempre, ignorando o cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch((error) => {
            console.error('Erro de rede no Service Worker:', error);
            throw error;
        })
    );
});