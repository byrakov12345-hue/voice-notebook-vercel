import React, { useEffect, useMemo, useRef, useState } from 'react';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const STORAGE_KEY = 'smart_voice_notebook_live_v2';
const LEGACY_STORAGE_KEYS = ['smart_voice_notebook_live_v1'];
const VOICE_STORAGE_KEY = 'smart_voice_notebook_voice_v1';
const VOICE_STYLE_STORAGE_KEY = 'smart_voice_notebook_voice_style_v1';
const REMINDER_STORAGE_KEY = 'smart_voice_notebook_reminders_v1';

const DEFAULT_FOLDERS = [
  'Идеи', 'Встречи', 'Покупки', 'Задачи', 'Контакты', 'Коды и комбинации',
  'Расходы', 'Клиенты', 'Работа', 'Дом', 'Машина', 'Семья', 'Здоровье', 'Учёба', 'Важное', 'Разное'
];

const TYPE_LABELS = {
  note: 'Заметка', idea: 'Идея', appointment: 'Встреча', shopping_list: 'Список',
  task: 'Задача', contact: 'Контакт', code: 'Код', expense: 'Расход'
};

const FOLDER_SIGNALS = {
  Идеи: ['идея', 'идею', 'придумал', 'придумала', 'задумка', 'концепт'],
  Встречи: ['встреча', 'встречи', 'встрет', 'прием', 'приём', 'запись', 'стрижка', 'врач', 'барбер', 'парикмахер', 'договорились'],
  Покупки: ['купить', 'покупка', 'покупки', 'магазин', 'продукты', 'список покупок', 'заказать'],
  Задачи: ['задача', 'сделать', 'выполнить', 'нужно', 'надо', 'проверить', 'подготовить'],
  Контакты: ['контакт', 'номер', 'телефон', 'позвонить', 'написать'],
  'Коды и комбинации': ['код', 'пароль', 'комбинация', 'цифры', 'пин'],
  Расходы: ['потратил', 'потратила', 'расход', 'заплатил', 'заплатила', 'рублей', 'рубля', 'рубль', 'евро', 'доллар'],
  Клиенты: ['клиент', 'заказчик', 'лид', 'сделка', 'коммерческое'],
  Работа: ['работа', 'проект', 'созвон', 'бриф', 'дедлайн', 'заказ'],
  Дом: ['дом', 'квартира', 'ремонт', 'кухня', 'ванна', 'мебель'],
  Машина: ['машина', 'авто', 'мойка', 'бензин', 'масло', 'шины', 'гараж'],
  Семья: ['сын', 'сыну', 'сына', 'дочь', 'дочке', 'дочери', 'мама', 'маме', 'папа', 'папе', 'жена', 'жене', 'муж', 'мужу', 'семья', 'ребенок', 'ребёнок', 'дети'],
  Здоровье: ['здоровье', 'таблетки', 'лекарство', 'врач', 'анализы', 'температура'],
  'Учёба': ['учеба', 'учёба', 'урок', 'школа', 'университет', 'экзамен', 'домашка'],
  Важное: ['важно', 'срочно', 'обязательно', 'не забыть', 'критично']
};

const FOLDER_STEMS = {
  Идеи: ['иде', 'задум', 'концеп'],
  Встречи: ['встреч', 'встрет', 'прием', 'приём', 'договор', 'созвон'],
  Покупки: ['куп', 'магаз', 'продукт', 'заказ'],
  Задачи: ['задач', 'сдела', 'выполн', 'провер', 'подготов'],
  Контакты: ['контакт', 'телефон', 'номер', 'позвон', 'напис'],
  'Коды и комбинации': ['код', 'парол', 'комбинац', 'пин'],
  Расходы: ['потрат', 'расход', 'заплат', 'рубл', 'евро', 'доллар'],
  Клиенты: ['клиент', 'заказч', 'лид', 'сделк', 'коммерч'],
  Работа: ['работ', 'проект', 'бриф', 'дедлайн', 'заказ'],
  Дом: ['дом', 'квартир', 'ремонт', 'кухн', 'ванн', 'мебел'],
  Машина: ['машин', 'авто', 'мойк', 'бенз', 'масл', 'шин', 'гараж'],
  Семья: ['сын', 'доч', 'мам', 'пап', 'жен', 'муж', 'сем', 'ребен', 'ребён', 'дет'],
  Здоровье: ['здоров', 'таблет', 'лекар', 'анализ', 'температур', 'врач'],
  'Учёба': ['учеб', 'учёб', 'урок', 'школ', 'универс', 'экзам', 'домашк'],
  Важное: ['важ', 'сроч', 'обязат', 'критич']
};

const TOPIC_STOP_WORDS = new Set([
  'мне', 'нужно', 'надо', 'над', 'хочу', 'хотел', 'хотела', 'запомни', 'запиши', 'сохрани',
  'добавь', 'создай', 'про', 'для', 'чтобы', 'если', 'потом', 'сегодня', 'завтра',
  'послезавтра', 'это', 'этот', 'эта', 'эту', 'мой', 'моя', 'мою', 'мои', 'наш', 'наша',
  'нужно', 'нужно', 'с', 'со', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'до', 'к', 'ко',
  'и', 'или', 'но', 'что', 'как', 'бы', 'уже', 'ещё', 'еще', 'надо', 'нужен', 'нужна', 'нужно'
]);

const DEDUPE_STOP_WORDS = new Set([
  ...TOPIC_STOP_WORDS,
  'запись', 'заметка', 'папка', 'папку', 'папке', 'последнюю', 'последняя', 'последний',
  'сохрани', 'запомни', 'запиши', 'добавь', 'сегодня', 'завтра', 'весь', 'вся', 'все', 'всё'
]);

