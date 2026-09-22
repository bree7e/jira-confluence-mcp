# Atlassian MCP Server (Jira + Confluence)

MCP-сервер для Jira и Confluence Server/Data Center. Работает по `stdio` и предоставляет модели инструменты для чтения и изменения задач Jira, а также поиска и редактирования страниц Confluence через REST API.

## Возможности

### Jira

| Инструмент           | Назначение                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `jira_search_issues` | Поиск задач по JQL с пагинацией                                                            |
| `jira_get_issue`     | Детали задачи, родительская задача, подзадачи, связи, удалённые ссылки и ссылки Confluence |
| `jira_create_issue`  | Создание задачи                                                                            |
| `jira_update_issue`  | Изменение заголовка, описания или приоритета                                               |
| `jira_list_projects` | Список проектов                                                                            |
| `jira_get_comments`  | Комментарии к задаче                                                                       |
| `jira_add_comment`   | Добавление комментария                                                                     |

### Confluence

| Инструмент                        | Назначение                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `confluence_search_pages`         | Поиск страниц по CQL с URL и метаданными                                                         |
| `confluence_get_page`             | Содержимое страницы по ID                                                                        |
| `confluence_create_page`          | Создание страницы в формате ADF                                                                  |
| `confluence_update_page`          | Изменение заголовка или тела страницы в формате ADF                                              |
| `confluence_list_spaces`          | Список пространств                                                                               |
| `confluence_find_pages_for_issue` | Поиск документации для задачи Jira: сначала удалённые ссылки Jira, затем поиск заголовков по CQL |

## Требования

- Node.js 20 или новее;
- доступ к REST API Jira и Confluence;
- учётные данные с правами на выполняемые операции.

Jira использует Basic-аутентификацию (`JIRA_USERNAME` и `JIRA_API_TOKEN`). Confluence использует Bearer-аутентификацию: `CONFLUENCE_API_TOKEN` должен быть персональным токеном доступа. Значение `CONFLUENCE_USERNAME` обязательно для единообразной конфигурации, но в Bearer-аутентификации не передаётся.

## Установка и сборка

```bash
npm install
npm run build
```

## Конфигурация

Сервер ожидает шесть переменных окружения:

```env
# Jira Server/Data Center
JIRA_URL=https://jira.example.com
JIRA_USERNAME=your-username
JIRA_API_TOKEN=your-api-token-or-password

# Confluence Server/Data Center
CONFLUENCE_URL=https://confluence.example.com
CONFLUENCE_USERNAME=your-username
CONFLUENCE_API_TOKEN=your-personal-access-token
```

Шаблон находится в [`.env.example`](.env.example). Обычные команды `npm start` и `npm run inspect` не читают `.env`: передавайте переменные в конфигурации MCP-клиента либо экспортируйте их в окружение. Для локальной разработки используйте `npm run start:local` или `npm run inspect:local` — эти команды загружают `.env` средствами Node.js 20+.

Например, в PowerShell:

```powershell
$env:JIRA_URL = "https://jira.example.com"
$env:JIRA_USERNAME = "your-username"
$env:JIRA_API_TOKEN = "your-api-token-or-password"
$env:CONFLUENCE_URL = "https://confluence.example.com"
$env:CONFLUENCE_USERNAME = "your-username"
$env:CONFLUENCE_API_TOKEN = "your-personal-access-token"
npm start
```

## Подключение к Codex

