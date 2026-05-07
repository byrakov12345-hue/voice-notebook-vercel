export function buildReminderPoints(note, reminderSettings = {}) {
  if (!note || note.type !== 'appointment' || !note.eventAt) return [];
  const eventAt = new Date(note.eventAt);
  if (Number.isNaN(eventAt.getTime())) return [];

  const points = [{ at: eventAt, label: 'event' }];

  const firstEnabled = note.reminderFirstEnabled ?? reminderSettings.firstReminderEnabled ?? true;
  if (firstEnabled) {
    const morningAt = new Date(eventAt);
    const [morningHour, morningMinute] = String(note.reminderMorningTime || reminderSettings.morningTime || '09:00').split(':').map(Number);
    morningAt.setHours(morningHour || 0, morningMinute || 0, 0, 0);
    points.push({ at: morningAt, label: 'morning' });
  }

  const secondEnabled = note.reminderSecondEnabled ?? reminderSettings.secondReminderEnabled ?? true;
  const secondValue = note.reminderSecondTime || reminderSettings.secondReminderTime || '';
  if (secondEnabled && secondValue) {
    const secondAt = new Date(eventAt);
    const [secondHour, secondMinute] = String(secondValue).split(':').map(Number);
    secondAt.setHours(secondHour || 0, secondMinute || 0, 0, 0);
    points.push({ at: secondAt, label: 'before' });
  }

  return points;
}

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}