const digitWords = {
  ноль: '0', один: '1', одна: '1', два: '2', две: '2', три: '3', четыре: '4',
  пять: '5', шесть: '6', семь: '7', восемь: '8', девять: '9'
};

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[?!;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(text) {
  const value = String(text || '').trim();
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function voiceDisplayMeta(voice) {
  const name = String(voice?.name || '');
  const lang = String(voice?.lang || '');
  const source = `${name} ${lang}`.toLowerCase();
  let gender = 'Голос';
  if (/male|man|муж|aleksei|yuri|pavel|sergey|igor/.test(source)) gender = 'Мужской';
  if (/female|woman|жен|alina|anna|olga|irina|maria|milena/.test(source)) gender = 'Женский';
  return {
    title: name || 'Системный голос',
    subtitle: `${gender} · ${lang || 'system'}`
  };
}

function prepareSpeechText(text) {
  const replacements = [
    [/\bсмс\b/gi, 'эс эм эс'],
    [/\bsms\b/gi, 'эс эм эс'],
    [/\bwhatsapp\b/gi, 'ватсап'],
    [/\bapi\b/gi, 'эй пи ай'],
    [/\bjson\b/gi, 'джейсон'],
    [/\burl\b/gi, 'ю ар эл'],
    [/\bid\b/gi, 'ай ди'],
    [/\bкоды и комбинации\b/gi, 'коды и комбинации'],
    [/\bконтакты\b/gi, 'контакты'],
    [/\bвстречи\b/gi, 'встречи'],
    [/\bпокупки\b/gi, 'покупки'],
    [/\bзадачи\b/gi, 'задачи'],
    [/\bмашина\b/gi, 'машина'],
    [/\bучёба\b/gi, 'учёба'],
    [/\bее\b/g, 'её'],
    [/\bЁ\b/g, 'Ё']
  ];

  let value = String(text || '');
  for (const [pattern, replacement] of replacements) {
    value = value.replace(pattern, replacement);
  }

  return value
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*/g, ', ')
    .replace(/:\s*/g, ': ')
    .trim();
}

function getVoiceStyleConfig(style) {
  switch (style) {
    case 'male':
      return { label: 'Мужской', rate: 0.9, pitch: 0.72 };
    case 'child':
      return { label: 'Детский', rate: 1.02, pitch: 1.32 };
    case 'robot':
      return { label: 'Робот', rate: 0.86, pitch: 0.58 };
    default:
      return { label: 'Обычный', rate: 0.92, pitch: 1 };
  }
}

function speak(text, preferredVoiceURI = '', voiceStyle = 'default') {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(prepareSpeechText(text));
  msg.lang = 'ru-RU';
  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferredVoice = preferredVoiceURI ? voices.find(voice => voice.voiceURI === preferredVoiceURI) : null;
  const ruVoice = preferredVoice || voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) || voices.find(voice => /russian|рус/i.test(voice.name));
  if (ruVoice) msg.voice = ruVoice;
  const styleConfig = getVoiceStyleConfig(voiceStyle);
  msg.rate = styleConfig.rate;
  msg.pitch = styleConfig.pitch;
  window.speechSynthesis.speak(msg);
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

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

function includesAny(text, words) {
  const source = normalize(text);
  return words.some(word => source.includes(normalize(word)));
}

function startsWithAny(text, words) {
  const source = normalize(text);
  return words.some(word => source.startsWith(normalize(word)));
}

function wordsToDigits(text) {
  return normalize(text).split(' ').map(t => digitWords[t] ?? t).join(' ');
}

function extractPhone(text) {
  const converted = wordsToDigits(text);
  const match = converted.match(/(?:\+?\d[\d\s().-]{5,}\d)/);
  return match ? match[0].replace(/[^0-9+]/g, '') : '';
}

function extractDigits(text) {
  return wordsToDigits(text).replace(/[^0-9+]/g, '');
}

function hasDateOrTime(text) {
  const source = normalize(text);
  const dateWords = ['сегодня', 'завтра', 'послезавтра', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const timeWords = ['утра', 'дня', 'вечера', 'ночи', 'час', 'часов', 'полдень', 'полночь'];
  const tokens = source.split(' ');
  const hasDateWord = dateWords.some(word => source.includes(word));
  const hasTimeWord = timeWords.some(word => source.includes(word));
  const hasClock = tokens.some(token => /^\d{1,2}[:.]\d{2}$/.test(token));
  const hasNumberBeforeTime = tokens.some((token, i) => !Number.isNaN(Number(token)) && timeWords.includes(tokens[i + 1]));
  return hasDateWord || hasTimeWord || hasClock || hasNumberBeforeTime;
}

function extractAppointmentTime(text) {
  const source = normalize(text);
  const tokens = source.split(' ');

  const clock = source.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (clock) return `${clock[1].padStart(2, '0')}:${clock[2]}`;

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
  if (monthMatch) {
    const day = Number(monthMatch[1]);
    const monthKey = Object.keys(months).find(key => monthMatch[2].startsWith(key.slice(0, 5)));
    if (day && monthKey) {
      let year = now.getFullYear();
      const probe = new Date(year, months[monthKey], day, 12, 0, 0, 0);
      if (probe.getTime() < now.getTime() - 86400000) year += 1;
      eventDate = new Date(year, months[monthKey], day, 12, 0, 0, 0);
    }
  } else if (source.includes('послезавтра')) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12, 0, 0, 0);
  } else if (source.includes('завтра')) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
  } else if (source.includes('сегодня')) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  const time = extractAppointmentTime(text);
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
  const actionMatch = source.match(/(?:нужно|надо|мне)\s+(.+?)(?:,|$)/i) || source.match(/(?:завтра|сегодня|послезавтра|\d{1,2}\s+[А-Яа-я]+)\s+(.+?)(?:,|$)/i);
  const placeMatch = source.match(/\b(?:на|в)\s+([А-Яа-яA-Za-z0-9][^,]+?)(?:\s+код|\s+в\s+\d|\s*$)/i);
  return {
    action: actionMatch?.[1]?.trim() || '',
    place: placeMatch?.[1]?.trim() || '',
    code: codeMatch?.[1] || ''
  };
}

