import React, { useEffect, useMemo, useRef, useState } from 'react';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const STORAGE_KEY = 'smart_voice_notebook_live_v1';

const DEFAULT_FOLDERS = [
  'Идеи', 'Встречи', 'Покупки', 'Задачи', 'Контакты', 'Коды и комбинации',
  'Расходы', 'Клиенты', 'Работа', 'Дом', 'Машина', 'Семья', 'Здоровье', 'Учёба', 'Важное', 'Разное'
];

const TYPE_LABELS = {
  note: 'Заметка', idea: 'Идея', appointment: 'Встреча', shopping_list: 'Список',
  task: 'Задача', contact: 'Контакт', code: 'Код', expense: 'Расход'
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

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = 'ru-RU';
  msg.rate = 0.95;
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
    notes: [],
    trash: []
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialData();
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed.folders) && parsed.folders.length ? parsed.folders : makeInitialData().folders,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      trash: Array.isArray(parsed.trash) ? parsed.trash : []
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
    .replace(/^(у меня идея|есть идея|идея|задача|заметка|список покупок|номер телефона|комбинация цифр)[:\s-]*/i, '')
    .replace(/\s+и\s+(покажи|выведи|открой|прочитай).*$/i, '')
    .trim();
  return value ? capitalize(value.slice(0, 80)) : fallback;
}

function extractExplicitFolder(text) {
  const source = normalize(text);
  const match = source.match(/(?:в папку|в раздел|в категорию|создай папку|создать папку)\s+(.+?)(?:\s+и\s+|$)/);
  return match?.[1] ? capitalize(match[1]) : '';
}

function chooseFolder(text) {
  const explicit = extractExplicitFolder(text);
  if (explicit) return explicit;
  const source = normalize(text);
  if (includesAny(source, ['идея', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'Идеи';
  if (includesAny(source, ['стриж', 'встреч', 'прием', 'приём', 'барбер', 'парикмахер']) || hasDateOrTime(source)) return 'Встречи';
  if (includesAny(source, ['купить', 'покуп', 'магазин', 'продукт'])) return 'Покупки';
  if (includesAny(source, ['телефон', 'номер', 'контакт'])) return 'Контакты';
  if (includesAny(source, ['код', 'комбинац', 'цифр', 'пароль'])) return 'Коды и комбинации';
  if (includesAny(source, ['клиент', 'заказчик', 'цена'])) return 'Клиенты';
  if (includesAny(source, ['машина', 'авто', 'гараж', 'масло', 'бензин'])) return 'Машина';
  if (includesAny(source, ['дом', 'квартира', 'ремонт'])) return 'Дом';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'евро', 'рубл'])) return 'Расходы';
  if (includesAny(source, ['задача', 'надо', 'нужно', 'сделать'])) return 'Задачи';
  return 'Разное';
}

function inferType(text) {
  const source = normalize(text);
  if (includesAny(source, ['идея', 'у меня идея', 'есть идея', 'придумал', 'придумала'])) return 'idea';
  if (includesAny(source, ['телефон', 'номер телефона', 'контакт'])) return 'contact';
  if (includesAny(source, ['комбинац', 'код', 'цифр', 'пароль'])) return 'code';
  if (includesAny(source, ['купить', 'покуп', 'магазин', 'продукт'])) return 'shopping_list';
  if (includesAny(source, ['стриж', 'прием', 'приём', 'встреч', 'барбер', 'парикмахер']) || hasDateOrTime(source)) return 'appointment';
  if (includesAny(source, ['потратил', 'потратила', 'расход', 'евро', 'рубл'])) return 'expense';
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
      id: uid('note'), type, folder: 'Встречи', title, content,
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
    return { id: uid('note'), type, folder: plan.folder || 'Встречи', title: plan.title || cleanTitle(plan.content || fallbackText, 'Встреча'), content: plan.content || fallbackText, dateLabel: plan.dateLabel || extractAppointmentDateLabel(fallbackText), time: plan.time || extractAppointmentTime(fallbackText), tags: ['встреча', ...(plan.tags || [])], createdAt: now, updatedAt: now };
  }

  return { id: uid('note'), type, folder: plan.folder || chooseFolder(fallbackText), title: plan.title || cleanTitle(plan.content || fallbackText, TYPE_LABELS[type] || 'Заметка'), content: plan.content || fallbackText, tags: Array.isArray(plan.tags) ? plan.tags : [], createdAt: now, updatedAt: now };
}

