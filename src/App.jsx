import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isLikelyGroceryList, shouldAppendShoppingList } from './lib/notebookRules';
import {
  DEDUPE_STOP_WORDS,
  DEFAULT_FOLDERS,
  FOLDER_SIGNALS,
  FOLDER_STEMS,
  SEARCH_SYNONYMS,
  TOPIC_STOP_WORDS,
  TYPE_LABELS,
  capitalize,
  formatDate,
  getVoiceStyleConfig,
  normalize,
  speak,
  uid,
  voiceDisplayMeta
} from './lib/notebookCore';
import {
  contactSpeechText,
  extractDigits,
  extractPhone,
  includesAny,
  isSameOrNearCommand,
  isSameOrNearDuplicate,
  noteSignature,
  shareText,
  startsWithAny,
  wordsToDigits
} from './lib/notebookText';
import {
  buildCalendarMonths,
  buildQuickDateStrip,
  findCalendarContextNote as findCalendarContextNoteByDate,
  formatCalendarDateLabel,
  getPeriodRange,
  notesForCalendarDate as notesForCalendarDateByDate
} from './lib/notebookCalendar';
import { buildAppointmentNote, buildNotificationOptions, buildReminderDefaults, buildReminderPoints, buildReminderStatusMessage, buildReminderSummary, enableReminderNotifications, isMobileBrowserTabMode, isNotificationSupported, queueServerPushReminderSchedule, registerReminderRecoverySync, requestNotificationPermission, resolveReminderTimes, showReminderNotification, showServiceWorkerTestNotification, supportsScheduledNotifications, syncServerPushReminderSchedule, syncServerPushReminderScheduleInServiceWorker, syncServiceWorkerReminderSchedule } from './lib/notebookReminders';
import {
  extractAllTimes as extractVoiceAllTimes,
  parseAppointmentDateTime as parseVoiceAppointmentDateTime,
  parseCalendarTargetDate as parseVoiceCalendarTargetDate,
  parseReminderVoiceSettings as parseVoiceReminderVoiceSettings,
  stripCalendarVoiceContent as stripVoiceCalendarVoiceContent,
  timeToLabel as voiceTimeToLabel
} from './lib/voiceCalendar';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const STORAGE_KEY = 'smart_voice_notebook_live_v2';
const LEGACY_STORAGE_KEYS = ['smart_voice_notebook_live_v1'];
const VOICE_STORAGE_KEY = 'smart_voice_notebook_voice_v1';
const VOICE_STYLE_STORAGE_KEY = 'smart_voice_notebook_voice_style_v1';
const REMINDER_STORAGE_KEY = 'smart_voice_notebook_reminders_v1';
const INSTALL_PROMPT_DISMISSED_KEY = 'smart_voice_notebook_install_dismissed_v1';
const FIRST_LAUNCH_BOOT_KEY = 'smart_voice_notebook_first_launch_boot_v1';
const FIRST_TOUCH_BOOT_KEY = 'smart_voice_notebook_first_touch_boot_v1';

function makeInitialData() {
  const now = new Date().toISOString();
  return {
    folders: DEFAULT_FOLDERS.map(name => ({ id: uid('folder'), name, createdAt: now })),
    notes: []
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
    if (!raw) return makeInitialData();
    const parsed = JSON.parse(raw);
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter(note => normalize(note?.folder || '') !== 'корзина')
      : [];
    const baseFolders = Array.isArray(parsed.folders) && parsed.folders.length ? parsed.folders : makeInitialData().folders;
    const folders = baseFolders
      .filter(folder => normalize(folder?.name || '') !== 'корзина')
      .reduce((acc, folder) => ensureFolder(acc, folder.name), makeInitialData().folders);

    return {
      folders,
      notes
    };
  } catch {
    return makeInitialData();
  }
}

function ensureFolder(folders, folderName) {
  const clean = capitalize(folderName || 'Разное');
  const exists = folders.find(f => normalize(f.name) === normalize(clean));
  if (exists) return folders;
  return [...folders, { id: uid('folder'), name: clean, createdAt: new Date().toISOString() }];
}

