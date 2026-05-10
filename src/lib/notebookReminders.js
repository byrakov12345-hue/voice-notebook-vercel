const PUSH_SUBSCRIPTION_STORAGE_KEY = 'smart_voice_notebook_push_subscription_v1';

function parseOffsetMinutes(value, customValue = 60) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === '15m') return 15;
  if (value === '30m') return 30;
  if (value === '1h') return 60;
  if (value === '1d') return 1440;
  if (value === 'custom') return Number(customValue) > 0 ? Number(customValue) : 60;
  return 60;
}

function parseTimeParts(value, fallbackHour = 9, fallbackMinute = 0) {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return [
    Number.isFinite(hour) ? hour : fallbackHour,
    Number.isFinite(minute) ? minute : fallbackMinute
  ];
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function normalizePushSubscription(subscription) {
  const value = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription;
  if (!value?.endpoint || !value?.keys?.p256dh || !value?.keys?.auth) return null;
  return value;
}

function cachePushSubscription(subscription) {
  if (typeof window === 'undefined') return null;
  const value = normalizePushSubscription(subscription);
  if (!value) return null;
  try {
    localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(value));
  } catch {}
  return value;
}

function readCachedPushSubscription() {
  if (typeof window === 'undefined') return null;
  try {
    return normalizePushSubscription(JSON.parse(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

function normalizeReminderAt(eventAt, reminderAt, settings = {}, wasExplicit = false) {
  if (!(reminderAt instanceof Date) || Number.isNaN(reminderAt.getTime())) return null;
  if (wasExplicit) return reminderAt;

  const quietEnd = settings.quietHoursEnd || '07:00';
  const [quietEndHour] = parseTimeParts(quietEnd, 7, 0);
  if (reminderAt.getHours() < quietEndHour) {
    const shifted = new Date(eventAt);
    shifted.setDate(shifted.getDate() - 1);
    shifted.setHours(20, 0, 0, 0);
    return shifted;
  }
  return reminderAt;
}

function resolveSingleReminderAt(note, reminderSettings = {}) {
  const eventAt = new Date(note.eventAt);
  if (Number.isNaN(eventAt.getTime())) return null;

  if (note.reminderExplicitAt) {
    const explicitAt = new Date(note.reminderExplicitAt);
    if (!Number.isNaN(explicitAt.getTime())) return explicitAt;
  }

  if (note.reminderUseMorningTime) {
    const morningAt = new Date(eventAt);
    const [hour, minute] = parseTimeParts(reminderSettings.morningReminderTime || reminderSettings.morningTime || '09:00', 9, 0);
    morningAt.setHours(hour, minute, 0, 0);
    return normalizeReminderAt(eventAt, morningAt, reminderSettings, false);
  }

  const offsetMinutes = parseOffsetMinutes(
    note.reminderOffsetType || reminderSettings.defaultReminderOffset || '1h',
    note.reminderCustomOffsetMinutes || reminderSettings.customReminderOffsetMinutes || 60
  );
  const offsetAt = new Date(eventAt.getTime() - offsetMinutes * 60 * 1000);
  return normalizeReminderAt(eventAt, offsetAt, reminderSettings, false);
}

export function buildReminderPoints(note, reminderSettings = {}) {
  if (!note || note.type !== 'appointment' || !note.eventAt) return [];
  const eventAt = new Date(note.eventAt);
  if (Number.isNaN(eventAt.getTime())) return [];
  const firstEnabled = reminderSettings.enabled ?? reminderSettings.firstReminderEnabled ?? true;
  if (!firstEnabled) return [];
  const primaryAt = resolveSingleReminderAt(note, reminderSettings);
  if (!primaryAt) return [];
  const points = [{ at: primaryAt, label: 'primary' }];

  const secondEnabled = note.reminderSecondEnabled ?? reminderSettings.secondReminderEnabled ?? false;
  if (secondEnabled) {
    const secondAt = new Date(primaryAt);
    const [hour, minute] = parseTimeParts(reminderSettings.secondReminderTime || '20:00', 20, 0);
    secondAt.setHours(hour, minute, 0, 0);
    points.push({ at: secondAt, label: 'secondary' });
  }
  return points;
}

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function supportsScheduledNotifications() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'showTrigger' in Notification.prototype
    && 'serviceWorker' in navigator
    && 'TimestampTrigger' in window;
}

export function buildNotificationOptions(note, pointLabel = 'primary') {
  return {
    body: [note.dateLabel, note.time, note.placeLabel || note.content].filter(Boolean).join(' · '),
    tag: `smart-voice-note:${note.id}:${pointLabel}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [180, 80, 180],
    data: { noteId: note.id, pointLabel }
  };
}

export async function showReminderNotification(note, pointLabel = 'primary') {
  if (!note || !isNotificationSupported() || Notification.permission !== 'granted') return false;
  const title = note.title || 'Напоминание';
  const options = buildNotificationOptions(note, pointLabel);
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fall through to the page Notification API when the service worker is unavailable.
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export async function syncServiceWorkerReminderSchedule(notes = [], reminderSettings = {}) {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !isNotificationSupported() ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing;
    if (!target?.postMessage) return false;

    const reminders = buildReminderPayloads(notes, reminderSettings);

    target.postMessage({ type: 'smart-notebook-sync-reminders', reminders });
    return true;
  } catch {
    return false;
  }
}

export function buildReminderPayloads(notes = [], reminderSettings = {}) {
  const reminders = [];
  notes
    .filter(note => note?.type === 'appointment' && note.eventAt)
    .forEach(note => {
      buildReminderPoints(note, reminderSettings)
        .filter(point => point.at.getTime() > Date.now())
        .forEach(point => {
          const options = buildNotificationOptions(note, point.label);
          reminders.push({
            key: options.tag,
            at: point.at.getTime(),
            title: note.title || 'Напоминание',
            noteId: note.id,
            label: point.label,
            options
          });
        });
    });
  return reminders;
}

export async function syncServerPushReminderScheduleInServiceWorker(notes = [], reminderSettings = {}) {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !isNotificationSupported() ||
    Notification.permission !== 'granted'
  ) {
    return { ok: false, status: 'unsupported' };
  }

  const reminders = buildReminderPayloads(notes, reminderSettings);
  const message = {
    type: 'smart-notebook-sync-server-reminders',
    reminders
  };
  const controlledWorker = navigator.serviceWorker.controller;
  if (controlledWorker?.postMessage) {
    controlledWorker.postMessage(message);
    return { ok: true, status: 'queued' };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing;
    if (!target?.postMessage) return { ok: false, status: 'service_worker_missing' };

    target.postMessage(message);
    return { ok: true, status: 'queued' };
  } catch (error) {
    return { ok: false, status: error?.message || 'queue_failed' };
  }
}

export function queueServerPushReminderSchedule(notes = [], reminderSettings = {}) {
  if (
    typeof window === 'undefined' ||
    !isNotificationSupported() ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  const subscription = readCachedPushSubscription();
  if (!subscription) return false;

  const body = JSON.stringify({
    subscription,
    reminders: buildReminderPayloads(notes, reminderSettings)
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/reminders-sync', blob)) return true;
    }
  } catch {}

  try {
    fetch('/api/reminders-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
      keepalive: true
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function fetchPushConfig() {
  const response = await fetch('/api/push-config');
  if (!response.ok) return { serverPushReady: false };
  return response.json();
}

export async function syncServerPushReminderSchedule(notes = [], reminderSettings = {}) {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !isNotificationSupported() ||
    Notification.permission !== 'granted'
  ) {
    return { ok: false, status: 'unsupported' };
  }

  try {
    const config = await fetchPushConfig();
    if (!config?.vapidConfigured) return { ok: false, status: 'vapid_missing' };
    if (!config?.storageConfigured) return { ok: false, status: 'storage_missing' };

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey)
      });
    }
    const subscriptionJson = cachePushSubscription(subscription);

    const response = await fetch('/api/reminders-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      keepalive: true,
      body: JSON.stringify({
        subscription: subscriptionJson || subscription.toJSON(),
        reminders: buildReminderPayloads(notes, reminderSettings)
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { ok: false, status: payload?.error || `sync_failed_${response.status}` };
    }

    const payload = await response.json();
    return { ok: true, status: 'synced', reminders: payload.reminders || 0 };
  } catch (error) {
    return { ok: false, status: error?.message || 'sync_failed' };
  }
}

export async function showServiceWorkerTestNotification() {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !isNotificationSupported() ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing;
    if (!target?.postMessage) return false;
    target.postMessage({ type: 'smart-notebook-test-notification' });
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function enableReminderNotifications(nextValue) {
  if (!nextValue) {
    return { enabled: false, status: 'disabled' };
  }
  if (!isNotificationSupported()) {
    return { enabled: false, status: 'unsupported' };
  }
  if (Notification.permission === 'granted') {
    return { enabled: true, status: 'granted' };
  }
  const permission = await requestNotificationPermission();
  if (permission === 'granted') {
    return { enabled: true, status: 'granted' };
  }
  return { enabled: false, status: permission };
}

export function buildReminderSummary(reminderPlan, toLabel) {
  return reminderPlan.firstEnabled ? toLabel(reminderPlan.morningTime || reminderPlan.noteTime || '') : 'уведомление выключено';
}

export function buildAppointmentNote({
  uid,
  selectedDate,
  folder,
  title,
  content,
  dateLabel,
  time,
  appointmentMeta,
  reminderFirstEnabled,
  reminderMorningTime,
  reminderSecondEnabled,
  reminderSecondTime
}) {
  const now = new Date().toISOString();
  return {
    id: uid('note'),
    type: 'appointment',
    folder,
    title,
    content,
    dateLabel,
    time,
    eventAt: selectedDate.toISOString(),
    reminderFirstEnabled,
    reminderMorningTime,
    reminderSecondTime: reminderSecondEnabled ? reminderSecondTime : '',
    reminderSecondEnabled,
    actionLabel: appointmentMeta.action || '',
    placeLabel: appointmentMeta.place || '',
    codeLabel: appointmentMeta.code || '',
    tags: ['встреча', dateLabel, time].filter(Boolean),
    createdAt: now,
    updatedAt: now
  };
}

export function buildReminderDefaults(reminderSettings = {}) {
  return {
    morningTime: reminderSettings.morningReminderTime || reminderSettings.morningTime || '09:00',
    firstEnabled: reminderSettings.enabled ?? false,
    secondTime: '',
    secondEnabled: Boolean(reminderSettings.secondReminderEnabled ?? false),
    offsetType: reminderSettings.defaultReminderOffset || '1h',
    customOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60)
  };
}

export function resolveReminderTimes(reminderPlan, reminderSettings = {}, noteTimeFallback = '09:00') {
  const noteTime = reminderPlan.noteTime || noteTimeFallback || '09:00';
  return {
    noteTime,
    reminderOne: noteTime,
    reminderTwo: ''
  };
}

export function buildReminderStatusMessage(prefix, reminderPlan, toLabel, overrides = {}) {
  const normalizedPlan = {
    ...reminderPlan,
    morningTime: overrides.morningTime || reminderPlan.morningTime,
    secondTime: overrides.secondTime || reminderPlan.secondTime
  };
  return `${prefix}${buildReminderSummary(normalizedPlan, toLabel)}.`;
}