function getPeriodRange(period) {
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

function buildCalendarMonths(notes) {
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

function formatCalendarDateLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
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
    расход: 'Расходы',
    расходы: 'Расходы',
    работа: 'Работа',
    дом: 'Дом',
    машина: 'Машина',
    семья: 'Семья',
    здоровье: 'Здоровье',
    учеба: 'Учёба',
    учёба: 'Учёба',
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
  if (includesAny(source, ['идея', 'идею', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'Идеи';
  if (isFamilyContext(source)) return 'Семья';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'евро', 'рубл'])) return 'Расходы';
  const scoredFolder = scoreFolderSignals(source);
  if (scoredFolder) return scoredFolder;
  if (includesAny(source, ['стриж', 'встреч', 'встрет', 'прием', 'приём', 'барбер', 'парикмахер', 'договорились']) || hasDateOrTime(source)) return 'Встречи';
  if (includesAny(source, ['купить', 'покуп', 'магазин', 'продукт'])) return 'Покупки';
  if (includesAny(source, ['телефон', 'номер', 'контакт'])) return 'Контакты';
  if (includesAny(source, ['код', 'комбинац', 'цифр', 'пароль'])) return 'Коды и комбинации';
  if (includesAny(source, ['клиент', 'заказчик', 'цена'])) return 'Клиенты';
  if (includesAny(source, ['машина', 'авто', 'гараж', 'масло', 'бензин'])) return 'Машина';
  if (includesAny(source, ['дом', 'квартира', 'ремонт'])) return 'Дом';
  if (includesAny(source, ['задача', 'надо', 'нужно', 'сделать'])) return 'Задачи';
  return 'Разное';
}

function inferType(text) {
  const source = normalize(text);
  if (includesAny(source, ['идея', 'идею', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'idea';
  if (includesAny(source, ['телефон', 'номер телефона', 'контакт'])) return 'contact';
  if (includesAny(source, ['комбинац', 'код', 'цифр', 'пароль'])) return 'code';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'евро', 'рубл'])) return 'expense';
  if (includesAny(source, ['купить', 'покуп', 'магазин', 'продукт'])) return 'shopping_list';
  if (includesAny(source, ['клиент']) && includesAny(source, ['просил', 'нужно', 'надо', 'позвонить', 'написать', 'связаться', 'перезвонить'])) return 'task';
  if (isFamilyContext(source) && (includesAny(source, ['нужно', 'надо', 'сказать', 'напомнить']) || hasDateOrTime(source))) return 'task';
  if (includesAny(source, ['стриж', 'прием', 'приём', 'встреч', 'встрет', 'барбер', 'парикмахер', 'договорились']) || hasDateOrTime(source)) return 'appointment';
  if (includesAny(source, ['задача', 'надо', 'нужно', 'сделать'])) return 'task';
  return 'note';
}

function extractItems(text) {
  return String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '')
    .replace(/^(?:мне\s+)?(?:список покупок|список|купить|нужно купить|надо купить)[:\s-]*/i, '')
    .replace(/\s+и\s+/gi, ', ')
    .split(/[,.]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function deriveShoppingListTitle(items, text = '') {
  const normalizedItems = (items || []).map(item => normalize(item)).filter(Boolean);
  const source = normalize([text, ...normalizedItems].join(' '));

  const groups = [
    { title: 'Еда', signals: ['хлеб', 'сахар', 'молоко', 'сыр', 'мяс', 'куриц', 'овощ', 'фрукт', 'еда', 'продукт', 'чай', 'кофе', 'круп', 'макарон'] },
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
  return includesAny(source, ['добавь', 'еще', 'ещё']) && inferType(text) === 'shopping_list';
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

function createNoteFromLocalText(text) {
  const now = new Date().toISOString();
  const type = inferType(text);
  const folder = resolveFolderName(text, type);
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
    const eventMeta = parseAppointmentDateTime(content);
    const appointmentMeta = extractAppointmentMeta(content);
    let title = 'Встреча';
    if (normalize(content).includes('стриж')) title = 'Стрижка';
    else if (normalize(content).includes('врач')) title = 'Врач';
    else title = cleanTitle(content, 'Встреча');
    return {
      id: uid('note'), type, folder, title, content,
      dateLabel: eventMeta.dateLabel, time: eventMeta.time, eventAt: eventMeta.eventAt,
      actionLabel: appointmentMeta.action, placeLabel: appointmentMeta.place, codeLabel: appointmentMeta.code,
      tags: ['встреча', eventMeta.dateLabel, eventMeta.time, appointmentMeta.place, appointmentMeta.code, ...tags].filter(Boolean), createdAt: now, updatedAt: now
    };
  }

  return {
    id: uid('note'), type, folder, title: cleanTitle(content, TYPE_LABELS[type] || 'Заметка'), content,
    tags, createdAt: now, updatedAt: now, status: type === 'task' ? 'active' : undefined
  };
}

function createNoteFromAI(plan, fallbackText) {
  if (!plan || typeof plan !== 'object') return createNoteFromLocalText(fallbackText);
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
    const eventMeta = parseAppointmentDateTime(plan.content || fallbackText);
    const appointmentMeta = extractAppointmentMeta(plan.content || fallbackText);
    return {
      id: uid('note'),
      type,
      folder: plan.folder || resolveFolderName(fallbackText, type),
      title: plan.title || cleanTitle(plan.content || fallbackText, 'Встреча'),
      content: plan.content || fallbackText,
      dateLabel: plan.dateLabel || eventMeta.dateLabel,
      time: plan.time || eventMeta.time,
      eventAt: plan.eventAt || eventMeta.eventAt,
      actionLabel: plan.actionLabel || appointmentMeta.action,
      placeLabel: plan.placeLabel || appointmentMeta.place,
      codeLabel: plan.codeLabel || appointmentMeta.code,
      tags: ['встреча', ...(plan.tags || [])],
      createdAt: now,
      updatedAt: now
    };
  }

  return { id: uid('note'), type, folder: plan.folder || resolveFolderName(fallbackText, type), title: plan.title || cleanTitle(plan.content || fallbackText, TYPE_LABELS[type] || 'Заметка'), content: plan.content || fallbackText, tags: Array.isArray(plan.tags) ? plan.tags : [], createdAt: now, updatedAt: now };
}

function detectIntent(text) {
  const source = normalize(text);
  if (includesAny(source, ['удали', 'удалить', 'очисти', 'сотри', 'стереть'])) return 'delete';
  if (includesAny(source, ['переименуй', 'назови запись как'])) return 'rename';
  if (includesAny(source, ['перемести это в', 'перенеси это в', 'перемести запись в', 'перенеси запись в'])) return 'move';
  if (includesAny(source, ['измени последнюю запись', 'открой последнюю запись для изменения'])) return 'edit';
  if (includesAny(source, ['добавь туда', 'добавь ещё туда', 'добавь еще туда', 'добавь в запись', 'добавь в список'])) return 'append';
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
  if (includesAny(source, ['запомни', 'запиши', 'сохрани', 'добавь', 'нужно запомнить', 'надо запомнить'])) return 'save';
  if (includesAny(source, ['у меня идея', 'есть идея'])) return 'save';
  if (includesAny(source, ['мне нужно', 'мне надо', 'надо', 'нужно', 'хочу'])) return 'save';
  if (inferType(text) !== 'note') return 'save';
  if (hasDateOrTime(source) || includesAny(source, ['на стрижку', 'к врачу', 'на прием', 'на приём', 'встреча', 'встретиться', 'встретится'])) return 'save';
  return 'unknown';
}

function searchNotes(notes, query) {
  const q = normalize(query)
    .replace(/^(найди|найти|покажи|выведи|поищи|мне)\s*/g, '')
    .replace(/\b(заметку|запись|номер|телефон|контакт|идею|задачу|про|мне)\b/g, '')
    .trim();
  const terms = q.split(' ').filter(t => t.length > 1);
  if (!terms.length) return [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes
    .map(note => {
      const haystack = normalize([
        note.title, note.content, note.folder, note.name, note.description, note.phone,
        ...(note.tags || []), ...(note.items || [])
      ].join(' '));
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { note, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.note.createdAt) - new Date(a.note.createdAt))
    .map(x => x.note);
}

function findFolderByText(folders, text) {
  const source = normalize(text);
  return folders.find(folder => source.includes(normalize(folder.name))) || null;
}

function extractFolderListIndex(text) {
  const source = normalize(text);
  const match = source.match(/(?:спис(?:ок|ка)|запис(?:ь|и|ку))\s+(\d{1,3})/i);
  return match ? Number(match[1]) : null;
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

function shareText(note) {
  if (!note) return '';
  if (note.type === 'contact') return `${note.title}\nТелефон: ${note.phone || 'не указан'}`;
  if (note.type === 'shopping_list') return `${note.title}\n${(note.items || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
  if (note.type === 'appointment') return `${note.title}\n${note.dateLabel || ''} ${note.time || ''}\n${note.content}`.trim();
  if (normalize(note.title) === normalize(note.content)) return `${note.title}`.trim();
  return `${note.title}\n${note.content || ''}`.trim();
}

function contactSpeechText(note) {
  if (!note) return '';
  if (note.phone) return `Телефон ${note.phone}`;
  return shareText(note);
}

function noteSignature(note) {
  return JSON.stringify({
    type: note?.type || '',
    folder: normalize(note?.folder || ''),
    title: normalize(note?.title || ''),
    content: normalize(note?.content || ''),
    phone: note?.phone || '',
    time: note?.time || '',
    dateLabel: normalize(note?.dateLabel || ''),
    items: Array.isArray(note?.items) ? note.items.map(item => normalize(item)).sort() : []
  });
}

function canonicalNoteText(note) {
  return normalize([note?.title || '', note?.content || '', note?.name || '', note?.description || '', ...(note?.items || [])].join(' '))
    .split(' ')
    .map(word => word.replace(/[^a-zа-я0-9-]/gi, '').trim())
    .filter(Boolean)
    .filter(word => word.length > 2)
    .filter(word => !DEDUPE_STOP_WORDS.has(word))
    .join(' ');
}

function tokenOverlapRatio(a, b) {
  const left = [...new Set(String(a || '').split(' ').filter(Boolean))];
  const right = new Set(String(b || '').split(' ').filter(Boolean));
  if (!left.length || !right.size) return 0;
  const intersection = left.filter(token => right.has(token)).length;
  return intersection / Math.max(left.length, right.size);
}

function isSameOrNearDuplicate(existing, incoming) {
  if (!existing || !incoming) return false;
  if (noteSignature(existing) === noteSignature(incoming)) return true;

  const sameFolder = normalize(existing.folder) === normalize(incoming.folder);
  const sameType = String(existing.type || '') === String(incoming.type || '');
  const sameTitle = normalize(existing.title) === normalize(incoming.title);
  const sameContent = normalize(existing.content) === normalize(incoming.content);
  const samePhone = String(existing.phone || '') !== '' && String(existing.phone || '') === String(incoming.phone || '');
  const sameItems = JSON.stringify((existing.items || []).map(item => normalize(item)).sort()) === JSON.stringify((incoming.items || []).map(item => normalize(item)).sort());
  const canonicalExisting = canonicalNoteText(existing);
  const canonicalIncoming = canonicalNoteText(incoming);
  const overlap = tokenOverlapRatio(canonicalExisting, canonicalIncoming);
  const containsSameMeaning =
    canonicalExisting && canonicalIncoming &&
    (canonicalExisting === canonicalIncoming ||
      canonicalExisting.includes(canonicalIncoming) ||
      canonicalIncoming.includes(canonicalExisting) ||
      overlap >= 0.72);

  return sameFolder && sameType && ((sameTitle && sameContent) || samePhone || sameItems || containsSameMeaning);
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

function localAIPlan(text, data, currentNote) {
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
        action: 'save_contact', type: 'contact', folder: resolveFolderName(text, 'contact'), title: `${c.name}${c.description ? ` — ${c.description}` : ''}`,
        content, name: c.name, description: c.description, phone: c.phone,
        tags: [c.name, c.description, 'телефон', 'контакт'].filter(Boolean), showAfterSave
      };
    }
    if (type === 'shopping_list') {
      const items = extractItems(content);
      return { action: 'save_shopping_list', type, folder: resolveFolderName(text, type), title: 'Список покупок', content: items.join(', '), items, tags: ['покупки', 'магазин', ...items], showAfterSave };
    }
    if (type === 'code') {
      return { action: 'save_code', type, folder: resolveFolderName(text, type), title: 'Комбинация цифр', content: extractDigits(content) || content, tags: ['код', 'комбинация', 'цифры'], showAfterSave };
    }
    if (type === 'appointment') {
      const appointmentTime = extractAppointmentTime(content);
      const appointmentDate = extractAppointmentDateLabel(content);
      let title = cleanTitle(content, 'Встреча');
      if (source.includes('стриж')) title = 'Стрижка';
      else if (source.includes('врач')) title = 'Врач';
      return { action: 'save_appointment', type, folder: resolveFolderName(text, type), title, content, dateLabel: appointmentDate, time: appointmentTime, tags: ['встреча', appointmentDate, appointmentTime].filter(Boolean), showAfterSave };
    }
    if (type === 'idea') {
      return { action: 'save_idea', type, folder: 'Идеи', title: cleanTitle(content, 'Идея'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    if (type === 'task') {
      return { action: 'save_task', type, folder: resolveFolderName(text, type), title: cleanTitle(content, 'Задача'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    return { action: 'save_note', type: 'note', folder: resolveFolderName(text, 'note'), title: cleanTitle(content, 'Заметка'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
  }

  return { action: 'unknown', type: 'unknown' };
}

function NoteCard({ note, selected, onOpen, onShare, onCopy, onDelete, onCall, onMessage, onRestore }) {
  const hasDuplicateBody = normalize(note.title) === normalize(note.content);
  return (
    <article className={`note-card ${selected ? 'selected' : ''}`}>
      <button className="note-main" onClick={() => onOpen(note)}>
        <div className="note-top">
          <span>{note.folder} · {TYPE_LABELS[note.type] || 'Запись'}</span>
          <small>{formatDate(note.createdAt)}</small>
        </div>
        <h3>{note.title}</h3>
        {note.type === 'shopping_list' ? (
          <ul>{(note.items || []).map((item, i) => <li key={`${note.id}_${i}`}>{item}</li>)}</ul>
        ) : note.type === 'contact' ? (
          <p><b>Телефон:</b> {note.phone || 'не распознан'}{note.description ? <><br /><b>Описание:</b> {note.description}</> : null}</p>
        ) : note.type === 'appointment' ? (
          <p>
            <b>Когда:</b> {[note.dateLabel, note.time].filter(Boolean).join(', ') || 'не указано'}
            {note.actionLabel ? <><br /><b>Действие:</b> {note.actionLabel}</> : null}
            {note.placeLabel ? <><br /><b>Место:</b> {note.placeLabel}</> : null}
            {note.codeLabel ? <><br /><b>Код:</b> {note.codeLabel}</> : null}
            <br />{note.content}
          </p>
        ) : (
          !hasDuplicateBody ? <p>{note.content}</p> : null
        )}
      </button>
      <div className="actions">
        {note.type === 'contact' && note.phone && <button onClick={() => onCall(note)}>Позвонить</button>}
        {note.type === 'contact' && note.phone && <button onClick={() => onMessage(note)}>Написать</button>}
        <button onClick={() => onShare(note)}>Поделиться</button>
        <button onClick={() => onCopy(note)}>Копировать</button>
        {onRestore && <button onClick={() => onRestore(note)}>Восстановить</button>}
        <button className="danger" onClick={() => onDelete(note)}>Удалить</button>
      </div>
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
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [selectedVoiceStyle, setSelectedVoiceStyle] = useState('default');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState('');
  const [calendarNoteText, setCalendarNoteText] = useState('');
  const [calendarNoteTime, setCalendarNoteTime] = useState('09:00');
  const [reminderSettings, setReminderSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}');
      return {
        enabled: Boolean(saved?.enabled ?? false),
        morningTime: String(saved?.morningTime || '09:00'),
        secondReminderTime: String(saved?.secondReminderTime || '17:30')
      };
    } catch {
      return { enabled: false, morningTime: '09:00', secondReminderTime: '17:30' };
    }
  });
  const useAI = true;
  const recognitionRef = useRef(null);
  const lastCommandRef = useRef({ text: '', at: 0 });
  const lastSavedRef = useRef({ signature: '', at: 0 });
  const firedReminderRef = useRef(new Set());

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
    if (typeof window === 'undefined' || !('Notification' in window)) return undefined;
    const timeouts = [];
    const scheduleNotification = (note, remindAt, label) => {
      const delay = remindAt.getTime() - Date.now();
      if (delay <= 0) return;
      const key = `${note.id}_${label}_${remindAt.toISOString()}`;
      if (firedReminderRef.current.has(key)) return;
      const timeoutId = window.setTimeout(() => {
        firedReminderRef.current.add(key);
        if (Notification.permission === 'granted') {
          new Notification(note.title || 'Напоминание', {
            body: [note.dateLabel, note.time, note.placeLabel || note.content].filter(Boolean).join(' · ')
          });
        }
        speak(`Напоминание: ${note.title}.`, selectedVoiceURI, selectedVoiceStyle);
      }, delay);
      timeouts.push(timeoutId);
    };

    data.notes
      .filter(note => note.type === 'appointment' && note.eventAt)
      .forEach(note => {
        const eventAt = new Date(note.eventAt);
        if (Number.isNaN(eventAt.getTime())) return;
        const morningAt = new Date(eventAt);
        const [morningHour, morningMinute] = String(reminderSettings.morningTime || '09:00').split(':').map(Number);
        morningAt.setHours(morningHour || 0, morningMinute || 0, 0, 0);
        const secondAt = new Date(eventAt);
        const [secondHour, secondMinute] = String(reminderSettings.secondReminderTime || '17:30').split(':').map(Number);
        secondAt.setHours(secondHour || 0, secondMinute || 0, 0, 0);
        if (reminderSettings.enabled && Notification.permission === 'granted') {
          scheduleNotification(note, morningAt, 'morning');
          scheduleNotification(note, secondAt, 'before');
        }
      });

    return () => {
      timeouts.forEach(id => window.clearTimeout(id));
    };
  }, [data.notes, reminderSettings, selectedVoiceStyle, selectedVoiceURI]);

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
    if (query.trim()) list = searchNotes(list, query);
    return list;
  }, [data.notes, selectedFolder, query, historyFilter]);
  const calendarMonths = useMemo(() => buildCalendarMonths(data.notes), [data.notes]);

  function setStatusVoice(text, voice = true) {
    setStatus(text);
    if (voice) speak(text, selectedVoiceURI, selectedVoiceStyle);
  }

  function openFolder(folderName, voice = true) {
    if (!folderName) return setStatusVoice('Не понял, какую папку открыть.', voice);
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
      const items = extractItems(`купить ${addition}`);
      return appendToLatestShoppingList(selectedNote.folder, items, addition);
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

  function saveNote(note, showAfterSave = false) {
    const freshWindowMs = 300000;
    let duplicateDetected = false;
    const incomingSignature = noteSignature(note);
    if (
      lastSavedRef.current.signature === incomingSignature &&
      Date.now() - lastSavedRef.current.at < freshWindowMs
    ) {
      setStatusVoice(`Такая запись уже только что сохранена в папку ${note.folder}.`, false);
      return;
    }

    setData(prev => {
      const nowTs = Date.now();
      const duplicate = prev.notes
        .slice(0, 100)
        .find(existing => isSameOrNearDuplicate(existing, note) && nowTs - new Date(existing.createdAt).getTime() <= freshWindowMs);

      if (duplicate) {
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
      setStatusVoice(`Такая запись уже только что сохранена в папку ${note.folder}.`, false);
      return;
    }

    lastSavedRef.current = { signature: incomingSignature, at: Date.now() };
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    setSuggestedFolder('');
    setStatusVoice(showAfterSave ? `Сохранено и показано: ${note.title}.` : `Сохранено в папку ${note.folder}.`);
  }

  function appendToLatestShoppingList(folderName, items, rawText = '') {
    if (!folderName || !items?.length) return false;
    const latestList = [...data.notes]
      .filter(note => note.folder === folderName && note.type === 'shopping_list')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (!latestList) return false;

    const mergedItems = [...new Set([...(latestList.items || []), ...items].map(item => String(item || '').trim()).filter(Boolean))];
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
          content: mergedItems.join(', '),
          updatedAt: new Date().toISOString(),
          tags: [...new Set(['покупки', 'магазин', ...mergedItems])]
        }
        : note)
    }));
    setSelectedId(latestList.id);
    setSelectedFolder(folderName);
    setSuggestedFolder('');
    setStatusVoice(`Добавлено в список ${mergedTitle}.`, false);
    return true;
  }

  function openNote(note) {
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    setStatusVoice(`Открыта запись: ${note.title}.`, false);
  }

  function performSearch(text) {
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
    setSelectedFolder('Все');
    setQuery('');
    setSelectedId(null);
    const labels = { today: 'сегодня', yesterday: 'вчера', week: 'за неделю', all: 'все записи' };
    setStatusVoice(`Показываю записи ${labels[period] || 'за период'}.`, false);
  }

  function selectCalendarDate(date) {
    if (!date) return;
    const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
    setCalendarSelectedDate(iso);
    setStatusVoice(`Выбрана дата ${formatCalendarDateLabel(date)}.`, false);
  }

  function saveCalendarNote() {
    if (!calendarSelectedDate) return setStatusVoice('Сначала выберите дату в календаре.', false);
    const content = String(calendarNoteText || '').trim();
    if (!content) return setStatusVoice('Введите заметку для выбранной даты.', false);
    const selectedDate = new Date(calendarSelectedDate);
    const [hour, minute] = String(calendarNoteTime || '09:00').split(':').map(Number);
    selectedDate.setHours(hour || 0, minute || 0, 0, 0);
    const type = inferType(content);
    const folder = resolveFolderName(content, type === 'note' ? 'appointment' : type);
    const appointmentMeta = extractAppointmentMeta(content);
    const note = {
      id: uid('note'),
      type: 'appointment',
      folder,
      title: cleanTitle(content, 'Напоминание'),
      content,
      dateLabel: formatCalendarDateLabel(selectedDate),
      time: String(calendarNoteTime || '09:00'),
      eventAt: selectedDate.toISOString(),
      actionLabel: appointmentMeta.action || '',
      placeLabel: appointmentMeta.place || '',
      codeLabel: appointmentMeta.code || '',
      tags: ['встреча', formatCalendarDateLabel(selectedDate), String(calendarNoteTime || '09:00')],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveNote(note, true);
    setCalendarNoteText('');
  }

  async function enableNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatusVoice('Этот браузер не поддерживает уведомления.', false);
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') setStatusVoice('Уведомления разрешены.', false);
    else setStatusVoice('Разрешение на уведомления не выдано.', false);
  }

  async function toggleRemindersEnabled(nextValue) {
    if (!nextValue) {
      setReminderSettings(prev => ({ ...prev, enabled: false }));
      setStatusVoice('Напоминания выключены.', false);
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatusVoice('Этот браузер не поддерживает уведомления.', false);
      return;
    }
    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setReminderSettings(prev => ({ ...prev, enabled: false }));
        return setStatusVoice('Разрешение на уведомления не выдано.', false);
      }
    }
    setReminderSettings(prev => ({ ...prev, enabled: true }));
    setStatusVoice('Напоминания включены.', false);
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
    const indexedFolder = findFolderByText(data.folders, text);
    const indexedNumber = extractFolderListIndex(text);
    if (indexedFolder && indexedNumber) return deleteFolderIndexedNote(indexedFolder.name, indexedNumber);
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
    if (plan.action === 'save_shopping_list' && isShoppingAppendCommand(originalText)) {
      const appendItems = Array.isArray(plan.items) && plan.items.length ? plan.items : extractItems(plan.content || originalText);
      if (appendToLatestShoppingList(plan.folder || resolveFolderName(originalText, 'shopping_list'), appendItems, originalText)) return true;
    }
    if (plan.action.startsWith('save_')) {
      const note = createNoteFromAI(plan, originalText);
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
    if (
      lastCommandRef.current.text === normalizedSpoken &&
      nowTs - lastCommandRef.current.at < 8000
    ) {
      setStatusVoice('Повтор команды пропущен.', false);
      return;
    }
    lastCommandRef.current = { text: normalizedSpoken, at: nowTs };
    setCommand(spoken);
    const source = normalizedSpoken;

    if (startsWithAny(source, ['создай папку', 'создать папку'])) {
      const folderName = extractFolderCreateName(spoken) || cleanTitle(spoken.replace(/создай папку|создать папку/gi, ''), 'Новая папка');
      setData(prev => ({ ...prev, folders: ensureFolder(prev.folders, folderName) }));
      setSelectedFolder(folderName);
      setSelectedId(null);
      setSuggestedFolder('');
      return setStatusVoice(`Папка ${folderName} создана или уже существует.`);
    }

    if (useAI) {
      setStatus('Локальный AI разбирает команду...');
      const plan = localAIPlan(spoken, data, selectedNote);
      const handled = await executePlan(plan, spoken);
      if (handled) return;
    }

    const intent = detectIntent(spoken);
    if (intent === 'save') {
      if (isShoppingAppendCommand(spoken)) {
        const targetFolder = resolveFolderName(spoken, 'shopping_list');
        const items = extractItems(spoken);
        if (appendToLatestShoppingList(targetFolder, items, spoken)) return;
      }
      return saveNote(createNoteFromLocalText(spoken), includesAny(spoken, ['выведи', 'покажи', 'открой', 'на экран']));
    }
    if (intent === 'history') {
      if (includesAny(spoken, ['вчера', 'вчераш'])) return showPeriod('yesterday');
      if (includesAny(spoken, ['неделе', 'неделя'])) return showPeriod('week');
      return showPeriod('today');
    }
    if (intent === 'edit') return openLatestForEdit();
    if (intent === 'rename') return renameCurrentNote(extractRenameValue(spoken));
    if (intent === 'move') return moveCurrentNote(extractMoveFolderName(spoken));
    if (intent === 'append') return appendToCurrentNote(extractAppendText(spoken));
    if (intent === 'search') return performSearch(spoken);
    if (intent === 'show_latest') return showLatest(spoken);
    if (intent === 'delete') return handleDelete(spoken);
    if (intent === 'open_folder') {
      const folderMatch = findFolderByText(data.folders, spoken);
      return folderMatch ? openFolder(folderMatch.name) : setStatusVoice('Не понял, какую папку открыть.', false);
    }
    if (intent === 'copy') {
      const folderMatch = findFolderByText(data.folders, spoken);
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
    if (intent === 'share') return selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.');
    if (intent === 'read') {
      const folderMatch = findFolderByText(data.folders, spoken);
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
      return found?.type === 'contact' ? callNote(found) : setStatusVoice('Не нашёл контакт для звонка.');
    }
    if (intent === 'message') {
      const found = searchNotes(data.notes.filter(n => n.type === 'contact'), spoken)[0] || selectedNote;
      return found?.type === 'contact' ? messageNote(found) : setStatusVoice('Не нашёл контакт для сообщения.');
    }
    if (intent === 'create_folder') {
      const name = extractExplicitFolder(spoken) || cleanTitle(spoken.replace(/создай папку|создать папку/gi, ''), 'Новая папка');
      setData(prev => ({ ...prev, folders: ensureFolder(prev.folders, name) }));
      setSelectedFolder(name);
      return setStatusVoice(`Папка ${name} создана или уже существует.`);
    }
    setStatusVoice('Я пока не понял команду. Попробуйте сказать: запомни идею, найди заметку, покажи последнюю.');
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

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>АИ Блокнот</h1>
        </div>
        <div className="hero-actions">
          <button
            className="icon-button"
            onClick={() => {
              setSettingsOpen(value => {
                const next = !value;
                if (next) setCalendarOpen(false);
                return next;
              });
            }}
            aria-label="Открыть настройки голоса"
          >
            ⚙
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setCalendarOpen(value => {
                const next = !value;
                if (next) setSettingsOpen(false);
                return next;
              });
            }}
            aria-label="Открыть календарь"
          >
            🗓
          </button>
          <button className={listening ? 'danger big' : 'primary big'} onClick={listening ? stopListening : startListening}>{listening ? 'Остановить' : 'Говорить'}</button>
        </div>
      </header>

      {settingsOpen ? (
        <section className="settings-panel">
          <div className="settings-head">
            <strong>Голос помощника</strong>
            <button onClick={() => setSettingsOpen(false)}>Закрыть</button>
          </div>
          <div className="voice-style-list">
            {['default', 'male', 'child', 'robot'].map(style => (
              <button
                key={style}
                className={selectedVoiceStyle === style ? 'voice-style-option active' : 'voice-style-option'}
                onClick={() => {
                  setSelectedVoiceStyle(style);
                  speak(`Выбран стиль ${getVoiceStyleConfig(style).label}`, selectedVoiceURI, style);
                }}
              >
                {getVoiceStyleConfig(style).label}
              </button>
            ))}
          </div>
          <div className="voice-list">
            {voiceOptions.length ? voiceOptions.map(voice => (
              <button
                key={voice.voiceURI}
                className={selectedVoiceURI === voice.voiceURI ? 'voice-option active' : 'voice-option'}
                onClick={() => {
                  setSelectedVoiceURI(voice.voiceURI);
                  speak(`Выбран голос ${voice.name}`, voice.voiceURI, selectedVoiceStyle);
                }}
              >
                <span>{voiceDisplayMeta(voice).title}</span>
                <small>{voiceDisplayMeta(voice).subtitle}</small>
              </button>
            )) : <div className="folder-note-empty">Голоса браузера пока не загрузились</div>}
          </div>
          <div className="settings-head">
            <strong>Напоминания</strong>
            <label className="switch">
              <input type="checkbox" checked={Boolean(reminderSettings.enabled)} onChange={e => toggleRemindersEnabled(e.target.checked)} />
              <span className="slider" />
            </label>
          </div>
          <div className="reminder-grid">
            <label>
              <span>Утреннее напоминание</span>
              <input type="time" value={reminderSettings.morningTime} onChange={e => setReminderSettings(prev => ({ ...prev, morningTime: e.target.value || '09:00' }))} />
            </label>
            <label>
              <span>Второе напоминание</span>
              <input type="time" value={reminderSettings.secondReminderTime} onChange={e => setReminderSettings(prev => ({ ...prev, secondReminderTime: e.target.value || '17:30' }))} />
            </label>
          </div>
        </section>
      ) : null}

      {calendarOpen ? (
        <section className="settings-panel calendar-panel">
          <div className="settings-head">
            <strong>Календарь на 5 лет</strong>
            <button onClick={() => setCalendarOpen(false)}>Закрыть</button>
          </div>
          <div className="calendar-compose">
            <div className="calendar-selected">
              {calendarSelectedDate ? `Выбрано: ${formatCalendarDateLabel(new Date(calendarSelectedDate))}` : 'Выберите число'}
            </div>
            <div className="calendar-compose-row">
              <input type="time" value={calendarNoteTime} onChange={e => setCalendarNoteTime(e.target.value || '09:00')} />
              <input value={calendarNoteText} onChange={e => setCalendarNoteText(e.target.value)} placeholder="Что добавить на эту дату" />
              <button className="primary" onClick={saveCalendarNote}>Сохранить</button>
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
                    const hasItems = month.items.some(note => String(note.eventAt || '').slice(0, 10) === dayIso.slice(0, 10));
                    const isSelected = calendarSelectedDate && String(calendarSelectedDate).slice(0, 10) === dayIso.slice(0, 10);
                    return (
                      <button
                        key={`${month.key}_${dayIndex + 1}`}
                        className={`calendar-day${hasItems ? ' has-items' : ''}${isSelected ? ' active' : ''}`}
                        onClick={() => selectCalendarDate(dayDate)}
                      >
                        {dayIndex + 1}
                      </button>
                    );
                  })}
                </div>
                {month.items.length ? month.items.map(note => (
                  <button key={note.id} className="calendar-item" onClick={() => openNote(note)}>
                    <strong>{note.title}</strong>
                    <span>{[note.dateLabel, note.time, note.placeLabel].filter(Boolean).join(' · ')}</span>
                  </button>
                )) : <div className="folder-note-empty">Пока пусто</div>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="status-grid">
        <div className="status-card wide">
          <span>Статус</span>
          <strong>{status}</strong>
          {suggestedFolder ? <button onClick={() => openFolder(suggestedFolder, false)}>Открыть папку {suggestedFolder}</button> : null}
          <div className="history-chips">
            <button className={historyFilter === 'today' ? 'active' : ''} onClick={() => showPeriod('today')}>Сегодня</button>
            <button className={historyFilter === 'yesterday' ? 'active' : ''} onClick={() => showPeriod('yesterday')}>Вчера</button>
            <button className={historyFilter === 'week' ? 'active' : ''} onClick={() => showPeriod('week')}>Неделя</button>
            <button className={historyFilter === 'all' ? 'active' : ''} onClick={() => setHistoryFilter('all')}>За всё время</button>
          </div>
        </div>
        <form className="manual" onSubmit={submitManual}>
          <input value={command} onChange={e => setCommand(e.target.value)} placeholder="Напишите команду или нажмите «Говорить»" />
          <button className="primary">Выполнить</button>
        </form>
      </section>

      <main className="layout">
        <aside className="panel folders">
          <h2>Папки</h2>
          <button className={selectedFolder === 'Все' ? 'folder active' : 'folder'} onClick={() => setSelectedFolder('Все')}>Все записи <span>{data.notes.length}</span></button>
          {data.folders.map(folder => {
            const folderNotes = [...data.notes]
              .filter(n => n.folder === folder.name)
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const count = folderNotes.length;
            const expanded = Boolean(expandedFolders[folder.name]);
            return (
              <div key={folder.id} className="folder-block">
                <div className={selectedFolder === folder.name ? 'folder-row active' : 'folder-row'}>
                  <button className={selectedFolder === folder.name ? 'folder folder-trigger active' : 'folder folder-trigger'} onClick={() => setSelectedFolder(folder.name)}>
                    {folder.name}
                    <span>{count}</span>
                  </button>
                  <div className="folder-controls">
                    <button
                      className="folder-expand"
                      onClick={() => toggleFolderExpand(folder.name)}
                      aria-label={expanded ? `Свернуть папку ${folder.name}` : `Развернуть папку ${folder.name}`}
                    >
                      {expanded ? '−' : '+'}
                    </button>
                    <button
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
                            className="folder-note-copy-button"
                            onClick={() => copyNote(note)}
                            aria-label={`Скопировать запись ${note.title}`}
                          >
                            ⧉
                          </button>
                          <button
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
                            className="folder-note-expand"
                            onClick={() => toggleNoteExpand(note.id)}
                            aria-label={expandedNotes[note.id] ? `Свернуть запись ${note.title}` : `Развернуть запись ${note.title}`}
                          >
                            {expandedNotes[note.id] ? '−' : '+'}
                          </button>
                          <button
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
              disabled={selectedFolder === 'Все' || !data.notes.some(n => n.folder === selectedFolder)}
              onClick={() => clearFolderNow(selectedFolder)}
            >
              Очистить папку
            </button>
            <button
              className="danger"
              disabled={!data.notes.length}
              onClick={clearNotebookNow}
            >
              Очистить блокнот
            </button>
          </div>
        </aside>

        <section className="panel notes">
          <div className="notes-head">
            <div><h2>{selectedFolder}</h2><p>{visibleNotes.length} записей</p></div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по заметкам" />
          </div>
          {selectedNote ? <div className="selected-inline"><NoteCard note={selectedNote} selected onOpen={openNote} onShare={shareNote} onCopy={copyNote} onDelete={deleteNoteNow} onCall={callNote} onMessage={messageNote} /></div> : null}
          <div className="note-list">
            {visibleNotes.length ? visibleNotes.map(note => <NoteCard key={note.id} note={note} selected={selectedId === note.id} onOpen={openNote} onShare={shareNote} onCopy={copyNote} onDelete={deleteNoteNow} onCall={callNote} onMessage={messageNote} />) : <div className="empty">Записей пока нет. Скажите или напишите команду.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
