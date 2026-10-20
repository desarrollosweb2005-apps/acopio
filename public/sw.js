// Service worker mínimo: hace Acopio instalable. No guarda nada en caché,
// así que la app siempre muestra los datos al día.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
