# Архитектура АИ Блокнота

## Текущая схема

- `src/App.jsx` — главный UI, состояние, голосовые команды, календарь, операции с папками и записями.
- `src/styles.css` — единая адаптивная оболочка: левая функциональная панель, центральный блокнот, правая AI/календарная панель.
- `src/lib/notebookCore.js` — базовые словари, папки, синонимы, форматирование, голосовая озвучка.
- `src/lib/notebookText.js` — текстовые утилиты: поиск фраз, телефоны, цифры, дубль-команды.
- `src/lib/notebookCalendar.js` — месяцы календаря, быстрые даты, выбор записей дня.
- `src/lib/voiceCalendar.js` — разбор дат, времени, голосовых напоминаний и очистка календарного текста.
- `src/lib/notebookReminders.js` — расчёт точек напоминаний, Notification API, Web Push, синхронизация service worker/server.
- `src/lib/notebookRules.js` — правила shopping-логики.
- `public/sw.js` — память напоминаний в IndexedDB, восстановление таймеров, push, клик по уведомлению.
- `api/*.js` — серверная часть Web Push и Vercel Blob.
- `scripts/voice-smoke.mjs` — быстрый smoke-тест команд без браузера.

## Логика уведомлений

1. Запись типа `appointment` получает `eventAt`, `reminderExplicitAt`, настройки первого/второго уведомления.
2. `buildReminderPoints` строит будущие точки уведомления.
3. `syncServiceWorkerReminderSchedule` отправляет payload в service worker.
4. `public/sw.js` сохраняет payload в IndexedDB телефона и ставит таймеры.
5. При клике уведомление открывает приложение и передаёт `noteId` в UI.
6. Для закрытого браузера серверный Web Push работает через `/api/reminders-sync` и `/api/reminders-dispatch`.

## Что ещё можно вынести позже

- `src/lib/noteFactory.js` — создание note/contact/shopping/appointment из текста.
- `src/lib/commandRouter.js` — роутинг voice/manual-команд.
- `src/components/*` — визуальные панели, если проект станет крупнее.

Сейчас проект уже собран так, чтобы ключевые правила AI, календаря и уведомлений были отделены от CSS и service worker.
