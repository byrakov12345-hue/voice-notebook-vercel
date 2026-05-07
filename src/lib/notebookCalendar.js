export function getPeriodRange(period) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === 'week') {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return null;
}

export function formatCalendarDateLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function buildCalendarMonths(notes) {
  const now = new Date();
  return Array.from({ length: 60 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + index, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const items = notes
      .filter(note => note.type === 'appointment' && note.eventAt)
      .filter(note => {
        const ts = new Date(note.eventAt).getTime();
        return ts >= monthStart.getTime() && ts <= monthEnd.getTime();
      })
      .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime());
    return {
      key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
      title: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(monthDate),
      monthDate,
      daysInMonth: monthEnd.getDate(),
      firstWeekday: (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7,
      items
    };
  });
}

export function buildQuickDateStrip() {
  const now = new Date();
  return Array.from({ length: 45 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12, 0, 0, 0);
    return {
      key: date.toISOString(),
      isoDay: date.toISOString().slice(0, 10),
      day: date.getDate(),
      label: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date),
      weekday: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date)
    };
  });
}

export function notesForCalendarDate(notes, dateIso) {
  if (!dateIso) return [];
  const key = String(dateIso).slice(0, 10);
  return [...notes]
    .filter(note => note.type === 'appointment' && String(note.eventAt || '').slice(0, 10) === key)
    .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime());
}

export function findCalendarContextNote(notes, selectedNote, dateIso) {
  if (
    selectedNote?.type === 'appointment' &&
    selectedNote.eventAt &&
    String(selectedNote.eventAt).slice(0, 10) === String(dateIso || '').slice(0, 10)
  ) {
    return selectedNote;
  }
  return notesForCalendarDate(notes, dateIso)[0] || null;
}
