self.__SMART_NOTEBOOK_TIMERS__ = self.__SMART_NOTEBOOK_TIMERS__ || new Map();

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

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
  await self.registration.showNotification(item?.title || item?.options?.title || 'Напоминание', notificationOptionsFromPayload(item));
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

async function syncServerReminders(reminders) {
  const configResponse = await fetch('/api/push-config', { cache: 'no-store' });
  if (!configResponse.ok) return;

  const config = await configResponse.json();
  if (!config?.vapidConfigured || !config?.storageConfigured || !config?.publicKey) return;

  let subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey)
    });
  }

  await fetch('/api/reminders-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      reminders: Array.isArray(reminders) ? reminders : []
    })
  });
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
  if (data.type === 'smart-notebook-sync-server-reminders') {
    const syncPromise = syncServerReminders(data.reminders || []).catch(() => {});
    if (typeof event.waitUntil === 'function') event.waitUntil(syncPromise);
  }
  if (data.type === 'smart-notebook-test-notification') {
    const testPromise = showReminder({
      title: 'АИ Блокнот',
      options: {
        body: 'Проверка уведомлений включена.',
        tag: 'smart-voice-note:test',
        data: { noteId: null, pointLabel: 'test' }
      }
    }).catch(() => {});
    if (typeof event.waitUntil === 'function') event.waitUntil(testPromise);
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'АИ Блокнот', options: { body: event.data?.text() || 'Напоминание' } };
  }
  event.waitUntil(showReminder({
    title: payload.title,
    options: payload.options || {},
    noteId: payload.options?.data?.noteId || null,
    label: payload.options?.data?.pointLabel || 'primary'
  }));
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
