#!/bin/bash

# Скрипт для одновременного запуска Flask бэкенда и React (Vite) фронтенда
# для Linux и macOS

echo "Запуск серверов разработки..."
echo

# Функция для очистки (остановки фоновых процессов) при выходе
cleanup() {
    echo "Остановка серверов..."
    # Отправляем сигнал TERM фоновым процессам
    # $BACKEND_PID и $FRONTEND_PID установлены ниже
    # 2>/dev/null подавляет вывод ошибок, если процесс уже завершен
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
    fi
    echo "Серверы остановлены."
    exit 0
}

# Устанавливаем ловушку для сигналов прерывания (Ctrl+C) и завершения
trap cleanup SIGINT SIGTERM

# --- Запуск Flask Бэкенда ---
echo "--> Запуск Flask бэкенда..."
# Активируем виртуальное окружение Python
# ПРОВЕРЬТЕ ПУТЬ к venv/bin/activate! Он должен быть относительным от корня проекта.
source ./venv/bin/activate || { echo "ОШИБКА: Не удалось активировать виртуальное окружение Python по пути ./venv/bin/activate"; exit 1; }
echo "Активировано окружение Python."

# Запускаем Flask в ФОНОВОМ режиме (&)
python ./run.py &
# Сохраняем PID (Process ID) фонового процесса бэкенда
BACKEND_PID=$!
echo "Бэкенд запущен (PID: $BACKEND_PID)"
# Небольшая пауза (опционально, обычно не нужна в Linux/macOS так, как в Windows)
# sleep 1

# --- Запуск React (Vite) Фронтенда ---
echo "--> Запуск React фронтенда..."
# Переходим в папку фронтенда
cd ./frontend-app || { echo "ОШИБКА: Не удалось перейти в папку ./frontend-app"; cleanup; exit 1; }
echo "Перешли в папку frontend-app."

# Запускаем Vite dev server в ФОНОВОМ режиме (&)
npm run dev &
# Сохраняем PID фонового процесса фронтенда
FRONTEND_PID=$!
# Возвращаемся в корневую папку (опционально, но хорошая практика)
cd ..
echo "Фронтенд запущен (PID: $FRONTEND_PID)"

echo
echo "Оба сервера запущены в фоновом режиме."
echo "Нажмите Ctrl+C в этом терминале, чтобы остановить ОБА сервера."
echo


wait $BACKEND_PID $FRONTEND_PID

echo "Один из серверов завершил работу."