function detectIntent(text) {
  const source = normalize(text);
  if (includesAny(source, ['удали', 'удалить', 'очисти', 'сотри', 'стереть'])) return 'delete';
  if (includesAny(source, ['поделись', 'поделиться', 'отправь', 'скинь'])) return 'share';
  if (includesAny(source, ['прочитай', 'зачитай', 'озвучь'])) return 'read';
  if (includesAny(source, ['позвони', 'набери'])) return 'call';
  if (includesAny(source, ['напиши', 'смс', 'sms', 'whatsapp', 'ватсап', 'вацап'])) return 'message';
  if (includesAny(source, ['покажи послед', 'выведи послед', 'последнюю заметку', 'что я только что записал'])) return 'show_latest';
  if (includesAny(source, ['найди', 'найти', 'поищи', 'поиск', 'что я записывал'])) return 'search';
  if (includesAny(source, ['создай папку', 'создать папку'])) return 'create_folder';
  if (includesAny(source, ['запомни', 'запиши', 'сохрани', 'добавь', 'нужно запомнить', 'надо запомнить'])) return 'save';
  if (includesAny(source, ['у меня идея', 'есть идея'])) return 'save';
  if (includesAny(source, ['мне нужно', 'мне надо', 'надо', 'нужно', 'хочу'])) return 'save';
  if (inferType(text) !== 'note') return 'save';
  if (hasDateOrTime(source) || includesAny(source, ['на стрижку', 'к врачу', 'на прием', 'на приём', 'встреча'])) return 'save';
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
  return `${note.title}\n${note.content || ''}`.trim();
}

