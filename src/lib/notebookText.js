import { DEDUPE_STOP_WORDS, digitWords, normalize } from './notebookCore';

export function includesAny(text, words) {
  const source = normalize(text);
  return words.some(word => source.includes(normalize(word)));
}

export function startsWithAny(text, words) {
  const source = normalize(text);
  return words.some(word => source.startsWith(normalize(word)));
}

export function wordsToDigits(text) {
  return normalize(text).split(' ').map(t => digitWords[t] ?? t).join(' ');
}

export function extractPhone(text) {
  const converted = wordsToDigits(text);
  const match = converted.match(/(?:\+?\d[\d\s().-]{5,}\d)/);
  return match ? match[0].replace(/[^0-9+]/g, '') : '';
}

export function extractDigits(text) {
  return wordsToDigits(text).replace(/[^0-9+]/g, '');
}

export function shareText(note) {
  if (!note) return '';
  if (note.type === 'contact') return `${note.title}\nТелефон: ${note.phone || 'не указан'}`;
  if (note.type === 'shopping_list') return `${note.title}\n${(note.items || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
  if (note.type === 'appointment') {
    const when = [note.dateLabel || '', note.time || ''].filter(Boolean).join(' ').trim();
    if (normalize(note.title) === normalize(note.content) || !String(note.content || '').trim()) {
      return [note.title, when].filter(Boolean).join('\n').trim();
    }
    return [note.title, when, note.content].filter(Boolean).join('\n').trim();
  }
  if (normalize(note.title) === normalize(note.content)) return `${note.title}`.trim();
  return `${note.title}\n${note.content || ''}`.trim();
}

export function contactSpeechText(note) {
  if (!note) return '';
  if (note.phone) return `Телефон ${note.phone}`;
  return shareText(note);
}

export function noteSignature(note) {
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

function canonicalCommandText(text) {
  return normalize(text)
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

export function isSameOrNearCommand(left, right) {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  const leftCanonical = canonicalCommandText(leftNormalized);
  const rightCanonical = canonicalCommandText(rightNormalized);
  if (!leftCanonical || !rightCanonical) return false;
  return (
    leftCanonical === rightCanonical ||
    leftCanonical.includes(rightCanonical) ||
    rightCanonical.includes(leftCanonical) ||
    tokenOverlapRatio(leftCanonical, rightCanonical) >= 0.72
  );
}

export function isSameOrNearDuplicate(existing, incoming) {
  if (!existing || !incoming) return false;
  if (noteSignature(existing) === noteSignature(incoming)) return true;

  const sameFolder = normalize(existing.folder) === normalize(incoming.folder);
  const sameType = String(existing.type || '') === String(incoming.type || '');
  const sameTitle = normalize(existing.title) === normalize(incoming.title);
  const sameContent = normalize(existing.content) === normalize(incoming.content);
  const samePhone = String(existing.phone || '') !== '' && String(existing.phone || '') === String(incoming.phone || '');
  const sameItems = JSON.stringify((existing.items || []).map(item => normalize(item)).sort()) === JSON.stringify((incoming.items || []).map(item => normalize(item)).sort());
  const sameDay = String(existing.eventAt || '').slice(0, 10) !== '' && String(existing.eventAt || '').slice(0, 10) === String(incoming.eventAt || '').slice(0, 10);
  const canonicalExisting = canonicalNoteText(existing);
  const canonicalIncoming = canonicalNoteText(incoming);
  const overlap = tokenOverlapRatio(canonicalExisting, canonicalIncoming);
  const containsSameMeaning =
    canonicalExisting && canonicalIncoming &&
    (canonicalExisting === canonicalIncoming ||
      canonicalExisting.includes(canonicalIncoming) ||
      canonicalIncoming.includes(canonicalExisting) ||
      overlap >= 0.8);

  if (sameType && sameFolder && (sameTitle || sameContent || samePhone || sameItems)) return true;
  if (sameType && sameFolder && sameDay && containsSameMeaning) return true;
  return sameType && sameFolder && containsSameMeaning;
}
