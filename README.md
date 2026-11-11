# Bot Content CRM

Панель для редактирования **текстов и картинок бота** прямо в GitHub‑репозиториях.
React + Vite, серверные функции Vercel, вход через GitHub OAuth.

## Возможности
- **Проекты и боты.** Слева создаёте проект (например, «Интернет‑магазин») и добавляете в него ботов.
  Каждый бот привязан к репозиторию GitHub, ветке и папкам с текстами и картинками — папки находятся автоматически.
  Список проектов хранится в приватном Gist `bot-crm.json` на вашем GitHub‑аккаунте и доступен с любого устройства.
- Вход через GitHub, список всех своих репозиториев и репозиториев организаций, выбор ветки.
- JSON / YAML — таблица «ключ → текст», поиск, добавление и удаление ключей.
- Сравнение языков бок о бок (`ru.json` ↔ `en.json`): подсветка непереведённых строк и расхождений в переменных `{name}`, `%s`, HTML‑тегах.
- Любые другие текстовые файлы — редактор исходного кода.
- Галерея картинок: загрузка (в том числе drag & drop), замена, переименование, удаление.
- Сохранение одним коммитом: сразу в ветку или в новую ветку с Pull Request. Предупреждение о конфликтах.

## Экраны бота (формат `bot-crm/1`)

Если в репозитории бота есть `content/content.json` (например, `app/content/content.json`), у бота появляется
вкладка **📱 Экраны**: каждое сообщение показано как в Telegram или ВК — картинка, текст, inline-кнопки под
сообщением и нижняя клавиатура. Текст правится прямо в сообщении, кнопка — по клику (подпись, цвет, место
в клавиатуре), картинка — заменой файла. Всё сохраняется одним коммитом.

Код бота читает этот файл при запуске, поэтому всё, что меняется в CRM, отделено от логики.

```jsonc
{
  "format": "bot-crm/1",
  "platform": "telegram",                       // или "vk"
  "texts":   { "GREETING": "Привет!\nНажми /start", "PARTNER_MESSAGE": "👤 Собеседник:\n{text}" },
  "buttons": { "FIND_BTN": "🔍 Найти собеседника" },
  "button_aliases": { "FIND_BTN": ["Найти"] },  // прежние подписи — CRM дописывает при переименовании
  "lists":   { "ROOMS": { "title": "Города", "items": { "msk": "Москва" } } },
  "keyboards": {
    "IDLE_KEYBOARD": { "title": "Главное меню", "type": "reply",          // reply — внизу, inline — под сообщением
      "rows": [[ { "button": "FIND_BTN", "color": "primary" } ], [ { "list": "ROOMS", "item": "msk" } ]] }
  },
  "images":  { "greeting": { "title": "Баннер", "file": "images/greeting.jpg" } },   // путь от content.json
  "screens": [ { "id": "greeting", "title": "Приветствие", "when": "Команда /start",
                 "image": "greeting", "text": "GREETING", "keyboard": "IDLE_KEYBOARD" } ]
}
```

- Цвета: `primary`, `success`, `danger`, `secondary` (или без цвета).
- `{text}`, `{date}`, `{city}` в текстах подставляет бот — CRM не даст их случайно удалить.
- Для ВК подписи кнопок ограничены 40 символами — CRM подсветит превышение.
- `screens` нужен только для превью: какой текст, картинку и клавиатуру бот отправляет вместе.

## Деплой на Vercel

### 1. Создайте GitHub OAuth App
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
(https://github.com/settings/applications/new)

| Поле | Значение |
|---|---|
| Homepage URL | `https://<ваш-проект>.vercel.app` |
| Authorization callback URL | `https://<ваш-проект>.vercel.app/api/auth/callback` |

После создания скопируйте **Client ID** и сгенерируйте **Client secret**.

### 2. Импортируйте проект в Vercel
1. Запушьте эту папку в репозиторий на GitHub.
2. https://vercel.com/new → выберите репозиторий. Framework определится как **Vite** автоматически.
3. В **Environment Variables** добавьте:

| Переменная | Значение |
|---|---|
| `GITHUB_CLIENT_ID` | Client ID из OAuth App |
| `GITHUB_CLIENT_SECRET` | Client secret из OAuth App |
| `SESSION_SECRET` | длинная случайная строка, например результат `openssl rand -hex 32` |
| `APP_URL` | *(необязательно, лучше не задавать)* — если задан, должен точно совпадать с адресом из Callback URL |

4. **Deploy**. Если адрес проекта изменился, обновите callback URL в OAuth App.

### 3. Доступ к репозиториям организаций
Если репозиториев организации нет в списке, владелец организации должен одобрить приложение:
GitHub → Settings → Applications → Authorized OAuth Apps → ваше приложение → **Grant** напротив организации.

## Локальная разработка
```bash
npm install
npm i -g vercel
vercel link            # привязать к проекту на Vercel
vercel env pull .env.local
vercel dev             # http://localhost:3000
```
Для локального запуска создайте отдельный OAuth App с callback `http://localhost:3000/api/auth/callback`.

## Как устроено
```
api/auth/login.js     → редирект на GitHub OAuth (state в cookie)
api/auth/callback.js  → обмен code на токен, зашифрованная httpOnly‑cookie (AES‑256‑GCM)
api/auth/me.js        → текущий пользователь
api/auth/logout.js    → выход
api/github.js         → прокси к api.github.com (только /user и /repos/*, защита от CSRF)
src/                  → React‑приложение
```
Токен GitHub не попадает в браузер: все запросы идут через `/api/github`.

## Ограничения
- Размер одной картинки — до 3 МБ (лимит тела запроса в функциях Vercel — 4,5 МБ).
- В YAML при правке в табличном режиме теряются комментарии. Чтобы их сохранить, используйте «Исходный код».

## Частые ошибки
**«The redirect_uri is not associated with this application»** — в настройках OAuth App указан не тот Callback URL.
Он должен быть ровно `https://<адрес, где открыта CRM>/api/auth/callback`. Также проверьте, что переменная `APP_URL` в Vercel не задана или совпадает с этим адресом.

**«Сессия входа не найдена»** — CRM открыта не по тому адресу, что указан в Callback URL (например, на preview-деплое). Откройте основной адрес проекта.
