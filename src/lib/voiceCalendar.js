function normalizeVoiceText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[?!;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAnyVoice(text, words) {
  const source = normalizeVoiceText(text);
  return words.some(word => source.includes(normalizeVoiceText(word)));
}

const MONTH_TOKEN_PATTERN = '(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])';
const MONTH_DATE_REGEX = new RegExp(`(?:^|\\s)(\\d{1,2})\\s+(?:число\\s+)?${MONTH_TOKEN_PATTERN}(?=\\s|$)`, 'i');
const REVERSE_MONTH_DATE_REGEX = new RegExp(`(?:^|\\s)${MONTH_TOKEN_PATTERN}\\s+(\\d{1,2})(?:\\s+число)?(?=\\s|$)`, 'i');

export function extractAllTimes(text) {
  const source = normalizeVoiceText(text);
  const times = [];
  const clockMatches = [...source.matchAll(/\b(\d{1,2})[:.](\d{2})\b(?:\s+(утра|дня|вечера|ночи))?/g)];
  clockMatches.forEach(match => {
    const rawHour = Number(match[1]);
    const minute = match[2];
    const suffix = match[3];
    let hour = rawHour;
    if (suffix === 'вечера' && hour < 12) hour += 12;
    else if (suffix === 'дня' && hour < 12) hour += 12;
    else if (suffix === 'ночи' && hour === 12) hour = 0;
    times.push(`${String(hour).padStart(2, '0')}:${minute}`);
  });
  const tokens = source.split(' ');
  for (let i = 0; i < tokens.length; i += 1) {
    const n = Number(tokens[i]);
    if (Number.isNaN(n)) continue;
    const next = tokens[i + 1];
    if (next === 'вечера' || next === 'ночи') {
      const hour = next === 'вечера' && n < 12 ? n + 12 : n;
      times.push(`${String(hour).padStart(2, '0')}:00`);
    } else if (next === 'утра') {
      times.push(`${String(n).padStart(2, '0')}:00`);
    } else if (next === 'дня') {
      times.push(`${String(n === 12 ? 12 : n + 12).padStart(2, '0')}:00`);
    }
  }
  return [...new Set(times)];
}

export function extractAppointmentTime(text) {
  return extractAllTimes(text)[0] || '';
}

export function extractAppointmentDateLabel(text) {
  const source = normalizeVoiceText(text);
  if (source.includes('послезавтра')) return 'послезавтра';
  if (source.includes('завтра')) return 'завтра';
  if (source.includes('сегодня')) return 'сегодня';
  const sameMonthMatch = source.match(/(?:^|\s)(\d{1,2})\s+число(?:\s+этого\s+месяца)?(?=\s|$)/i);
  if (sameMonthMatch) return `${sameMonthMatch[1]} число`;
  const monthMatch = source.match(MONTH_DATE_REGEX);
  if (monthMatch) return `${monthMatch[1]} ${monthMatch[2]}`;
  const reverseMonthMatch = source.match(REVERSE_MONTH_DATE_REGEX);
  if (reverseMonthMatch) return `${reverseMonthMatch[2]} ${reverseMonthMatch[1]}`;
  const weekdays = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  return weekdays.find(day => source.includes(day)) || '';
}

export function parseAppointmentDateTime(text, now = new Date()) {
  const source = normalizeVoiceText(text);
  const months = {
    января: 0, феврал: 1, марта: 2, апрел: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
  };
  let eventDate = null;

  const monthMatch = source.match(MONTH_DATE_REGEX);
  const reverseMonthMatch = source.match(REVERSE_MONTH_DATE_REGEX);
  if (monthMatch || reverseMonthMatch) {
    const day = Number(monthMatch ? monthMatch[1] : reverseMonthMatch[2]);
    const monthToken = monthMatch ? monthMatch[2] : reverseMonthMatch[1];
    const monthKey = Object.keys(months).find(key => monthToken.startsWith(key.slice(0, 5)));
    if (day && monthKey) {
      let year = now.getFullYear();
      const probe = new Date(year, months[monthKey], day, 12, 0, 0, 0);
      if (probe.getTime() < now.getTime() - 86400000) year += 1;
      eventDate = new Date(year, months[monthKey], day, 12, 0, 0, 0);
    }
  } else {
    const sameMonthMatch = source.match(/(?:^|\s)(\d{1,2})\s+число(?:\s+этого\s+месяца)?(?=\s|$)/i);
    if (sameMonthMatch) {
      const day = Number(sameMonthMatch[1]);
      if (day) {
        let year = now.getFullYear();
        let month = now.getMonth();
        const probe = new Date(year, month, day, 12, 0, 0, 0);
        if (probe.getTime() < now.getTime() - 86400000) {
          const nextMonth = new Date(year, month + 1, day, 12, 0, 0, 0);
          year = nextMonth.getFullYear();
          month = nextMonth.getMonth();
        }
        eventDate = new Date(year, month, day, 12, 0, 0, 0);
      }
    } else if (source.includes('послезавтра')) {
      eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12, 0, 0, 0);
    } else if (source.includes('завтра')) {
      eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
    } else if (source.includes('сегодня')) {
      eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }
  }

  const time = extractAppointmentTime(text);
  if (!eventDate && time) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }
  if (eventDate && time) {
    const [hour, minute] = time.split(':').map(Number);
    eventDate.setHours(hour || 0, minute || 0, 0, 0);
  }

  return {
    dateLabel: extractAppointmentDateLabel(text),
    time,
    eventAt: eventDate ? eventDate.toISOString() : ''
  };
}