Codex Desktop, Codex CLI и IDE-расширение используют общую конфигурацию MCP. В Codex Desktop откройте **Settings → MCP servers → Add server**, выберите **STDIO**, укажите команду и переменные окружения из примера ниже, сохраните и перезапустите Codex. Подробности — в [официальной документации Codex](https://developers.openai.com/codex/mcp).

После публикации пакета в npm добавьте в `~/.codex/config.toml`:

```toml
[mcp_servers.atlassian]
command = "npx"
args = ["-y", "mcp-server-atlassian"]

[mcp_servers.atlassian.env]
JIRA_URL = "https://jira.example.com"
JIRA_USERNAME = "your-username"
JIRA_API_TOKEN = "your-api-token-or-password"
CONFLUENCE_URL = "https://confluence.example.com"
CONFLUENCE_USERNAME = "your-username"
CONFLUENCE_API_TOKEN = "your-personal-access-token"
```

Для запуска из локального клона без копирования секретов в `config.toml` используйте `.env`:

```toml
[mcp_servers.atlassian]
command = "node"
args = ["--env-file=.env", "dist/index.js"]
cwd = "D:\\path\\to\\jira-confluence-mcp"
```

После перезапуска откройте `/mcp` в Codex CLI либо список MCP-серверов в Desktop и убедитесь, что сервер `atlassian` подключён. Для первой проверки выполните `jira_list_projects` или `confluence_list_spaces`.

## Подключение MCP-клиента

После сборки точкой входа является `dist/index.js`. Пример конфигурации клиента:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "node",
      "args": ["/absolute/path/to/jira-confluence-mcp/dist/index.js"],
      "env": {
        "JIRA_URL": "https://jira.example.com",
        "JIRA_USERNAME": "your-username",
        "JIRA_API_TOKEN": "your-api-token-or-password",
        "CONFLUENCE_URL": "https://confluence.example.com",
        "CONFLUENCE_USERNAME": "your-username",
        "CONFLUENCE_API_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

Не добавляйте реальные токены в репозиторий или общие конфигурационные файлы.

## Локальный запуск и разработка

```bash
npm start             # запуск со значениями из окружения MCP-клиента
npm run start:local   # локальный запуск с переменными из .env
npm run dev           # компиляция TypeScript в watch-режиме
npm run build         # компиляция в dist/
npm run inspect       # Inspector со значениями из окружения
npm run inspect:local # Inspector с переменными из .env
```

`npm start` запускает сервер по `stdio`; это не HTTP-сервис и не открывает порт.

## Примечания по API

- URL Jira и Confluence указываются без обязательного завершающего `/`: лишние слеши автоматически убираются.
- Тела страниц при создании и обновлении должны быть валидным JSON в формате Atlassian Document Format (ADF).
- `confluence_find_pages_for_issue` по умолчанию ищет в пространстве `ZPA`; при необходимости передайте `spaceKey`.

## Импорт Confluence в Markdown

Импорт доступен независимо от MCP, через Node.js. REST API используется только на чтение.
Нужны Node.js 20.6+ для флага --env-file (либо передайте переменные окружения самостоятельно) и собранный проект:

```powershell
npm ci
npm run build
node --env-file=.env dist/import-confluence.js 468684852 --out imports --modules=ma,qc
```

CLI использует CONFLUENCE_URL и CONFLUENCE_API_TOKEN.
Jira credentials не нужны; JIRA_URL необязателен и задаёт адрес ссылок Jira.
Без него используется origin Confluence. Для Jira с отдельным хостом или context path задайте его явно.
Существующие переменные окружения имеют приоритет над .env.

### Движок преобразования

Для импорта используется remark:

```powershell
node --env-file=.env dist/import-confluence.js 468684852 478273679 --converter remark --out imports
npm run import:confluence -- --help
```

remark — единственный встроенный движок и значение по умолчанию.
Интерфейс MarkdownConverter в src/import/converters.ts сохранён: id, version и convert(html).
Нормализация Confluence и файловая синхронизация независимы от адаптера.
При изменении правил увеличивайте FORMAT_VERSION, при изменении адаптера — его version.

Офлайн-пример без сети и учётных данных:

```powershell
node dist/import-confluence.js --fixture test/fixtures/page.json --out imports/sample
```

Fixture — JSON страницы REST API с id, title, space, version, body.storage.
Офлайн-режим не разрешает вложения и ссылки по названию через API; они получают предупреждения.
Для правильного source задайте CONFLUENCE_URL; иначе используется демонстрационный адрес.

### Формат и ограничения

Файл начинается с YAML frontmatter: title, source, page_id (строка), space, version, updated.
При указании `--modules=ma,qc` добавляется массив `modules: ["ma","qc"]`.
Параметр необязателен; коды модулей указываются через запятую.
updated — дата версии страницы в часовом поясе исходного timestamp, не время импорта.
После frontmatter расположен единственный H1 с названием страницы.

- Заголовки источника нормализуются начиная с H2; глубина сверх H6 сопровождается предупреждением.
- Сохраняются вложенные списки, начальный номер списка, жирный/курсив/зачёркнутый текст и код.
- Все таблицы сохраняются как GFM-таблицы для Obsidian с выравниванием колонок в исходном Markdown.
  Абзацы и пункты списков внутри ячеек разделяются через <br>; списки сохраняют номера и отступы.
  Длина ячейки не меняет представление. Пустые значения остаются пустыми.
- Объединения rowspan и colspan в данных разворачиваются: значение повторяется в каждой покрытой ячейке.
  Многоуровневая шапка объединяется через <br>: общий заголовок попадает в каждую дочернюю колонку.
  Для таблиц без шапки добавляется «Столбец N», для таблиц свойств — «Поле / Значение».
- Вложенная таблица выносится сразу после родительской, с подписью и идентификатором блока.
  В исходной ячейке остаётся ссылка Obsidian вида [[#^table-id\|[1]]].
  Идентификатор строится по ID исходной таблицы, а при его отсутствии — по содержимому.
  В последнем случае изменение содержимого меняет идентификатор. Ссылки внутри экспорта обновляются вместе с ним.
- Блоки кода внутри таблиц превращаются в строки встроенного кода через <br>.
  Для сочетания обратного слеша с вертикальной чертой применяется HTML <code>, чтобы не создавать лишнюю колонку.
  Неоднозначные размеры объединений отмечаются в отчёте; превышение 512 колонок прерывает импорт.
- Картинки становятся обычными ссылками на оригиналы, без скачивания и встраивания.
  Вложения ищутся через API, включая вложения другой страницы.
- Ссылки на пользователей, включая ответственного аналитика, сохраняются как ссылки на профиль Confluence.
- Ссылки на страницы и исходные якоря пока ведут в Confluence. В манифесте сохраняются
  распознанные linkedPageIds для будущего режима Obsidian; ссылки без ID не угадываются.
- Контейнеры section/column/panel/expand/info/note/warning/tip раскрываются; toc удаляется.
  Jira key становится ссылкой, Jira JQL — ссылкой на поиск, а не снимком результатов.
  Code/noformat становятся блоками кода. Неизвестные макросы сохраняют доступный текст и явную отметку.
- Динамические include/excerpt и результаты запросов не загружаются рекурсивно.
  Цвета и расположение колонок не сохраняются. Преобразование сложных таблиц является
  нормализацией структуры, а не копией внешнего вида страницы.

### Обновление и конфликты

Имена файлов стабильны: <pageId>.md.
В каталоге создаётся .confluence-import.json с адресом источника, версией,
движком, версией преобразования, SHA-256 результата, ссылками и предупреждениями.

- Повторный запуск получает страницу заново, но идентичный результат не переписывает файлы.
- Новая версия страницы или другой движок обновляют тот же файл.
- Локальные правки и существующий файл без записи в манифесте дают conflict;
  файл сохраняется. Для сравнения или восстановления используйте другой выходной каталог.
- Страница с тем же ID от другого источника и более старая версия также дают конфликт.
- HTTP 403/404 и другие ошибки не удаляют предыдущий импорт.
- Запись каждого файла атомарна. Каталог защищён от параллельных писателей через .import-lock.
  После аварийного завершения удалять оставшийся пустой lock-каталог можно только убедившись,
  что импорт не запущен. Файл страницы и манифест не являются общей транзакцией:
  сбой между их записью приведёт к безопасному конфликту на следующем запуске.
- Итоговый JSON содержит статусы created, updated, unchanged, conflict, error и предупреждения.
  При конфликте/ошибке код выхода 1, при успешной обработке — 0.
  Ошибка одной страницы не останавливает остальные.

Импорты в стандартном imports/ исключены из Git. RAG-индекс и локальные wikilinks пока не реализованы.

### MCP

Новый инструмент confluence_export_markdown:

```json
{
  "pageId": "468684852",
  "converter": "remark",
  "modules": ["ma", "qc"],
  "outputDirectory": "D:/knowledge/confluence"
}
```

Без outputDirectory возвращает Markdown и предупреждения без файловой записи.
С каталогом использует тот же механизм импорта, что и CLI; путь относится к машине MCP-сервера.
После пересборки перезапустите подключение MCP, чтобы новый инструмент появился в клиенте.

### Проверки

```powershell
npm test
```

Тесты проверяют конвертацию, метаданные, таблицы, ссылки, макросы, конфликты,
неизменность файлов при повторном импорте, CLI с локальным HTTP-сервером и MCP-обработчик.
Реальная доступность конкретных страниц зависит от прав токена Confluence.
