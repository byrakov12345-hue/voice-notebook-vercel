import React, { useEffect, useMemo, useRef, useState } from 'react';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const STORAGE_KEY = 'smart_voice_notebook_live_v2';
const LEGACY_STORAGE_KEYS = ['smart_voice_notebook_live_v1'];

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

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(prepareSpeechText(text));
  msg.lang = 'ru-RU';
  const voices = window.speechSynthesis.getVoices?.() || [];
  const ruVoice = voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) || voices.find(voice => /russian|рус/i.test(voice.name));
  if (ruVoice) msg.voice = ruVoice;
  msg.rate = 0.92;
  msg.pitch = 1;
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

function cleanTitle(text, fallback = 'Заметка') {
  const value = String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь|создай|мне нужно|мне надо|нужно|надо|мне|хочу)\s*/i, '')
    .replace(/^(у меня идея|есть идея|идея|идею|задача|заметка|список покупок|номер телефона|комбинация цифр)[:\s-]*/i, '')
    .replace(/\s+и\s+(покажи|выведи|открой|прочитай).*$/i, '')
    .trim();
  return value ? capitalize(value.slice(0, 80)) : fallback;
}

function extractExplicitFolder(text) {
  const source = normalize(text);
  const match = source.match(/(?:в папку|в раздел|в категорию|создай папку|создать папку)\s+(.+?)(?:\s+и\s+|$)/);
  return match?.[1] ? capitalize(match[1]) : '';
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
  const ranked = Object.entries(FOLDER_SIGNALS)
    .map(([folder, signals]) => ({
      folder,
      score: signals.reduce((sum, signal) => sum + (source.includes(normalize(signal)) ? 1 : 0), 0)
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.folder || '';
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
  const folder = chooseFolder(text);
  const content = String(text || '').replace(/^(запомни|запиши|сохрани|добавь)\s*/i, '').trim();
  const tags = normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10);

  if (type === 'contact') {
    const c = extractContact(content);
    return {
      id: uid('note'), type, folder: 'Контакты', title: `${c.name}${c.description ? ` — ${c.description}` : ''}`,
      content, name: c.name, description: c.description, phone: c.phone,
      tags: [c.name, c.description, 'телефон', 'контакт'].filter(Boolean), createdAt: now, updatedAt: now
    };
  }

  if (type === 'shopping_list') {
    const items = extractItems(content);
    return {
      id: uid('note'), type, folder: 'Покупки', title: 'Список покупок', content: items.join(', '),
      items, checkedItems: [], tags: ['покупки', 'магазин', ...items], createdAt: now, updatedAt: now
    };
  }

  if (type === 'code') {
    const code = extractDigits(content) || content;
    return {
      id: uid('note'), type, folder: 'Коды и комбинации', title: 'Комбинация цифр', content: code,
      isSensitive: true, tags: ['код', 'комбинация', 'цифры'], createdAt: now, updatedAt: now
    };
  }

  if (type === 'appointment') {
    const time = extractAppointmentTime(content);
    const dateLabel = extractAppointmentDateLabel(content);
    let title = 'Встреча';
    if (normalize(content).includes('стриж')) title = 'Стрижка';
    else if (normalize(content).includes('врач')) title = 'Врач';
    else title = cleanTitle(content, 'Встреча');
    return {
      id: uid('note'), type, folder: resolveTimedEntryFolder(content), title, content,
      dateLabel, time, tags: ['встреча', dateLabel, time, ...tags].filter(Boolean), createdAt: now, updatedAt: now
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
    return { id: uid('note'), type, folder: plan.folder || 'Покупки', title: plan.title || 'Список покупок', content: items.join(', '), items, checkedItems: [], tags: ['покупки', 'магазин', ...items, ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  if (type === 'code') {
    return { id: uid('note'), type, folder: 'Коды и комбинации', title: plan.title || 'Комбинация цифр', content: plan.content || plan.code || extractDigits(fallbackText), isSensitive: true, tags: ['код', 'комбинация', ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  if (type === 'appointment') {
    return { id: uid('note'), type, folder: plan.folder || resolveTimedEntryFolder(plan.content || fallbackText), title: plan.title || cleanTitle(plan.content || fallbackText, 'Встреча'), content: plan.content || fallbackText, dateLabel: plan.dateLabel || extractAppointmentDateLabel(fallbackText), time: plan.time || extractAppointmentTime(fallbackText), tags: ['встреча', ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  return { id: uid('note'), type, folder: plan.folder || chooseFolder(fallbackText), title: plan.title || cleanTitle(plan.content || fallbackText, TYPE_LABELS[type] || 'Заметка'), content: plan.content || fallbackText, tags: Array.isArray(plan.tags) ? plan.tags : [], createdAt: now, updatedAt: now };
}

function detectIntent(text) {
  const source = normalize(text);
  if (includesAny(source, ['удали', 'удалить', 'очисти', 'сотри', 'стереть'])) return 'delete';
  if (includesAny(source, ['поделись', 'поделиться', 'отправь', 'скинь'])) return 'share';
  if (includesAny(source, ['прочитай', 'зачитай', 'озвучь', 'продиктуй'])) return 'read';
  if (includesAny(source, ['открой папку', 'покажи папку', 'перейди в папку'])) return 'open_folder';
  if (startsWithAny(source, ['позвони', 'набери'])) return 'call';
  if (startsWithAny(source, ['напиши', 'смс', 'sms', 'whatsapp', 'ватсап', 'вацап'])) return 'message';
  if (includesAny(source, ['покажи послед', 'выведи послед', 'последнюю заметку', 'что я только что записал'])) return 'show_latest';
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

function isSameOrNearDuplicate(existing, incoming) {
  if (!existing || !incoming) return false;
  if (noteSignature(existing) === noteSignature(incoming)) return true;

  const sameFolder = normalize(existing.folder) === normalize(incoming.folder);
  const sameType = String(existing.type || '') === String(incoming.type || '');
  const sameTitle = normalize(existing.title) === normalize(incoming.title);
  const sameContent = normalize(existing.content) === normalize(incoming.content);
  const samePhone = String(existing.phone || '') !== '' && String(existing.phone || '') === String(incoming.phone || '');
  const sameItems = JSON.stringify((existing.items || []).map(item => normalize(item)).sort()) === JSON.stringify((incoming.items || []).map(item => normalize(item)).sort());

  return sameFolder && sameType && ((sameTitle && sameContent) || samePhone || sameItems);
}

function stripSaveWords(text) {
  return String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь|создай|мне нужно|мне надо|мне|у меня|есть|нужно|надо|хочу)\s*/i, '')
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
    if (includesAny(source, ['очисти корзину', 'удали корзину', 'удали все записи с корзины', 'удали всё с корзины'])) {
      return { action: 'delete_trash', target: 'trash' };
    }
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё', 'удали все с блокнота', 'удали всё с блокнота', 'очисти блокнот', 'очисти весь блокнот'])) {
      return { action: 'delete_all', target: 'all' };
    }
    if (includesAny(source, ['очисти папку', 'удали все в папке', 'удали папку'])) {
      const folderMatch = findFolderByText(data.folders, text);
      return { action: 'clear_folder', folder: folderMatch?.name || '', target: 'folder' };
    }
    if (source.includes('послед') && source.includes('папк')) {
      const folderMatch = findFolderByText(data.folders, text);
      return { action: 'delete_note', folder: folderMatch?.name || '', target: folderMatch ? 'folder_latest' : 'latest' };
    }
    if (source.includes('послед')) return { action: 'delete_note', target: 'latest' };
    if (includesAny(source, ['это', 'эту', 'ее', 'её', 'его']) && currentNote) return { action: 'delete_note', target: 'current' };
    return { action: 'delete_note', target: 'specific', query: text };
  }

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
  if (intent === 'search') return { action: 'search_notes', query: text };

  if (intent === 'create_folder') {
    return { action: 'create_folder', folder: extractExplicitFolder(text) || cleanTitle(text.replace(/создай папку|создать папку/gi, ''), 'Новая папка') };
  }

  if (intent === 'save') {
    if (type === 'contact') {
      const c = extractContact(content);
      return {
        action: 'save_contact', type: 'contact', folder: 'Контакты', title: `${c.name}${c.description ? ` — ${c.description}` : ''}`,
        content, name: c.name, description: c.description, phone: c.phone,
        tags: [c.name, c.description, 'телефон', 'контакт'].filter(Boolean), showAfterSave
      };
    }
    if (type === 'shopping_list') {
      const items = extractItems(content);
      return { action: 'save_shopping_list', type, folder: 'Покупки', title: 'Список покупок', content: items.join(', '), items, tags: ['покупки', 'магазин', ...items], showAfterSave };
    }
    if (type === 'code') {
      return { action: 'save_code', type, folder: 'Коды и комбинации', title: 'Комбинация цифр', content: extractDigits(content) || content, tags: ['код', 'комбинация', 'цифры'], showAfterSave };
    }
    if (type === 'appointment') {
      const appointmentTime = extractAppointmentTime(content);
      const appointmentDate = extractAppointmentDateLabel(content);
      let title = cleanTitle(content, 'Встреча');
      if (source.includes('стриж')) title = 'Стрижка';
      else if (source.includes('врач')) title = 'Врач';
      return { action: 'save_appointment', type, folder: resolveTimedEntryFolder(content), title, content, dateLabel: appointmentDate, time: appointmentTime, tags: ['встреча', appointmentDate, appointmentTime].filter(Boolean), showAfterSave };
    }
    if (type === 'idea') {
      return { action: 'save_idea', type, folder: 'Идеи', title: cleanTitle(content, 'Идея'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    if (type === 'task') {
      return { action: 'save_task', type, folder: chooseFolder(content || text), title: cleanTitle(content, 'Задача'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    return { action: 'save_note', type: 'note', folder, title: cleanTitle(content, 'Заметка'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
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
          <p><b>Когда:</b> {[note.dateLabel, note.time].filter(Boolean).join(', ') || 'не указано'}<br />{note.content}</p>
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
  const useAI = true;
  const recognitionRef = useRef(null);

  const selectedNote = data.notes.find(n => n.id === selectedId) || null;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  }, [data]);

  const visibleNotes = useMemo(() => {
    let list = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (selectedFolder !== 'Все') list = list.filter(n => n.folder === selectedFolder);
    if (query.trim()) list = searchNotes(list, query);
    return list;
  }, [data.notes, selectedFolder, query]);

  function setStatusVoice(text, voice = true) {
    setStatus(text);
    if (voice) speak(text);
  }

  function openFolder(folderName, voice = true) {
    if (!folderName) return setStatusVoice('Не понял, какую папку открыть.', voice);
    setSelectedFolder(folderName);
    setSelectedId(null);
    setQuery('');
    setSuggestedFolder('');
    setStatusVoice(`Открыта папка ${folderName}.`, voice);
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

  function clearNotebookNow() {
    if (!data.notes.length) return setStatusVoice('Блокнот уже пуст.', false);
    setData(prev => ({ ...prev, notes: [] }));
    setSelectedId(null);
    setSelectedFolder('Все');
    setStatusVoice('Блокнот очищен.', false);
  }

  function saveNote(note, showAfterSave = false) {
    const freshWindowMs = 90000;
    let duplicateDetected = false;

    setData(prev => {
      const nowTs = Date.now();
      const duplicate = prev.notes
        .slice(0, 25)
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

    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    setSuggestedFolder('');
    setStatusVoice(showAfterSave ? `Сохранено и показано: ${note.title}.` : `Сохранено в папку ${note.folder}.`);
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
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё', 'удали все с блокнота', 'удали всё с блокнота', 'очисти блокнот', 'очисти весь блокнот'])) return clearNotebookNow();
    if (includesAny(source, ['очисти корзину', 'удали корзину', 'удали все записи с корзины', 'удали всё с корзины'])) return setStatusVoice('Корзины больше нет. Записи удаляются сразу из папок.', false);
    if (includesAny(source, ['очисти папку', 'удали все в папке', 'удали папку'])) {
      const folder = findFolderByText(data.folders, text) || (selectedFolder !== 'Все' ? { name: selectedFolder } : null);
      return folder ? clearFolderNow(folder.name) : setStatusVoice('Не понял, какую папку очистить.', false);
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
    if (plan.action.startsWith('save_')) {
      const note = createNoteFromAI(plan, originalText);
      saveNote(note, Boolean(plan.showAfterSave || includesAny(originalText, ['выведи', 'покажи', 'открой', 'на экран'])));
      return true;
    }
    if (plan.action === 'search_notes') { performSearch(plan.query || originalText); return true; }
    if (plan.action === 'show_latest_note') { showLatest(plan.query || originalText); return true; }
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
    if (plan.action === 'delete_folder') { plan.folder ? clearFolderNow(plan.folder) : setStatusVoice('Не указана папка.', false); return true; }
    if (plan.action === 'delete_note') {
      const found =
        plan.target === 'current' ? selectedNote
          : plan.target === 'latest' ? [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
            : plan.target === 'folder_latest' && plan.folder ? [...data.notes].filter(note => note.folder === plan.folder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
              : searchNotes(data.notes, plan.query || originalText)[0];
      found ? deleteNoteNow(found) : setStatusVoice('Не нашёл запись для удаления.', false);
      return true;
    }
    if (plan.action === 'share_current') { selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_current') { selectedNote ? speak(shareText(selectedNote)) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_contact_latest') {
      const latestContact = [...data.notes]
        .filter(note => note.folder === 'Контакты' || note.type === 'contact')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!latestContact) setStatusVoice('В папке Контакты пока нет записей.');
      else {
        openNote(latestContact);
        speak(contactSpeechText(latestContact));
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
        speak(shareText(latestInFolder));
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
    setCommand(spoken);
    const source = normalize(spoken);

    if (useAI) {
      setStatus('Локальный AI разбирает команду...');
      const plan = localAIPlan(spoken, data, selectedNote);
      const handled = await executePlan(plan, spoken);
      if (handled) return;
    }

    const intent = detectIntent(spoken);
    if (intent === 'save') return saveNote(createNoteFromLocalText(spoken), includesAny(spoken, ['выведи', 'покажи', 'открой', 'на экран']));
    if (intent === 'search') return performSearch(spoken);
    if (intent === 'show_latest') return showLatest(spoken);
    if (intent === 'delete') return handleDelete(spoken);
    if (intent === 'open_folder') {
      const folderMatch = findFolderByText(data.folders, spoken);
      return folderMatch ? openFolder(folderMatch.name) : setStatusVoice('Не понял, какую папку открыть.', false);
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
        speak(contactSpeechText(latestContact));
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
        speak(shareText(latestInFolder));
        setSuggestedFolder(folderMatch.name);
        setStatus('');
        return;
      }
      return selectedNote ? speak(shareText(selectedNote)) : setStatusVoice('Сначала откройте запись.');
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
          <p>Микрофон, папки и быстрые команды. Остальное происходит в фоне.</p>
        </div>
        <div className="hero-actions">
          <button className={listening ? 'danger big' : 'primary big'} onClick={listening ? stopListening : startListening}>{listening ? 'Остановить' : 'Говорить'}</button>
        </div>
      </header>

      <section className="status-grid">
        <div className="status-card wide">
          <span>Статус</span>
          <strong>{status}</strong>
          {suggestedFolder ? <button onClick={() => openFolder(suggestedFolder, false)}>Открыть папку {suggestedFolder}</button> : null}
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
            const count = data.notes.filter(n => n.folder === folder.name).length;
            return <button key={folder.id} className={selectedFolder === folder.name ? 'folder active' : 'folder'} onClick={() => setSelectedFolder(folder.name)}>{folder.name}<span>{count}</span></button>;
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
