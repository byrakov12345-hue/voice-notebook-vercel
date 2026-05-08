import { getVapidConfig, isStorageConfigured, loadPushState, pruneReminderList, savePushState, subscriptionId } from './_push-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!getVapidConfig().configured) {
    res.status(503).json({ error: 'VAPID is not configured' });
    return;
  }

  if (!isStorageConfigured()) {
    res.status(503).json({ error: 'Server storage is not configured' });
    return;
  }

  try {
    const body = req.body || {};
    const subscription = body.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: 'Invalid push subscription' });
      return;
    }

    const id = subscriptionId(subscription);
    const state = await loadPushState();
    const reminders = pruneReminderList(Array.isArray(body.reminders) ? body.reminders : []);
    state.subscriptions[id] = {
      id,
      subscription,
      reminders,
      updatedAt: new Date().toISOString()
    };
    await savePushState(state);
    res.status(200).json({ ok: true, id, reminders: reminders.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to sync reminders' });
  }
}
