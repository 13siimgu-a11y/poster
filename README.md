# POS Poster

## OpenAI AI Assistant

API ключ нельзя хранить во frontend-файлах. AI работает через backend endpoint:

```text
POST /api/ai/chat
```

### Настройка

1. Отзовите старый ключ, если он был опубликован в чате или коде.
2. Создайте новый OpenAI API key.
3. Создайте файл `.env` рядом с `package.json`.
4. Добавьте:

```env
OPENAI_API_KEY=your_new_openai_key
PORT=3000
```

### Запуск

```bash
npm install
npm start
```

После запуска откройте:

```text
http://localhost:3000
```

Frontend AI Assistant автоматически отправляет запросы на `/api/ai/chat`.
