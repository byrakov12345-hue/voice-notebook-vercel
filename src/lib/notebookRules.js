const GROCERY_SIGNALS = [
  'хлеб', 'батон', 'чеснок', 'молоко', 'сыр', 'яйца', 'картош', 'лук', 'помидор', 'огур',
  'яблок', 'банан', 'мяс', 'куриц', 'рыб', 'сахар', 'соль', 'масло', 'круп', 'макарон',
  'рис', 'греч', 'кефир', 'творог', 'йогурт', 'колбас', 'сосиск', 'чай', 'кофе', 'вода',
  'сок', 'мука', 'печенье', 'шоколад', 'аптек', 'витамин', 'лекар', 'таблет'
];

const NON_GROCERY_SIGNALS = [
  'велосипед', 'машин', 'авто', 'шина', 'телефон', 'ноутбук', 'кабель', 'зарядк', 'наушник',
  'диван', 'стол', 'стул', 'лампа', 'одежд', 'куртк', 'кроссов', 'ботин', 'штан', 'игруш',
  'самокат', 'скутер', 'запчаст', 'фильтр', 'подшип', 'косилк', 'дрель', 'молот', 'шкаф'
];

function normalizeRuleText(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').trim();
}

export function isLikelyGroceryItem(text) {
  const source = normalizeRuleText(text);
  if (!source) return false;
  const groceryHits = GROCERY_SIGNALS.filter(signal => source.includes(signal)).length;
  const nonGroceryHits = NON_GROCERY_SIGNALS.filter(signal => source.includes(signal)).length;
  if (groceryHits === 0 && nonGroceryHits === 0) return source.split(' ').length <= 2;
  return groceryHits >= nonGroceryHits;
}

export function isLikelyGroceryList(items = []) {
  const normalized = items.map(item => String(item || '').trim()).filter(Boolean);
  if (!normalized.length) return false;
  const groceryCount = normalized.filter(isLikelyGroceryItem).length;
  return groceryCount >= Math.ceil(normalized.length / 2);
}

export function shouldAppendShoppingList(items = [], latestNote = null) {
  if (!latestNote || latestNote.type !== 'shopping_list') return false;
  const incomingGrocery = isLikelyGroceryList(items);
  const currentGrocery = isLikelyGroceryList(latestNote.items || latestNote.content?.split(',') || []);
  return incomingGrocery && currentGrocery;
}
