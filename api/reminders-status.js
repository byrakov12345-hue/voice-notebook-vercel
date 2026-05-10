import { getVapidConfig, isStorageConfigured, loadPushState } from './_push-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!getVapidConfig().configured || !isStorageConfigured()) {
    res.status(200).json({
      ready: false,
      subscriptions: 0,
      reminders: 0,
      pending: 0,
      due: 0,
      nextAt: null
    });
    return;
  }

  try {
    const state = await loadPushState();
    const now = Date.now();
    const subscriptions = Object.values(state.subscriptions || {});
    const reminders = subscriptions.flatMap(record => record.reminders || []);
    const pending = reminders.filter(reminder => !reminder.sent);
    const due = pending.filter(reminder => Number(reminder.at) <= now);
    const next = [...pending].sort((a, b) => Number(a.at) - Number(b.at))[0];

    res.status(200).json({
      ready: true,
      subscriptions: subscriptions.length,
      reminders: reminders.length,
      pending: pending.length,
      due: due.length,
      nextAt: next ? new Date(Number(next.at)).toISOString() : null,
      now: new Date(now).toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to read reminder status' });
  }
}
