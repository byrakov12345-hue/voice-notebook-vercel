const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: [
        'save_note', 'save_idea', 'save_task', 'save_appointment', 'save_shopping_list',
        'save_contact', 'save_code', 'save_expense', 'search_notes', 'show_latest_note',
        'create_folder', 'delete_note', 'delete_folder', 'delete_all', 'share_current',
        'call_contact', 'message_contact', 'read_current', 'unknown'
      ]
    },
    type: { type: 'string', enum: ['note', 'idea', 'task', 'appointment', 'shopping_list', 'contact', 'code', 'expense', 'unknown'] },
    folder: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
    name: { type: 'string' },
    description: { type: 'string' },
    phone: { type: 'string' },
    query: { type: 'string' },
    target: { type: 'string', enum: ['current', 'latest', 'specific', 'folder', 'all', 'none'] },
    dateLabel: { type: 'string' },
    time: { type: 'string' },
    showAfterSave: { type: 'boolean' },
    needsConfirmation: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'action', 'type', 'folder', 'title', 'content', 'items', 'name', 'description', 'phone',
    'query', 'target', 'dateLabel', 'time', 'showAfterSave', 'needsConfirmation', 'tags'
  ]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  try {
    const body = req.body || {};
    const prompt = `
Ты AI-парсер голосовых команд для русского умного голосового блокнота.
Верни только JSON по схеме. Не объясняй.

Задача: определить действие пользователя и заполнить поля.

Правила:
1. Если пользователь хочет сохранить идею: action=save_idea, type=idea, folder=Идеи.
2. Фраза "у меня идея ..." всегда идея, даже если внутри есть слова "вечером", "завтра" и т.п.
3. Если пользователь говорит про запись, встречу, стрижку, врача, прием или содержит дату/время без явной идеи: action=save_appointment, type=appointment, folder=Встречи.
4. "мне завтра на стрижку в 8 вечера" => save_appointment, title="Стрижка", dateLabel="завтра", time="20:00".
5. Если пользователь говорит "запомни номер телефона ...": action=save_contact, type=contact, folder=Контакты.
6. Если пользователь ищет номер/запись: action=search_notes, query=то, что ищет.
7. Если пользователь говорит "позвони ему" или "напиши ему", target=current.
8. Если пользователь говорит про код/комбинацию цифр: action=save_code, type=code, folder=Коды и комбинации. Сохраняй цифры в content.
9. Если пользователь говорит про покупки: action=save_shopping_list, items=список товаров, folder=Покупки.
10. Удаление всегда needsConfirmation=true. Не удалять без подтверждения.
11. Если пользователь говорит "это", "эту", "ее", "её" — target=current.
12. Если команда непонятна — action=unknown.

Доступные папки: ${JSON.stringify(body.folders || [])}
Текущая запись: ${JSON.stringify(body.currentNote || null)}
Последние записи: ${JSON.stringify(body.recentNotes || [])}
Команда пользователя: ${JSON.stringify(body.text || '')}
`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'voice_notebook_command',
            strict: true,
            schema
          }
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(response.status).json({ error: err });
      return;
    }

    const result = await response.json();
    const jsonText = result.output_text || result.output?.flatMap(item => item.content || []).find(part => part.type === 'output_text')?.text;
    if (!jsonText) {
      res.status(500).json({ error: 'Empty AI response' });
      return;
    }

    res.status(200).json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
