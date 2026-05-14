# iOS / TestFlight Setup (АИ Блокнот)

Этот слой добавлен **дополнительно** и не ломает Android/PWA установку.

## Что уже добавлено в проект
- Capacitor зависимости (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`)
- Конфиг: `capacitor.config.ts`
- npm-скрипты:
  - `npm run ios:add`
  - `npm run ios:sync`
  - `npm run ios:open`

## Первый запуск iOS-обёртки
1. `npm install`
2. `npm run ios:add` (один раз, создаст папку `ios/`)
3. `npm run ios:sync`
4. `npm run ios:open`

## Сборка и отправка в TestFlight
1. В Xcode: `ios/App/App.xcworkspace`
2. `Signing & Capabilities`:
   - Team: ваш Apple Developer Team
   - Bundle ID: уникальный (например `app.vercel.voice_notebook`)
3. `Product -> Archive`
4. `Distribute App -> App Store Connect -> Upload`
5. В App Store Connect включить TestFlight для внутренних/внешних тестеров.

## Важно про “установить одной кнопкой”
- В вебе iPhone не поддерживает установку одной кнопкой из JS.
- Один тап “Install” возможен только через **TestFlight** или App Store.
- После публикации TestFlight пользователь ставит приложение кнопкой `Install`.