export function timeToLabel(time) {
  if (!time) return '';
  const [hourRaw, minuteRaw] = String(time).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return String(time);
  let suffix = 'утра';
  let displayHour = hour;
  if (hour >= 18) suffix = 'вечера';
  else if (hour >= 12) suffix = 'дня';
  else if (hour < 5) suffix = 'ночи';
  if (displayHour === 0) displayHour = 12;
  if (displayHour > 12) displayHour -= 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}` : `${displayHour} ${suffix}`;
}

export function parseReminderVoiceSettings(text, defaults = {}) {
  const source = normalizeVoiceText(text);
  const allTimes = extractAllTimes(text);
  const defaultsResolved = {
    noteTime: defaults.noteTime || '',
    morningTime: defaults.morningTime || '09:00',
    firstEnabled: Boolean(defaults.firstEnabled ?? true),
    secondTime: defaults.secondTime || '',
    secondEnabled: Boolean(defaults.secondEnabled)
  };
  const result = { ...defaultsResolved };

  const secondOnly = source.match(/(?:второе|2-е|второй)\s+напоминани[ея]\s+на\s+(.+)$/i);
  if (secondOnly) {
    const secondTimes = extractAllTimes(secondOnly[1]);
    if (secondTimes[0]) {
      result.secondTime = secondTimes[0];
      result.secondEnabled = true;
    }
    return result;
  }

  const firstOnly = source.match(/(?:первое|1-е|утренн\w+)\s+напоминани[ея]\s+на\s+(.+)$/i);
  if (firstOnly) {
    const firstTimes = extractAllTimes(firstOnly[1]);
    if (firstTimes[0]) result.morningTime = firstTimes[0];
    return result;
  }

  if (includesAnyVoice(source, ['без второго напоминания', 'убери второе напоминание', 'отключи второе напоминание'])) {
    result.secondEnabled = false;
    result.secondTime = '';
    return result;
  }

  if (includesAnyVoice(source, ['без первого напоминания', 'убери первое напоминание', 'отключи первое напоминание', 'убери утреннее напоминание'])) {
    result.firstEnabled = false;
    return result;
  }

  if (allTimes.length >= 3) {
    result.noteTime = allTimes[0];
    result.morningTime = allTimes[1];
    result.secondTime = allTimes[2];
    result.secondEnabled = true;
    return result;
  }

  if (allTimes.length === 2) {
    result.noteTime = allTimes[0];
    result.morningTime = allTimes[0];
    result.secondTime = allTimes[1];
    result.secondEnabled = true;
    return result;
  }

  if (allTimes.length === 1 && includesAnyVoice(source, ['напоминан', 'уведомлен'])) {
    result.noteTime = allTimes[0];
    result.morningTime = allTimes[0];
    result.secondEnabled = false;
    result.secondTime = '';
  }

  return result;
}

export function parseCalendarTargetDate(text, now = new Date()) {
  const source = normalizeVoiceText(text);
  const months = {
    январ: 0, феврал: 1, март: 2, апрел: 3, май: 4, июн: 5,
    июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11
  };
  let day = null;
  let month = null;
  let year = now.getFullYear();

  const sameMonthMatch = source.match(/(?:^|\s)(\d{1,2})\s+число\s+этого\s+месяца(?=\s|$)/i);
  if (sameMonthMatch) {
    day = Number(sameMonthMatch[1]);
    month = now.getMonth();
  }

  if (day === null) {
    const monthMatch = source.match(MONTH_DATE_REGEX);
    if (monthMatch) {
      day = Number(monthMatch[1]);
      const monthKey = Object.keys(months).find(key => monthMatch[2].startsWith(key));
      if (monthKey) month = months[monthKey];
    }
  }

  if (day === null) {
    const reverseMonthMatch = source.match(REVERSE_MONTH_DATE_REGEX);
    if (reverseMonthMatch) {
      day = Number(reverseMonthMatch[2]);
      const monthKey = Object.keys(months).find(key => reverseMonthMatch[1].startsWith(key));
      if (monthKey) month = months[monthKey];
    }
  }

  if (day === null) {
    const simpleThisMonth = source.match(/(?:^|\s)(\d{1,2})\s+число(?=\s|$)/i);
    if (simpleThisMonth) {
      day = Number(simpleThisMonth[1]);
      month = now.getMonth();
    }
  }

  if (day === null || month === null) return null;
  return new Date(year, month, day, 12, 0, 0, 0);
}

export function stripCalendarVoiceContent(text) {
  return String(text || '')
    .replace(/^(открой|отметь|запиши|запомни|сохрани|добавь|поставь)\s+/i, '')
    .replace(/^(?:на\s+)?/i, '')
    .replace(/(?:^|\s)\d{1,2}\s+число\s+этого\s+месяца(?=\s|$)/i, ' ')
    .replace(MONTH_DATE_REGEX, ' ')
    .replace(REVERSE_MONTH_DATE_REGEX, ' ')
    .replace(/(?:^|\s)оставь\s+напоминание(?=\s|$)/i, ' ')
    .replace(/(?:^|\s)напоминание(?=\s|$)/i, ' ')
    .replace(/(?:^|\s)сделай\s+уведомление(?=\s|$)/i, ' ')
    .replace(/(?:^|\s)установи\s+уведомление(?=\s|$)/i, ' ')
    .replace(/(?:^|\s)(?:в|на)\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)(?=\s|$)/gi, ' ')
    .replace(/(?:^|\s)и\s+(?:в|на)\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)(?=\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:первое|1-е|утренн\w+|второе|2-е|второй)\s+напоминани[ея]\s+на\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)(?=\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:и\s+)?(?:первое|1-е|утренн\w+|второе|2-е|второй)\s+напоминани[ея](?=\s|$)/gi, ' ')
    .replace(/^\s*на\s+/i, '')
    .replace(/^и\s+/i, '')
    .replace(/^что\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeVoiceCalendarText(text) {
  return normalizeVoiceText(text);
}
