# app/routes/misc_routes.py

from flask import Blueprint, jsonify, send_from_directory, current_app # Добавил current_app
import logging
import os
# Убедимся в правильности импорта gemini_service
from ..services import gemini_service

misc_bp = Blueprint('misc', __name__)
logger = logging.getLogger(__name__)

@misc_bp.route('/api/models', methods=['GET'])
def get_models():
    """Возвращает список доступных моделей Gemini."""
    try:
        models = gemini_service.get_available_models()
        return jsonify({'models': models}), 200
    except Exception as e:
        logger.error(f"Ошибка получения списка моделей Gemini: {e}")
        return jsonify({'error': 'Ошибка сервера при получении списка моделей'}), 500

# --- Маршруты для статики ---

# Получаем путь к папке static из конфигурации приложения Flask
# Это более надежно, чем вычислять относительный путь
# static_folder_path = os.path.join(os.path.dirname(__file__), '..', '..', 'static')
# static_folder_path = os.path.normpath(static_folder_path)
# logger.info(f"Вычисленный путь к статической директории: {static_folder_path}")

# Функция для получения пути к папке static из приложения
def get_static_folder():
     # current_app доступен только внутри контекста запроса или приложения
     # Если этот код выполняется при импорте, current_app может быть недоступен
     # Безопаснее получать путь внутри функции маршрута
    try:
        return current_app.static_folder
    except RuntimeError:
         # Если вне контекста, пытаемся вычислить путь (менее надежно)
         logger.warning("Получение static_folder вне контекста приложения. Используется относительный путь.")
         static_folder_path = os.path.join(os.path.dirname(__file__), '..', '..', 'static')
         return os.path.normpath(static_folder_path)


@misc_bp.route('/')
def serve_index():
    """Отдает index.html"""
    static_folder = get_static_folder()
    logger.debug(f"Запрос к / - отдача index.html из {static_folder}")
    # Используем безопасный способ отправки файла
    try:
        # send_from_directory требует абсолютный путь к директории
        # Убедимся, что static_folder - это абсолютный путь
        if not os.path.isabs(static_folder):
             # Преобразуем в абсолютный относительно корня приложения
             static_folder = os.path.join(current_app.root_path, '..', static_folder) # ../ если static вне app/
             static_folder = os.path.normpath(static_folder)

        return send_from_directory(static_folder, 'index.html')
    except FileNotFoundError:
         logger.error(f"Файл index.html не найден в {static_folder}!")
         return "Главная страница не найдена.", 404
    except Exception as e:
        logger.error(f"Ошибка при отдаче index.html: {e}", exc_info=True)
        return "Ошибка сервера при загрузке страницы", 500


# Маршрут для chat.html (новый)
@misc_bp.route('/chat.html')
def serve_chat_html():
    """Отдает chat.html"""
    static_folder = get_static_folder()
    logger.debug(f"Запрос к /chat.html - отдача chat.html из {static_folder}")
    try:
         if not os.path.isabs(static_folder):
             static_folder = os.path.join(current_app.root_path, '..', static_folder)
             static_folder = os.path.normpath(static_folder)

         return send_from_directory(static_folder, 'chat.html')
    except FileNotFoundError:
        logger.error(f"Файл chat.html не найден в {static_folder}!")
        return "Страница чата не найдена.", 404
    except Exception as e:
        logger.error(f"Ошибка при отдаче chat.html: {e}", exc_info=True)
        return "Ошибка сервера при загрузке страницы чата", 500

# Маршрут для auth.html (переименован)
# Старый: @misc_bp.route('/auth')
@misc_bp.route('/auth.html') # ИЗМЕНЕНО: Добавлено .html для соответствия файлу
def serve_auth_html(): # ИЗМЕНЕНО: Переименована функция
    """Отдает auth.html"""
    static_folder = get_static_folder()
    logger.debug(f"Запрос к /auth.html - отдача auth.html из {static_folder}")
    try:
         if not os.path.isabs(static_folder):
             static_folder = os.path.join(current_app.root_path, '..', static_folder)
             static_folder = os.path.normpath(static_folder)

         return send_from_directory(static_folder, 'auth.html')
    except FileNotFoundError:
        logger.error(f"Файл auth.html не найден в {static_folder}!")
        return "Страница авторизации не найдена.", 404
    except Exception as e:
        logger.error(f"Ошибка при отдаче auth.html: {e}", exc_info=True)
        return "Ошибка сервера при загрузке страницы авторизации", 500


# Обработчик для других статических файлов (CSS, JS, assets)
# Flask обычно обрабатывает это сам через static_url_path и static_folder,
# если URL начинается с static_url_path (по умолчанию '/static').
# Если ты настроил static_url_path='', как в примере __init__.py,
# то Flask будет искать файлы напрямую в static_folder по их именам.
# Этот явный маршрут ниже нужен, только если стандартная обработка не работает.
#
# @misc_bp.route('/<path:filename>')
# def serve_static_files(filename):
#     static_folder = get_static_folder()
#     logger.debug(f"Запрос к статическому файлу: {filename} из {static_folder}")
#     try:
#         if not os.path.isabs(static_folder):
#              static_folder = os.path.join(current_app.root_path, '..', static_folder)
#              static_folder = os.path.normpath(static_folder)
#         return send_from_directory(static_folder, filename)
#     except FileNotFoundError:
#         logger.warning(f"Статический файл не найден: {filename} в {static_folder}")
#         return "Файл не найден", 404
#     except Exception as e:
#         logger.error(f"Ошибка при отдаче статического файла {filename}: {e}", exc_info=True)
#         return "Ошибка сервера", 500