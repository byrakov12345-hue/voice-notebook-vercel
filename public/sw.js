self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.length) {
      const client = allClients[0];
      client.focus();
      client.postMessage({
        type: 'open-note-from-notification',
        noteId: event.notification?.data?.noteId || null
      });
      return;
    }
    await self.clients.openWindow('/');
  })());
});
