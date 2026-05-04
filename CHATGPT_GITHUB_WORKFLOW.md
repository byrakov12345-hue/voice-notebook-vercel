# Работа через GitHub и ChatGPT на телефоне

Этот проект подготовлен под схему:

1. Вы отправляете в ChatGPT на телефоне ссылку на репозиторий.
2. ChatGPT вносит правки в GitHub-репозиторий.
3. После push вы просто обновляете сайт в браузере.

## Ссылка на репозиторий

`https://github.com/byrakov12345-hue/voice-notebook-vercel`

## Как поднимать локально

```bash
npm install
npm run dev:open
```

Если порт `3000` занят, запустите:

```bash
npm run dev -- --host 127.0.0.1 --port 3005
```

## Как выкладывать в интернет

Проект рассчитан на простой деплой в `Vercel`:

1. Открыть `Vercel`
2. `Add New -> Project`
3. Выбрать репозиторий `voice-notebook-vercel`
4. Framework: `Vite`
5. Build command: `npm run build`
6. Output directory: `dist`
7. Deploy

После этого у проекта будет постоянная ссылка. Дальше после каждого `push` на GitHub достаточно обновлять страницу.

## Что важно для следующего аккаунта

- Основной стек: `Vite + React`
- Голос: Web Speech API в браузере
- Базовый AI-разбор работает локально в браузере
- `api/parse-command.js` нужен только если позже захотите подключить серверный OpenAI-разбор
