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
  return reminderPlan.secondEnabled
    ? `${reminderPlan.firstEnabled ? toLabel(reminderPlan.morningTime) : '1-е выкл.'} и ${toLabel(reminderPlan.secondTime)}`
    : (reminderPlan.firstEnabled ? toLabel(reminderPlan.morningTime) : 'оба напоминания выключены');
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
    morningTime: reminderSettings.morningTime || '09:00',
    firstEnabled: reminderSettings.firstReminderEnabled ?? true,
    secondTime: reminderSettings.secondReminderTime || '17:30',
    secondEnabled: reminderSettings.secondReminderEnabled ?? true
  };
}

export function resolveReminderTimes(reminderPlan, reminderSettings = {}, noteTimeFallback = '09:00') {
  return {
    noteTime: reminderPlan.noteTime || noteTimeFallback || '09:00',
    reminderOne: reminderPlan.morningTime || reminderSettings.morningTime || '09:00',
    reminderTwo: reminderPlan.secondTime || reminderSettings.secondReminderTime || '17:30'
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
