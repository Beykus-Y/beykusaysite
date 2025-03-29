@echo off
:: Скрипт для одновременного запуска Flask бэкенда и React (Vite) фронтенда

:: Устанавливаем кодовую страницу для корректного вывода
chcp 65001 > nul

:: Заголовки окон для удобства
set BACKEND_TITLE="BeykuSay Backend (Flask)"
set FRONTEND_TITLE="BeykuSay Frontend (Vite)"

echo Запуск серверов разработки...
echo.

:: --- Запуск Flask Бэкенда ---
echo Запуск Flask бэкенда (%BACKEND_TITLE%)...
:: Активируем виртуальное окружение и запускаем run.py
:: ПРОВЕРЬТЕ ПУТЬ к venv\Scripts\activate.bat! Он должен быть относительным от корня проекта.
:: Используем start, чтобы запустить в новом окне
start %BACKEND_TITLE% cmd /k ".\venv\Scripts\activate.bat && echo Активировано окружение Python. && python .\run.py"
timeout /t 2 /nobreak > nul :: Небольшая пауза, чтобы первое окно успело запуститься

:: --- Запуск React (Vite) Фронтенда ---
echo Запуск React фронтенда (%FRONTEND_TITLE%)...
:: Переходим в папку фронтенда и запускаем npm run dev
:: Используем start, чтобы запустить в новом окне
start %FRONTEND_TITLE% cmd /k "cd .\frontend-app && echo Перешли в папку frontend-app. && npm run dev"

echo.
echo Оба сервера запущены в отдельных окнах.
echo Закройте окна серверов (Ctrl+C в каждом), чтобы остановить их.
echo.
echo Нажмите любую клавишу для закрытия этого окна...
pause > nul