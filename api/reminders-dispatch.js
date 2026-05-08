import webpush from 'web-push';
import { getVapidConfig, isStorageConfigured, loadPushState, pruneReminderList, savePushState } from './_push-store.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

function pushPayload(reminder) {
  return JSON.stringify({
    title: reminder.title || 'Напоминание',
    options: {
      ...(reminder.options || {}),
      tag: reminder.options?.tag || reminder.key,
      renotify: true,
      requireInteraction: true,
      vibrate: [180, 80, 180]
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const vapid = getVapidConfig();
  if (!vapid.configured) {
    res.status(503).json({ error: 'VAPID is not configured' });
    return;
  }

  if (!isStorageConfigured()) {
    res.status(503).json({ error: 'Server storage is not configured' });
    return;
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const now = Date.now();
  const dueWindowMs = 30 * 1000;
  let sent = 0;
  let failed = 0;
  let removed = 0;
  let changed = false;

  try {
    const state = await loadPushState();
    const entries = Object.entries(state.subscriptions || {});

    for (const [id, record] of entries) {
      if (!record?.subscription?.endpoint) {
        delete state.subscriptions[id];
        removed += 1;
        changed = true;
        continue;
      }

      const reminders = pruneReminderList(record.reminders || [], now);
      for (const reminder of reminders) {
        const at = Number(reminder.at);
        if (reminder.sent || !Number.isFinite(at) || at > now + dueWindowMs) continue;

        try {
          await webpush.sendNotification(record.subscription, pushPayload(reminder));
          reminder.sent = true;
          reminder.sentAt = new Date().toISOString();
          sent += 1;
          changed = true;
        } catch (error) {
          failed += 1;
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            delete state.subscriptions[id];
            removed += 1;
            changed = true;
            break;
          }
        }
      }

      if (state.subscriptions[id]) {
        state.subscriptions[id] = {
          ...record,
          reminders: pruneReminderList(reminders, now),
          checkedAt: new Date().toISOString()
        };
      }
    }

    if (changed) await savePushState(state);
    res.status(200).json({ ok: true, sent, failed, removed, subscriptions: Object.keys(state.subscriptions || {}).length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to dispatch reminders', sent, failed, removed });
  }
}