function hasDateOrTime(text) {
  const source = normalize(text);
  const dateWords = ['сегодня', 'завтра', 'послезавтра', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const timeWords = ['утра', 'дня', 'вечера', 'ночи', 'час', 'часов', 'полдень', 'полночь'];
  const tokens = source.split(' ');
  const hasDateWord = dateWords.some(word => source.includes(word));
  const hasCalendarDate =
    /\b\d{1,2}\s+число(?:\s+этого\s+месяца)?\b/i.test(source) ||
    /\b\d{1,2}\s+(?:число\s+)?(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/i.test(source) ||
    /\b(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+\d{1,2}(?:\s+число)?\b/i.test(source);
  const hasTimeWord = timeWords.some(word => source.includes(word));
  const hasClock = tokens.some(token => /^\d{1,2}[:.]\d{2}$/.test(token));
  const hasNumberBeforeTime = tokens.some((token, i) => !Number.isNaN(Number(token)) && timeWords.includes(tokens[i + 1]));
  return hasDateWord || hasCalendarDate || hasTimeWord || hasClock || hasNumberBeforeTime;
}

function extractAppointmentTime(text) {
  const source = normalize(text);
  const hasEveningHint = source.includes('вечером') || source.includes('к вечеру');
  const hasDayHint = source.includes('днем') || source.includes('днём') || source.includes('дня');
  const hasMorningHint = source.includes('утром') || source.includes('утра');
  const hasNightHint = source.includes('ночью') || source.includes('к ночи') || source.includes('ночи');
  if (source.includes('полдень') || source.includes('в обед') || source.includes('днем') || source.includes('днём')) return '12:00';
  if (source.includes('полночь')) return '00:00';
  if (source.includes('утром') && !/\d/.test(source)) return '09:00';
  if ((source.includes('вечером') || source.includes('к вечеру')) && !/\d/.test(source)) return '20:00';
  if ((source.includes('ночью') || source.includes('к ночи')) && !/\d/.test(source)) return '22:00';
  const tokens = source.split(' ');

  const clock = source.match(/\b(\d{1,2})[:.](\d{2})\b(?:\s+(утра|дня|вечера|ночи))?/);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = clock[2];
    const suffix = clock[3];
    if (suffix === 'вечера' && hour < 12) hour += 12;
    else if (suffix === 'дня' && hour < 12) hour += 12;
    else if (suffix === 'ночи' && hour === 12) hour = 0;
    else if (!suffix) {
      if (hasEveningHint && hour < 12) hour += 12;
      else if (hasDayHint && hour < 12) hour += 12;
      else if (hasNightHint && hour === 12) hour = 0;
      else if (hasNightHint && hour >= 5 && hour < 12) hour += 12;
      else if (hasMorningHint && hour === 12) hour = 0;
    }
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const n = Number(tokens[i]);
    if (Number.isNaN(n)) continue;
    const next = tokens[i + 1];
    if (next === 'вечера' || next === 'ночи') {
      const hour = next === 'вечера' && n < 12 ? n + 12 : n;
      return `${String(hour).padStart(2, '0')}:00`;
    }
    if (next === 'утра') return `${String(n).padStart(2, '0')}:00`;
    if (next === 'дня') return `${String(n === 12 ? 12 : n + 12).padStart(2, '0')}:00`;
  }
  return '';
}

function extractAppointmentDateLabel(text) {
  const source = normalize(text);
  if (source.includes('послезавтра')) return 'послезавтра';
  if (source.includes('завтра')) return 'завтра';
  if (source.includes('сегодня')) return 'сегодня';
  const sameMonthMatch = source.match(/\b(\d{1,2})\s+число(?:\s+этого\s+месяца)?\b/i);
  if (sameMonthMatch) return `${sameMonthMatch[1]} число`;
  const monthMatch = source.match(/\b(\d{1,2})\s+(?:число\s+)?(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/i);
  if (monthMatch) return `${monthMatch[1]} ${monthMatch[2]}`;
  const reverseMonthMatch = source.match(/\b(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+(\d{1,2})(?:\s+число)?\b/i);
  if (reverseMonthMatch) return `${reverseMonthMatch[2]} ${reverseMonthMatch[1]}`;
  const weekdays = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  return weekdays.find(day => source.includes(day)) || '';
}

function parseAppointmentDateTime(text) {
  const source = normalize(text);
  const now = new Date();
  const months = {
    января: 0, феврал: 1, марта: 2, апрел: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
  };
  let eventDate = null;

  const monthMatch = source.match(/\b(\d{1,2})\s+(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/i);
  const reverseMonthMatch = source.match(/\b(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+(\d{1,2})(?:\s+число)?\b/i);
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
    const sameMonthMatch = source.match(/\b(\d{1,2})\s+число(?:\s+этого\s+месяца)?\b/i);
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
    }
    else if (source.includes('послезавтра')) {
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

function extractAppointmentMeta(text) {
  const source = String(text || '').trim();
  const codeMatch = source.match(/код\s+([0-9]{2,})/i);
  const actionMatch = source.match(/(?:нужно|надо|мне)\s+(.+?)(?:,|$)/i)
    || source.match(/(?:завтра|сегодня|послезавтра|\d{1,2}\s+[А-Яа-я]+|[А-Яа-я]+\s+\d{1,2})\s+(.+?)(?:,|$)/i);
  const placeMatch = source.match(/\b(?:на|в)\s+([А-Яа-яA-Za-z0-9][^,]+?)(?:\s+код|\s+в\s+\d|\s*$)/i);
  return {
    action: actionMatch?.[1]?.trim() || '',
    place: placeMatch?.[1]?.trim() || '',
    code: codeMatch?.[1] || ''
  };
}

function extractAllTimes(text) {
  const source = normalize(text);
  const times = [];
  const hasEveningHint = source.includes('вечером') || source.includes('к вечеру');
  const hasDayHint = source.includes('днем') || source.includes('днём') || source.includes('дня');
  const hasMorningHint = source.includes('утром') || source.includes('утра');
  const hasNightHint = source.includes('ночью') || source.includes('к ночи') || source.includes('ночи');
  if (source.includes('полдень') || source.includes('в обед') || source.includes('днем') || source.includes('днём')) times.push('12:00');
  if (source.includes('полночь')) times.push('00:00');
  if (source.includes('утром') && !/\d/.test(source)) times.push('09:00');
  if ((source.includes('вечером') || source.includes('к вечеру')) && !/\d/.test(source)) times.push('20:00');
  if ((source.includes('ночью') || source.includes('к ночи')) && !/\d/.test(source)) times.push('22:00');
  const clockMatches = [...source.matchAll(/\b(\d{1,2})[:.](\d{2})\b(?:\s+(утра|дня|вечера|ночи))?/g)];
  clockMatches.forEach(match => {
    let hour = Number(match[1]);
    const minute = match[2];
    const suffix = match[3];
    if (suffix === 'вечера' && hour < 12) hour += 12;
    else if (suffix === 'дня' && hour < 12) hour += 12;
    else if (suffix === 'ночи' && hour === 12) hour = 0;
    else if (!suffix) {
      if (hasEveningHint && hour < 12) hour += 12;
      else if (hasDayHint && hour < 12) hour += 12;
      else if (hasNightHint && hour === 12) hour = 0;
      else if (hasNightHint && hour >= 5 && hour < 12) hour += 12;
      else if (hasMorningHint && hour === 12) hour = 0;
    }
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

function timeToLabel(time) {
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

function parseReminderVoiceSettings(text, defaults = {}) {
  const source = normalize(text);
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

  if (includesAny(source, ['без второго напоминания', 'убери второе напоминание', 'отключи второе напоминание'])) {
    result.secondEnabled = false;
    result.secondTime = '';
    return result;
  }

  if (includesAny(source, ['без первого напоминания', 'убери первое напоминание', 'отключи первое напоминание', 'убери утреннее напоминание'])) {
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
    result.morningTime = allTimes[0];
    result.secondTime = allTimes[1];
    result.secondEnabled = true;
    return result;
  }

  if (allTimes.length === 1 && includesAny(source, ['напоминан', 'уведомлен'])) {
    result.morningTime = allTimes[0];
    result.secondEnabled = false;
    result.secondTime = '';
  }

  return result;
}

function parseCalendarTargetDate(text) {
  const source = normalize(text);
  const now = new Date();
  const months = {
    январ: 0, феврал: 1, март: 2, апрел: 3, май: 4, июн: 5,
    июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11
  };
  let day = null;
  let month = null;
  let year = now.getFullYear();

  const sameMonthMatch = source.match(/\b(\d{1,2})\s+число\s+этого\s+месяца\b/i);
  if (sameMonthMatch) {
    day = Number(sameMonthMatch[1]);
    month = now.getMonth();
  }

  if (day === null) {
    const monthMatch = source.match(/\b(\d{1,2})\s+(?:число\s+)?(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/i);
    if (monthMatch) {
      day = Number(monthMatch[1]);
      const monthKey = Object.keys(months).find(key => monthMatch[2].startsWith(key));
      if (monthKey) month = months[monthKey];
    }
  }

  if (day === null) {
    const reverseMonthMatch = source.match(/\b(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+(\d{1,2})(?:\s+число)?\b/i);
    if (reverseMonthMatch) {
      day = Number(reverseMonthMatch[2]);
      const monthKey = Object.keys(months).find(key => reverseMonthMatch[1].startsWith(key));
      if (monthKey) month = months[monthKey];
    }
  }

  if (day === null) {
    const simpleThisMonth = source.match(/\b(\d{1,2})\s+число\b/i);
    if (simpleThisMonth) {
      day = Number(simpleThisMonth[1]);
      month = now.getMonth();
    }
  }

  if (day === null || month === null) return null;
  const candidate = new Date(year, month, day, 12, 0, 0, 0);
  if (candidate.getTime() < now.getTime() - 86400000) {
    year += 1;
  }
  return new Date(year, month, day, 12, 0, 0, 0);
}

function stripCalendarVoiceContent(text) {
  return String(text || '')
    .replace(/^(открой|отметь|запиши|запомни|сохрани|добавь|поставь)\s+/i, '')
    .replace(/^(?:на\s+)?/i, '')
    .replace(/\b\d{1,2}\s+число\s+этого\s+месяца\b/i, '')
    .replace(/\b\d{1,2}\s+(?:число\s+)?(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/i, '')
    .replace(/\b(январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+\d{1,2}(?:\s+число)?\b/i, '')
    .replace(/\bоставь\s+напоминание\b/i, '')
    .replace(/\bнапоминание\b/i, '')
    .replace(/\bсделай\s+уведомление\b/i, '')
    .replace(/\bустанови\s+уведомление\b/i, '')
    .replace(/\b(?:в|на)\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)\b/gi, '')
    .replace(/\bи\s+(?:в|на)\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)\b/gi, '')
    .replace(/\b(?:первое|1-е|утренн\w+|второе|2-е|второй)\s+напоминани[ея]\s+на\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)\b/gi, '')
    .replace(/\b(?:и\s+)?(?:первое|1-е|утренн\w+|второе|2-е|второй)\s+напоминани[ея]\b/gi, '')
    .replace(/^\s*на\s+/i, '')
    .replace(/^и\s+/i, '')
    .replace(/^что\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(text, fallback = 'Заметка') {
  const value = String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь|создай|мне нужно|мне надо|нужно|надо|мне|хочу)\s*/i, '')
    .replace(/^(?:в папку|в раздел|в категорию)\s+[а-яa-z0-9-]+\s*/i, '')
    .replace(/^(у меня идея|есть идея|идея|идею|задача|заметка|список покупок|номер телефона|комбинация цифр)[:\s-]*/i, '')
    .replace(/\s+и\s+(покажи|выведи|открой|прочитай).*$/i, '')
    .trim();
  return value ? capitalize(value.slice(0, 80)) : fallback;
}

function normalizeCalendarReminderText(text) {
  return normalize(String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '')
    .replace(/^\s*в\s+\d{1,2}[:.]\d{2}\s*/i, '')
    .trim());
}

function buildCalendarReminderTitle(text) {
  const normalizedText = normalizeCalendarReminderText(text);
  if (!normalizedText) return 'Напоминание';
  return cleanTitle(normalizedText, 'Напоминание');
}

function normalizeTimedShoppingContent(text) {
  const items = extractItems(text);
  if (items.length) return items.join(', ');
  const fallback = normalizeCalendarReminderText(text);
  return fallback || String(text || '').trim();
}

function resolveExplicitFolderName(rawName) {
  const clean = normalize(rawName).replace(/[^a-zа-я0-9 -]/gi, '').trim();
  if (!clean) return '';

  const exact = DEFAULT_FOLDERS.find(folder => normalize(folder) === clean);
  if (exact) return exact;

  const softVariants = {
    важно: 'Важное',
    важное: 'Важное',
    встреча: 'Встречи',
    встречи: 'Встречи',
    задача: 'Задачи',
    задачи: 'Задачи',
    покупка: 'Покупки',
    покупки: 'Покупки',
    контакт: 'Контакты',
    контакты: 'Контакты',
    код: 'Коды и комбинации',
    коды: 'Коды и комбинации',
    клиент: 'Клиенты',
    клиенты: 'Клиенты',
    проект: 'Проекты',
    проекты: 'Проекты',
    сделка: 'Сделки',
    сделки: 'Сделки',
    счет: 'Счета',
    счёт: 'Счета',
    счета: 'Счета',
    звонок: 'Звонки',
    звонки: 'Звонки',
    дедлайн: 'Дедлайны',
    дедлайны: 'Дедлайны',
    расход: 'Расходы',
    расходы: 'Расходы',
    работа: 'Работа',
    дом: 'Дом',
    машина: 'Машина',
    семья: 'Семья',
    здоровье: 'Здоровье',
    учеба: 'Учёба',
    учёба: 'Учёба',
    финансы: 'Финансы',
    финансыи: 'Финансы',
    банк: 'Финансы',
    документы: 'Документы',
    документ: 'Документы',
    путешествия: 'Путешествия',
    поездка: 'Путешествия',
    поездки: 'Путешествия',
    рецепт: 'Рецепты',
    рецепты: 'Рецепты',
    спорт: 'Спорт',
    тренировки: 'Спорт',
    животные: 'Животные',
    питомец: 'Животные',
    питомцы: 'Животные',
    личное: 'Личное',
    идея: 'Идеи',
    идеи: 'Идеи',
    разное: 'Разное'
  };

  if (softVariants[clean]) return softVariants[clean];

  const prefixMatch = DEFAULT_FOLDERS.find(folder => {
    const normalizedFolder = normalize(folder);
    return normalizedFolder.startsWith(clean) || clean.startsWith(normalizedFolder.slice(0, Math.max(3, normalizedFolder.length - 2)));
  });
  if (prefixMatch) return prefixMatch;

  return capitalize(rawName);
}

function extractExplicitFolder(text) {
  const source = normalize(text);
  const markers = ['в папку ', 'в раздел ', 'в категорию ', 'создай папку ', 'создать папку '];
  const storedFolders = (() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.folders) ? parsed.folders.map(folder => folder?.name).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();
  const knownFolders = [...new Set([...storedFolders, ...DEFAULT_FOLDERS])];

  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index === -1) continue;
    const tail = source.slice(index + marker.length).trim();
    if (!tail) continue;
    const matchedKnownFolder = [...knownFolders]
      .sort((a, b) => normalize(b).length - normalize(a).length)
      .find(folder => {
        const normalizedFolder = normalize(folder);
        return tail === normalizedFolder || tail.startsWith(`${normalizedFolder} `);
      });
    if (matchedKnownFolder) return matchedKnownFolder;
    const folderPart = tail
      .split(/\s+(?=что\b|чтобы\b|про\b|и\b|но\b|а\b|мне\b|нужно\b|надо\b|завтра\b|сегодня\b|послезавтра\b)/i)[0]
      .trim();
    if (folderPart) return resolveExplicitFolderName(folderPart);
  }
  return '';
}

function extractFolderCreateName(text) {
  const source = normalize(text);
  const match = source.match(/^(?:создай папку|создать папку)\s+(.+)$/i);
  if (!match?.[1]) return '';
  const candidate = match[1].trim();
  return resolveExplicitFolderName(candidate);
}

function isFamilyContext(text) {
  const source = normalize(text);
  return includesAny(source, [
    'сын', 'сыну', 'сына', 'дочь', 'дочке', 'дочери', 'мама', 'маме', 'папа', 'папе',
    'жена', 'жене', 'муж', 'мужу', 'семья', 'ребенок', 'ребёнок', 'дети', 'ребёнку', 'ребенку'
  ]);
}

function resolveTimedEntryFolder(text) {
  return isFamilyContext(text) ? 'Семья' : 'Встречи';
}

function scoreFolderSignals(text) {
  const source = normalize(text);
  const words = source.split(' ').filter(Boolean);
  const ranked = Object.entries(FOLDER_SIGNALS)
    .map(([folder, signals]) => ({
      folder,
      score:
        signals.reduce((sum, signal) => sum + (source.includes(normalize(signal)) ? 2 : 0), 0) +
        (FOLDER_STEMS[folder] || []).reduce((sum, stem) => sum + words.reduce((inner, word) => inner + (word.includes(stem) ? 1 : 0), 0), 0)
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.folder || '';
}

function detectNovelFolderName(text) {
  const source = normalize(text);
  const afterTopicCue =
    source.match(/(?:про|о|об|для)\s+([а-яa-z0-9-]+\s*[а-яa-z0-9-]*)/i)?.[1] ||
    source.match(/(?:запомни|запиши|сохрани|добавь|нужно|надо|хочу)\s+([а-яa-z0-9-]+\s*[а-яa-z0-9-]*)/i)?.[1] ||
    '';

  const rawWords = (afterTopicCue || source)
    .split(' ')
    .map(word => word.replace(/[^a-zа-я0-9-]/gi, '').trim())
    .filter(Boolean)
    .filter(word => word.length > 3)
    .filter(word => !TOPIC_STOP_WORDS.has(word));

  const topicWords = rawWords.slice(0, 2);
  if (!topicWords.length) return '';

  const candidate = topicWords.map(capitalize).join(' ');
  if (DEFAULT_FOLDERS.some(folder => normalize(folder) === normalize(candidate))) return '';
  if (candidate.length < 4) return '';
  return candidate;
}

function resolveFolderName(text, type = 'note') {
  const chosen = chooseFolder(text);
  if (chosen !== 'Разное') return chosen;
  if (!['note', 'task'].includes(type)) return chosen;
  const novel = detectNovelFolderName(text);
  return novel || chosen;
}

function chooseFolder(text) {
  const explicit = extractExplicitFolder(text);
  if (explicit) return explicit;
  const source = normalize(text);
  const fastHint = fastFolderAndTypeHint(source);
  if (fastHint?.folder) return fastHint.folder;
  if (includesAny(source, ['идея', 'идею', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'Идеи';
  if (isFamilyContext(source)) return 'Семья';
  if (includesAny(source, ['адрес', 'улиц', 'ул ', 'проспект', 'дом ', 'квартира', 'подъезд', 'корпус'])) return 'Адрес';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'трата', 'трат', 'евро', 'рубл', 'доллар', '₽'])) return 'Финансы';
  if (includesAny(source, ['заработал', 'получил', 'доход', 'прибыль', 'пришли деньги', 'пришел перевод'])) return 'Финансы';
  if (includesAny(source, ['финанс', 'банк', 'карта', 'счет', 'счёт', 'платеж', 'платёж', 'кредит', 'ипотека'])) return 'Финансы';
  if (includesAny(source, ['документ', 'паспорт', 'права', 'договор', 'полис', 'справка'])) return 'Документы';
  if (includesAny(source, ['поездка', 'путешествие', 'билет', 'отель', 'аэропорт', 'виза'])) return 'Путешествия';
  if (includesAny(source, ['рецепт', 'готовить', 'ингредиенты', 'блюдо'])) return 'Рецепты';
  if (includesAny(source, ['спорт', 'тренировка', 'зал', 'фитнес', 'пробежка'])) return 'Спорт';
  if (includesAny(source, ['кот', 'кошка', 'собака', 'питомец', 'ветеринар'])) return 'Животные';
  if (includesAny(source, ['личное', 'дневник', 'настроение', 'привычка'])) return 'Личное';
  const scoredFolder = scoreFolderSignals(source);
  if (scoredFolder) return scoredFolder;
  if (includesAny(source, ['стриж', 'встреч', 'встрет', 'прием', 'приём', 'барбер', 'парикмахер', 'договорились']) || hasDateOrTime(source)) return 'Встречи';
  if (includesAny(source, ['купить', 'покуп', 'магазин', 'продукт'])) return 'Покупки';
  if (includesAny(source, ['телефон', 'номер', 'контакт'])) return 'Контакты';
  if (includesAny(source, ['код', 'комбинац', 'цифр', 'пароль'])) return 'Коды и комбинации';
  if (includesAny(source, ['клиент', 'заказчик', 'цена'])) return 'Клиенты';
  if (includesAny(source, ['проект', 'спринт', 'тз', 'релиз'])) return 'Проекты';
  if (includesAny(source, ['сделка', 'лид', 'продажа', 'воронка'])) return 'Сделки';
  if (includesAny(source, ['счет', 'счёт', 'инвойс', 'акт'])) return 'Счета';
  if (includesAny(source, ['звонок', 'созвон', 'перезвонить', 'связаться'])) return 'Звонки';
  if (includesAny(source, ['дедлайн', 'срок', 'до пятницы', 'до конца дня'])) return 'Дедлайны';
  if (includesAny(source, ['машина', 'авто', 'гараж', 'масло', 'бензин'])) return 'Машина';
  if (includesAny(source, ['дом', 'квартира', 'ремонт'])) return 'Дом';
  if (includesAny(source, ['задача', 'надо', 'нужно', 'сделать'])) return 'Задачи';
  return 'Разное';
}

function inferType(text) {
  const source = normalize(text);
  const fastHint = fastFolderAndTypeHint(source);
  if (fastHint?.type) return fastHint.type;
  if (includesAny(source, ['идея', 'идею', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'idea';
  if (includesAny(source, ['телефон', 'номер телефона', 'контакт'])) return 'contact';
  if (includesAny(source, ['комбинац', 'код', 'цифр', 'пароль'])) return 'code';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'трата', 'трат', 'евро', 'рубл', 'доллар', '₽'])) return 'expense';
  if (includesAny(source, ['заработал', 'получил', 'доход', 'прибыль', 'пришли деньги', 'пришел перевод'])) return 'income';
  if (includesAny(source, ['купить', 'купи', 'покуп', 'магазин', 'продукт', 'аптек', 'лекар', 'таблет', 'анальгин', 'стекло', 'лобов'])) return 'shopping_list';
  if (includesAny(source, ['адрес', 'улиц', 'ул ', 'проспект', 'дом ', 'квартира', 'подъезд', 'корпус'])) return 'note';
  if (includesAny(source, ['клиент']) && includesAny(source, ['просил', 'нужно', 'надо', 'позвонить', 'написать', 'связаться', 'перезвонить'])) return 'task';
  if (isFamilyContext(source) && (includesAny(source, ['нужно', 'надо', 'сказать', 'напомнить']) || hasDateOrTime(source))) return 'task';
  if (includesAny(source, ['стриж', 'прием', 'приём', 'встреч', 'встрет', 'барбер', 'парикмахер', 'договорились']) || hasDateOrTime(source)) return 'appointment';
  if (includesAny(source, ['задача', 'надо', 'нужно', 'сделать'])) return 'task';
  return 'note';
}

function fastFolderAndTypeHint(text) {
  const source = normalize(text);
  const words = source.split(' ').filter(Boolean);
  const joined = ` ${words.join(' ')} `;
  const has = token => joined.includes(` ${token} `) || words.some(word => word.startsWith(token));
  if (has('адрес') || has('улиц') || has('проспект') || has('подъезд') || has('корпус')) return { folder: 'Адрес', type: 'note' };
  if (has('потрат') || has('расход') || has('заработ') || has('доход') || has('прибыл')) return { folder: 'Финансы', type: has('заработ') || has('доход') ? 'income' : 'expense' };
  if (has('купи') || has('купить') || has('покуп') || has('аптек') || has('лекар') || has('таблет')) return { folder: 'Покупки', type: 'shopping_list' };
  if (has('встрет') || has('встреч') || has('прием') || has('стриж')) return { folder: 'Встречи', type: 'appointment' };
  return null;
}

function isTimedShoppingCommand(text) {
  const source = normalize(text);
  return inferType(text) === 'shopping_list' && hasDateOrTime(source);
}

function extractItems(text) {
  const normalizeQuantityUnits = value => String(value || '')
    .replace(/(\d)\s*(кг|килограмм(?:а|ов)?|кило)\b/gi, '$1 кг')
    .replace(/(\d)\s*(г|грамм(?:а|ов)?)\b/gi, '$1 г')
    .replace(/(\d)\s*(л|литр(?:а|ов)?)\b/gi, '$1 л')
    .replace(/(\d)\s*(мл|миллилитр(?:а|ов)?)\b/gi, '$1 мл')
    .replace(/(\d)\s*(шт|штук(?:и)?|штука)\b/gi, '$1 шт')
    .replace(/(\d)\s*(уп|упак(?:овка|овки|овок)?)\b/gi, '$1 уп')
    .replace(/(\d)\s*(пачк(?:а|и|у)?|пакет(?:а|ов)?)\b/gi, '$1 пачка')
    .replace(/(\d)\s*(бутылк(?:а|и|у)?|бут)\b/gi, '$1 бут')
    .replace(/(\d)\s*(м|метр(?:а|ов)?)\b/gi, '$1 м')
    .replace(/(\d)\s*(см|сантиметр(?:а|ов)?)\b/gi, '$1 см')
    .replace(/(\d)\s*(мм|миллиметр(?:а|ов)?)\b/gi, '$1 мм')
    .replace(/полкил(?:о|ограмма)?/gi, '0.5 кг')
    .replace(/поллитр(?:а)?/gi, '0.5 л')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '')
    .replace(/\b(сегодня|завтра|послезавтра)\b/gi, ' ')
    .replace(/\b\d{1,2}\s+(?:число\s+)?(?:январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\b/gi, ' ')
    .replace(/\b(?:в|на)\s+\d{1,2}[:.]\d{2}\b/gi, ' ')
    .replace(/\b\d{1,2}[:.]\d{2}\b/gi, ' ')
    .replace(/\b(?:в|на)\s+\d{1,2}\s+(утра|дня|вечера|ночи)\b/gi, ' ')
    .replace(/\b\d{1,2}\s+(утра|дня|вечера|ночи)\b/gi, ' ')
    .replace(/^\d{1,2}\s+(?:число\s+)?(?:январ[яь]|феврал[яь]|март[ае]?|апрел[яь]|мая|май|июн[яь]|июл[яь]|август[ае]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s*/i, '')
    .replace(/^на\s+\d{1,2}\s+число(?:\s+этого\s+месяца)?\s*/i, '')
    .replace(/^\d{1,2}\s+число(?:\s+этого\s+месяца)?\s*/i, '')
    .replace(/^\d{1,2}[:.]\d{2}\s*/i, '')
    .replace(/^\d{1,2}\s+(утра|дня|вечера|ночи)\s*/i, '')
    .replace(/^(?:мне\s+)?(?:список покупок|список|купить|нужно купить|надо купить)[:\s-]*/i, '')
    .replace(/\s+и\s+/gi, ', ')
    .replace(/\s{2,}/g, ' ')
    .split(/[,.]/)
    .map(x => normalizeQuantityUnits(x.trim()))
    .filter(Boolean);
}

function sanitizeShoppingContent(text) {
  return extractItems(text).join(', ');
}

function sanitizeAppointmentContent(text) {
  const stripped = stripVoiceCalendarVoiceContent(String(text || ''));
  return stripped
    .replace(/^(завтра|сегодня|послезавтра)\s*/i, '')
    .replace(/^(?:в|на)\s+\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)\s*/i, '')
    .replace(/^\d{1,2}([:.]\d{2})?\s+(утра|дня|вечера|ночи)\s*/i, '')
    .replace(/^(?:в|на)\s+\d{1,2}[:.]\d{2}\s*/i, '')
    .replace(/^\d{1,2}[:.]\d{2}\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function deriveShoppingListTitle(items, text = '') {
  const normalizedItems = (items || []).map(item => normalize(item)).filter(Boolean);
  const source = normalize([text, ...normalizedItems].join(' '));

  const groups = [
    { title: 'Еда', signals: ['хлеб', 'батон', 'сахар', 'молоко', 'сыр', 'мяс', 'куриц', 'овощ', 'фрукт', 'еда', 'продукт', 'чай', 'кофе', 'круп', 'макарон'] },
    { title: 'Транспорт', signals: ['мотоцикл', 'велосипед', 'самокат', 'машин', 'авто', 'транспорт', 'скутер'] },
    { title: 'Запчасти', signals: ['втулк', 'шина', 'колес', 'подшип', 'масл', 'фильтр', 'чехл', 'запчаст', 'свеч'] },
    { title: 'Дом', signals: ['ламп', 'мебел', 'посуда', 'подушк', 'ремонт', 'дом', 'квартир'] },
    { title: 'Одежда', signals: ['куртк', 'обув', 'футбол', 'джинс', 'носк', 'штан', 'одежд'] },
    { title: 'Техника', signals: ['телефон', 'ноутбук', 'планшет', 'кабель', 'зарядк', 'наушник', 'мышк'] },
    { title: 'Здоровье', signals: ['лекар', 'таблет', 'витамин', 'бинт', 'градусник', 'здоров'] }
  ];

  const matched = groups.find(group => group.signals.some(signal => source.includes(signal)));
  if (matched) return matched.title;

  const firstMeaningful = normalizedItems[0];
  if (firstMeaningful) return capitalize(firstMeaningful.slice(0, 1).toUpperCase() + firstMeaningful.slice(1));
  return 'Покупки';
}

function isShoppingAppendCommand(text) {
  const source = normalize(text);
  if (includesAny(source, ['добавь к', 'добавить к', 'добавь в', 'добавить в', 'добавь еще в', 'добавь ещё в', 'добавить еще в', 'добавить ещё в', 'допиши к', 'докинь в', 'впиши в', 'внеси в'])) return true;
  if (startsWithAny(source, ['еще ', 'ещё ', 'плюс ']) && source.split(' ').filter(Boolean).length <= 6) return true;
  if (/^к\s+[а-яa-z0-9-]+\s+[а-яa-z0-9-]/i.test(source) && !includesAny(source, ['врач', 'прием', 'приём', 'встреч', 'звон', 'клиент'])) return true;
  return includesAny(source, ['добавь', 'добавить', 'допиши', 'дописать', 'докинь', 'впиши', 'внеси', 'еще', 'ещё', 'плюс']) && inferType(text) === 'shopping_list';
}

function extractShoppingAppendItems(text) {
  const base = String(text || '')
    .replace(/\s+и\s+(оповещ|уведомл|напоминан).*/i, '')
    .replace(/^(добавь|добавить|допиши|дописать|докинь|впиши|внеси)\s+/i, '')
    .replace(/^(еще|ещё|плюс)\s+/i, '')
    .replace(/^(?:в|к)\s+спис(?:ок|ку)\s+/i, '')
    .replace(/^к\s+[а-яa-z0-9-]+\s*/i, '')
    .trim();
  return extractItems(base)
    .map(item => item.replace(/^к\s+[а-яa-z0-9-]+\s*/i, '').trim())
    .filter(item => item && !includesAny(normalize(item), ['оповещ', 'уведомл', 'напоминан']));
}

function extractContact(text) {
  const phone = extractPhone(text);
  let rest = String(text || '')
    .replace(phone, '')
    .replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '')
    .replace(/(номер телефона|номер|телефон|контакт|зовут|его зовут|ее зовут|её зовут)/gi, '')
    .replace(/[,:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = rest.split(' ').filter(Boolean);
  const name = capitalize(parts[0] || 'Без имени');
  const description = parts.slice(1).join(' ');
  return { name, description, phone };
}

function createNoteFromLocalText(text, preferredFolder = '', reminderDefaults = {}) {
  const now = new Date().toISOString();
  const type = inferType(text);
  const folder = resolveSaveFolder(text, type, preferredFolder);
  const content = String(text || '').replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '').trim();
  const tags = normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10);

  if (type === 'contact') {
    const c = extractContact(content);
    return {
      id: uid('note'), type, folder, title: `${c.name}${c.description ? ` — ${c.description}` : ''}`,
      content, name: c.name, description: c.description, phone: c.phone,
      tags: [c.name, c.description, 'телефон', 'контакт'].filter(Boolean), createdAt: now, updatedAt: now
    };
  }

  if (type === 'shopping_list') {
    const items = extractItems(content);
    if (isTimedShoppingCommand(text)) {
      const eventMeta = parseVoiceAppointmentDateTime(text);
      const timedReminder = eventMeta.time || '09:00';
      const cleanShoppingContent = sanitizeShoppingContent(content);
      return {
        id: uid('note'),
        type: 'appointment',
        folder,
        title: deriveShoppingListTitle(items, content),
        content: cleanShoppingContent,
        items,
        dateLabel: eventMeta.dateLabel || formatCalendarDateLabel(new Date(eventMeta.eventAt || Date.now())),
        time: eventMeta.time || '09:00',
        eventAt: eventMeta.eventAt || new Date().toISOString(),
        reminderFirstEnabled: Boolean(reminderDefaults.firstEnabled ?? false),
        reminderMorningTime: timedReminder,
        reminderExplicitAt: eventMeta.time ? (eventMeta.eventAt || '') : '',
        reminderUseMorningTime: false,
        reminderOffsetType: reminderDefaults.offsetType || '1h',
        reminderCustomOffsetMinutes: reminderDefaults.customOffsetMinutes || 60,
        reminderSecondTime: '',
        reminderSecondEnabled: false,
        tags: ['покупки', 'магазин', ...items],
        createdAt: now,
        updatedAt: now
      };
    }
    return {
      id: uid('note'), type, folder, title: deriveShoppingListTitle(items, content), content: items.join(', '),
      items, checkedItems: [], tags: ['покупки', 'магазин', ...items], createdAt: now, updatedAt: now
    };
  }

  if (type === 'code') {
    const code = extractDigits(content) || content;
    return {
      id: uid('note'), type, folder, title: 'Комбинация цифр', content: code,
      isSensitive: true, tags: ['код', 'комбинация', 'цифры'], createdAt: now, updatedAt: now
    };
  }

  if (type === 'appointment') {
    const eventMeta = parseVoiceAppointmentDateTime(text);
    const cleanAppointmentContent = sanitizeAppointmentContent(content);
    const appointmentMeta = extractAppointmentMeta(cleanAppointmentContent);
    let title = 'Встреча';
    if (normalize(cleanAppointmentContent).includes('стриж')) title = 'Стрижка';
    else if (normalize(cleanAppointmentContent).includes('врач')) title = 'Врач';
    else title = cleanTitle(cleanAppointmentContent, 'Встреча');
    return {
      id: uid('note'), type, folder, title, content: cleanAppointmentContent || content,
      dateLabel: eventMeta.dateLabel, time: eventMeta.time, eventAt: eventMeta.eventAt,
      reminderFirstEnabled: Boolean(reminderDefaults.firstEnabled ?? false),
      reminderMorningTime: eventMeta.time || reminderDefaults.morningTime || '09:00',
      reminderExplicitAt: eventMeta.time ? (eventMeta.eventAt || '') : '',
      reminderUseMorningTime: !eventMeta.time && normalize(text).includes('утром'),
      reminderOffsetType: reminderDefaults.offsetType || '1h',
      reminderCustomOffsetMinutes: reminderDefaults.customOffsetMinutes || 60,
      reminderSecondTime: '',
      reminderSecondEnabled: false,
      actionLabel: appointmentMeta.action, placeLabel: appointmentMeta.place, codeLabel: appointmentMeta.code,
      tags: ['встреча', eventMeta.dateLabel, eventMeta.time, appointmentMeta.place, appointmentMeta.code, ...tags].filter(Boolean), createdAt: now, updatedAt: now
    };
  }

  if (type === 'expense' || type === 'income') {
    const label = type === 'expense' ? 'Расход' : 'Доход';
    return {
      id: uid('note'),
      type: 'note',
      folder: 'Финансы',
      title: cleanTitle(`${label}: ${content}`, label),
      content: `${label}: ${content}`,
      tags: [label.toLowerCase(), 'финансы', ...tags].filter(Boolean),
      createdAt: now,
      updatedAt: now
    };
  }

  return {
    id: uid('note'), type, folder, title: cleanTitle(content, TYPE_LABELS[type] || 'Заметка'), content,
    tags, createdAt: now, updatedAt: now, status: type === 'task' ? 'active' : undefined
  };
}

function createNoteFromAI(plan, fallbackText, preferredFolder = '', reminderDefaults = {}) {
  if (!plan || typeof plan !== 'object') return createNoteFromLocalText(fallbackText, preferredFolder, reminderDefaults);
  const now = new Date().toISOString();
  const actionMap = {
    save_idea: 'idea', save_task: 'task', save_appointment: 'appointment', save_shopping_list: 'shopping_list',
    save_contact: 'contact', save_code: 'code', save_note: 'note', save_expense: 'expense'
  };
  const type = plan.type && plan.type !== 'unknown' ? plan.type : (actionMap[plan.action] || inferType(fallbackText));

  if (type === 'contact') {
    const name = capitalize(plan.name || extractContact(fallbackText).name || 'Без имени');
    const description = plan.description || plan.label || extractContact(fallbackText).description || '';
    const phone = plan.phone || extractPhone(fallbackText);
    return { id: uid('note'), type, folder: 'Контакты', title: `${name}${description ? ` — ${description}` : ''}`, content: plan.content || fallbackText, name, description, phone, tags: [name, description, 'телефон', 'контакт', ...(plan.tags || [])].filter(Boolean), createdAt: now, updatedAt: now };
  }

  if (type === 'shopping_list') {
    const items = Array.isArray(plan.items) && plan.items.length ? plan.items : extractItems(plan.content || fallbackText);
    return { id: uid('note'), type, folder: plan.folder || 'Покупки', title: plan.title || deriveShoppingListTitle(items, plan.content || fallbackText), content: items.join(', '), items, checkedItems: [], tags: ['покупки', 'магазин', ...items, ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  if (type === 'code') {
    return { id: uid('note'), type, folder: 'Коды и комбинации', title: plan.title || 'Комбинация цифр', content: plan.content || plan.code || extractDigits(fallbackText), isSensitive: true, tags: ['код', 'комбинация', ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  if (type === 'appointment') {
    const metaSource = [fallbackText, plan.content].filter(Boolean).join(' ').trim();
    const eventMeta = parseVoiceAppointmentDateTime(metaSource);
    const appointmentMeta = extractAppointmentMeta(metaSource);
    return {
      id: uid('note'),
      type,
      folder: plan.folder || resolveSaveFolder(fallbackText, type, preferredFolder),
      title: plan.title || cleanTitle(plan.content || fallbackText, 'Встреча'),
      content: plan.content || fallbackText,
      dateLabel: plan.dateLabel || eventMeta.dateLabel,
      time: plan.time || eventMeta.time,
      eventAt: plan.eventAt || eventMeta.eventAt,
      reminderFirstEnabled: Boolean(plan.reminderFirstEnabled ?? reminderDefaults.firstEnabled ?? false),
      reminderMorningTime: plan.time || eventMeta.time || plan.reminderMorningTime || reminderDefaults.morningTime || '09:00',
      reminderExplicitAt: plan.reminderExplicitAt || ((plan.time || eventMeta.time) ? (plan.eventAt || eventMeta.eventAt || '') : ''),
      reminderUseMorningTime: Boolean(plan.reminderUseMorningTime ?? false),
      reminderOffsetType: plan.reminderOffsetType || reminderDefaults.offsetType || '1h',
      reminderCustomOffsetMinutes: Number(plan.reminderCustomOffsetMinutes || reminderDefaults.customOffsetMinutes || 60),
      reminderSecondTime: '',
      reminderSecondEnabled: false,
      actionLabel: plan.actionLabel || appointmentMeta.action,
      placeLabel: plan.placeLabel || appointmentMeta.place,
      codeLabel: plan.codeLabel || appointmentMeta.code,
      tags: ['встреча', ...(plan.tags || [])],
      createdAt: now,
      updatedAt: now
    };
  }

  return { id: uid('note'), type, folder: plan.folder || resolveSaveFolder(fallbackText, type, preferredFolder), title: plan.title || cleanTitle(plan.content || fallbackText, TYPE_LABELS[type] || 'Заметка'), content: plan.content || fallbackText, tags: Array.isArray(plan.tags) ? plan.tags : [], createdAt: now, updatedAt: now };
}

function detectIntent(text) {
  const source = normalize(text);
  if (includesAny(source, ['удали', 'удалить', 'очисти', 'сотри', 'стереть'])) return 'delete';
  if (includesAny(source, ['переименуй', 'назови запись как'])) return 'rename';
  if (includesAny(source, ['перемести это в', 'перенеси это в', 'перемести запись в', 'перенеси запись в'])) return 'move';
  if (includesAny(source, ['измени последнюю запись', 'открой последнюю запись для изменения'])) return 'edit';
  if (includesAny(source, ['добавь туда', 'добавить туда', 'добавь ещё туда', 'добавь еще туда', 'добавь в запись', 'добавить в запись', 'добавь в список', 'добавить в список', 'добавь к', 'добавить к', 'добавь в', 'добавить в', 'допиши туда', 'впиши туда', 'внеси туда'])) return 'append';
  if (includesAny(source, ['скопируй', 'копируй', 'скопировать', 'в буфер', 'в буфер обмена'])) return 'copy';
  if (includesAny(source, ['поделись', 'поделиться', 'отправь', 'скинь'])) return 'share';
  if (includesAny(source, ['прочитай', 'зачитай', 'озвучь', 'продиктуй'])) return 'read';
  if (includesAny(source, ['открой папку', 'покажи папку', 'перейди в папку'])) return 'open_folder';
  if (startsWithAny(source, ['позвони', 'набери'])) return 'call';
  if (startsWithAny(source, ['напиши', 'смс', 'sms', 'whatsapp', 'ватсап', 'вацап'])) return 'message';
  if (includesAny(source, ['покажи послед', 'выведи послед', 'последнюю заметку', 'что я только что записал'])) return 'show_latest';
  if (includesAny(source, ['что я записывал сегодня', 'покажи вчерашние записи', 'что я сохранял на этой неделе', 'за вчера', 'за сегодня', 'на этой неделе'])) return 'history';
  if (includesAny(source, ['найди', 'найти', 'поищи', 'поиск', 'что я записывал'])) return 'search';
  if (includesAny(source, ['создай папку', 'создать папку'])) return 'create_folder';
  if (includesAny(source, ['запомни', 'запиши', 'сохрани', 'добавь', 'напомни', 'напомнить', 'поставь напоминание', 'поставь уведомление', 'создай напоминание', 'оставь напоминание', 'запланируй', 'нужно запомнить', 'надо запомнить'])) return 'save';
  if (includesAny(source, ['у меня идея', 'есть идея'])) return 'save';
  if (includesAny(source, ['мне нужно', 'мне надо', 'надо', 'нужно', 'хочу'])) return 'save';
  if (inferType(text) !== 'note') return 'save';
  if (hasDateOrTime(source) || includesAny(source, ['на стрижку', 'к врачу', 'на прием', 'на приём', 'встреча', 'встретиться', 'встретится'])) return 'save';
  if (source.split(' ').filter(Boolean).length >= 2) return 'save';
  return 'unknown';
}

function searchNotes(notes, query) {
  const q = normalize(query)
    .replace(/^(найди|найти|покажи|выведи|поищи|мне)\s*/g, '')
    .replace(/\b(заметку|запись|номер|телефон|контакт|идею|задачу|про|мне)\b/g, '')
    .trim();
  const terms = q.split(' ').filter(t => t.length > 1);
  const expandedTerms = [...new Set(terms.flatMap(term => [term, ...(SEARCH_SYNONYMS[term] || [])]))];
  if (!expandedTerms.length) return [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes
    .map(note => {
      const haystack = normalize([
        note.title, note.content, note.folder, note.name, note.description, note.phone,
        ...(note.tags || []), ...(note.items || [])
      ].join(' '));
      const score = expandedTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { note, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.note.createdAt) - new Date(a.note.createdAt))
    .map(x => x.note);
}

function compactAppointmentBody(note) {
  const lines = String(note?.content || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  const seen = new Set();
  const actionNorm = normalize(note?.actionLabel || '');
  const compact = lines.filter(line => {
    const key = normalize(line);
    if (!key || seen.has(key)) return false;
    if (actionNorm && (key === actionNorm || key.endsWith(actionNorm))) return false;
    seen.add(key);
    return true;
  });
  return compact.join('\n');
}

function findFolderByText(folders, text) {
  const source = normalize(text);
  return folders.find(folder => source.includes(normalize(folder.name))) || null;
}

function extractFolderListIndex(text) {
  const source = normalize(text);
  const match = source.match(/(?:спис(?:ок|ка)|запис(?:ь|и|ку)|заметк(?:у|и|а)?|номер)\s+(\d{1,3})/i);
  return match ? Number(match[1]) : null;
}

function resolveSaveFolder(text, type = 'note', preferredFolder = '') {
  const explicit = extractExplicitFolder(text);
  if (explicit) return explicit;
  const semanticFolder = resolveFolderName(text, type);
  const noteSemanticPriorityFolders = new Set(['Адрес', 'Финансы', 'Расходы', 'Доходы', 'Покупки', 'Встречи', 'Контакты', 'Идеи', 'Задачи']);
  // For structured intents, semantic routing must override currently opened folder.
  if (['appointment', 'shopping_list', 'contact', 'code', 'expense', 'income', 'idea'].includes(type)) {
    return semanticFolder;
  }
  if (type === 'note' && noteSemanticPriorityFolders.has(semanticFolder)) {
    return semanticFolder;
  }
  if (preferredFolder && preferredFolder !== 'Все') return preferredFolder;
  return semanticFolder;
}

function extractRenameValue(text) {
  const source = String(text || '').trim();
  const quoted = source.match(/[«"']([^"»']+)[»"']/);
  if (quoted?.[1]) return quoted[1].trim();
  const plain = source.match(/(?:переименуй(?:\s+запись)?\s+в|назови(?:\s+запись)?\s+как)\s+(.+)$/i);
  return plain?.[1]?.trim() || '';
}

function extractMoveFolderName(text) {
  const source = String(text || '').trim();
  const explicit = extractExplicitFolder(source);
  if (explicit) return explicit;
  const match = source.match(/(?:перемести|перенеси)\s+(?:это|запись|заметку|список)?\s*(?:в|во)\s+(.+)$/i);
  return match?.[1] ? resolveExplicitFolderName(match[1].trim()) : '';
}

function extractListItemToRemove(text) {
  const source = String(text || '').trim();
  const match = source.match(/(?:удали|убери|вычеркни)\s+(?:из\s+списка\s+)?(.+)$/i);
  return match?.[1]?.trim() || '';
}

function extractAppendText(text) {
  return String(text || '')
    .replace(/^(добавь|добавить)\s+/i, '')
    .replace(/^(туда|сюда|в запись|в список)\s+/i, '')
    .replace(/^(ещё|еще)\s+/i, '')
    .trim();
}

function stripSaveWords(text) {
  return String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь|создай|мне нужно|мне надо|мне|у меня|есть|нужно|надо|хочу)\s*/i, '')
    .replace(/^(?:в папку|в раздел|в категорию)\s+[а-яa-z0-9-]+\s*/i, '')
    .replace(/^(идея|идею|задача|заметка|список покупок|номер телефона|комбинация цифр)[:\s-]*/i, '')
    .replace(/\s+и\s+(покажи|выведи|открой|прочитай).*$/i, '')
    .replace(/^что\s+/i, '')
    .trim();
}

function localAIPlan(text, data, currentNote, activeFolder = '') {
  const source = normalize(text);
  const intent = detectIntent(text);
  const type = inferType(text);
  const folder = chooseFolder(text);
  const content = stripSaveWords(text) || text;
  const showAfterSave = includesAny(source, ['выведи', 'покажи', 'открой', 'на экран']);

  if (intent === 'delete') {
    const folderMatch = findFolderByText(data.folders, text);
    const listIndex = extractFolderListIndex(text);
    if (folderMatch && listIndex) {
      return { action: 'delete_folder_indexed_note', folder: folderMatch.name, index: listIndex, target: 'folder_index' };
    }
    if (activeFolder && activeFolder !== 'Все' && listIndex) {
      return { action: 'delete_folder_indexed_note', folder: activeFolder, index: listIndex, target: 'folder_index' };
    }
    if (includesAny(source, ['очисти корзину', 'удали корзину', 'удали все записи с корзины', 'удали всё с корзины'])) {
      return { action: 'delete_trash', target: 'trash' };
    }
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё', 'удали все с блокнота', 'удали всё с блокнота', 'очисти блокнот', 'очисти весь блокнот'])) {
      return { action: 'delete_all', target: 'all' };
    }
    if (includesAny(source, ['очисти папку', 'удали все в папке', 'удали всё в папке', 'удали все с папки', 'удали всё с папки'])) {
      const folderMatch = findFolderByText(data.folders, text);
      return { action: 'clear_folder', folder: folderMatch?.name || '', target: 'folder' };
    }
    if (includesAny(source, ['удали папку'])) {
      const folderMatch = findFolderByText(data.folders, text);
      return { action: 'delete_folder', folder: folderMatch?.name || '', target: 'folder' };
    }
    if (source.includes('послед') && source.includes('папк')) {
      const folderMatch = findFolderByText(data.folders, text);
      return { action: 'delete_note', folder: folderMatch?.name || '', target: folderMatch ? 'folder_latest' : 'latest' };
    }
    if (source.includes('послед')) return { action: 'delete_note', target: 'latest' };
    if (includesAny(source, ['это', 'эту', 'ее', 'её', 'его']) && currentNote) return { action: 'delete_note', target: 'current' };
    return { action: 'delete_note', target: 'specific', query: text };
  }

  if (intent === 'copy') {
    const folderMatch = findFolderByText(data.folders, text);
    if (folderMatch) return { action: 'copy_folder_latest', folder: folderMatch.name, target: 'folder' };
    return { action: 'copy_current', target: 'current' };
  }
  if (intent === 'rename') return { action: 'rename_current', title: extractRenameValue(text), target: 'current' };
  if (intent === 'move') return { action: 'move_current', folder: extractMoveFolderName(text), target: 'current' };
  if (intent === 'edit') return { action: 'edit_latest', target: 'latest' };
  if (intent === 'append') return { action: 'append_current', content: extractAppendText(text), target: 'current' };
  if (intent === 'share') return { action: 'share_current', target: 'current' };
  if (intent === 'read') {
    const folderMatch = findFolderByText(data.folders, text);
    if (folderMatch?.name === 'Контакты' || includesAny(source, ['номер', 'телефон', 'контакт'])) {
      return { action: 'read_contact_latest', folder: 'Контакты', target: 'folder' };
    }
    if (folderMatch) return { action: 'read_folder_latest', folder: folderMatch.name, target: 'folder' };
    return { action: 'read_current', target: 'current' };
  }
  if (intent === 'open_folder') {
    const folderMatch = findFolderByText(data.folders, text);
    return { action: 'open_folder', folder: folderMatch?.name || '' };
  }
  if (intent === 'call') return { action: 'call_contact', query: text, target: includesAny(source, ['ему', 'ей', 'этому']) ? 'current' : 'specific' };
  if (intent === 'message') return { action: 'message_contact', query: text, target: includesAny(source, ['ему', 'ей', 'этому']) ? 'current' : 'specific' };
  if (intent === 'show_latest') return { action: 'show_latest_note', query: text, target: 'latest' };
  if (intent === 'history') {
    if (includesAny(source, ['вчера', 'вчераш'])) return { action: 'show_period', period: 'yesterday' };
    if (includesAny(source, ['неделе', 'неделя'])) return { action: 'show_period', period: 'week' };
    return { action: 'show_period', period: 'today' };
  }
  if (intent === 'search') return { action: 'search_notes', query: text };

  if (intent === 'create_folder') {
    return { action: 'create_folder', folder: extractFolderCreateName(text) || extractExplicitFolder(text) || cleanTitle(text.replace(/создай папку|создать папку/gi, ''), 'Новая папка') };
  }

  if (intent === 'save') {
    if (type === 'contact') {
      const c = extractContact(content);
      return {
        action: 'save_contact', type: 'contact', folder: resolveSaveFolder(text, 'contact', activeFolder), title: `${c.name}${c.description ? ` — ${c.description}` : ''}`,
        content, name: c.name, description: c.description, phone: c.phone,
        tags: [c.name, c.description, 'телефон', 'контакт'].filter(Boolean), showAfterSave
      };
    }
    if (type === 'shopping_list') {
      const items = extractItems(content);
      return { action: 'save_shopping_list', type, folder: resolveSaveFolder(text, type, activeFolder), title: 'Список покупок', content: items.join(', '), items, tags: ['покупки', 'магазин', ...items], showAfterSave };
    }
    if (type === 'code') {
      return { action: 'save_code', type, folder: resolveSaveFolder(text, type, activeFolder), title: 'Комбинация цифр', content: extractDigits(content) || content, tags: ['код', 'комбинация', 'цифры'], showAfterSave };
    }
  if (type === 'appointment') {
    const appointmentTime = extractAppointmentTime(text);
    const appointmentDate = extractAppointmentDateLabel(text);
    const cleanAppointmentContent = sanitizeAppointmentContent(content);
    let title = cleanTitle(cleanAppointmentContent, 'Встреча');
    if (normalize(cleanAppointmentContent).includes('стриж')) title = 'Стрижка';
    else if (normalize(cleanAppointmentContent).includes('врач')) title = 'Врач';
    return { action: 'save_appointment', type, folder: resolveSaveFolder(text, type, activeFolder), title, content: cleanAppointmentContent || content, dateLabel: appointmentDate, time: appointmentTime, tags: ['встреча', appointmentDate, appointmentTime].filter(Boolean), showAfterSave };
  }
    if (type === 'idea') {
      return { action: 'save_idea', type, folder: 'Идеи', title: cleanTitle(content, 'Идея'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    if (type === 'task') {
      return { action: 'save_task', type, folder: resolveSaveFolder(text, type, activeFolder), title: cleanTitle(content, 'Задача'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    return { action: 'save_note', type: 'note', folder: resolveSaveFolder(text, 'note', activeFolder), title: cleanTitle(content, 'Заметка'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
  }

  return { action: 'unknown', type: 'unknown' };
}

function NoteCard({ note, selected, displayIndex = null, onOpen, onShare, onCopy, onDelete, onEdit, onCall, onMessage, onRestore }) {
  const hasDuplicateBody = normalize(note.title) === normalize(note.content);
  const appointmentBody = note.type === 'appointment' ? compactAppointmentBody(note) : '';
  const appointmentFallback = note.type === 'appointment'
    ? (sanitizeAppointmentContent(note.content || '').trim() || String(note.content || '').trim())
    : '';
  const noteTitle = String(note.title || '').trim() || (note.type === 'appointment' ? 'Встреча' : 'Без названия');
  const appointmentText = [appointmentBody, appointmentFallback].find(Boolean) || 'Текст встречи пуст.';
  const plainBody = note.type === 'shopping_list'
    ? (note.items || []).join(', ')
    : note.type === 'contact'
      ? [note.phone ? `Телефон: ${note.phone}` : '', note.description ? `Описание: ${note.description}` : ''].filter(Boolean).join('\n')
      : note.type === 'appointment'
        ? `Когда: ${[note.dateLabel, note.time].filter(Boolean).join(', ') || 'не указано'}\n${appointmentText}`
        : (!hasDuplicateBody ? String(note.content || '') : '');
  return (
    <article className={`note-card ${selected ? 'selected' : ''}`}>
      <div
        className="note-main"
        role="button"
        tabIndex={0}
        onClick={() => onOpen(note)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(note);
          }
        }}
      >
        <div className="note-top">
          <span>{displayIndex ? `${displayIndex}. ` : ''}{note.folder} · {TYPE_LABELS[note.type] || 'Запись'}</span>
          <small>{formatDate(note.createdAt)}</small>
        </div>
        <h3>{displayIndex ? `${displayIndex}. ` : ''}{noteTitle}</h3>
        <p>{plainBody || 'Текст записи пуст.'}</p>
      </div>
      <div className="note-actions-label">Действия записи</div>
      <div className="actions note-actions">
        <button type="button" onClick={() => onCopy(note)}>Копировать</button>
        <button type="button" onClick={() => onShare(note)}>Поделиться</button>
        <button type="button" onClick={() => onEdit(note)}>Редактировать</button>
        <button type="button" className="danger" onClick={() => onDelete(note)}>Удалить</button>
      </div>
      {note.type === 'contact' && note.phone ? (
        <div className="actions">
          <button onClick={() => onCall(note)}>Позвонить</button>
          <button onClick={() => onMessage(note)}>Написать</button>
        </div>
      ) : null}
    </article>
  );
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [selectedFolder, setSelectedFolder] = useState('Все');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('Готов. Нажмите микрофон или введите команду для теста.');
  const [listening, setListening] = useState(false);
  const [suggestedFolder, setSuggestedFolder] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installPromptDismissed, setInstallPromptDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === '1'; } catch { return false; }
  });
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
  });
  const [mobilePanel, setMobilePanel] = useState('voice');
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [selectedVoiceStyle, setSelectedVoiceStyle] = useState('default');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [quickDateFilter, setQuickDateFilter] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState('');
  const [calendarDayPanelOpen, setCalendarDayPanelOpen] = useState(false);
  const [calendarDayFilter, setCalendarDayFilter] = useState('');
  const [calendarNoteText, setCalendarNoteText] = useState('');
  const [calendarNoteTime, setCalendarNoteTime] = useState('09:00');
  const [lastReminderSyncAt, setLastReminderSyncAt] = useState('');
  const [reminderSettings, setReminderSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}');
      return {
        enabled: Boolean(saved?.enabled ?? false),
        morningReminderTime: String(saved?.morningReminderTime || saved?.morningTime || '09:00'),
        firstReminderEnabled: Boolean(saved?.firstReminderEnabled ?? true),
        defaultReminderOffset: String(saved?.defaultReminderOffset || '1h'),
        customReminderOffsetMinutes: Number(saved?.customReminderOffsetMinutes || 60),
        quietHoursStart: String(saved?.quietHoursStart || '22:00'),
        quietHoursEnd: String(saved?.quietHoursEnd || '07:00'),
        secondReminderTime: String(saved?.secondReminderTime || '17:30'),
        secondReminderEnabled: Boolean(saved?.secondReminderEnabled ?? false)
      };
    } catch {
      return {
        enabled: false,
        morningReminderTime: '09:00',
        firstReminderEnabled: true,
        defaultReminderOffset: '1h',
        customReminderOffsetMinutes: 60,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        secondReminderTime: '20:00',
        secondReminderEnabled: false
      };
    }
  });
  const useAI = true;
  const recognitionRef = useRef(null);
  const lastCommandRef = useRef({ text: '', at: 0 });
  const lastHandledCommandRef = useRef({ text: '', at: 0 });
  const processingCommandRef = useRef(false);
  const lastSavedRef = useRef({ signature: '', at: 0 });
  const firedReminderRef = useRef(new Set());
  const lastServerBackupSyncRef = useRef(0);

  const selectedNote = data.notes.find(n => n.id === selectedId) || null;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  }, [data]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const filtered = voices.filter(voice => /^ru(-|_)?/i.test(voice.lang) || /russian|рус/i.test(voice.name));
      const usable = (filtered.length ? filtered : voices).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setVoiceOptions(usable);

      const saved = localStorage.getItem(VOICE_STORAGE_KEY) || '';
      const stillExists = usable.some(voice => voice.voiceURI === saved);
      if (stillExists) {
        setSelectedVoiceURI(saved);
        return;
      }
      if (!saved && usable[0]?.voiceURI) {
        setSelectedVoiceURI(usable[0].voiceURI);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (selectedVoiceURI) localStorage.setItem(VOICE_STORAGE_KEY, selectedVoiceURI);
  }, [selectedVoiceURI]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia?.('(display-mode: standalone)');
    const syncInstalledState = () => {
      const installed = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
      setIsInstalled(installed);
      if (installed) {
        setInstallPromptEvent(null);
        setInstallPromptDismissed(true);
        try { localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1'); } catch {}
      }
    };

    const handleBeforeInstallPrompt = event => {
      event.preventDefault();
      setInstallPromptEvent(event);
      try {
        if (localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) !== '1') setInstallPromptDismissed(false);
      } catch {}
    };

    const handleAppInstalled = () => syncInstalledState();

    syncInstalledState();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    media?.addEventListener?.('change', syncInstalledState);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      media?.removeEventListener?.('change', syncInstalledState);
    };
  }, []);

  useEffect(() => {
    const savedStyle = localStorage.getItem(VOICE_STYLE_STORAGE_KEY);
    if (savedStyle) setSelectedVoiceStyle(savedStyle);
  }, []);

  useEffect(() => {
    localStorage.setItem(VOICE_STYLE_STORAGE_KEY, selectedVoiceStyle);
  }, [selectedVoiceStyle]);

  useEffect(() => {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminderSettings));
  }, [reminderSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let alreadyBooted = false;
    try { alreadyBooted = localStorage.getItem(FIRST_LAUNCH_BOOT_KEY) === '1'; } catch {}
    if (alreadyBooted) return;
    try { localStorage.setItem(FIRST_LAUNCH_BOOT_KEY, '1'); } catch {}

    let cancelled = false;
    (async () => {
      if (!isNotificationSupported()) return;
      const permission = await requestNotificationPermission();
      if (cancelled || permission !== 'granted') return;
      const nextSettings = { ...reminderSettings, enabled: true };
      setReminderSettings(prev => (prev.enabled ? prev : { ...prev, enabled: true }));
      await registerReminderRecoverySync();
      const ok = await syncServiceWorkerReminderSchedule(data.notes, nextSettings);
      if (ok) setLastReminderSyncAt(new Date().toISOString());
      await syncServerRemindersBestEffort(data.notes, nextSettings);
      await showServiceWorkerTestNotification();
      setStatusVoice('Уведомления и локальная память напоминаний подключены.', false);
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const isStandalone = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
    if (!isStandalone || !isNotificationSupported()) return undefined;
    let touched = false;
    try { touched = localStorage.getItem(FIRST_TOUCH_BOOT_KEY) === '1'; } catch {}
    if (touched) return undefined;

    let cancelled = false;
    const onFirstTouch = async () => {
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('touchstart', onFirstTouch);
      try { localStorage.setItem(FIRST_TOUCH_BOOT_KEY, '1'); } catch {}
      const permission = await requestNotificationPermission();
      if (cancelled || permission !== 'granted') return;
      const nextSettings = { ...reminderSettings, enabled: true };
      setReminderSettings(prev => (prev.enabled ? prev : { ...prev, enabled: true }));
      await registerReminderRecoverySync();
      const ok = await syncServiceWorkerReminderSchedule(data.notes, nextSettings);
      if (ok) setLastReminderSyncAt(new Date().toISOString());
      await syncServerRemindersBestEffort(data.notes, nextSettings);
      await showServiceWorkerTestNotification();
      setStatusVoice('Уведомления включены после первого касания.', false);
    };

    window.addEventListener('pointerdown', onFirstTouch, { once: true });
    window.addEventListener('touchstart', onFirstTouch, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('touchstart', onFirstTouch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstalled]);


  useEffect(() => {
    if (!isNotificationSupported()) return undefined;
    if (supportsScheduledNotifications()) return undefined;
    if (
      reminderSettings.enabled &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      Notification.permission === 'granted'
    ) {
      return undefined;
    }
    const timeouts = [];
    const emitReminder = (note, remindAt, label) => {
      const key = `${note.id}_${label}_${remindAt.toISOString()}`;
      if (firedReminderRef.current.has(key)) return;
      firedReminderRef.current.add(key);
      showReminderNotification(note, label);
      speak(`Напоминание: ${note.title}.`, selectedVoiceURI, selectedVoiceStyle);
    };
    const scheduleNotification = (note, remindAt, label) => {
      const delay = remindAt.getTime() - Date.now();
      if (delay <= 0) return;
      const key = `${note.id}_${label}_${remindAt.toISOString()}`;
      if (firedReminderRef.current.has(key)) return;
      const timeoutId = window.setTimeout(() => {
        emitReminder(note, remindAt, label);
      }, delay);
      timeouts.push(timeoutId);
    };
    const checkMissedNotifications = () => {
      const nowTs = Date.now();
      const graceWindowMs = 5 * 60 * 1000;
      if (!reminderSettings.enabled) return;
      data.notes
        .filter(note => note.type === 'appointment' && note.eventAt)
        .forEach(note => {
          buildReminderPoints(note, reminderSettings).forEach(point => {
            const diff = nowTs - point.at.getTime();
            if (diff >= 0 && diff <= graceWindowMs) emitReminder(note, point.at, point.label);
          });
        });
    };
    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      checkMissedNotifications();
    };

    data.notes
      .filter(note => note.type === 'appointment' && note.eventAt)
      .forEach(note => {
        if (reminderSettings.enabled && Notification.permission === 'granted') {
          buildReminderPoints(note, reminderSettings).forEach(point => {
            scheduleNotification(note, point.at, point.label);
          });
        }
      });

    checkMissedNotifications();
    window.addEventListener('focus', handleResume);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);
    const intervalId = window.setInterval(checkMissedNotifications, 30000);

    return () => {
      timeouts.forEach(id => window.clearTimeout(id));
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [data.notes, reminderSettings, selectedVoiceStyle, selectedVoiceURI]);

  useEffect(() => {
    if (!reminderSettings.enabled || !isNotificationSupported() || Notification.permission !== 'granted') return undefined;
    let cancelled = false;
    const sync = async () => {
      if (cancelled) return;
      const ok = await syncServiceWorkerReminderSchedule(data.notes, reminderSettings);
      if (ok) setLastReminderSyncAt(new Date().toISOString());
      await registerReminderRecoverySync();
    };
    sync();
    const intervalId = window.setInterval(sync, 60000);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [data.notes, reminderSettings]);

  useEffect(() => {
    if (!reminderSettings.enabled || !isNotificationSupported() || Notification.permission !== 'granted') return undefined;
    const backup = () => {
      queueServerPushReminderSchedule(data.notes, reminderSettings);
      const nowTs = Date.now();
      if (nowTs - lastServerBackupSyncRef.current > 10 * 60 * 1000) {
        lastServerBackupSyncRef.current = nowTs;
        syncServerRemindersBestEffort(data.notes, reminderSettings).catch(() => ({ ok: false }));
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') backup();
    };
    window.addEventListener('pagehide', backup);
    window.addEventListener('beforeunload', backup);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', backup);
      window.removeEventListener('beforeunload', backup);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [data.notes, reminderSettings]);

  useEffect(() => {
    if (!isNotificationSupported()) return undefined;
    if (!supportsScheduledNotifications()) return undefined;
    if (!reminderSettings.enabled) return undefined;
    if (Notification.permission !== 'granted') return undefined;

    let cancelled = false;

    (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || cancelled) return;

      const existing = await registration.getNotifications({ includeTriggered: true });
      await Promise.all(existing
        .filter(notification => String(notification.tag || '').startsWith('smart-voice-note:'))
        .map(notification => notification.close()));

      const notes = data.notes.filter(note => note.type === 'appointment' && note.eventAt);
      for (const note of notes) {
        const points = buildReminderPoints(note, reminderSettings);
        for (const point of points) {
          if (point.at.getTime() <= Date.now()) continue;
          try {
            await registration.showNotification(note.title || 'Напоминание', {
              ...buildNotificationOptions(note, point.label),
              showTrigger: new window.TimestampTrigger(point.at.getTime())
            });
          } catch {
            // Fallback remains in the page-timer effect when triggers are unsupported.
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data.notes, reminderSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const openNoteById = noteId => {
      if (!noteId) return false;
      const note = data.notes.find(item => item.id === noteId);
      if (!note) return false;
      openNote(note);
      return true;
    };

    const params = new URLSearchParams(window.location.search);
    const noteIdFromUrl = params.get('openNote') || params.get('noteId');
    if (noteIdFromUrl && openNoteById(noteIdFromUrl)) {
      params.delete('openNote');
      params.delete('noteId');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    }

    if (!('serviceWorker' in navigator)) return undefined;
    const handleWorkerMessage = event => {
      if (event.data?.type !== 'open-note-from-notification') return;
      openNoteById(event.data?.noteId);
    };
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
  }, [data.notes]);

  const visibleNotes = useMemo(() => {
    let list = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (selectedFolder !== 'Все') list = list.filter(n => n.folder === selectedFolder);
    if (historyFilter !== 'all') {
      const range = getPeriodRange(historyFilter);
      if (range) {
        list = list.filter(note => {
          const ts = new Date(note.updatedAt || note.createdAt).getTime();
          return ts >= range.start.getTime() && ts <= range.end.getTime();
        });
      }
    }
    if (quickDateFilter) {
      list = list.filter(note => {
        const noteDay = String(note.eventAt || note.updatedAt || note.createdAt || '').slice(0, 10);
        return noteDay === quickDateFilter;
      });
    }
    if (query.trim()) list = searchNotes(list, query);
    return list;
  }, [data.notes, selectedFolder, query, historyFilter, quickDateFilter]);
  const calendarMonths = useMemo(() => buildCalendarMonths(data.notes), [data.notes]);
  const selectedCalendarDayNotes = useMemo(() => notesForCalendarDateByDate(data.notes, calendarSelectedDate), [data.notes, calendarSelectedDate]);
  const filteredCalendarDayNotes = useMemo(() => {
    const queryText = normalize(calendarDayFilter);
    if (!queryText) return selectedCalendarDayNotes;
    return selectedCalendarDayNotes.filter(note => normalize([
      note.title,
      note.content,
      note.placeLabel,
      note.actionLabel,
      note.codeLabel
    ].filter(Boolean).join(' ')).includes(queryText));
  }, [selectedCalendarDayNotes, calendarDayFilter]);
  const quickDateStrip = useMemo(() => buildQuickDateStrip(), []);
  const nextReminderAtLabel = useMemo(() => {
    if (!reminderSettings.enabled) return 'Напоминания выключены';
    const points = data.notes
      .filter(note => note?.type === 'appointment' && note.eventAt)
      .flatMap(note => buildReminderPoints(note, reminderSettings))
      .map(point => point.at.getTime())
      .filter(ts => Number.isFinite(ts) && ts > Date.now())
      .sort((a, b) => a - b);
    if (!points.length) return 'нет запланированных';
    return new Date(points[0]).toLocaleString('ru-RU');
  }, [data.notes, reminderSettings]);
  const notificationPermissionLabel = (() => {
    if (!isNotificationSupported() || typeof Notification === 'undefined') return 'не поддерживается';
    if (Notification.permission === 'granted') return 'разрешено';
    if (Notification.permission === 'denied') return 'запрещено';
    return 'не запрошено';
  })();
  const calendarDayPicker = useMemo(() => {
    const baseDate = calendarSelectedDate ? new Date(calendarSelectedDate) : new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return {
      year,
      month,
      selectedDay: baseDate.getDate(),
      options: Array.from({ length: daysInMonth }, (_, index) => index + 1)
    };
  }, [calendarSelectedDate]);
  const selectedNoteIndex = useMemo(
    () => visibleNotes.findIndex(note => note.id === selectedId),
    [visibleNotes, selectedId]
  );
  const activeSelectedNote = selectedNote || visibleNotes[0] || null;
  const activeSelectedIndex = activeSelectedNote ? visibleNotes.findIndex(note => note.id === activeSelectedNote.id) : -1;

  function setStatusVoice(text, voice = true) {
    setStatus(text);
    if (voice) speak(text, selectedVoiceURI, selectedVoiceStyle);
  }

  function openFolder(folderName, voice = true) {
    if (!folderName) return setStatusVoice('Не понял, какую папку открыть.', voice);
    setMobilePanel('folders');
    setSelectedFolder(folderName);
    setSelectedId(null);
    setQuery('');
    setSuggestedFolder('');
    setStatusVoice(`Открыта папка ${folderName}.`, voice);
  }

  function toggleFolderExpand(folderName) {
    setExpandedFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
  }

  function toggleNoteExpand(noteId) {
    setExpandedNotes(prev => ({ ...prev, [noteId]: !prev[noteId] }));
  }

  function deleteNoteNow(note) {
    if (!note) return;
    setData(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== note.id) }));
    setSelectedId(current => (current === note.id ? null : current));
    setStatusVoice(`Удалено: ${note.title}.`, false);
  }

  function clearFolderNow(folderName) {
    if (!folderName || folderName === 'Все') return setStatusVoice('Сначала выберите папку.', false);
    const count = data.notes.filter(n => n.folder === folderName).length;
    if (!count) return setStatusVoice(`В папке ${folderName} нет записей.`, false);
    setData(prev => ({ ...prev, notes: prev.notes.filter(n => n.folder !== folderName) }));
    setSelectedId(null);
    setSelectedFolder(folderName);
    setStatusVoice(`Папка ${folderName} очищена.`, false);
  }

  function deleteFolderNow(folderName) {
    if (!folderName || folderName === 'Все') return setStatusVoice('Не понял, какую папку удалить.', false);
    const exists = data.folders.some(folder => folder.name === folderName);
    if (!exists) return setStatusVoice(`Папка ${folderName} не найдена.`, false);
    setData(prev => ({
      folders: prev.folders.filter(folder => folder.name !== folderName),
      notes: prev.notes.filter(note => note.folder !== folderName)
    }));
    setExpandedFolders(prev => {
      const next = { ...prev };
      delete next[folderName];
      return next;
    });
    setSelectedId(null);
    setSelectedFolder('Все');
    setStatusVoice(`Папка ${folderName} удалена.`, false);
  }

  function deleteFolderIndexedNote(folderName, displayIndex) {
    if (!folderName) return setStatusVoice('Не понял, из какой папки удалить.', false);
    const ordered = [...data.notes]
      .filter(note => note.folder === folderName)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const target = ordered[(Number(displayIndex) || 0) - 1];
    if (!target) return setStatusVoice(`В папке ${folderName} нет записи с номером ${displayIndex}.`, false);
    deleteNoteNow(target);
  }

  function deleteVisibleIndexedNote(displayIndex) {
    const target = visibleNotes[(Number(displayIndex) || 0) - 1];
    if (!target) return setStatusVoice(`Не нашёл запись с номером ${displayIndex}.`, false);
    deleteNoteNow(target);
  }

  function applyCalendarReminderDefaults(note = null) {
    if (note?.time) setCalendarNoteTime(note.time);
  }

  function loadNoteIntoCalendar(note) {
    if (!note?.eventAt) return;
    setCalendarSelectedDate(new Date(note.eventAt).toISOString());
    setCalendarNoteText(note.content || '');
    setCalendarNoteTime(note.time || '09:00');
    applyCalendarReminderDefaults(note);
    setCalendarOpen(true);
    setSettingsOpen(false);
  }

  function updateNoteById(noteId, updater) {
    let updatedNote = null;
    setData(prev => ({
      ...prev,
      notes: prev.notes.map(note => {
        if (note.id !== noteId) return note;
        updatedNote = {
          ...updater(note),
          updatedAt: new Date().toISOString()
        };
        return updatedNote;
      })
    }));
    if (updatedNote) setSelectedId(updatedNote.id);
  }

  function openLatestForEdit() {
    const latest = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (!latest) return setStatusVoice('Пока нет записей для изменения.', false);
    openNote(latest);
    setStatusVoice(`Открыл для изменения: ${latest.title}.`, false);
  }

  function renameCurrentNote(nextTitle) {
    if (!selectedNote) return setStatusVoice('Сначала откройте запись.', false);
    if (!nextTitle) return setStatusVoice('Не понял новое название.', false);
    updateNoteById(selectedNote.id, note => ({ ...note, title: capitalize(nextTitle) }));
    setStatusVoice(`Переименовано в ${capitalize(nextTitle)}.`, false);
  }

  function moveCurrentNote(folderName) {
    if (!selectedNote) return setStatusVoice('Сначала откройте запись.', false);
    if (!folderName) return setStatusVoice('Не понял, в какую папку перенести.', false);
    setData(prev => ({
      folders: ensureFolder(prev.folders, folderName),
      notes: prev.notes.map(note => note.id === selectedNote.id ? { ...note, folder: folderName, updatedAt: new Date().toISOString() } : note)
    }));
    setSelectedFolder(folderName);
    setStatusVoice(`Перенёс в папку ${folderName}.`, false);
  }

  function appendToCurrentNote(content) {
    if (!selectedNote) return setStatusVoice('Сначала откройте запись.', false);
    const addition = String(content || '').trim();
    if (!addition) return setStatusVoice('Не понял, что добавить.', false);
    if (selectedNote.type === 'shopping_list') {
      const items = extractShoppingAppendItems(addition);
      return appendToLatestShoppingList(selectedNote.folder, items, addition, true);
    }
    updateNoteById(selectedNote.id, note => ({
      ...note,
      content: [note.content, addition].filter(Boolean).join('. '),
      tags: [...new Set([...(note.tags || []), ...normalize(addition).split(' ').filter(w => w.length > 3).slice(0, 10)])]
    }));
    setStatusVoice('Добавил в текущую запись.', false);
  }

  function removeFromCurrentShoppingList(itemText) {
    if (!selectedNote) return setStatusVoice('Сначала откройте запись.', false);
    if (selectedNote.type !== 'shopping_list') return setStatusVoice('Сейчас открыта не shopping-запись.', false);
    const target = normalize(itemText);
    const nextItems = (selectedNote.items || []).filter(item => !normalize(item).includes(target));
    if (nextItems.length === (selectedNote.items || []).length) return setStatusVoice('Не нашёл такой пункт в списке.', false);
    updateNoteById(selectedNote.id, note => ({
      ...note,
      items: nextItems,
      content: nextItems.join(', '),
      title: note.title && note.title !== 'Покупки' ? note.title : deriveShoppingListTitle(nextItems, nextItems.join(', '))
    }));
    setStatusVoice('Пункт удалён из списка.', false);
  }

  function clearNotebookNow() {
    if (!data.notes.length) return setStatusVoice('Блокнот уже пуст.', false);
    setData(prev => ({ ...prev, notes: [] }));
    setSelectedId(null);
    setSelectedFolder('Все');
    setStatusVoice('Блокнот очищен.', false);
  }

  async function syncServerRemindersBestEffort(notes, settings) {
    const viaWorker = await syncServerPushReminderScheduleInServiceWorker(notes, settings).catch(() => ({ ok: false }));
    if (viaWorker?.ok) return viaWorker;
    return syncServerPushReminderSchedule(notes, settings).catch(() => ({ ok: false }));
  }

  function saveNote(note, showAfterSave = false) {
    const dedupeWindowMs = 20000;
    const incomingSignature = noteSignature(note);
    if (
      lastSavedRef.current.signature === incomingSignature &&
      Date.now() - lastSavedRef.current.at < dedupeWindowMs
    ) {
      setStatusVoice(`Повторная запись ${note.title} пропущена.`, false);
      return false;
    }

    let duplicateDetected = false;
    let duplicateNote = null;
    setData(prev => {
      if (note.type === 'appointment') {
        return {
          ...prev,
          folders: ensureFolder(prev.folders, note.folder),
          notes: [note, ...prev.notes]
        };
      }
      const nowTs = Date.now();
      duplicateNote = prev.notes.find(existing => {
        const createdAt = new Date(existing.createdAt || existing.updatedAt || nowTs).getTime();
        return nowTs - createdAt < dedupeWindowMs && isSameOrNearDuplicate(existing, note);
      });
      if (duplicateNote) {
        duplicateDetected = true;
        return prev;
      }
      return {
        ...prev,
        folders: ensureFolder(prev.folders, note.folder),
        notes: [note, ...prev.notes]
      };
    });
    if (duplicateDetected) {
      if (duplicateNote?.id) setSelectedId(duplicateNote.id);
      setSelectedFolder(duplicateNote?.folder || note.folder);
      setSuggestedFolder('');
      lastSavedRef.current = { signature: incomingSignature, at: Date.now() };
      setStatusVoice(`Такая запись уже есть в папке ${duplicateNote?.folder || note.folder}.`, false);
      return false;
    }
    lastSavedRef.current = { signature: incomingSignature, at: Date.now() };
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    if (showAfterSave) setMobilePanel('notes');
    setSuggestedFolder('');
    setStatusVoice(showAfterSave ? `Сохранено и показано: ${note.title}.` : `Сохранено в папку ${note.folder}.`);
    ensureReminderReady(note);
    return true;
  }

  function changeSelectedReminderTime(targetNote = selectedNote) {
    if (!targetNote) {
      setStatusVoice('Сначала откройте запись.', false);
      return;
    }
    if (targetNote.type !== 'appointment') {
      setStatusVoice('У выбранной записи нет времени встречи.', false);
      return;
    }
    const raw = window.prompt('Новое время (например 18:30 или в 6 вечера):', targetNote.time || '18:00');
    if (!raw) return;
    const parsedTime = parseVoiceAppointmentDateTime(raw).time || parseAppointmentDateTime(raw).time || '';
    const fallback = String(raw).trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    const nextTime = parsedTime || (fallback ? `${String(Number(fallback[1])).padStart(2, '0')}:${fallback[2]}` : '');
    if (!nextTime) {
      setStatusVoice('Не понял время. Пример: 18:30 или в 6 вечера.', false);
      return;
    }

    updateNoteById(targetNote.id, note => {
      const base = note.eventAt ? new Date(note.eventAt) : new Date();
      const [hour, minute] = nextTime.split(':').map(Number);
      base.setHours(hour || 0, minute || 0, 0, 0);
      return {
        ...note,
        time: nextTime,
        eventAt: base.toISOString(),
        reminderMorningTime: nextTime,
        reminderExplicitAt: base.toISOString()
      };
    });
    setStatusVoice(`Время уведомления обновлено: ${nextTime}.`, false);
  }

  function ensureReminderReady(note) {
    if (!note || note.type !== 'appointment' || !note.eventAt) return;
    if (!isNotificationSupported()) return;
    const syncSavedReminder = () => {
      const nextSettings = { ...reminderSettings, enabled: true };
      const notesForSync = [note, ...data.notes.filter(existing => existing.id !== note.id)];
      syncServiceWorkerReminderSchedule(notesForSync, nextSettings).then(ok => {
        if (ok) {
          setLastReminderSyncAt(new Date().toISOString());
        } else {
          setStatusVoice('Запись сохранена. Телефон пока не подтвердил локальную память напоминания.', false);
        }
      });
      queueServerPushReminderSchedule(notesForSync, nextSettings);
      registerReminderRecoverySync();
      if (isMobileBrowserTabMode()) {
        setStatusVoice('Для стабильных фоновых уведомлений на телефоне откройте блокнот с главного экрана, не из вкладки браузера.', false);
      }
    };
    if (Notification.permission === 'granted') {
      setReminderSettings(prev => (prev.enabled ? prev : { ...prev, enabled: true }));
      syncSavedReminder();
      return;
    }
    if (Notification.permission !== 'default') return;
    requestNotificationPermission().then(result => {
      if (result === 'granted') {
        setReminderSettings(prev => ({ ...prev, enabled: true }));
        syncSavedReminder();
        setStatusVoice(`Уведомления включены для записи ${note.title}.`, false);
      } else {
        setStatusVoice('Чтобы напоминание пришло на телефон, разрешите уведомления в браузере.', false);
      }
    }).catch(() => {});
  }

function findLatestCompatibleShoppingList(folderName, items) {
    const lists = [...data.notes]
      .filter(note => note.folder === folderName && (note.type === 'shopping_list' || note.type === 'appointment'))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return lists.find(note => {
      if (note.type === 'shopping_list') return shouldAppendShoppingList(items, note);
      const appointmentItems = Array.isArray(note.items) && note.items.length
        ? note.items
        : extractItems(note.content || '');
      return shouldAppendShoppingList(items, { ...note, type: 'shopping_list', items: appointmentItems });
    }) || null;
  }

  function appendToLatestShoppingList(folderName, items, rawText = '', forceLatest = false) {
    if (!folderName || !items?.length) return false;
    const latestByFolder = name => [...data.notes]
      .filter(note => note.folder === name && (note.type === 'shopping_list' || note.type === 'appointment'))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

    const latestList = forceLatest
      ? (latestByFolder(folderName) || (folderName !== 'Покупки' ? latestByFolder('Покупки') : null))
      : (findLatestCompatibleShoppingList(folderName, items) || (folderName !== 'Покупки' ? findLatestCompatibleShoppingList('Покупки', items) : null));
    if (!latestList) return false;

    const latestItems = Array.isArray(latestList.items) && latestList.items.length
      ? latestList.items
      : extractItems(latestList.content || '');
    const mergedItems = [...new Set([...(latestItems || []), ...items].map(item => String(item || '').trim()).filter(Boolean))];
    const mergedContent = sanitizeShoppingContent(mergedItems.join(', '));
    const mergedTitle = latestList.title && latestList.title !== 'Покупки'
      ? latestList.title
      : deriveShoppingListTitle(mergedItems, rawText || mergedItems.join(', '));

    setData(prev => ({
      ...prev,
      notes: prev.notes.map(note => note.id === latestList.id
        ? {
          ...note,
          title: mergedTitle,
          items: mergedItems,
          content: mergedContent,
          updatedAt: new Date().toISOString(),
          tags: [...new Set(['покупки', 'магазин', ...mergedItems])]
        }
        : note)
    }));
    setSelectedId(latestList.id);
    setSelectedFolder(latestList.folder || folderName);
    setSuggestedFolder('');
    setStatusVoice(`Добавлено в список ${mergedTitle}.`, false);
    return true;
  }

  function openNote(note) {
    setMobilePanel('notes');
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    if (note.type === 'appointment' && note.eventAt) loadNoteIntoCalendar(note);
    setStatusVoice(`Открыта запись: ${note.title}.`, false);
  }

  function performSearch(text) {
    setMobilePanel('notes');
    const results = searchNotes(data.notes, text);
    setQuery(text);
    setSelectedFolder('Все');
    if (!results.length) {
      setStatusVoice('Ничего не найдено.');
      return;
    }
    setSelectedId(results[0].id);
    setStatusVoice(`Нашёл ${results.length}. Показываю: ${results[0].title}.`);
  }

  function showLatest(text = '') {
    const source = normalize(text);
    let notes = [...data.notes];
    if (source.includes('иде')) notes = notes.filter(n => n.type === 'idea');
    if (source.includes('покуп')) notes = notes.filter(n => n.type === 'shopping_list');
    if (source.includes('номер') || source.includes('телефон') || source.includes('контакт')) notes = notes.filter(n => n.type === 'contact');
    if (source.includes('код') || source.includes('комбинац')) notes = notes.filter(n => n.type === 'code');
    if (source.includes('встреч') || source.includes('стриж') || source.includes('запис')) notes = notes.filter(n => n.type === 'appointment');
    const latest = notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (!latest) return setStatusVoice('Пока нет подходящих записей.');
    setSelectedId(latest.id);
    setSelectedFolder(latest.folder);
    setQuery('');
    setStatusVoice(`Показываю последнюю запись: ${latest.title}.`);
  }

  function showPeriod(period) {
    setHistoryFilter(period);
    setQuickDateFilter('');
    setSelectedFolder('Все');
    setQuery('');
    setSelectedId(null);
    const labels = { today: 'сегодня', yesterday: 'вчера', week: 'за неделю', all: 'все записи' };
    setStatusVoice(`Показываю записи ${labels[period] || 'за период'}.`, false);
  }

  function showQuickDate(isoDay) {
    setHistoryFilter('all');
    setQuickDateFilter(current => current === isoDay ? '' : isoDay);
    setSelectedFolder('Все');
    setQuery('');
    setSelectedId(null);
  }

  function selectCalendarDate(date, options = {}) {
    if (!date) return;
    const { clearContext = false, openDayPanel = false } = options;
    const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
    setCalendarSelectedDate(iso);
    applyCalendarReminderDefaults();
    if (openDayPanel) setCalendarDayPanelOpen(true);
    setCalendarDayFilter('');
    if (clearContext) {
      setSelectedId(null);
      setCalendarNoteText('');
    }
    setStatusVoice(`Выбрана дата ${formatCalendarDateLabel(date)}.`, false);
  }

  function selectCalendarDayFromPicker(dayValue) {
    const day = Number(dayValue);
    if (!day) return;
    const date = new Date(calendarDayPicker.year, calendarDayPicker.month, day, 12, 0, 0, 0);
    selectCalendarDate(date, { clearContext: true });
  }

  function notesForCalendarDate(dateIso) {
    return notesForCalendarDateByDate(data.notes, dateIso);
  }

  function findCalendarContextNote(dateIso = calendarSelectedDate) {
    return findCalendarContextNoteByDate(data.notes, selectedNote, dateIso);
  }

  function updateCalendarAppointmentNote(noteId, content, timeValue, reminderPlan = {}, dateIso) {
    const selectedDate = new Date(dateIso);
    const [hour, minute] = String(timeValue || '09:00').split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);
    const appointmentMeta = extractAppointmentMeta(content);
    const folder = resolveFolderName(content, 'appointment');
    const firstEnabled = Boolean(reminderPlan.firstEnabled ?? reminderSettings.enabled);
    const secondEnabled = Boolean(reminderPlan.secondEnabled ?? reminderSettings.secondReminderEnabled);
    const secondTime = secondEnabled ? (reminderPlan.secondTime || reminderSettings.secondReminderTime || '20:00') : '';
    updateNoteById(noteId, note => ({
      ...note,
      folder,
      title: buildCalendarReminderTitle(content),
      content,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: timeValue,
      eventAt: selectedDate.toISOString(),
      reminderFirstEnabled: firstEnabled,
      reminderMorningTime: reminderPlan.morningTime || timeValue,
      reminderExplicitAt: selectedDate.toISOString(),
      reminderUseMorningTime: Boolean(reminderPlan.useMorningTime ?? false),
      reminderOffsetType: reminderPlan.offsetType || reminderSettings.defaultReminderOffset || '1h',
      reminderCustomOffsetMinutes: Number(reminderPlan.customOffsetMinutes || reminderSettings.customReminderOffsetMinutes || 60),
      reminderSecondTime: secondTime,
      reminderSecondEnabled: secondEnabled,
      actionLabel: appointmentMeta.action || '',
      placeLabel: appointmentMeta.place || '',
      codeLabel: appointmentMeta.code || '',
      tags: ['встреча', formatCalendarDateLabel(selectedDate), timeValue].filter(Boolean),
      updatedAt: new Date().toISOString()
    }));
    setCalendarNoteText(content);
    setCalendarNoteTime(timeValue);
  }

  function toggleCalendarDayPanelForDate(date) {
    if (!date) return;
    const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
    setCalendarSelectedDate(iso);
    setCalendarDayFilter('');
    setCalendarDayPanelOpen(prev => (String(calendarSelectedDate).slice(0, 10) === iso.slice(0, 10) ? !prev : true));
  }

  function completeCalendarDayNote(note) {
    if (!note) return;
    const now = new Date().toISOString();
    setData(prev => ({
      folders: ensureFolder(prev.folders, 'Выполнено'),
      notes: prev.notes.map(item => (item.id === note.id ? {
        ...item,
        type: 'note',
        status: 'done',
        folder: 'Выполнено',
        completedAt: now,
        updatedAt: now,
        eventAt: '',
        dateLabel: '',
        time: ''
      } : item))
    }));
    if (selectedId === note.id) setSelectedId(null);
    setStatusVoice(`Выполнено: ${note.title}.`, false);
  }

  function postponeCalendarDayNoteToTomorrow(note) {
    if (!note?.eventAt) return;
    const base = new Date(note.eventAt);
    if (Number.isNaN(base.getTime())) return;
    base.setDate(base.getDate() + 1);
    updateNoteById(note.id, item => ({
      ...item,
      dateLabel: formatCalendarDateLabel(base),
      eventAt: base.toISOString()
    }));
    selectCalendarDate(base, { openDayPanel: true });
    setStatusVoice(`Перенесено на завтра: ${note.title}.`, false);
  }

  function saveCalendarNote() {
    if (!calendarSelectedDate) return setStatusVoice('Сначала выберите дату в календаре.', false);
    const content = String(calendarNoteText || '').trim();
    if (!content) return setStatusVoice('Введите заметку для выбранной даты.', false);
    const selectedDate = new Date(calendarSelectedDate);
    const parsedEvent = parseVoiceAppointmentDateTime(content);
    const noteTime = parsedEvent.time || String(calendarNoteTime || '09:00');
    const [hour, minute] = noteTime.split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);
    const type = inferType(content);
    const isShoppingText = type === 'shopping_list';
    const normalizedEntryContent = isShoppingText ? normalizeTimedShoppingContent(content) : content;
    const folder = resolveFolderName(content, type === 'note' ? 'appointment' : type);
    const appointmentMeta = extractAppointmentMeta(content);
    const dayItems = notesForCalendarDate(calendarSelectedDate);
    const normalizedContent = normalizeCalendarReminderText(normalizedEntryContent);
    const sameDayExisting = isShoppingText
      ? dayItems.find(item => normalizeCalendarReminderText(item.content || '') === normalizedContent)
        || dayItems.find(item => String(item.time || '') === noteTime && normalize(item.title || '') === normalize('Еда'))
        || dayItems.find(item => normalize(item.title || '') === normalize('Еда'))
      : null;
    if (isShoppingText && sameDayExisting) {
      updateCalendarAppointmentNote(
        sameDayExisting.id,
        normalizedEntryContent,
        noteTime,
        {
          firstEnabled: Boolean(reminderSettings.enabled),
          morningTime: noteTime,
          secondEnabled: Boolean(reminderSettings.secondReminderEnabled),
          secondTime: reminderSettings.secondReminderTime || '20:00'
        },
        calendarSelectedDate
      );
      setCalendarDayPanelOpen(true);
      setCalendarDayFilter('');
      setCalendarNoteTime(noteTime);
      setStatusVoice(`Обновил запись на ${formatCalendarDateLabel(selectedDate)}.`, false);
      return;
    }

    const note = buildAppointmentNote({
      uid,
      selectedDate,
      folder,
      title: isShoppingText ? deriveShoppingListTitle(extractItems(normalizedEntryContent), normalizedEntryContent) : buildCalendarReminderTitle(normalizedEntryContent),
      content: normalizedEntryContent,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: noteTime,
      appointmentMeta,
      reminderFirstEnabled: Boolean(reminderSettings.enabled),
      reminderMorningTime: noteTime,
      reminderExplicitAt: selectedDate.toISOString(),
      reminderUseMorningTime: !parsedEvent.time && normalize(normalizedEntryContent).includes('утром'),
      reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
      reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
      reminderSecondEnabled: Boolean(reminderSettings.secondReminderEnabled),
      reminderSecondTime: reminderSettings.secondReminderEnabled ? (reminderSettings.secondReminderTime || '20:00') : ''
    });
    setCalendarNoteTime(noteTime);
    const saved = saveNote(note, true);
    if (saved) setCalendarNoteText('');
  }

  function saveCalendarNoteFromCommand(text, preferredFolder = '') {
    if (!calendarSelectedDate) return false;
    const raw = String(text || '').trim();
    if (!raw) return false;
    const content = raw.replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '').trim() || raw;
    const selectedDate = new Date(calendarSelectedDate);
    const parsedEvent = parseVoiceAppointmentDateTime(raw);
    const noteTime = parsedEvent.time || String(calendarNoteTime || '09:00');
    const isShoppingText = inferType(content) === 'shopping_list';
    const normalizedEntryContent = isShoppingText ? normalizeTimedShoppingContent(content) : content;
    const normalizedContent = normalizeCalendarReminderText(normalizedEntryContent);
    const [hour, minute] = noteTime.split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);

    const folder = resolveSaveFolder(content, 'appointment', preferredFolder);
    const appointmentMeta = extractAppointmentMeta(content);
    const dayItems = notesForCalendarDate(calendarSelectedDate);
    const sameDayExisting = isShoppingText
      ? dayItems.find(item => normalizeCalendarReminderText(item.content || '') === normalizedContent)
        || dayItems.find(item => String(item.time || '') === noteTime && normalize(item.title || '') === normalize('Еда'))
        || dayItems.find(item => normalize(item.title || '') === normalize('Еда'))
      : null;
    if (isShoppingText && sameDayExisting) {
      updateCalendarAppointmentNote(
        sameDayExisting.id,
        normalizedEntryContent,
        noteTime,
        {
          firstEnabled: Boolean(reminderSettings.enabled),
          morningTime: noteTime,
          secondEnabled: Boolean(reminderSettings.secondReminderEnabled),
          secondTime: reminderSettings.secondReminderTime || '20:00'
        },
        calendarSelectedDate
      );
      setCalendarDayPanelOpen(true);
      setCalendarDayFilter('');
      setCalendarNoteTime(noteTime);
      setStatusVoice(`Обновил запись на ${formatCalendarDateLabel(selectedDate)}.`, false);
      return true;
    }

    const note = buildAppointmentNote({
      uid,
      selectedDate,
      folder,
      title: isShoppingText ? deriveShoppingListTitle(extractItems(normalizedEntryContent), normalizedEntryContent) : buildCalendarReminderTitle(normalizedEntryContent),
      content: normalizedEntryContent,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: noteTime,
      appointmentMeta,
      reminderFirstEnabled: Boolean(reminderSettings.enabled),
      reminderMorningTime: noteTime,
      reminderExplicitAt: selectedDate.toISOString(),
      reminderUseMorningTime: !parsedEvent.time && normalize(normalizedEntryContent).includes('утром'),
      reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
      reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
      reminderSecondEnabled: Boolean(reminderSettings.secondReminderEnabled),
      reminderSecondTime: reminderSettings.secondReminderEnabled ? (reminderSettings.secondReminderTime || '20:00') : ''
    });
    setCalendarDayPanelOpen(true);
    setCalendarDayFilter('');
    setCalendarNoteTime(noteTime);
    const saved = saveNote(note, true);
    if (saved) setCalendarNoteText('');
    return saved;
  }

  function handleCalendarVoiceCommand(text) {
    const targetDate = parseVoiceCalendarTargetDate(text);
    if (!targetDate) return false;
    setCalendarOpen(true);
    setSettingsOpen(false);
    selectCalendarDate(targetDate);

    const sameDayNotes = notesForCalendarDate(targetDate.toISOString());
    if (sameDayNotes[0]) {
      setSelectedId(sameDayNotes[0].id);
      setSelectedFolder(sameDayNotes[0].folder);
      loadNoteIntoCalendar(sameDayNotes[0]);
    }

    const source = normalize(text);
    const wantsSave =
      includesAny(source, ['запиши', 'запомни', 'сохрани', 'оставь напоминание', 'установи уведомление', 'сделай уведомление']) ||
      inferType(text) === 'appointment' ||
      includesAny(source, ['мне ', 'стриж', 'врач', 'встреч', 'прием', 'приём']);
    if (!wantsSave) {
      if (sameDayNotes[0]) setStatusVoice(`Открыта дата ${formatCalendarDateLabel(targetDate)}. Найдено записей: ${sameDayNotes.length}.`, false);
      return true;
    }

    const content = stripVoiceCalendarVoiceContent(text);
    const isShoppingText = inferType(content) === 'shopping_list';
    const normalizedEntryContent = isShoppingText ? normalizeTimedShoppingContent(content) : content;

    const allTimes = extractVoiceAllTimes(text);
    const noteTime = allTimes[0] || sameDayNotes[0]?.time || calendarNoteTime || '09:00';

    const selectedDate = new Date(targetDate);
    const [hour, minute] = String(noteTime).split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);
    const appointmentMeta = extractAppointmentMeta(normalizedEntryContent);
    const folder = resolveFolderName(normalizedEntryContent, 'appointment');
    const note = buildAppointmentNote({
      uid,
      selectedDate,
      folder,
      title: isShoppingText ? deriveShoppingListTitle(extractItems(normalizedEntryContent), normalizedEntryContent) : buildCalendarReminderTitle(normalizedEntryContent),
      content: normalizedEntryContent,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: noteTime,
      appointmentMeta,
      reminderFirstEnabled: Boolean(reminderSettings.enabled),
      reminderMorningTime: noteTime,
      reminderExplicitAt: selectedDate.toISOString(),
      reminderUseMorningTime: !allTimes[0] && normalize(normalizedEntryContent).includes('утром'),
      reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
      reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
      reminderSecondEnabled: Boolean(reminderSettings.secondReminderEnabled),
      reminderSecondTime: reminderSettings.secondReminderEnabled ? (reminderSettings.secondReminderTime || '20:00') : ''
    });
    setCalendarSelectedDate(new Date(targetDate).toISOString());
    setCalendarNoteTime(noteTime);

    if (!normalizedEntryContent) {
      if (sameDayNotes[0]) {
        updateNoteById(sameDayNotes[0].id, note => ({
          ...note,
          reminderFirstEnabled: Boolean(reminderSettings.enabled),
          reminderMorningTime: note.time || noteTime,
          reminderExplicitAt: selectedDate.toISOString(),
          reminderUseMorningTime: !allTimes[0] && normalize(text).includes('утром'),
          reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
          reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
          reminderSecondTime: reminderSettings.secondReminderEnabled ? (reminderSettings.secondReminderTime || '20:00') : '',
          reminderSecondEnabled: Boolean(reminderSettings.secondReminderEnabled),
          time: note.time || noteTime
        }));
        setStatusVoice(`Для ${formatCalendarDateLabel(selectedDate)} установлено уведомление на ${voiceTimeToLabel(noteTime)}.`, false);
      } else {
        setStatusVoice(`Дата ${formatCalendarDateLabel(selectedDate)} открыта. Уведомление будет на ${voiceTimeToLabel(noteTime)}.`, false);
      }
      return true;
    }

    const wantsUpdateExisting = includesAny(source, ['измени', 'обнови', 'поменяй', 'исправь']);
    if (wantsUpdateExisting && sameDayNotes[0]) {
      updateCalendarAppointmentNote(sameDayNotes[0].id, normalizedEntryContent, noteTime, {
        firstEnabled: Boolean(reminderSettings.enabled),
        morningTime: noteTime,
        secondTime: '',
        secondEnabled: false
      }, targetDate.toISOString());
      setStatusVoice(`Запись на ${formatCalendarDateLabel(selectedDate)} обновлена. Уведомление на ${voiceTimeToLabel(noteTime)}.`, false);
      return true;
    }

    setCalendarNoteText('');
    const saved = saveNote(note, true);
    if (saved) {
      setStatusVoice(`Сохранено на ${formatCalendarDateLabel(selectedDate)}. Уведомление на ${voiceTimeToLabel(noteTime)}.`, false);
    }
    return true;
  }

  function handleReminderVoiceCommand(text) {
    const source = normalize(text);
    if (!includesAny(source, ['напоминан', 'уведомлен'])) return false;
    if (parseVoiceCalendarTargetDate(text) && (inferType(text) === 'appointment' || includesAny(source, ['запиши', 'запомни', 'сохрани', 'мне ']))) {
      return false;
    }
    const contextNote = selectedNote?.type === 'appointment' ? selectedNote : findCalendarContextNote(calendarSelectedDate);
    const targetNote = contextNote?.type === 'appointment' ? contextNote : null;
    const reminderPlan = parseVoiceReminderVoiceSettings(text, {
      noteTime: targetNote?.time || calendarNoteTime || '09:00',
      morningTime: targetNote?.reminderMorningTime || reminderSettings.morningReminderTime || '09:00',
      firstEnabled: reminderSettings.enabled,
      secondTime: reminderSettings.secondReminderTime || '20:00',
      secondEnabled: reminderSettings.secondReminderEnabled ?? false
    });
    const reminderTime = reminderPlan.noteTime || reminderPlan.morningTime || targetNote?.time || calendarNoteTime || '09:00';

    setCalendarNoteTime(reminderTime);

    if (targetNote) {
      const targetEventAt = targetNote.eventAt ? new Date(targetNote.eventAt) : null;
      const explicitReminderAt = targetEventAt && !Number.isNaN(targetEventAt.getTime())
        ? (() => {
            const at = new Date(targetEventAt);
            const [hour, minute] = String(reminderTime).split(':').map(Number);
            at.setHours(hour || 0, minute || 0, 0, 0);
            return at.toISOString();
          })()
        : '';
      updateNoteById(targetNote.id, note => ({
        ...note,
        reminderFirstEnabled: Boolean(reminderSettings.enabled),
        reminderMorningTime: reminderTime,
        reminderExplicitAt: explicitReminderAt,
        reminderUseMorningTime: !reminderPlan.noteTime && normalize(text).includes('утром'),
        reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
        reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
        reminderSecondTime: reminderPlan.secondEnabled ? (reminderPlan.secondTime || note.reminderSecondTime || reminderSettings.secondReminderTime || '20:00') : '',
        reminderSecondEnabled: Boolean(reminderPlan.secondEnabled)
      }));
      setCalendarOpen(true);
      setSettingsOpen(false);
      setStatusVoice(`Уведомление обновлено: ${voiceTimeToLabel(reminderTime)}.`, false);
      return true;
    }

    if (calendarSelectedDate) {
      const contextNoteForDate = findCalendarContextNote(calendarSelectedDate);
      if (contextNoteForDate?.type === 'appointment') {
        const selectedDate = new Date(calendarSelectedDate);
        const [hour, minute] = String(reminderTime).split(':').map(Number);
        selectedDate.setHours(hour || 0, minute || 0, 0, 0);
        updateNoteById(contextNoteForDate.id, note => ({
          ...note,
          time: reminderTime,
          eventAt: selectedDate.toISOString(),
          reminderFirstEnabled: Boolean(reminderSettings.enabled),
          reminderMorningTime: reminderTime,
          reminderExplicitAt: selectedDate.toISOString(),
          reminderUseMorningTime: !reminderPlan.noteTime && normalize(text).includes('утром'),
          reminderOffsetType: reminderSettings.defaultReminderOffset || '1h',
          reminderCustomOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60),
          reminderSecondTime: reminderPlan.secondEnabled ? (reminderPlan.secondTime || reminderSettings.secondReminderTime || '20:00') : '',
          reminderSecondEnabled: Boolean(reminderPlan.secondEnabled),
          updatedAt: new Date().toISOString()
        }));
      }
      setCalendarOpen(true);
      setSettingsOpen(false);
      setStatusVoice(`Для выбранной даты установлено уведомление: ${voiceTimeToLabel(reminderTime)}.`, false);
      return true;
    }

    const touchesSecondReminder = includesAny(source, ['второе напоминание', '2-е напоминание', 'второй уведомление', 'без второго напоминания', 'отключи второе напоминание', 'убери второе напоминание']);
    setReminderSettings(prev => ({
      ...prev,
      morningReminderTime: normalize(text).includes('утром') ? reminderTime : prev.morningReminderTime,
      secondReminderTime: reminderPlan.secondEnabled && reminderPlan.secondTime ? reminderPlan.secondTime : prev.secondReminderTime,
      secondReminderEnabled: touchesSecondReminder ? Boolean(reminderPlan.secondEnabled) : prev.secondReminderEnabled
    }));
    setStatusVoice(`Настройки уведомлений обновлены: ${voiceTimeToLabel(reminderTime)}.`, false);
    return true;
  }

  function handleCalendarContextVoiceCommand(text) {
    if (!calendarSelectedDate) return false;
    const source = normalize(text);
    const hasContextMarker = includesAny(source, ['сюда', 'туда', 'на эту дату', 'на выбранную дату', 'в этот день', 'в этот календарь']);
    const wantsWrite = includesAny(source, ['запиши', 'запомни', 'сохрани', 'добавь', 'измени', 'обнови', 'поменяй', 'исправь']);
    if (!hasContextMarker || !wantsWrite) return false;

    const content = stripVoiceCalendarVoiceContent(text)
      .replace(/\b(сюда|туда|на эту дату|на выбранную дату|в этот день|в этот календарь)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!content) return false;

    const existingNote = findCalendarContextNote(calendarSelectedDate);
    const wantsUpdate = includesAny(source, ['измени', 'обнови', 'поменяй', 'исправь']);

    const reminderDefaults = {
      morningTime: reminderSettings.morningReminderTime || '09:00',
      firstEnabled: Boolean(reminderSettings.enabled),
      secondTime: reminderSettings.secondReminderTime || '20:00',
      secondEnabled: Boolean(reminderSettings.secondReminderEnabled),
      offsetType: reminderSettings.defaultReminderOffset || '1h',
      customOffsetMinutes: Number(reminderSettings.customReminderOffsetMinutes || 60)
    };

    const selectedDate = new Date(calendarSelectedDate);
    const [hour, minute] = String(calendarNoteTime || '09:00').split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);
    if (wantsUpdate && existingNote) {
      updateCalendarAppointmentNote(existingNote.id, content, String(calendarNoteTime || '09:00'), reminderDefaults, calendarSelectedDate);
      setStatusVoice(`Обновил запись на ${formatCalendarDateLabel(selectedDate)}.`, false);
      return true;
    }
    const type = inferType(content);
    const folder = resolveFolderName(content, type === 'note' ? 'appointment' : type);
    const appointmentMeta = extractAppointmentMeta(content);
    const note = buildAppointmentNote({
      uid,
      selectedDate,
      folder,
      title: cleanTitle(content, 'Напоминание'),
      content,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: String(calendarNoteTime || '09:00'),
      appointmentMeta,
      reminderFirstEnabled: reminderDefaults.firstEnabled,
      reminderMorningTime: String(calendarNoteTime || '09:00'),
      reminderExplicitAt: selectedDate.toISOString(),
      reminderUseMorningTime: false,
      reminderOffsetType: reminderDefaults.offsetType,
      reminderCustomOffsetMinutes: reminderDefaults.customOffsetMinutes,
      reminderSecondEnabled: reminderDefaults.secondEnabled,
      reminderSecondTime: reminderDefaults.secondTime
    });
    const saved = saveNote(note, true);
    if (saved) {
      setCalendarNoteText('');
      setStatusVoice(`Добавил запись на ${formatCalendarDateLabel(selectedDate)}.`, false);
    }
    return true;
  }

  async function enableNotifications() {
    if (!isNotificationSupported()) {
      setStatusVoice('Этот браузер не поддерживает уведомления.', false);
      return;
    }
    const result = await requestNotificationPermission();
    if (result === 'granted') {
      await showServiceWorkerTestNotification();
      await registerReminderRecoverySync();
      if (isMobileBrowserTabMode()) {
        setStatusVoice('Уведомления разрешены. Для стабильного фона на телефоне используйте версию с главного экрана.', false);
        return;
      }
      setStatusVoice('Уведомления разрешены. Проверка отправлена в шторку.', false);
    } else {
      setStatusVoice('Разрешение на уведомления не выдано.', false);
    }
  }

  async function toggleRemindersEnabled(nextValue) {
    const result = await enableReminderNotifications(nextValue);
    if (result.status === 'unsupported') {
      setStatusVoice('Этот браузер не поддерживает уведомления.', false);
      return;
    }
    setReminderSettings(prev => ({ ...prev, enabled: Boolean(result.enabled) }));
    if (result.status === 'disabled') {
      const ok = await syncServiceWorkerReminderSchedule([], { ...reminderSettings, enabled: false });
      if (ok) setLastReminderSyncAt(new Date().toISOString());
      await syncServerRemindersBestEffort([], { ...reminderSettings, enabled: false });
      await registerReminderRecoverySync();
      return setStatusVoice('Напоминания выключены.', false);
    }
    if (result.status !== 'granted') return setStatusVoice('Разрешение на уведомления не выдано.', false);
    await showServiceWorkerTestNotification();
    const ok = await syncServiceWorkerReminderSchedule(data.notes, { ...reminderSettings, enabled: true });
    if (ok) setLastReminderSyncAt(new Date().toISOString());
    await syncServerRemindersBestEffort(data.notes, { ...reminderSettings, enabled: true });
    await registerReminderRecoverySync();
    if (isMobileBrowserTabMode()) {
      setStatusVoice('Напоминания включены. Для стабильной фоновой доставки на телефоне используйте запуск с главного экрана.', false);
      return;
    }
    setStatusVoice('Напоминания включены локально.', false);
  }

  async function shareNote(note) {
    const text = shareText(note);
    if (navigator.share) {
      try { await navigator.share({ title: note.title, text }); } catch {}
    } else {
      await navigator.clipboard?.writeText(text);
      setStatusVoice('Текст скопирован. Можно вставить в сообщение.');
    }
  }

  function copyNote(note) {
    navigator.clipboard?.writeText(shareText(note));
    setStatusVoice('Скопировано.');
  }

  function editNoteNow(note) {
    if (!note) return;
    const initial = note.type === 'shopping_list'
      ? (note.items || []).join(', ')
      : (note.content || note.title || '');
    const raw = window.prompt('Измените текст записи:', initial);
    if (raw == null) return;
    const nextText = String(raw).trim();
    if (!nextText) return setStatusVoice('Пустой текст не сохранён.', false);

    updateNoteById(note.id, current => {
      if (current.type === 'shopping_list') {
        const items = extractItems(nextText);
        return {
          ...current,
          content: items.join(', '),
          items,
          title: current.title || 'Список покупок'
        };
      }
      if (current.type === 'appointment') {
        const parsed = parseVoiceAppointmentDateTime(nextText);
        const cleanText = sanitizeAppointmentContent(nextText) || nextText;
        const nextTime = parsed.time || current.time || '09:00';
        const eventBase = parsed.eventAt
          ? new Date(parsed.eventAt)
          : (current.eventAt ? new Date(current.eventAt) : null);
        const eventAt = eventBase && !Number.isNaN(eventBase.getTime())
          ? (() => {
              const [h, m] = String(nextTime).split(':').map(Number);
              eventBase.setHours(h || 0, m || 0, 0, 0);
              return eventBase.toISOString();
            })()
          : current.eventAt;
        return {
          ...current,
          title: cleanTitle(cleanText, current.title || 'Встреча'),
          content: cleanText,
          dateLabel: parsed.dateLabel || current.dateLabel || '',
          time: nextTime,
          eventAt: eventAt || '',
          reminderMorningTime: nextTime,
          reminderExplicitAt: eventAt || ''
        };
      }
      if (current.type === 'contact') {
        return {
          ...current,
          content: nextText,
          description: nextText,
          title: current.name ? `${current.name} — ${nextText}` : cleanTitle(nextText, current.title || 'Контакт')
        };
      }
      return {
        ...current,
        content: nextText,
        title: cleanTitle(nextText, current.title || 'Запись')
      };
    });
    setStatusVoice('Запись обновлена.', false);
  }

  function callNote(note) {
    if (!note?.phone) return setStatusVoice('У контакта нет номера.');
    window.location.href = `tel:${note.phone}`;
  }

  function messageNote(note) {
    if (!note?.phone) return setStatusVoice('У контакта нет номера.');
    window.location.href = `sms:${note.phone}`;
  }

  function handleDelete(text) {
    const source = normalize(text);
    const indexedFolder = findFolderByText(data.folders, text) || (selectedFolder !== 'Все' ? { name: selectedFolder } : null);
    const indexedNumber = extractFolderListIndex(text);
    if (indexedFolder && indexedNumber) return deleteFolderIndexedNote(indexedFolder.name, indexedNumber);
    if (indexedNumber) return deleteVisibleIndexedNote(indexedNumber);
    if (includesAny(source, ['удали из списка', 'убери из списка', 'вычеркни из списка'])) return removeFromCurrentShoppingList(extractListItemToRemove(text));
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё', 'удали все с блокнота', 'удали всё с блокнота', 'очисти блокнот', 'очисти весь блокнот'])) return clearNotebookNow();
    if (includesAny(source, ['очисти корзину', 'удали корзину', 'удали все записи с корзины', 'удали всё с корзины'])) return setStatusVoice('Корзины больше нет. Записи удаляются сразу из папок.', false);
    if (includesAny(source, ['очисти папку', 'удали все в папке', 'удали всё в папке', 'удали все с папки', 'удали всё с папки'])) {
      const folder = findFolderByText(data.folders, text) || (selectedFolder !== 'Все' ? { name: selectedFolder } : null);
      return folder ? clearFolderNow(folder.name) : setStatusVoice('Не понял, какую папку очистить.', false);
    }
    if (includesAny(source, ['удали папку'])) {
      const folder = findFolderByText(data.folders, text);
      return folder ? deleteFolderNow(folder.name) : setStatusVoice('Не понял, какую папку удалить.', false);
    }
    if (source.includes('папк')) {
      const folder = findFolderByText(data.folders, text);
      if (source.includes('послед') && folder) {
        const latestInFolder = [...data.notes]
          .filter(note => note.folder === folder.name)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        return latestInFolder ? deleteNoteNow(latestInFolder) : setStatusVoice(`В папке ${folder.name} нет записей.`, false);
      }
      if (folder) return clearFolderNow(folder.name);
      return setStatusVoice('Не понял, какую папку удалить.');
    }
    if (source.includes('послед')) {
      const latest = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return latest ? deleteNoteNow(latest) : setStatusVoice('Нет записей для удаления.', false);
    }
    if (includesAny(source, ['это', 'эту', 'ее', 'её'])) {
      return selectedNote ? deleteNoteNow(selectedNote) : setStatusVoice('Сначала откройте запись.', false);
    }
    const found = searchNotes(data.notes, text)[0];
    return found ? deleteNoteNow(found) : setStatusVoice('Не нашёл запись для удаления.', false);
  }

  async function executePlan(plan, originalText) {
    if (!plan?.action || plan.action === 'unknown') return false;
    const preferredFolder = selectedFolder !== 'Все' ? selectedFolder : '';
    if (calendarSelectedDate && calendarOpen && String(plan.action).startsWith('save_')) {
      return saveCalendarNoteFromCommand(originalText, preferredFolder);
    }
    const reminderDefaults = buildReminderDefaults(reminderSettings);
    if (plan.action === 'save_shopping_list' && isShoppingAppendCommand(originalText)) {
      const appendItems = Array.isArray(plan.items) && plan.items.length ? plan.items : extractShoppingAppendItems(plan.content || originalText);
      if (appendToLatestShoppingList(plan.folder || resolveSaveFolder(originalText, 'shopping_list', preferredFolder), appendItems, originalText, true)) return true;
    }
    if (plan.action === 'save_shopping_list' && !isTimedShoppingCommand(originalText)) {
      const appendItems = Array.isArray(plan.items) && plan.items.length ? plan.items : extractItems(plan.content || originalText);
      if (isLikelyGroceryList(appendItems) && appendToLatestShoppingList(plan.folder || resolveSaveFolder(originalText, 'shopping_list', preferredFolder), appendItems, originalText)) return true;
    }
    if (plan.action === 'save_shopping_list' && isTimedShoppingCommand(originalText)) {
      const note = createNoteFromLocalText(originalText, preferredFolder, reminderDefaults);
      saveNote(note, Boolean(plan.showAfterSave || includesAny(originalText, ['выведи', 'покажи', 'открой', 'на экран'])));
      return true;
    }
    if (plan.action.startsWith('save_')) {
      const note = createNoteFromAI(plan, originalText, preferredFolder, reminderDefaults);
      saveNote(note, Boolean(plan.showAfterSave || includesAny(originalText, ['выведи', 'покажи', 'открой', 'на экран'])));
      return true;
    }
    if (plan.action === 'show_period') { showPeriod(plan.period || 'today'); return true; }
    if (plan.action === 'search_notes') { performSearch(plan.query || originalText); return true; }
    if (plan.action === 'show_latest_note') { showLatest(plan.query || originalText); return true; }
    if (plan.action === 'edit_latest') { openLatestForEdit(); return true; }
    if (plan.action === 'rename_current') { renameCurrentNote(plan.title); return true; }
    if (plan.action === 'move_current') { moveCurrentNote(plan.folder); return true; }
    if (plan.action === 'append_current') { appendToCurrentNote(plan.content); return true; }
    if (plan.action === 'create_folder') {
      const folderName = plan.folder || cleanTitle(originalText.replace(/создай папку|создать папку/gi, ''), 'Новая папка');
      setData(prev => ({ ...prev, folders: ensureFolder(prev.folders, folderName) }));
      setSelectedFolder(folderName);
      setStatusVoice(`Папка ${folderName} создана или уже существует.`);
      return true;
    }
    if (plan.action === 'open_folder') { return plan.folder ? openFolder(plan.folder) : setStatusVoice('Не понял, какую папку открыть.'); }
    if (plan.action === 'delete_all') { clearNotebookNow(); return true; }
    if (plan.action === 'delete_trash') { setStatusVoice('Корзины больше нет. Записи удаляются сразу из папок.', false); return true; }
    if (plan.action === 'clear_folder') { plan.folder ? clearFolderNow(plan.folder) : setStatusVoice('Не указана папка.', false); return true; }
    if (plan.action === 'delete_folder') { plan.folder ? deleteFolderNow(plan.folder) : setStatusVoice('Не указана папка.', false); return true; }
    if (plan.action === 'delete_folder_indexed_note') { deleteFolderIndexedNote(plan.folder, plan.index); return true; }
    if (plan.action === 'delete_note') {
      const found =
        plan.target === 'current' ? selectedNote
          : plan.target === 'latest' ? [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
            : plan.target === 'folder_latest' && plan.folder ? [...data.notes].filter(note => note.folder === plan.folder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
              : searchNotes(data.notes, plan.query || originalText)[0];
      found ? deleteNoteNow(found) : setStatusVoice('Не нашёл запись для удаления.', false);
      return true;
    }
    if (plan.action === 'copy_current') { selectedNote ? copyNote(selectedNote) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'copy_folder_latest') {
      const latestInFolder = [...data.notes]
        .filter(note => note.folder === plan.folder)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!latestInFolder) setStatusVoice(`В папке ${plan.folder || 'этой'} пока нет записей.`);
      else {
        openNote(latestInFolder);
        copyNote(latestInFolder);
        setSuggestedFolder(plan.folder);
      }
      return true;
    }
    if (plan.action === 'share_current') { selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_current') { selectedNote ? speak(shareText(selectedNote), selectedVoiceURI, selectedVoiceStyle) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_contact_latest') {
      const latestContact = [...data.notes]
        .filter(note => note.folder === 'Контакты' || note.type === 'contact')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!latestContact) setStatusVoice('В папке Контакты пока нет записей.');
      else {
        openNote(latestContact);
        speak(contactSpeechText(latestContact), selectedVoiceURI, selectedVoiceStyle);
        setSuggestedFolder('Контакты');
        setStatus('');
      }
      return true;
    }
    if (plan.action === 'read_folder_latest') {
      const latestInFolder = [...data.notes]
        .filter(note => note.folder === plan.folder)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!latestInFolder) setStatusVoice(`В папке ${plan.folder || 'этой'} пока нет записей.`);
      else {
        openNote(latestInFolder);
        speak(shareText(latestInFolder), selectedVoiceURI, selectedVoiceStyle);
        setSuggestedFolder(plan.folder);
        setStatus('');
      }
      return true;
    }
    if (plan.action === 'call_contact' || plan.action === 'message_contact') {
      const found = searchNotes(data.notes.filter(n => n.type === 'contact'), plan.query || originalText)[0] || selectedNote;
      if (found?.type !== 'contact') setStatusVoice('Не нашёл контакт.');
      else plan.action === 'call_contact' ? callNote(found) : messageNote(found);
      return true;
    }
    return false;
  }

  async function processCommand(text) {
    const spoken = String(text || '').trim();
    if (!spoken) return;
    const normalizedSpoken = normalize(spoken);
    const nowTs = Date.now();
    if (processingCommandRef.current) {
      setStatusVoice('Команда уже обрабатывается.', false);
      return;
    }
    if (
      isSameOrNearCommand(lastCommandRef.current.text, normalizedSpoken) &&
      nowTs - lastCommandRef.current.at < 8000
    ) {
      setStatusVoice('Повтор команды пропущен.', false);
      return;
    }
    if (
      isSameOrNearCommand(lastHandledCommandRef.current.text, normalizedSpoken) &&
      nowTs - lastHandledCommandRef.current.at < 20000
    ) {
      setStatusVoice('Повтор команды пропущен.', false);
      return;
    }
    lastCommandRef.current = { text: normalizedSpoken, at: nowTs };
    processingCommandRef.current = true;
    setCommand(spoken);
    const source = normalizedSpoken;
    const preferredFolder = selectedFolder !== 'Все' ? selectedFolder : '';
    const reminderDefaults = buildReminderDefaults(reminderSettings);
    try {
      if (includesAny(source, ['включи уведомления', 'включи напоминания', 'разреши уведомления', 'активируй уведомления'])) {
        await toggleRemindersEnabled(true);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (includesAny(source, ['выключи уведомления', 'выключи напоминания', 'отключи уведомления', 'отключи напоминания'])) {
        await toggleRemindersEnabled(false);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (!parseVoiceCalendarTargetDate(spoken) && includesAny(source, ['открой календарь', 'покажи календарь', 'разверни календарь', 'календарь справа'])) {
        setCalendarOpen(true);
        setStatusVoice('Календарь открыт.', false);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (includesAny(source, ['закрой календарь', 'сверни календарь', 'убери календарь'])) {
        setCalendarOpen(false);
        setStatusVoice('Календарь свернут.', false);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (includesAny(source, ['открой настройки', 'покажи настройки', 'настройки голоса', 'настройки уведомлений'])) {
        setSettingsOpen(true);
        setStatusVoice('Настройки открыты.', false);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (includesAny(source, ['закрой настройки', 'сверни настройки', 'убери настройки'])) {
        setSettingsOpen(false);
        setStatusVoice('Настройки свернуты.', false);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (handleCalendarVoiceCommand(spoken)) {
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (handleCalendarContextVoiceCommand(spoken)) {
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (handleReminderVoiceCommand(spoken)) {
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return;
      }
      if (calendarSelectedDate && calendarOpen && detectIntent(spoken) === 'save') {
        if (saveCalendarNoteFromCommand(spoken, preferredFolder)) {
          lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
          return;
        }
      }
      if (startsWithAny(source, ['создай папку', 'создать папку'])) {
        const folderName = extractFolderCreateName(spoken) || cleanTitle(spoken.replace(/создай папку|создать папку/gi, ''), 'Новая папка');
        setData(prev => ({ ...prev, folders: ensureFolder(prev.folders, folderName) }));
        setSelectedFolder(folderName);
        setSelectedId(null);
        setSuggestedFolder('');
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return setStatusVoice(`Папка ${folderName} создана или уже существует.`);
      }

      if (isShoppingAppendCommand(spoken)) {
        const items = extractShoppingAppendItems(spoken);
        if (items.length && appendToLatestShoppingList('Покупки', items, spoken, true)) {
          lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
          return;
        }
        if (items.length) {
          const fallbackText = `купить ${items.join(', ')}`;
          const note = createNoteFromLocalText(fallbackText, 'Покупки', reminderDefaults);
          saveNote(note, false);
          lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
          return;
        }
      }

      if (useAI) {
        setStatus('Локальный AI разбирает команду...');
        const plan = localAIPlan(spoken, data, selectedNote, preferredFolder);
        const handled = await executePlan(plan, spoken);
        if (handled) {
          lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
          return;
        }
      }

      const intent = detectIntent(spoken);
      if (intent === 'save') {
        if (isTimedShoppingCommand(spoken)) {
          lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
          return saveNote(createNoteFromLocalText(spoken, preferredFolder, reminderDefaults), includesAny(spoken, ['выведи', 'покажи', 'открой', 'на экран']));
        }
        if (isShoppingAppendCommand(spoken)) {
          const targetFolder = resolveSaveFolder(spoken, 'shopping_list', preferredFolder);
          const items = extractShoppingAppendItems(spoken);
          if (appendToLatestShoppingList(targetFolder, items, spoken, true)) {
            lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
            return;
          }
          if (items.length) {
            const fallbackText = `купить ${items.join(', ')}`;
            const note = createNoteFromLocalText(fallbackText, targetFolder || 'Покупки', reminderDefaults);
            saveNote(note, false);
            lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
            return;
          }
        }
        if (inferType(spoken) === 'shopping_list') {
          const targetFolder = resolveSaveFolder(spoken, 'shopping_list', preferredFolder);
          const items = extractItems(spoken);
          if (isLikelyGroceryList(items) && appendToLatestShoppingList(targetFolder, items, spoken)) {
            lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
            return;
          }
        }
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return saveNote(createNoteFromLocalText(spoken, preferredFolder, reminderDefaults), includesAny(spoken, ['выведи', 'покажи', 'открой', 'на экран']));
      }
      if (intent === 'history') {
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        if (includesAny(spoken, ['вчера', 'вчераш'])) return showPeriod('yesterday');
        if (includesAny(spoken, ['неделе', 'неделя'])) return showPeriod('week');
        return showPeriod('today');
      }
      if (intent === 'edit') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return openLatestForEdit(); }
      if (intent === 'rename') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return renameCurrentNote(extractRenameValue(spoken)); }
      if (intent === 'move') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return moveCurrentNote(extractMoveFolderName(spoken)); }
      if (intent === 'append') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return appendToCurrentNote(extractAppendText(spoken)); }
      if (intent === 'search') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return performSearch(spoken); }
      if (intent === 'show_latest') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return showLatest(spoken); }
      if (intent === 'delete') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return handleDelete(spoken); }
      if (intent === 'open_folder') {
        const folderMatch = findFolderByText(data.folders, spoken);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return folderMatch ? openFolder(folderMatch.name) : setStatusVoice('Не понял, какую папку открыть.', false);
      }
      if (intent === 'copy') {
        const folderMatch = findFolderByText(data.folders, spoken);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        if (folderMatch) {
          const latestInFolder = [...data.notes]
            .filter(note => note.folder === folderMatch.name)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          if (!latestInFolder) return setStatusVoice(`В папке ${folderMatch.name} пока нет записей.`);
          openNote(latestInFolder);
          copyNote(latestInFolder);
          setSuggestedFolder(folderMatch.name);
          return;
        }
        return selectedNote ? copyNote(selectedNote) : setStatusVoice('Сначала откройте запись.');
      }
      if (intent === 'share') { lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() }; return selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.'); }
      if (intent === 'read') {
        const folderMatch = findFolderByText(data.folders, spoken);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        if (folderMatch?.name === 'Контакты' || includesAny(spoken, ['номер', 'телефон', 'контакт'])) {
          const latestContact = [...data.notes]
            .filter(note => note.folder === 'Контакты' || note.type === 'contact')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          if (!latestContact) return setStatusVoice('В папке Контакты пока нет записей.');
          openNote(latestContact);
          speak(contactSpeechText(latestContact), selectedVoiceURI, selectedVoiceStyle);
          setSuggestedFolder('Контакты');
          setStatus('');
          return;
        }
        if (folderMatch) {
          const latestInFolder = [...data.notes]
            .filter(note => note.folder === folderMatch.name)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          if (!latestInFolder) return setStatusVoice(`В папке ${folderMatch.name} пока нет записей.`);
          openNote(latestInFolder);
          speak(shareText(latestInFolder), selectedVoiceURI, selectedVoiceStyle);
          setSuggestedFolder(folderMatch.name);
          setStatus('');
          return;
        }
        return selectedNote ? speak(shareText(selectedNote), selectedVoiceURI, selectedVoiceStyle) : setStatusVoice('Сначала откройте запись.');
      }
      if (intent === 'call') {
        const found = searchNotes(data.notes.filter(n => n.type === 'contact'), spoken)[0] || selectedNote;
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return found?.type === 'contact' ? callNote(found) : setStatusVoice('Не нашёл контакт для звонка.');
      }
      if (intent === 'message') {
        const found = searchNotes(data.notes.filter(n => n.type === 'contact'), spoken)[0] || selectedNote;
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return found?.type === 'contact' ? messageNote(found) : setStatusVoice('Не нашёл контакт для сообщения.');
      }
      if (intent === 'create_folder') {
        const name = extractExplicitFolder(spoken) || cleanTitle(spoken.replace(/создай папку|создать папку/gi, ''), 'Новая папка');
        setData(prev => ({ ...prev, folders: ensureFolder(prev.folders, name) }));
        setSelectedFolder(name);
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return setStatusVoice(`Папка ${name} создана или уже существует.`);
      }
      if (String(spoken || '').trim()) {
        lastHandledCommandRef.current = { text: normalizedSpoken, at: Date.now() };
        return saveNote(
          createNoteFromLocalText(spoken, preferredFolder, reminderDefaults),
          includesAny(spoken, ['выведи', 'покажи', 'открой', 'на экран'])
        );
      }
      setStatusVoice('Я пока не понял команду. Попробуйте сказать: запомни идею, найди заметку, покажи последнюю.');
    } finally {
      processingCommandRef.current = false;
    }
  }

  function startListening() {
    if (!speechSupported) return setStatusVoice('Браузер не поддерживает распознавание речи. Попробуйте Chrome на Android.');
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => { setListening(true); setStatus('Слушаю...'); };
    recognition.onresult = e => processCommand(e.results?.[0]?.[0]?.transcript || '');
    recognition.onerror = () => { setListening(false); setStatusVoice('Не получилось распознать голос. Проверьте микрофон.'); };
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function submitManual(e) {
    e.preventDefault();
    const text = command;
    setCommand('');
    processCommand(text);
  }

  async function promptInstallApp() {
    if (isInstalled) {
      setStatusVoice('Приложение уже установлено.', false);
      return;
    }
    if (installPromptEvent?.prompt) {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setInstallPromptEvent(null);
          setInstallPromptDismissed(true);
          try { localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1'); } catch {}
          setStatusVoice('Установка приложения запущена.', false);
          return;
        }
      } catch {}
    }
    setStatusVoice('Откройте меню браузера и выберите «Установить приложение» / «Добавить на главный экран».', false);
  }

  function dismissInstallCard() {
    setInstallPromptDismissed(true);
    try { localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1'); } catch {}
  }

  function selectMobilePanel(panel) {
    setMobilePanel(panel);
    if (panel === 'notes') setSelectedFolder('Все');
    if (panel === 'calendar') setCalendarOpen(true);
    if (panel === 'settings') setSettingsOpen(true);
  }

  const shouldShowInstallPrompt = !isInstalled;

  return (
    <div className="app-shell">
      <div className="future-backdrop" aria-hidden="true" />
      <div className="future-workspace">
        <aside className="left-command-panel" aria-label="Функции блокнота">
          <section className="panel brand-panel mobile-panel mobile-brand">
            <div className="brand-mark">AI</div>
            <div>
              <p className="eyebrow">АИ Блокнот</p>
              <h1>АИ Блокнот</h1>
              <p>Голосовые записи, папки, календарь и напоминания в одном компактном рабочем месте.</p>
            </div>
            <div className="left-actions">
              <button type="button" className="tool-button" onClick={() => { setSettingsOpen(value => !value); selectMobilePanel('settings'); }}>
                {settingsOpen ? 'Скрыть настройки' : 'Настройки'}
              </button>
              <button type="button" className="tool-button" onClick={() => { setCalendarOpen(value => !value); selectMobilePanel('calendar'); }}>
                {calendarOpen ? 'Свернуть календарь' : 'Календарь'}
              </button>
              {!isInstalled ? <button type="button" className="tool-button" onClick={promptInstallApp}>Установить приложение</button> : null}
              <button type="button" className="tool-button" onClick={enableNotifications}>Тест уведомления</button>
            </div>
          </section>

          <section className={`${settingsOpen ? 'panel settings-panel expanded' : 'panel settings-panel compact'} mobile-panel ${mobilePanel === 'settings' ? 'mobile-active' : ''}`}>
            <div className="settings-head">
              <div>
                <p className="eyebrow">Настройки</p>
                <strong>Настройки помощника</strong>
              </div>
              <button type="button" onClick={() => setSettingsOpen(value => !value)}>{settingsOpen ? 'Свернуть' : 'Открыть'}</button>
            </div>
            <div className="reminder-diagnostics">
              <div><span>AI</span><strong>{useAI ? 'локальный включён' : 'выключен'}</strong></div>
              <div><span>Уведомления</span><strong>{notificationPermissionLabel}</strong></div>
              <div><span>Ближайшее напоминание</span><strong>{nextReminderAtLabel}</strong></div>
              <div><span>Память телефона</span><strong>{lastReminderSyncAt ? new Date(lastReminderSyncAt).toLocaleString('ru-RU') : 'ожидает синхронизации'}</strong></div>
            </div>
            {settingsOpen ? (
              <>
                <div className="settings-head nested">
                  <strong>Стиль речи</strong>
                </div>
                <div className="voice-style-list">
                  <button type="button" className="voice-style-option active" disabled>
                    {getVoiceStyleConfig('default').label}
                  </button>
                </div>
                <div className="folder-note-empty">Используется один стандартный голос устройства.</div>
                <div className="settings-head nested">
                  <strong>Напоминания</strong>
                  <label className="switch">
                    <input type="checkbox" checked={Boolean(reminderSettings.enabled)} onChange={e => toggleRemindersEnabled(e.target.checked)} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="reminder-grid">
                  <label className="reminder-row">
                    <span>По умолчанию</span>
                    <select value={reminderSettings.defaultReminderOffset} onChange={e => setReminderSettings(prev => ({ ...prev, defaultReminderOffset: e.target.value }))}>
                      <option value="15m">За 15 минут</option>
                      <option value="30m">За 30 минут</option>
                      <option value="1h">За 1 час</option>
                      <option value="1d">За 1 день</option>
                      <option value="custom">Своё</option>
                    </select>
                  </label>
                  {reminderSettings.defaultReminderOffset === 'custom' ? (
                    <label className="reminder-row">
                      <span>Своё, минут</span>
                      <input type="number" min="1" step="1" value={reminderSettings.customReminderOffsetMinutes} onChange={e => setReminderSettings(prev => ({ ...prev, customReminderOffsetMinutes: Number(e.target.value || 60) }))} />
                    </label>
                  ) : null}
                  <label className="reminder-row">
                    <span>Утром</span>
                    <input type="time" value={reminderSettings.morningReminderTime} onChange={e => setReminderSettings(prev => ({ ...prev, morningReminderTime: e.target.value || '09:00' }))} />
                  </label>
                  <label className="reminder-row">
                    <span>Тихие часы: начало</span>
                    <input type="time" value={reminderSettings.quietHoursStart} onChange={e => setReminderSettings(prev => ({ ...prev, quietHoursStart: e.target.value || '22:00' }))} />
                  </label>
                  <label className="reminder-row">
                    <span>Тихие часы: конец</span>
                    <input type="time" value={reminderSettings.quietHoursEnd} onChange={e => setReminderSettings(prev => ({ ...prev, quietHoursEnd: e.target.value || '07:00' }))} />
                  </label>
                  <label className="reminder-row">
                    <span>Второе уведомление</span>
                    <div className="reminder-input-row">
                      <input type="time" disabled={!reminderSettings.secondReminderEnabled} value={reminderSettings.secondReminderTime} onChange={e => setReminderSettings(prev => ({ ...prev, secondReminderTime: e.target.value || '20:00' }))} />
                      <label className="switch">
                        <input type="checkbox" checked={Boolean(reminderSettings.secondReminderEnabled)} onChange={e => setReminderSettings(prev => ({ ...prev, secondReminderEnabled: e.target.checked }))} />
                        <span className="slider" />
                      </label>
                    </div>
                  </label>
                </div>
              </>
            ) : null}
          </section>

          <section className={`panel folders mobile-panel ${mobilePanel === 'folders' ? 'mobile-active' : ''}`}>
            <div className="folders-head">
              <div>
                <p className="eyebrow">Разделы</p>
                <h2>Папки</h2>
              </div>
              <span>{data.notes.length}</span>
            </div>
            <button type="button" className={selectedFolder === 'Все' ? 'folder active' : 'folder'} onClick={() => setSelectedFolder('Все')}>Все записи <span>{data.notes.length}</span></button>
            {data.folders.map(folder => {
              const folderNotes = [...data.notes]
                .filter(n => n.folder === folder.name)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              const count = folderNotes.length;
              const expanded = Boolean(expandedFolders[folder.name]);
              return (
                <div key={folder.id} className="folder-block">
                  <div className={selectedFolder === folder.name ? 'folder-row active' : 'folder-row'}>
                    <button type="button" className={selectedFolder === folder.name ? 'folder folder-trigger active' : 'folder folder-trigger'} onClick={() => setSelectedFolder(folder.name)}>
                      {folder.name}
                      <span>{count}</span>
                    </button>
                    <div className="folder-controls">
                      <button
                        type="button"
                        className="folder-expand"
                        onClick={() => toggleFolderExpand(folder.name)}
                        aria-label={expanded ? `Свернуть папку ${folder.name}` : `Развернуть папку ${folder.name}`}
                      >
                        {expanded ? '−' : '+'}
                      </button>
                      <button
                        type="button"
                        className="folder-delete"
                        onClick={() => deleteFolderNow(folder.name)}
                        aria-label={`Удалить папку ${folder.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="folder-notes">
                      {folderNotes.length ? folderNotes.map((note, folderIndex) => (
                        <div key={note.id} className="folder-note-wrap">
                          <div className={selectedId === note.id ? 'folder-note-row active' : 'folder-note-row'}>
                            <button
                              type="button"
                              className="folder-note-copy-button"
                              onClick={() => copyNote(note)}
                              aria-label={`Скопировать запись ${note.title}`}
                            >
                              ⧉
                            </button>
                            <button
                              type="button"
                              className={selectedId === note.id ? 'folder-note-item active' : 'folder-note-item'}
                              onClick={() => openNote(note)}
                            >
                              <div className="folder-note-copy">
                                <span className="folder-note-title">{folderIndex + 1}. {note.title}</span>
                                {note.type === 'shopping_list' ? <small className="folder-note-preview">{(note.items || []).join(', ')}</small> : null}
                              </div>
                              <small>{formatDate(note.createdAt)}</small>
                            </button>
                            <button
                              type="button"
                              className="folder-note-expand"
                              onClick={() => toggleNoteExpand(note.id)}
                              aria-label={expandedNotes[note.id] ? `Свернуть запись ${note.title}` : `Развернуть запись ${note.title}`}
                            >
                              {expandedNotes[note.id] ? '−' : '+'}
                            </button>
                            <button
                              type="button"
                              className="folder-note-delete"
                              onClick={() => deleteNoteNow(note)}
                              aria-label={`Удалить запись ${note.title}`}
                            >
                              ×
                            </button>
                          </div>
                          {expandedNotes[note.id] ? (
                            <div className="folder-note-detail">
                              {note.type === 'shopping_list' ? (
                                <ul className="folder-note-list">
                                  {(note.items || []).map((item, index) => <li key={`${note.id}_${index}`}>{item}</li>)}
                                </ul>
                              ) : (
                                <div className="folder-note-text">{shareText(note)}</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )) : <div className="folder-note-empty">В этой папке пока нет записей</div>}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="folder-tools">
              <button
                type="button"
                disabled={selectedFolder === 'Все' || !data.notes.some(n => n.folder === selectedFolder)}
                onClick={() => clearFolderNow(selectedFolder)}
              >
                Очистить папку
              </button>
              <button
                type="button"
                className="danger"
                disabled={!data.notes.length}
                onClick={clearNotebookNow}
              >
                Очистить блокнот
              </button>
            </div>
          </section>
        </aside>

        <main className="center-notebook" aria-label="Записи блокнота">
          <section className={`panel notes mobile-panel ${mobilePanel === 'notes' ? 'mobile-active' : ''}`}>
            {shouldShowInstallPrompt ? (
              <div className="install-card">
                <div>
                  <strong>Установить АИ Блокнот</strong>
                  <span>Для стабильной фоновой работы и уведомлений.</span>
                </div>
                <button type="button" className="primary" onClick={promptInstallApp}>Установить</button>
                <button type="button" onClick={dismissInstallCard} aria-label="Скрыть">×</button>
              </div>
            ) : null}
            <div className="notes-head">
              <div>
                <p className="eyebrow">Записи</p>
                <h2>{selectedFolder}</h2>
                <p>{visibleNotes.length} записей{activeSelectedNote ? ` · открыта №${activeSelectedIndex + 1}` : ''}</p>
              </div>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по заметкам, контактам и папкам" />
            </div>
            <div className="history-chips">
              <button type="button" className={historyFilter === 'all' && !quickDateFilter ? 'active' : ''} onClick={() => showPeriod('all')}>Все</button>
              <button type="button" className={historyFilter === 'today' ? 'active' : ''} onClick={() => showPeriod('today')}>Сегодня</button>
              <button type="button" className={historyFilter === 'yesterday' ? 'active' : ''} onClick={() => showPeriod('yesterday')}>Вчера</button>
              <button type="button" className={historyFilter === 'week' ? 'active' : ''} onClick={() => showPeriod('week')}>Неделя</button>
            </div>
            {activeSelectedNote ? (
              <div className="selected-strip">
                <span>Открыта: {activeSelectedNote.title}</span>
                <div>
                  <button type="button" onClick={() => copyNote(activeSelectedNote)}>Копировать</button>
                  <button type="button" onClick={() => shareNote(activeSelectedNote)}>Поделиться</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedId !== activeSelectedNote.id) setSelectedId(activeSelectedNote.id);
                      changeSelectedReminderTime(activeSelectedNote);
                    }}
                  >
                    Поменять время
                  </button>
                  <button type="button" className="danger" onClick={() => deleteNoteNow(activeSelectedNote)}>Удалить</button>
                </div>
              </div>
            ) : null}
            <div className="note-list records-list">
              {visibleNotes.length ? visibleNotes.map((note, index) => {
                const compactText = note.type === 'shopping_list'
                  ? (note.items || []).join(', ')
                  : note.type === 'contact'
                    ? [note.phone ? `Телефон: ${note.phone}` : '', note.description ? `Описание: ${note.description}` : ''].filter(Boolean).join('\n')
                    : note.type === 'appointment'
                      ? `Когда: ${[note.dateLabel, note.time].filter(Boolean).join(', ') || 'не указано'}\n${sanitizeAppointmentContent(note.content || '') || note.content || ''}`
                      : (note.content || '');
                return (
                  <article key={note.id} className={`record-item ${selectedId === note.id ? 'selected' : ''}`}>
                    <div
                      className="record-main"
                      role="button"
                      tabIndex={0}
                      onClick={() => openNote(note)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openNote(note);
                        }
                      }}
                    >
                      <div className="record-top">
                        <span>{index + 1}. {note.folder} · {TYPE_LABELS[note.type] || 'Запись'}</span>
                        <small>{formatDate(note.createdAt)}</small>
                      </div>
                      <h3>{index + 1}. {note.title || 'Без названия'}</h3>
                      <p className="record-text">{compactText || 'Текст записи пуст.'}</p>
                    </div>
                  </article>
                );
              }) : <div className="empty">Записей пока нет. Нажмите «Говорить» или введите команду.</div>}
            </div>
          </section>
        </main>

        <aside className="right-ai-panel" aria-label="Микрофон и календарь">
          <section className={`panel ai-comm-panel mobile-panel ${mobilePanel === 'voice' ? 'mobile-active' : ''}`}>
            <div className="ai-panel-head">
              <div>
                <p className="eyebrow">Команды</p>
                <h2>Голос</h2>
              </div>
              <span className={listening ? 'live-dot active' : 'live-dot'} />
            </div>
            <button
              type="button"
              className={listening ? 'mic-button listening' : 'mic-button'}
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? 'Остановить голосовой ввод' : 'Начать голосовой ввод'}
            >
              <span>{listening ? '■' : '●'}</span>
              <strong>{listening ? 'Слушаю' : 'Говорить'}</strong>
            </button>
            {!isInstalled ? (
              <button type="button" className="tool-button install-inline-button" onClick={promptInstallApp}>
                Установить приложение
              </button>
            ) : null}
            <div className="status-card">
              <span>Статус</span>
              <strong>{status}</strong>
              {suggestedFolder ? <button type="button" onClick={() => openFolder(suggestedFolder, false)}>Открыть папку {suggestedFolder}</button> : null}
            </div>
            <form className="manual" onSubmit={submitManual}>
              <input value={command} onChange={e => setCommand(e.target.value)} placeholder="Напишите команду" />
              <button type="submit" className="primary">Выполнить</button>
            </form>
          </section>

          {calendarOpen ? (
            <section className={`panel calendar-panel mobile-panel ${mobilePanel === 'calendar' ? 'mobile-active' : ''}`}>
              <div className="settings-head">
                <div>
                  <p className="eyebrow">Календарь</p>
                  <strong>Дата и уведомления</strong>
                </div>
                <button type="button" onClick={() => setCalendarOpen(false)}>Свернуть</button>
              </div>
              <div className="calendar-compose">
                <div className="calendar-compose-row compact-date-row">
                  <select value={calendarDayPicker.selectedDay} onChange={event => selectCalendarDayFromPicker(event.target.value)}>
                    {calendarDayPicker.options.map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                  <input type="time" value={calendarNoteTime} onChange={event => setCalendarNoteTime(event.target.value || '09:00')} />
                </div>
                <div className="calendar-compose-row calendar-compose-main">
                  <input value={calendarNoteText} onChange={e => setCalendarNoteText(e.target.value)} placeholder="Что добавить на выбранную дату" />
                  <button type="button" className="primary" onClick={saveCalendarNote}>Сохранить</button>
                </div>
              </div>
              <div className="calendar-list">
                {calendarMonths.map(month => (
                  <div key={month.key} className="calendar-month">
                    <h3>{capitalize(month.title)}</h3>
                    <div className="calendar-grid">
                      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <div key={`${month.key}_${day}`} className="calendar-weekday">{day}</div>)}
                      {Array.from({ length: month.firstWeekday }).map((_, idx) => <div key={`${month.key}_empty_${idx}`} className="calendar-day empty" />)}
                      {Array.from({ length: month.daysInMonth }, (_, dayIndex) => {
                        const dayDate = new Date(month.monthDate.getFullYear(), month.monthDate.getMonth(), dayIndex + 1, 12, 0, 0, 0);
                        const dayIso = dayDate.toISOString();
                        const dayItems = month.items.filter(note => String(note.eventAt || '').slice(0, 10) === dayIso.slice(0, 10));
                        const hasItems = dayItems.length > 0;
                        const isSelected = calendarSelectedDate && String(calendarSelectedDate).slice(0, 10) === dayIso.slice(0, 10);
                        return (
                          <button
                            type="button"
                            key={`${month.key}_${dayIndex + 1}`}
                            className={`calendar-day${hasItems ? ' has-items' : ''}${isSelected ? ' active' : ''}`}
                            onClick={() => selectCalendarDate(dayDate, { clearContext: true, openDayPanel: hasItems })}
                          >
                            <span>{dayIndex + 1}</span>
                            {dayItems.length > 0 ? <small>{dayItems.length}</small> : null}
                          </button>
                        );
                      })}
                    </div>
                    {calendarDayPanelOpen &&
                    calendarSelectedDate &&
                    (() => {
                      const panelDate = new Date(calendarSelectedDate);
                      return panelDate.getFullYear() === month.monthDate.getFullYear() && panelDate.getMonth() === month.monthDate.getMonth();
                    })() ? (
                      <div className="calendar-day-panel">
                        <div className="calendar-day-panel-head">
                          <strong>{formatCalendarDateLabel(new Date(calendarSelectedDate))}</strong>
                          <button type="button" onClick={() => setCalendarDayPanelOpen(false)}>Свернуть</button>
                        </div>
                        <input
                          className="calendar-day-filter"
                          value={calendarDayFilter}
                          onChange={event => setCalendarDayFilter(event.target.value)}
                          placeholder="Фильтр по напоминаниям дня"
                        />
                        {filteredCalendarDayNotes.length ? filteredCalendarDayNotes.map(note => (
                          <div key={note.id} className="calendar-day-note">
                            <div className="calendar-day-note-main">
                              <strong>{note.time || '--:--'} · {note.title}</strong>
                              <span>{[note.placeLabel, note.content].filter(Boolean).join(' · ')}</span>
                            </div>
                            <div className="calendar-day-note-actions">
                              <button type="button" onClick={() => openNote(note)}>Открыть</button>
                              <button type="button" onClick={() => completeCalendarDayNote(note)}>Выполнить</button>
                              <button type="button" onClick={() => postponeCalendarDayNoteToTomorrow(note)}>Завтра</button>
                              <button type="button" className="danger" onClick={() => deleteNoteNow(note)}>Удалить</button>
                            </div>
                          </div>
                        )) : <div className="folder-note-empty">На выбранную дату нет напоминаний</div>}
                      </div>
                    ) : null}
                    {month.items.length ? month.items.map(note => (
                      <button type="button" key={note.id} className="calendar-item" onClick={() => openNote(note)}>
                        <strong>{note.title}</strong>
                        <span>{[note.dateLabel, note.time, note.placeLabel].filter(Boolean).join(' · ')}</span>
                      </button>
                    )) : <div className="folder-note-empty">Пока пусто</div>}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className={`panel calendar-panel calendar-collapsed mobile-panel ${mobilePanel === 'calendar' ? 'mobile-active' : ''}`}>
              <p className="eyebrow">Календарь</p>
              <button type="button" className="primary" onClick={() => setCalendarOpen(true)}>Открыть календарь</button>
            </section>
          )}
        </aside>
      </div>
      <nav className="mobile-dock" aria-label="Быстрая навигация">
        <button type="button" className={mobilePanel === 'folders' ? 'active' : ''} onClick={() => selectMobilePanel('folders')}>
          <span>☰</span>
          <strong>Папки</strong>
        </button>
        <button type="button" className={mobilePanel === 'notes' ? 'active' : ''} onClick={() => selectMobilePanel('notes')}>
          <span>✎</span>
          <strong>Записи</strong>
        </button>
        <button type="button" className={mobilePanel === 'voice' ? 'active' : ''} onClick={() => selectMobilePanel('voice')}>
          <span>●</span>
          <strong>Голос</strong>
        </button>
        <button type="button" className={mobilePanel === 'calendar' ? 'active' : ''} onClick={() => selectMobilePanel('calendar')}>
          <span>31</span>
          <strong>Календарь</strong>
        </button>
        <button type="button" className={mobilePanel === 'settings' ? 'active' : ''} onClick={() => selectMobilePanel('settings')}>
          <span>⚙</span>
          <strong>Настр.</strong>
        </button>
      </nav>
    </div>
  );

}
