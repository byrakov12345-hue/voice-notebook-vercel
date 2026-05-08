self.__SMART_NOTEBOOK_TIMERS__ = self.__SMART_NOTEBOOK_TIMERS__ || new Map();

function clearReminderTimers() {
  self.__SMART_NOTEBOOK_TIMERS__.forEach(timerId => clearTimeout(timerId));
  self.__SMART_NOTEBOOK_TIMERS__.clear();
}

function notificationOptionsFromPayload(item) {
  return {
    body: item?.options?.body || '',
    tag: item?.options?.tag || `smart-voice-note:${item?.noteId || 'unknown'}:${item?.label || 'primary'}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [180, 80, 180],
    data: item?.options?.data || { noteId: item?.noteId || null, pointLabel: item?.label || 'primary' }
  };
}

async function showReminder(item) {
  await self.registration.showNotification(item?.title || 'Напоминание', notificationOptionsFromPayload(item));
}

function scheduleReminder(item) {
  const key = item?.key || item?.options?.tag;
  const at = Number(item?.at || 0);
  if (!key || !Number.isFinite(at)) return;

  const delay = at - Date.now();
  if (delay <= 0) {
    showReminder(item).catch(() => {});
    return;
  }

  const timerId = setTimeout(() => {
    self.__SMART_NOTEBOOK_TIMERS__.delete(key);
    showReminder(item).catch(() => {});
  }, Math.min(delay, 2147483647));
  self.__SMART_NOTEBOOK_TIMERS__.set(key, timerId);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'smart-notebook-sync-reminders') {
    clearReminderTimers();
    (data.reminders || []).forEach(scheduleReminder);
  }
  if (data.type === 'smart-notebook-test-notification') {
    showReminder({
      title: 'АИ Блокнот',
      options: {
        body: 'Проверка уведомлений включена.',
        tag: 'smart-voice-note:test',
        data: { noteId: null, pointLabel: 'test' }
      }
    }).catch(() => {});
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'АИ Блокнот', options: { body: event.data?.text() || 'Напоминание' } };
  }
  event.waitUntil(showReminder(payload));
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
