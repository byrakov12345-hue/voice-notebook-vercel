self.__SMART_NOTEBOOK_TIMERS__ = self.__SMART_NOTEBOOK_TIMERS__ || new Map();
self.__SMART_NOTEBOOK_FIRED__ = self.__SMART_NOTEBOOK_FIRED__ || new Set();
self.__SMART_NOTEBOOK_INFLIGHT__ = self.__SMART_NOTEBOOK_INFLIGHT__ || new Set();
const OFFLINE_CACHE_VERSION = 'offline-v1-2026-05-16';
const OFFLINE_SHELL_CACHE = `smart-notebook-shell-${OFFLINE_CACHE_VERSION}`;
const OFFLINE_RUNTIME_CACHE = `smart-notebook-runtime-${OFFLINE_CACHE_VERSION}`;
const OFFLINE_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg'
];
const REMINDER_DB_NAME = 'smart_voice_notebook_reminders_db_v1';
const REMINDER_STORE_NAME = 'reminders';
const REMINDER_KEEP_PAST_MS = 24 * 60 * 60 * 1000;
const REMINDER_OVERDUE_DELIVERY_MS = 6 * 60 * 60 * 1000;

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function openReminderDb() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(REMINDER_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE_NAME)) {
        db.createObjectStore(REMINDER_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withReminderStore(mode, callback) {
  return openReminderDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(REMINDER_STORE_NAME, mode);
    const store = transaction.objectStore(REMINDER_STORE_NAME);
    let callbackResult;
    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    callbackResult = callback(store);
  }));
}

async function readStoredReminders() {
  return withReminderStore('readonly', store => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  }));
}

async function replaceStoredReminders(reminders) {
  const items = (Array.isArray(reminders) ? reminders : [])
    .filter(item => item?.key || item?.options?.tag)
    .filter(item => Number(item?.at || 0) > Date.now() - REMINDER_KEEP_PAST_MS);

  await withReminderStore('readwrite', store => {
    store.clear();
    items.forEach(item => store.put({
      ...item,
      key: item.key || item.options?.tag,
      savedAt: new Date().toISOString()
    }));
  });
  return items;
}

async function deleteStoredReminder(key) {
  if (!key) return;
  await withReminderStore('readwrite', store => {
    store.delete(key);
  });
}

function clearReminderTimers() {
  self.__SMART_NOTEBOOK_TIMERS__.forEach(timerId => clearTimeout(timerId));
  self.__SMART_NOTEBOOK_TIMERS__.clear();
}

function postMessageReply(event, payload) {
  const port = event?.ports?.[0];
  if (port?.postMessage) port.postMessage(payload);
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
  const key = item?.key || item?.options?.tag;
  if (key && self.__SMART_NOTEBOOK_FIRED__.has(key)) return;
  if (key && self.__SMART_NOTEBOOK_INFLIGHT__.has(key)) return;
  if (key) self.__SMART_NOTEBOOK_INFLIGHT__.add(key);
  try {
    await self.registration.showNotification(item?.title || item?.options?.title || 'Напоминание', notificationOptionsFromPayload(item));
    if (key) self.__SMART_NOTEBOOK_FIRED__.add(key);
    await deleteStoredReminder(key);
  } finally {
    if (key) self.__SMART_NOTEBOOK_INFLIGHT__.delete(key);
  }
}

function scheduleReminder(item) {
  const key = item?.key || item?.options?.tag;
  const at = Number(item?.at || 0);
  if (!key || !Number.isFinite(at)) return;

  const delay = at - Date.now();
  if (delay <= 0) {
    if (Math.abs(delay) <= REMINDER_OVERDUE_DELIVERY_MS) {
      showReminder(item).catch(() => {});
    } else {
      deleteStoredReminder(key).catch(() => {});
    }
    return;
  }

  const timerId = setTimeout(() => {
    self.__SMART_NOTEBOOK_TIMERS__.delete(key);
    showReminder(item).catch(() => {});
  }, Math.min(delay, 2147483647));
  self.__SMART_NOTEBOOK_TIMERS__.set(key, timerId);
}

async function syncLocalReminders(reminders) {
  clearReminderTimers();
  const storedReminders = await replaceStoredReminders(reminders);
  storedReminders.forEach(scheduleReminder);
  return storedReminders;
}

async function restoreStoredReminders() {
  const reminders = await readStoredReminders();
  clearReminderTimers();
  reminders.forEach(scheduleReminder);
  return reminders;
}

