export function buildReminderPoints(note, reminderSettings = {}) {
  if (!note || note.type !== 'appointment' || !note.eventAt) return [];
  const eventAt = new Date(note.eventAt);
  if (Number.isNaN(eventAt.getTime())) return [];
  const firstEnabled = note.reminderFirstEnabled ?? reminderSettings.firstReminderEnabled ?? true;
  if (!firstEnabled) return [];
  return [{ at: eventAt, label: 'event' }];
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
    morningTime: reminderSettings.morningTime || '09:00',
    firstEnabled: reminderSettings.enabled ?? false,
    secondTime: '',
    secondEnabled: false
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
