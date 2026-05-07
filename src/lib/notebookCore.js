export const DEFAULT_FOLDERS = [
  'Идеи', 'Встречи', 'Покупки', 'Задачи', 'Контакты', 'Коды и комбинации',
  'Расходы', 'Клиенты', 'Работа', 'Дом', 'Машина', 'Семья', 'Здоровье', 'Учёба', 'Важное', 'Разное'
];

export const TYPE_LABELS = {
  note: 'Заметка', idea: 'Идея', appointment: 'Встреча', shopping_list: 'Список',
  task: 'Задача', contact: 'Контакт', code: 'Код', expense: 'Расход'
};

export const FOLDER_SIGNALS = {
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

export const FOLDER_STEMS = {
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

export const TOPIC_STOP_WORDS = new Set([
  'мне', 'нужно', 'надо', 'над', 'хочу', 'хотел', 'хотела', 'запомни', 'запиши', 'сохрани',
  'добавь', 'создай', 'про', 'для', 'чтобы', 'если', 'потом', 'сегодня', 'завтра',
  'послезавтра', 'это', 'этот', 'эта', 'эту', 'мой', 'моя', 'мою', 'мои', 'наш', 'наша',
  'нужно', 'нужно', 'с', 'со', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'до', 'к', 'ко',
  'и', 'или', 'но', 'что', 'как', 'бы', 'уже', 'ещё', 'еще', 'надо', 'нужен', 'нужна', 'нужно'
]);

export const DEDUPE_STOP_WORDS = new Set([
  ...TOPIC_STOP_WORDS,
  'запись', 'заметка', 'папка', 'папку', 'папке', 'последнюю', 'последняя', 'последний',
  'сохрани', 'запомни', 'запиши', 'добавь', 'сегодня', 'завтра', 'весь', 'вся', 'все', 'всё'
]);

export const SEARCH_SYNONYMS = {
  мастер: ['гараж', 'парикмахер', 'барбер', 'мастер'],
  машина: ['авто', 'гараж', 'масло', 'бензин', 'шины', 'машина'],
  аптека: ['лекарство', 'таблетки', 'здоровье', 'витамин', 'аптека'],
  работа: ['проект', 'клиент', 'заказ', 'дедлайн', 'работа'],
  купить: ['покупки', 'магазин', 'продукты', 'купить'],
  телефон: ['номер', 'контакт', 'телефон'],
  стрижка: ['барбер', 'парикмахер', 'стрижка'],
  приложение: ['проект', 'идея', 'приложение']
};

export const digitWords = {
  ноль: '0', один: '1', одна: '1', два: '2', две: '2', три: '3', четыре: '4',
  пять: '5', шесть: '6', семь: '7', восемь: '8', девять: '9'
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[?!;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalize(text) {
  const value = String(text || '').trim();
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function voiceDisplayMeta(voice) {
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

export function prepareSpeechText(text) {
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

export function getVoiceStyleConfig(style) {
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

export function speak(text, preferredVoiceURI = '', voiceStyle = 'default') {
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

export function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '';
  }
}
