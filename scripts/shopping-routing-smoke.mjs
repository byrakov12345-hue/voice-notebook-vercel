import { groupShoppingItemsByCategory, mapShoppingCategoryToFolder } from '../src/lib/notebookRules.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCase(name, phrase, items, expected) {
  const groups = groupShoppingItemsByCategory(items, phrase);
  const actual = groups.map(group => ({
    category: group.title,
    folder: mapShoppingCategoryToFolder(group.title),
    items: group.items
  }));

  for (const check of expected) {
    const found = actual.find(item => item.category === check.category && item.folder === check.folder);
    assert(found, `${name}: не найдена категория ${check.category} -> ${check.folder}`);
    for (const expectedItem of check.items) {
      assert(found.items.includes(expectedItem), `${name}: в ${check.category} нет "${expectedItem}"`);
    }
  }
}

runCase(
  'mixed-categories',
  'купить пилу молоко масло моторное лук помидоры кресло велосипед',
  ['пилу', 'молоко', 'масло моторное', 'лук', 'помидоры', 'кресло', 'велосипед'],
  [
    { category: 'Инструмент', folder: 'Инструмент', items: ['пилу'] },
    { category: 'Еда', folder: 'Покупки', items: ['молоко', 'лук', 'помидоры'] },
    { category: 'Авто', folder: 'Машина', items: ['масло моторное'] },
    { category: 'Дом', folder: 'Дом', items: ['кресло'] },
    { category: 'Транспорт', folder: 'Транспорт', items: ['велосипед'] }
  ]
);

runCase(
  'tech-food',
  'купить ноутбук кабель и сахар',
  ['ноутбук', 'кабель', 'сахар'],
  [
    { category: 'Техника', folder: 'Техника', items: ['ноутбук', 'кабель'] },
    { category: 'Еда', folder: 'Покупки', items: ['сахар'] }
  ]
);

runCase(
  'pharmacy-food',
  'купить анальгин и хлеб',
  ['анальгин', 'хлеб'],
  [
    { category: 'Аптека', folder: 'Здоровье', items: ['анальгин'] },
    { category: 'Еда', folder: 'Покупки', items: ['хлеб'] }
  ]
);

console.log('shopping-routing-smoke: ok');