async function syncServerReminders(reminders) {
  const configResponse = await fetch('/api/push-config', { cache: 'no-store' });
  if (!configResponse.ok) return { ok: false, status: `push_config_${configResponse.status}` };

  const config = await configResponse.json();
  if (!config?.vapidConfigured || !config?.storageConfigured || !config?.publicKey) {
    return { ok: false, status: 'push_not_configured' };
  }

  let subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey)
    });
  }

  const response = await fetch('/api/reminders-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      reminders: Array.isArray(reminders) ? reminders : []
    })
  });
  if (!response.ok) return { ok: false, status: `sync_${response.status}` };
  const payload = await response.json().catch(() => ({}));
  return { ok: true, status: 'synced', reminders: payload.reminders || 0 };
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(OFFLINE_SHELL_CACHE);
    await cache.addAll(OFFLINE_SHELL_URLS);
  })());
});

async function cleanupOldCaches() {
  const keep = new Set([OFFLINE_SHELL_CACHE, OFFLINE_RUNTIME_CACHE]);
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key =>
      key.startsWith('smart-notebook-shell-')
      || key.startsWith('smart-notebook-runtime-'))
    .filter(key => !keep.has(key))
    .map(key => caches.delete(key)));
}

async function networkFirstForNavigation(request) {
  const shellCache = await caches.open(OFFLINE_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      shellCache.put('/index.html', response.clone()).catch(() => {});
      shellCache.put('/', response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await shellCache.match('/index.html') || await shellCache.match('/');
    if (cached) return cached;
    throw new Error('offline_navigation_unavailable');
  }
}

async function cacheFirstForStatic(request) {
  const runtimeCache = await caches.open(OFFLINE_RUNTIME_CACHE);
  const cached = await runtimeCache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) runtimeCache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(OFFLINE_RUNTIME_CACHE);
  const cached = await runtimeCache.match(request);
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) runtimeCache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const network = await networkPromise;
  if (network) return network;
  throw new Error('offline_resource_unavailable');
}

function isStaticAssetRequest(requestUrl, request) {
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font' || request.destination === 'image') return true;
  return /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|ico)$/i.test(requestUrl.pathname);
}

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith('/api/');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (isApiRequest(requestUrl)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstForNavigation(request));
    return;
  }

  if (isStaticAssetRequest(requestUrl, request)) {
    event.respondWith(cacheFirstForStatic(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    cleanupOldCaches().catch(() => {}),
    restoreStoredReminders().catch(() => {})
  ]));
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'smart-notebook-sync-reminders') {
    const syncPromise = syncLocalReminders(data.reminders || [])
      .then(reminders => postMessageReply(event, {
        type: 'smart-notebook-sync-reminders-result',
        ok: true,
        reminders: reminders.length,
        nextAt: reminders[0]?.at || null
      }))
      .catch(error => postMessageReply(event, {
        type: 'smart-notebook-sync-reminders-result',
        ok: false,
        status: error?.message || 'local_sync_failed'
      }));
    if (typeof event.waitUntil === 'function') event.waitUntil(syncPromise);
  }
  if (data.type === 'smart-notebook-sync-server-reminders') {
    const syncPromise = syncServerReminders(data.reminders || [])
      .then(result => postMessageReply(event, {
        type: 'smart-notebook-sync-server-reminders-result',
        ...result
      }))
      .catch(error => postMessageReply(event, {
        type: 'smart-notebook-sync-server-reminders-result',
        ok: false,
        status: error?.message || 'server_sync_failed'
      }));
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

self.addEventListener('sync', event => {
  if (event.tag === 'smart-notebook-restore-reminders') {
    event.waitUntil(restoreStoredReminders().catch(() => {}));
  }
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'smart-notebook-restore-reminders') {
    event.waitUntil(restoreStoredReminders().catch(() => {}));
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
    key: payload.options?.tag || null,
    noteId: payload.options?.data?.noteId || null,
    label: payload.options?.data?.pointLabel || 'primary'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const noteId = event.notification?.data?.noteId || null;
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.length) {
      const client = allClients[0];
      await client.focus();
      client.postMessage({
        type: 'open-note-from-notification',
        noteId
      });
      return;
    }
    const targetUrl = noteId ? `/?openNote=${encodeURIComponent(noteId)}` : '/';
    await self.clients.openWindow(targetUrl);
  })());
});
