import assert from 'node:assert/strict';
import {
  parseAppointmentDateTime,
  parseCalendarTargetDate,
  parseReminderVoiceSettings,
  stripCalendarVoiceContent
} from '../src/lib/voiceCalendar.js';
import { isLikelyGroceryItem, shouldAppendShoppingList } from '../src/lib/notebookRules.js';

const fixedNow = new Date('2026-05-07T10:00:00.000Z');

function isoDay(iso) {
  return String(iso || '').slice(0, 10);
}

const mayHaircut = parseAppointmentDateTime('7 мая мне на стрижку', fixedNow);
assert.equal(isoDay(mayHaircut.eventAt), '2026-05-07');
assert.equal(mayHaircut.dateLabel, '7 мая');
assert.equal(mayHaircut.time, '');

const todayShopping = parseAppointmentDateTime('купить батон в 8 вечера', fixedNow);
assert.equal(isoDay(todayShopping.eventAt), '2026-05-07');
assert.equal(todayShopping.time, '20:00');

const futureShopping = parseAppointmentDateTime('купить батон 9 мая в 8 вечера', fixedNow);
assert.equal(isoDay(futureShopping.eventAt), '2026-05-09');
assert.equal(futureShopping.time, '20:00');

const datedShoppingNoTime = parseAppointmentDateTime('8 мая купить в магазине батон', fixedNow);
assert.equal(isoDay(datedShoppingNoTime.eventAt), '2026-05-08');
assert.equal(datedShoppingNoTime.time, '');

const openThisMonth = parseCalendarTargetDate('открой 5 число этого месяца', fixedNow);
assert.equal(isoDay(openThisMonth?.toISOString()), '2026-05-05');

const openSeptember = parseCalendarTargetDate('открой 10 число сентября', fixedNow);
assert.equal(isoDay(openSeptember?.toISOString()), '2026-09-10');

const reminderPair = parseReminderVoiceSettings('установи уведомление на 7 утра и 10 вечера', {
  morningTime: '09:00',
  firstEnabled: true,
  secondTime: '17:30',
  secondEnabled: true
});
assert.equal(reminderPair.morningTime, '07:00');
assert.equal(reminderPair.secondTime, '22:00');

const secondOnly = parseReminderVoiceSettings('поставь второе напоминание на 8 вечера', {
  morningTime: '09:00',
  firstEnabled: true,
  secondTime: '',
  secondEnabled: false
});
assert.equal(secondOnly.morningTime, '09:00');
assert.equal(secondOnly.secondTime, '20:00');
assert.equal(secondOnly.secondEnabled, true);

const stripped = stripCalendarVoiceContent('добавь на 10 сентября на 8 вечера напоминание позвонить другу');
assert.equal(stripped, 'позвонить другу');

assert.equal(isLikelyGroceryItem('хлеб'), true);
assert.equal(isLikelyGroceryItem('велосипед'), false);
assert.equal(shouldAppendShoppingList(['чеснок'], { type: 'shopping_list', items: ['хлеб', 'молоко'] }), true);
assert.equal(shouldAppendShoppingList(['велосипед'], { type: 'shopping_list', items: ['хлеб', 'молоко'] }), false);

console.log('voice-smoke: ok');
