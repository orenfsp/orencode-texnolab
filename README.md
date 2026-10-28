# ФСП Оренбуржье

Единая цифровая платформа Федерации спортивного программирования Оренбургской области.

![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-green.svg)
![React](https://img.shields.io/badge/React-18-lightblue.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)

Руководство по развёртыванию. Демо-база создаётся одной командой при установке, все данные в ней вымышленные.

## Установка пошагово

### Что нужно установить

| Программа | Версия | Ссылка |
|---|---|---|
| Python | 3.12 или новее | [Скачать](https://www.python.org/downloads/) |
| Node.js | 20 или новее | [Скачать](https://nodejs.org/) |
| Git | любая | [Скачать](https://git-scm.com/downloads) |

> **Важно.** При установке Python отметьте галочку **Add Python to PATH**.

Установите всё это до того, как переходить к командам ниже.

### Клонирование проекта

Откройте **PowerShell** и выполните:

```powershell
git clone https://github.com/orenfsp/orencode-texnolab.git
cd orencode-texnolab
```

### Запуск сервера

Сервер и сайт запускаются в двух разных окнах PowerShell. Начнём с сервера.

> **Важно.** Все команды сервера выполняйте из папки `backend`. Путь в начале строки PowerShell должен заканчиваться на `backend>`.

```powershell
cd backend

python -m venv .venv

.\.venv\Scripts\Activate.ps1
```

Если PowerShell пишет, что выполнение скриптов отключено, введите команду ниже, ответьте `Y` и повторите активацию:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Дальше:

```powershell
python -m pip install --upgrade pip

pip install -r requirements.txt

python -m app.seed

python -m uvicorn app.main:app --port 8000
```

Команда `python -m app.seed` создаёт базу и заполняет её демо-данными. Не закрывайте это окно, пока работаете с платформой.

Описание API: http://127.0.0.1:8000/docs

### Запуск сайта

Откройте **второе окно** PowerShell, перейдите в папку проекта и выполните:

```powershell
cd frontend

npm install

npm run dev
```

Если PowerShell не даёт запустить `npm`, используйте `npm.cmd install` и `npm.cmd run dev`.

Готово. Платформа открывается по адресу http://localhost:5173

### Вход в систему

Войдите как `admin@fsp56.demo`, пароль `demo1234`.

## Запуск через Docker

Если установлен Docker Desktop, всё поднимается одной командой из корня проекта:

```powershell
docker compose up --build
```

Сайт будет на http://localhost:5173, API на http://localhost:8000/docs. При каждом запуске контейнера демо-данные создаются заново.

## Настройки

Ничего настраивать не нужно, всё работает сразу. Если нужно изменить настройки, создайте файл `backend/.env`:

```powershell
cd backend
copy .env.example .env
```

| Переменная | Что делает |
|---|---|
| `FSP_DATABASE_URL` | адрес базы. Без неё используется файл `backend/fsp.db`. Для PostgreSQL: `postgresql+psycopg://fsp:fsp@localhost:5432/fsp` |
| `FSP_JWT_SECRET` | секрет для входа. На рабочем сервере замените на длинную случайную строку |
| `FSP_PUBLIC_BASE_URL` | адрес сайта для ссылок в уведомлениях и QR-кодов |
| `FSP_ISSUER` | адрес сервера для входа через ФСП ID |
| `FSP_TELEGRAM_BOT_TOKEN` | токен Telegram-бота. Без него уведомления пишутся только в лог |

## Частые проблемы

| Проблема | Что делать |
|---|---|
| `python` не найден | переустановите Python и отметьте Add Python to PATH |
| Порт 8000 или 5173 занят | закройте программу, которая его использует |
| Сайт открылся, но данных нет | проверьте, что сервер запущен и открывается http://127.0.0.1:8000/docs |
| Не получается войти | выполните `python -m app.seed` и попробуйте снова |
| `pip install` идёт очень долго | перенесите проект из папки с синхронизацией (OneDrive) в обычную, например `C:\dev` |
