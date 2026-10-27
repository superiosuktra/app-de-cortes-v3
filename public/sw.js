// Self-unregistering Service Worker
// Este SW existe para garantir que qualquer Service Worker legado seja
// removido automaticamente. Após todos os usuários terem atualizado,
// este arquivo pode ser removido junto com as referências ao manifest.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll();
    })
  );
});
