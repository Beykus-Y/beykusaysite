import logging
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from .config import Config
from . import database

# Настройка логирования до создания приложения
logging.basicConfig(
    level=logging.INFO, # Установите DEBUG для более подробной информации
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
# Уменьшаем шум от библиотек (опционально)
logging.getLogger("werkzeug").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

def create_app(config_class=Config):
    """Фабрика для создания экземпляра приложения Flask."""
    # Путь к статике теперь относительно корня проекта
    static_dir = os.path.join(os.path.dirname(__file__), '..', 'static')
    static_dir = os.path.normpath(static_dir)

    app = Flask(__name__,
                static_folder=static_dir, # Указываем папку со статикой
                static_url_path='' # URL для статики будет начинаться с корня /
               )
    app.config.from_object(config_class)

    logger.info(f"Загружена конфигурация: SECRET_KEY={'*' * 8}, DB={app.config['DATABASE_URL']}, Static={app.static_folder}")

    # Инициализация CORS
    CORS(app, resources={
        r"/*": { # Применяем ко всем маршрутам
            "origins": app.config['CORS_ORIGINS'],
            "methods": app.config['CORS_METHODS'],
            "allow_headers": app.config['CORS_HEADERS'],
            "supports_credentials": True # Если нужны куки или Authorization header
        }
    })
    logger.info(f"CORS настроен для Origins: {app.config['CORS_ORIGINS']}")

    # Инициализация базы данных
    # database.init_app(app)
    # Создаем таблицы, если БД не существует (или используем CLI команду)
    with app.app_context():
         try:
             # Передаем URL базы данных из конфигурации приложения
             database.init_db(app.config['DATABASE_URL'])  # <--- ИСПРАВЛЕНИЕ ЗДЕСЬ
             # Вызываем init_app ПОСЛЕ init_db, чтобы зарегистрировать teardown
             database.init_app(app)
         except Exception as e:
              logger.critical(f"Не удалось инициализировать базу данных при старте: {e}", exc_info=True)
              # Решите, должно ли приложение падать, если БД недоступна
              # raise

    # Регистрация Blueprints (маршрутов)
    from app.routes import chat_routes
    from app.routes import auth_routes
    from app.routes import misc_routes
    app.register_blueprint(auth_routes.auth_bp)
    app.register_blueprint(chat_routes.chat_bp)
    app.register_blueprint(misc_routes.misc_bp)
    logger.info("Blueprints зарегистрированы.")

    # Регистрация обработчиков запросов/ответов и ошибок на уровне приложения

    @app.before_request
    def log_request_info():
        # Логируем детали запроса
        origin = request.headers.get('Origin', 'unknown')
        user_agent = request.headers.get('User-Agent', 'unknown')
        # Не логгируем тело запроса по умолчанию для безопасности
        logger.info(f"Request: {request.method} {request.path} from {request.remote_addr} (Origin: {origin}) UserAgent: {user_agent[:30]}...") # Обрезаем User-Agent

    # @app.after_request # Управление CORS передано Flask-CORS
    # def add_cors_headers(response):
    #      pass

    # Глобальный обработчик ошибок 500
    @app.errorhandler(500)
    def internal_server_error(error):
        # Логируем полную ошибку
        logger.error(f"Internal Server Error: {error}", exc_info=True)
        # Возвращаем общий JSON ответ
        return jsonify(error="Внутренняя ошибка сервера"), 500

    # Глобальный обработчик ошибок 404
    @app.errorhandler(404)
    def not_found_error(error):
        logger.warning(f"Resource not found (404): {request.path}")
        # Возвращаем JSON, так как это API
        return jsonify(error="Запрошенный ресурс не найден"), 404

    # Глобальный обработчик ошибок 405
    @app.errorhandler(405)
    def method_not_allowed(error):
        logger.warning(f"Method Not Allowed (405): {request.method} for {request.path}")
        return jsonify(error="Метод не поддерживается для данного ресурса"), 405

    # Можно добавить больше обработчиков для стандартных ошибок werkzeug

    logger.info("Приложение Flask успешно создано.")
    return app