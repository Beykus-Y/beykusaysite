# app/database.py
import sqlite3
import logging
from flask import g, current_app # Импортируем current_app для доступа к конфигу

# Убираем импорт Config, он больше не нужен напрямую здесь
# from .config import Config

logger = logging.getLogger(__name__)

# Убираем DATABASE = Config.DATABASE_URL, будем получать из app.config
DATABASE_URL = None # Эта переменная будет установлена в init_app

def get_db():
    """Возвращает соединение с БД для текущего запроса."""
    db_url = DATABASE_URL # Используем глобальную переменную модуля
    if not db_url:
         # Если DATABASE_URL не установлен, пытаемся получить его из current_app
         # Это полезно, если get_db вызывается до init_app или вне контекста приложения
         try:
             db_url = current_app.config['DATABASE_URL']
         except RuntimeError: # Вне контекста приложения
             raise RuntimeError("DATABASE_URL не сконфигурирован или get_db вызван вне контекста приложения.")
         except KeyError: # Ключ отсутствует в конфиге
              raise RuntimeError("DATABASE_URL не найден в конфигурации приложения.")

    if 'db' not in g:
        try:
            g.db = sqlite3.connect(db_url, detect_types=sqlite3.PARSE_DECLTYPES)
            g.db.row_factory = sqlite3.Row # Возвращать строки как объекты, похожие на dict
            logger.debug(f"Создано новое соединение с БД: {db_url}")
        except sqlite3.Error as e:
            logger.error(f"Ошибка подключения к БД {db_url}: {e}")
            raise # Передаем ошибку выше
    return g.db

def close_db(e=None):
    """Закрывает соединение с БД в конце запроса."""
    db = g.pop('db', None)
    if db is not None:
        db.close()
        logger.debug("Соединение с БД закрыто.")

def _check_and_apply_migrations(conn):
    """Проверяет и применяет простые миграции схемы."""
    cursor = conn.cursor()
    try:
        # Проверка наличия колонки 'thoughts' в таблице 'messages'
        cursor.execute("PRAGMA table_info(messages)")
        columns = [column[1].lower() for column in cursor.fetchall()] # Приводим к нижнему регистру для надежности
        if 'thoughts' not in columns:
            logger.info("Обнаружено отсутствие колонки 'thoughts'. Применяется миграция...")
            cursor.execute("ALTER TABLE messages ADD COLUMN thoughts TEXT NULL") # Указываем NULL явно
            conn.commit()
            logger.info("Колонка 'thoughts' успешно добавлена в таблицу 'messages'.")
        else:
            logger.debug("Колонка 'thoughts' уже существует в таблице 'messages'.")

        # Здесь можно добавить другие проверки миграций в будущем
        # Например, проверка наличия другой колонки или индекса

    except sqlite3.OperationalError as e:
        # Часто возникает, если таблица messages еще не существует при первом запуске
        if "no such table: messages" in str(e).lower():
            logger.warning("Таблица 'messages' еще не создана, миграция 'thoughts' будет применена после создания.")
        else:
            logger.error(f"Ошибка во время проверки/применения миграций: {e}")
    except sqlite3.Error as e:
        logger.error(f"Общая ошибка SQLite во время миграции: {e}")
        conn.rollback() # Откатываем на всякий случай
        # Не прерываем работу, но логируем ошибку

def init_db(db_url):
    """Инициализирует таблицы и применяет миграции."""
    try:
        # Используем новое соединение для инициализации
        with sqlite3.connect(db_url) as conn:
            c = conn.cursor()
            # Создание таблицы users
            c.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # Создание таблицы chats
            c.execute('''
                CREATE TABLE IF NOT EXISTS chats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            ''')
            # Создание таблицы messages - БЕЗ колонки thoughts изначально
            # Миграция добавит её позже, если её нет
            c.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    is_bot INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            ''')
            # Индексы для ускорения запросов
            c.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats (user_id)')
            c.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)')

            conn.commit() # Сохраняем создание таблиц
            logger.info(f"Базовые таблицы в '{db_url}' успешно инициализированы или уже существуют.")

            # --- Применение миграций ---
            _check_and_apply_migrations(conn) # Вызываем после создания таблиц

    except sqlite3.Error as e:
        logger.error(f"Критическая ошибка инициализации базы данных '{db_url}': {e}")
        raise

def init_app(app):
    """Регистрирует функции управления БД в приложении Flask."""
    global DATABASE_URL
    try:
        DATABASE_URL = app.config['DATABASE_URL']
        if not DATABASE_URL:
             raise ValueError("DATABASE_URL в конфигурации пуст.")
    except KeyError:
        logger.critical("Ключ 'DATABASE_URL' отсутствует в конфигурации Flask!")
        raise KeyError("DATABASE_URL не найден в app.config")
    except ValueError as e:
         logger.critical(e)
         raise e

    app.teardown_appcontext(close_db) # Регистрируем закрытие соединения

    # Инициализируем БД (создание таблиц + миграции) при старте приложения
    # Используем app.app_context() для доступа к конфигурации
    with app.app_context():
        logger.info(f"Инициализация БД и применение миграций для '{DATABASE_URL}'...")
        init_db(DATABASE_URL) # Передаем URL явно

    logger.info("Модуль database успешно инициализирован для приложения.")

    # Опционально: Добавление команды CLI для инициализации БД вручную
    # Для этого нужно установить click: pip install click
    # import click
    # @app.cli.command('init-db')
    # def init_db_command():
    #     """Инициализирует базу данных и применяет миграции."""
    #     try:
    #         db_url = current_app.config['DATABASE_URL']
    #         init_db(db_url)
    #         click.echo(f'База данных "{db_url}" инициализирована.')
    #     except Exception as e:
    #         click.echo(f'Ошибка инициализации БД: {e}', err=True)