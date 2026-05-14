const CATEGORY_RULES = [
  {
    title: 'Инструмент',
    signals: [
      'инструмент', 'бит', 'диск', 'болгар', 'шуруповерт', 'шуруповёрт', 'дрел',
      'сверл', 'отвертк', 'молот', 'ключ', 'перфорат', 'пленк', 'плёнк', 'саморез',
      'гвозд', 'рулетк', 'ножовк'
    ]
  },
  {
    title: 'Аптека',
    signals: ['аптек', 'лекар', 'таблет', 'анальгин', 'ибупрофен', 'парацетамол', 'бинт', 'мазь', 'витамин']
  },
  {
    title: 'Авто',
    signals: ['машин', 'авто', 'лобов', 'стекл', 'шина', 'масл', 'фильтр', 'дворник', 'антифриз', 'аккум']
  },
  {
    title: 'Еда',
    signals: [
      'хлеб', 'батон', 'чеснок', 'молоко', 'сыр', 'яйц', 'картош', 'лук', 'помидор', 'огур',
      'яблок', 'банан', 'мяс', 'куриц', 'рыб', 'сахар', 'соль', 'круп', 'макарон', 'пельмен',
      'рис', 'греч', 'кефир', 'творог', 'йогурт', 'колбас', 'сосиск', 'чай', 'кофе', 'вода',
      'сок', 'мука', 'печенье', 'шоколад', 'сладост', 'торт'
    ]
  },
  {
    title: 'Дом',
    signals: ['ламп', 'моющ', 'порош', 'губк', 'посуда', 'полотен', 'бумаг', 'дом', 'квартир']
  },
  {
    title: 'Техника',
    signals: ['телефон', 'ноутбук', 'планшет', 'кабель', 'зарядк', 'наушник', 'мышк', 'клавиатур']
  }
];

function normalizeRuleText(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').trim();
}

export function detectShoppingCategoryTitle(text, context = '') {
  const itemSource = normalizeRuleText(text);
  const contextSource = normalizeRuleText(context);
  const matchCategory = (source) => {
    if (!source) return '';
    const matched = CATEGORY_RULES.find(rule => rule.signals.some(signal => source.includes(signal)));
    return matched ? matched.title : '';
  };

  const byItem = matchCategory(itemSource);
  if (byItem) return byItem;
  const byContext = matchCategory(contextSource);
  if (byContext) return byContext;
  return 'Покупки';
}

export function groupShoppingItemsByCategory(items = [], context = '') {
  const groups = new Map();
  items
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .forEach(item => {
      const title = detectShoppingCategoryTitle(item, context);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(item);
    });

  const order = ['Еда', 'Инструмент', 'Аптека', 'Авто', 'Дом', 'Техника', 'Покупки'];
  return [...groups.entries()]
    .map(([title, values]) => ({ title, items: [...new Set(values)] }))
    .sort((a, b) => {
      const ai = order.indexOf(a.title);
      const bi = order.indexOf(b.title);
      const av = ai === -1 ? 999 : ai;
      const bv = bi === -1 ? 999 : bi;
      return av - bv || a.title.localeCompare(b.title);
    });
}

export function isLikelyGroceryItem(text) {
  return detectShoppingCategoryTitle(text) === 'Еда';
}

export function isLikelyGroceryList(items = []) {
  const normalized = items.map(item => String(item || '').trim()).filter(Boolean);
  if (!normalized.length) return false;
  const groceryCount = normalized.filter(isLikelyGroceryItem).length;
  return groceryCount >= Math.ceil(normalized.length / 2);
}

export function shouldAppendShoppingList(items = [], latestNote = null) {
  if (!latestNote || latestNote.type !== 'shopping_list') return false;
  const incomingGroups = groupShoppingItemsByCategory(items);
  const currentGroups = groupShoppingItemsByCategory(latestNote.items || latestNote.content?.split(',') || []);
  const incomingMain = incomingGroups[0]?.title || 'Покупки';
  const currentMain = currentGroups[0]?.title || 'Покупки';
  if (incomingMain !== 'Покупки' && currentMain !== 'Покупки') return incomingMain === currentMain;
  const incomingGrocery = isLikelyGroceryList(items);
  const currentGrocery = isLikelyGroceryList(latestNote.items || latestNote.content?.split(',') || []);
  return incomingGrocery && currentGrocery;
}
