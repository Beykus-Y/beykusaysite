import os
from app import create_app, Config # Импортируем фабрику и базу данных
import logging

logger = logging.getLogger(__name__)

# Создаем экземпляр приложения с использованием фабрики
app = create_app()

if __name__ == '__main__':
    # Убедимся, что директория для БД существует (если это файл)
    db_path = Config.DATABASE_URL
    if '/' in db_path:
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir)
            logger.info(f"Создана директория для БД: {db_dir}")

    # Команда для инициализации БД (можно закомментировать после первого запуска)
    # with app.app_context():
    #     try:
    #         database.init_db()
    #         logger.info("База данных инициализирована (или уже существует).")
    #     except Exception as e:
    #         logger.critical(f"Критическая ошибка инициализации БД: {e}", exc_info=True)
    #         # Выход, если БД не инициализирована? Зависит от требований.
    #         # exit(1)

    # Запуск сервера Flask для разработки
    # debug=True перезагружает сервер при изменениях кода и дает отладчик
    # В продакшене используйте Gunicorn или другой WSGI сервер
    host = '0.0.0.0' # Слушать на всех интерфейсах
    port = 8000
    logger.info(f"Запуск сервера разработки Flask на http://{host}:{port}")
    app.run(host=host, port=port, debug=True) # Установите debug=False для продакшена!