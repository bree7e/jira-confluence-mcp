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