function stripSaveWords(text) {
  return String(text || '')
    .replace(/^(запомни|запиши|сохрани|добавь|создай|мне нужно|мне надо|мне|у меня|есть|нужно|надо|хочу)\s*/i, '')
    .replace(/^(идея|задача|заметка|список покупок|номер телефона|комбинация цифр)[:\s-]*/i, '')
    .replace(/\s+и\s+(покажи|выведи|открой|прочитай).*$/i, '')
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
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё'])) {
      return { action: 'delete_all', needsConfirmation: true, target: 'all' };
    }
    if (source.includes('папк')) {
      const folderMatch = data.folders.find(f => source.includes(normalize(f.name)));
      return { action: 'delete_folder', folder: folderMatch?.name || '', needsConfirmation: true, target: 'folder' };
    }
    if (source.includes('послед')) return { action: 'delete_note', target: 'latest', needsConfirmation: true };
    if (includesAny(source, ['это', 'эту', 'ее', 'её', 'его']) && currentNote) return { action: 'delete_note', target: 'current', needsConfirmation: true };
    return { action: 'delete_note', target: 'specific', query: text, needsConfirmation: true };
  }

  if (intent === 'share') return { action: 'share_current', target: 'current' };
  if (intent === 'read') {
    const folderMatch = findFolderByText(data.folders, text);
    if (folderMatch) return { action: 'read_folder_latest', folder: folderMatch.name, target: 'folder' };
    return { action: 'read_current', target: 'current' };
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
      return { action: 'save_appointment', type, folder: 'Встречи', title, content, dateLabel: appointmentDate, time: appointmentTime, tags: ['встреча', appointmentDate, appointmentTime].filter(Boolean), showAfterSave };
    }
    if (type === 'idea') {
      return { action: 'save_idea', type, folder: 'Идеи', title: cleanTitle(content, 'Идея'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    if (type === 'task') {
      return { action: 'save_task', type, folder: 'Задачи', title: cleanTitle(content, 'Задача'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
    }
    return { action: 'save_note', type: 'note', folder, title: cleanTitle(content, 'Заметка'), content, tags: normalize(content).split(' ').filter(w => w.length > 3).slice(0, 10), showAfterSave };
  }

  return { action: 'unknown', type: 'unknown' };
}

function NoteCard({ note, selected, onOpen, onShare, onCopy, onDelete, onCall, onMessage, onRestore }) {
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
          <p>{note.content}</p>
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
  const [pending, setPending] = useState(null);
  const useAI = true;
  const recognitionRef = useRef(null);

  const selectedNote = data.notes.find(n => n.id === selectedId) || null;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

  function saveNote(note, showAfterSave = false) {
    setData(prev => ({
      ...prev,
      folders: ensureFolder(prev.folders, note.folder),
      notes: [note, ...prev.notes]
    }));
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
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

  function requestDeleteNote(note) {
    setPending({ kind: 'note', noteId: note.id, message: 'Удалить эту запись? Она будет перемещена в корзину.', preview: shareText(note) });
  }

  function requestDeleteFolder(folderName) {
    const count = data.notes.filter(n => n.folder === folderName).length;
    setPending({ kind: 'folder', folderName, message: `Удалить папку “${folderName}” и записи внутри?`, preview: `Записей: ${count}` });
  }

  function requestDeleteAll() {
    setPending({ kind: 'all', message: 'Удалить все записи? Они будут перемещены в корзину.', preview: `Записей: ${data.notes.length}` });
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'note') {
      setData(prev => {
        const note = prev.notes.find(n => n.id === pending.noteId);
        return { ...prev, notes: prev.notes.filter(n => n.id !== pending.noteId), trash: note ? [{ ...note, deletedAt: new Date().toISOString() }, ...prev.trash] : prev.trash };
      });
      setSelectedId(null);
      setStatusVoice('Запись перемещена в корзину.');
    }
    if (pending.kind === 'folder') {
      setData(prev => {
        const moving = prev.notes.filter(n => n.folder === pending.folderName);
        return { ...prev, notes: prev.notes.filter(n => n.folder !== pending.folderName), folders: prev.folders.filter(f => f.name !== pending.folderName), trash: [...moving.map(n => ({ ...n, deletedAt: new Date().toISOString() })), ...prev.trash] };
      });
      setSelectedFolder('Все');
      setSelectedId(null);
      setStatusVoice('Папка удалена, записи перемещены в корзину.');
    }
    if (pending.kind === 'all') {
      setData(prev => ({ ...prev, notes: [], trash: [...prev.notes.map(n => ({ ...n, deletedAt: new Date().toISOString() })), ...prev.trash] }));
      setSelectedFolder('Все');
      setSelectedId(null);
      setStatusVoice('Все записи перемещены в корзину.');
    }
    if (pending.kind === 'trash') {
      setData(prev => ({ ...prev, trash: [] }));
      setStatusVoice('Корзина очищена.');
    }
    setPending(null);
  }

  function cancelPending() {
    setPending(null);
    setStatusVoice('Отменено.');
  }

  function restoreNote(note) {
    setData(prev => ({ ...prev, notes: [{ ...note, deletedAt: undefined }, ...prev.notes], trash: prev.trash.filter(n => n.id !== note.id) }));
    setSelectedId(note.id);
    setSelectedFolder(note.folder);
    setStatusVoice('Запись восстановлена.');
  }

  function handleDelete(text) {
    const source = normalize(text);
    if (includesAny(source, ['удали все', 'удалить все', 'удали всё', 'удалить всё'])) return requestDeleteAll();
    if (includesAny(source, ['очисти корзину', 'удали корзину'])) return setPending({ kind: 'trash', message: 'Очистить корзину навсегда?', preview: `В корзине: ${data.trash.length}` });
    if (source.includes('папк')) {
      const folder = data.folders.find(f => source.includes(normalize(f.name)));
      if (folder) return requestDeleteFolder(folder.name);
      return setStatusVoice('Не понял, какую папку удалить.');
    }
    if (source.includes('послед')) {
      const latest = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return latest ? requestDeleteNote(latest) : setStatusVoice('Нет записей для удаления.');
    }
    if (includesAny(source, ['это', 'эту', 'ее', 'её'])) {
      return selectedNote ? requestDeleteNote(selectedNote) : setStatusVoice('Сначала откройте запись.');
    }
    const found = searchNotes(data.notes, text)[0];
    return found ? requestDeleteNote(found) : setStatusVoice('Не нашёл запись для удаления.');
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
    if (plan.action === 'delete_all') { requestDeleteAll(); return true; }
    if (plan.action === 'delete_folder') { plan.folder ? requestDeleteFolder(plan.folder) : setStatusVoice('Не указана папка.'); return true; }
    if (plan.action === 'delete_note') {
      const found = plan.target === 'current' ? selectedNote : plan.target === 'latest' ? [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] : searchNotes(data.notes, plan.query || originalText)[0];
      found ? requestDeleteNote(found) : setStatusVoice('Не нашёл запись для удаления.');
      return true;
    }
    if (plan.action === 'share_current') { selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_current') { selectedNote ? speak(shareText(selectedNote)) : setStatusVoice('Сначала откройте запись.'); return true; }
    if (plan.action === 'read_folder_latest') {
      const latestInFolder = [...data.notes]
        .filter(note => note.folder === plan.folder)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!latestInFolder) setStatusVoice(`В папке ${plan.folder || 'этой'} пока нет записей.`);
      else {
        openNote(latestInFolder);
        speak(shareText(latestInFolder));
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

    if (pending) {
      if (includesAny(source, ['да', 'подтверждаю', 'удалить', 'согласен', 'согласна'])) return confirmPending();
      if (includesAny(source, ['нет', 'отмена', 'отмени', 'не надо'])) return cancelPending();
    }

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
    if (intent === 'share') return selectedNote ? shareNote(selectedNote) : setStatusVoice('Сначала откройте запись.');
    if (intent === 'read') {
      const folderMatch = findFolderByText(data.folders, spoken);
      if (folderMatch) {
        const latestInFolder = [...data.notes]
          .filter(note => note.folder === folderMatch.name)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        if (!latestInFolder) return setStatusVoice(`В папке ${folderMatch.name} пока нет записей.`);
        openNote(latestInFolder);
        speak(shareText(latestInFolder));
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
      {pending && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Подтвердите действие</h2>
            <p>{pending.message}</p>
            {pending.preview && <pre>{pending.preview}</pre>}
            <div className="modal-actions">
              <button className="danger" onClick={confirmPending}>Подтвердить</button>
              <button onClick={cancelPending}>Отмена</button>
            </div>
            <small>Голосом можно сказать: “да, удалить” или “отмена”.</small>
          </div>
        </div>
      )}

      <header className="hero">
        <div>
          <h1>Умный голосовой блокнот</h1>
          <p>Сохраняет, сортирует, ищет и выполняет действия по голосу.</p>
        </div>
        <div className="hero-actions">
          <button className={listening ? 'danger big' : 'primary big'} onClick={listening ? stopListening : startListening}>{listening ? 'Остановить' : 'Говорить'}</button>
          <button className="big" onClick={() => selectedNote ? speak(shareText(selectedNote)) : setStatusVoice('Сначала откройте запись.')}>Прочитать</button>
        </div>
      </header>

      <section className="status-grid">
        <div className="status-card wide">
          <span>Статус</span>
          <strong>{status}</strong>
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
          <div className="trash-box">
            <b>Корзина</b>
            <p>{data.trash.length} записей</p>
            <button disabled={!data.trash.length} onClick={() => setPending({ kind: 'trash', message: 'Очистить корзину навсегда?', preview: `В корзине: ${data.trash.length}` })}>Очистить</button>
          </div>
        </aside>

        <section className="panel notes">
          <div className="notes-head">
            <div><h2>{selectedFolder}</h2><p>{visibleNotes.length} записей</p></div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по заметкам" />
          </div>
          <div className="note-list">
            {visibleNotes.length ? visibleNotes.map(note => <NoteCard key={note.id} note={note} selected={selectedId === note.id} onOpen={openNote} onShare={shareNote} onCopy={copyNote} onDelete={requestDeleteNote} onCall={callNote} onMessage={messageNote} />) : <div className="empty">Записей пока нет. Скажите или напишите команду.</div>}
          </div>
        </section>

        <aside className="panel details">
          <h2>Открытая запись</h2>
          {selectedNote ? <NoteCard note={selectedNote} selected onOpen={openNote} onShare={shareNote} onCopy={copyNote} onDelete={requestDeleteNote} onCall={callNote} onMessage={messageNote} /> : <p className="muted">Откройте запись или скажите: “покажи последнюю заметку”.</p>}

          {data.trash.length > 0 && <>
            <h2>Корзина</h2>
            <div className="trash-list">
              {data.trash.slice(0, 4).map(note => <NoteCard key={`trash_${note.id}`} note={note} selected={false} onOpen={() => {}} onShare={shareNote} onCopy={copyNote} onDelete={() => setPending({ kind: 'trash', message: 'Очистить корзину навсегда?', preview: `В корзине: ${data.trash.length}` })} onCall={callNote} onMessage={messageNote} onRestore={restoreNote} />)}
            </div>
          </>}
        </aside>
      </main>
    </div>
  );
}
