# Level Up

Level Up — адаптивный веб-планировщик учебных и повседневных задач с авторизацией, серверным хранением данных, XP и уровнями, фильтрами, архивом и календарём в режимах «Месяц», «Неделя» и «День».

## Production и GitHub Pages

Основное приложение: [https://levelup.aikcu.ru](https://levelup.aikcu.ru)

Статическая копия frontend на GitHub Pages: [https://aikcuru.github.io/level-up/](https://aikcuru.github.io/level-up/)

GitHub Pages не предоставляет production API по same-origin пути `/api/v1`, поэтому полноценное приложение работает на основном домене. Развёртывание текущего WEB-релиза на production выполняется отдельным этапом после локальной приёмки.

## Возможности

- вход и выход через существующий API;
- серверная загрузка профиля, предметов, задач, XP и уровня;
- создание, редактирование, выполнение и удаление задач;
- направления задач, базовые и дополнительные предметы;
- три уровня сложности с наградами 5, 20 и 50 XP;
- дедлайны, отображение просрочки и учёт переносов;
- фильтры по статусу, направлению и предмету;
- вкладки «Задачи», «Календарь» и «Архив»;
- календарь в режимах «Месяц», «Неделя» и «День»;
- выбор даты и полный обзор задач выбранного дня;
- адаптивный интерфейс для компьютера и телефона;
- восстановление разрешённых UI preferences после F5;
- расчёт Today/Overdue по часовому поясу `Asia/Irkutsk` и локальный пересчёт после возвращения страницы из фона;
- обработка ошибок сети, API и некорректного server contract;
- client-side timeout API-запросов 15 секунд;
- отсутствие автоматического повтора task mutation при неопределённом результате;
- безопасный повтор только чтения, если операция принята сервером, но обновить state не удалось.

## Архитектура

Frontend реализован на HTML, CSS и vanilla JavaScript. Production build отсутствует.

API — отдельный FastAPI-компонент из репозитория `level-up-api`. Frontend обращается к нему по same-origin пути `/api/v1`.

Пользователь входит в существующий аккаунт по логину и паролю. Сессия хранится в server-side session cookie, а CSRF-токен — только в памяти открытой страницы.

`GET /api/v1/state` загружает актуальные данные приложения. После изменяющих операций frontend получает свежий state; сервер остаётся источником истины.

## Данные и browser storage

Server source of truth:

- профиль;
- предметы;
- задачи;
- XP и уровень;
- версии записей;
- `syncVersion`.

`sessionStorage` используется только для UI preferences под ключом:

```text
level-up:ui-preferences
```

Сохраняются только:

- версия формата;
- активная вкладка;
- фильтры по статусу, направлению и предмету;
- режим календаря и выбранная дата.

Browser storage не содержит задачи, объекты предметов, профиль, XP, пароль, auth/session token, CSRF-токен, ответы API или черновик формы. `localStorage` не используется как хранилище бизнес-данных или UI state Level Up. Черновик формы после F5 не восстанавливается.

## Локальный запуск

### Только frontend

В Windows PowerShell:

```powershell
cd C:\Projects\level-up
python.exe -m http.server 8000 --bind 127.0.0.1
```

Статический preview будет доступен по адресу [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Авторизация и server data через `/api/v1` при таком запуске сами по себе не работают.

### Frontend + локальный API

Для полного локального контура нужен отдельный репозиторий API:

```powershell
cd C:\Projects\level-up-api

$env:LEVELUP_ENVIRONMENT="development"
$env:LEVELUP_STATIC_DIR="C:\Projects\level-up"
$env:LEVELUP_ALLOWED_ORIGIN="http://127.0.0.1:8000"

.\.venv\Scripts\python.exe -m uvicorn app.main:app `
  --host 127.0.0.1 `
  --port 8000
```

Предварительно необходимы:

- локальная копия `level-up-api`;
- существующее Python virtual environment `.venv`;
- установленные API dependencies;
- безопасная development-конфигурация без публикации секретов;
- подготовленная локальная БД и локальный тестовый аккаунт;
- свободный порт `8000`.

Не используйте копию production DB для локального запуска.

## Автоматические тесты

Playwright открывает только локальную страницу. API в browser tests заменяется synthetic mock, а fixture не содержит реальных пользовательских данных. Production URL тестами не используется.

Проверенная матрица E01–E24:

- Chromium: 55 passed, 0 failed, 0 skipped;
- WebKit: 55 passed, 0 failed, 0 skipped.

Firefox не входит в текущую Playwright config.

Полный Chromium:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-web-tests.ps1 `
  --project=chromium `
  --workers=1
```

Полный WebKit:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-web-tests.ps1 `
  --project=webkit `
  --workers=1
```

`ExecutionPolicy Bypass` применяется только к процессу запуска runner и не меняет глобальную Windows PowerShell policy.

## Установка dev-зависимостей

```powershell
cd C:\Projects\level-up
npm.cmd ci
npx.cmd playwright install chromium webkit
```

В проекте используется точная версия `@playwright/test` — `1.63.0`. npm scripts не определены, поэтому тесты запускаются через `scripts/run-web-tests.ps1`, а не через `npm test` или `npm run test`.

Проверенная локальная среда, но не обязательный набор точных версий:

- Node.js `v24.18.0`;
- npm/npx `11.16.0`;
- Python `3.12.10`.

На проверенной Windows-машине использовались `npm.cmd` и `npx.cmd`, чтобы не менять глобальную PowerShell Execution Policy.

## Структура проекта

- `index.html` — семантическая разметка авторизации, вкладок, форм и календаря.
- `style.css` — оформление и адаптивные состояния Month/Week/Day.
- `script.js` — API client, server state, CRUD, авторизация, UI preferences и календарь.
- `package.json` — npm foundation и Playwright dev dependency.
- `package-lock.json` — зафиксированные версии npm dependencies.
- `playwright.config.js` — локальный baseURL и проекты Chromium/WebKit.
- `scripts/run-web-tests.ps1` — Windows runner с локальным static server и cleanup.
- `tests/web-release.spec.js` — smoke-тесты и автоматическая матрица E01–E24.
- `tests/fixtures/state.json` — synthetic server state для browser tests.
- `.gitignore` — исключения dependencies, test artifacts и environment-файлов.
- `concept.md`, `tz.md`, `plan.md` — исторические учебные документы первоначального MVP, а не описание текущей архитектуры.
- `docs/sync-architecture.md` — исторический проектный документ раннего этапа серверной синхронизации, не являющийся текущим API-контрактом.

## Ограничения

- GitHub Pages не предоставляет production API.
- Frontend не предоставляет публичную регистрацию.
- UI preferences относятся к текущей browser session/tab.
- Черновик формы после F5 не восстанавливается.
- Offline cache и offline sync отсутствуют.
- Автоматической синхронизации UI между открытыми устройствами нет.
- API и БД находятся в отдельном server component.
- WebKit automation не заменяет ручную проверку Safari на реальном iPhone.
- Пользовательский выбор цветов предметов не реализован.

## Статус WEB-релиза

- автоматическая матрица E01–E24 завершена;
- Chromium: 55 passed, 0 failed, 0 skipped;
- WebKit: 55 passed, 0 failed, 0 skipped;
- API и БД в этом WEB-релизе не менялись;
- полная локальная ручная приёмка выполняется отдельным Stage 7;
- production deployment выполняется отдельным Stage 8 после успешной приёмки.
