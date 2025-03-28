import logging
import sqlite3
from datetime import datetime, timezone
from app.database import get_db

logger = logging.getLogger(__name__)

class ChatServiceError(Exception):
    """Базовый класс для ошибок сервиса чатов."""
    pass

class ChatNotFoundError(ChatServiceError):
    """Чат не найден или нет доступа."""
    pass

class InvalidInputError(ChatServiceError):
    """Ошибка валидации входных данных."""
    pass


def create_chat(user_id: int, title: str):
    """Создает новый чат для пользователя."""
    title = title.strip()
    if not title:
        raise InvalidInputError('Название чата не может быть пустым')
    # Ограничение длины названия?
    if len(title) > 100:
         title = title[:100] + '...' # Обрезаем для примера

    db = get_db()
    try:
        cursor = db.cursor()
        # Убедимся, что пользователь существует (хотя это должно проверяться токеном)
        # cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        # if not cursor.fetchone():
        #     raise ChatServiceError("Пользователь не найден") # Или другая ошибка

        cursor.execute('INSERT INTO chats (user_id, title) VALUES (?, ?)', (user_id, title))
        chat_id = cursor.lastrowid
        db.commit()

        # Получаем время создания из БД для точности
        cursor.execute("SELECT created_at FROM chats WHERE id = ?", (chat_id,))
        created_at_row = cursor.fetchone()
        created_at = created_at_row['created_at'] if created_at_row else datetime.now(timezone.utc)

        logger.info(f"Создан новый чат ID={chat_id} для пользователя ID={user_id} с названием '{title}'")
        return {
            'id': chat_id,
            'title': title,
            # Форматируем дату в ISO для JSON
            'created_at': created_at.isoformat().replace('+00:00', 'Z')
        }
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при создании чата для пользователя ID={user_id}: {e}")
        db.rollback()
        raise ChatServiceError(f"Ошибка сервера при создании чата: {e}")


def get_chats_for_user(user_id: int):
    """Возвращает список чатов пользователя с последним сообщением."""
    db = get_db()
    try:
        cursor = db.cursor()
        # Оптимизированный запрос для получения последнего сообщения
        cursor.execute('''
            SELECT
                c.id,
                c.title,
                c.created_at,
                (SELECT m.content
                 FROM messages m
                 WHERE m.chat_id = c.id
                 ORDER BY m.created_at DESC
                 LIMIT 1) AS last_message_content
            FROM chats c
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        ''', (user_id,))
        chats_rows = cursor.fetchall()

        chats_list = []
        for row in chats_rows:
            chats_list.append({
                'id': row['id'],
                'title': row['title'],
                'created_at': row['created_at'].isoformat().replace('+00:00', 'Z'),
                'last_message': row['last_message_content'] or 'Нет сообщений'
            })
        logger.debug(f"Получено {len(chats_list)} чатов для пользователя ID={user_id}")
        return chats_list
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при получении списка чатов для пользователя ID={user_id}: {e}")
        raise ChatServiceError(f"Ошибка сервера при получении чатов: {e}")


def _check_chat_access(chat_id: int, user_id: int):
    """Вспомогательная функция для проверки существования чата и доступа пользователя."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM chats WHERE id = ? AND user_id = ?', (chat_id, user_id))
    chat = cursor.fetchone()
    if not chat:
        logger.warning(f"Попытка доступа к чату ID={chat_id} пользователем ID={user_id} (не найден или нет прав)")
        raise ChatNotFoundError(f"Чат с ID {chat_id} не найден или доступ запрещен.")
    return True # Возвращаем True для удобства использования


def get_messages_for_chat(chat_id: int, user_id: int):
    """Возвращает список сообщений для указанного чата."""
    _check_chat_access(chat_id, user_id) # Проверяем доступ

    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute('''
            SELECT id, content, is_bot, created_at, thoughts
            FROM messages
            WHERE chat_id = ?
            ORDER BY created_at ASC
        ''', (chat_id,))
        messages_rows = cursor.fetchall()

        messages_list = []
        for row in messages_rows:
            messages_list.append({
                'id': row['id'],
                'content': row['content'],
                'is_bot': bool(row['is_bot']), # Преобразуем 0/1 в True/False
                'created_at': row['created_at'].isoformat().replace('+00:00', 'Z'),
                'thoughts': row['thoughts']
            })
        logger.debug(f"Получено {len(messages_list)} сообщений для чата ID={chat_id}")
        return messages_list
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при получении сообщений для чата ID={chat_id}: {e}")
        raise ChatServiceError(f"Ошибка сервера при получении сообщений: {e}")


def add_user_message(chat_id: int, user_id: int, content: str):
    """Добавляет сообщение от пользователя в чат."""
    content = content.strip()
    if not content:
        raise InvalidInputError('Сообщение не может быть пустым')
    # Ограничение длины сообщения?
    if len(content) > 4096: # Пример ограничения
         raise InvalidInputError('Сообщение слишком длинное')

    _check_chat_access(chat_id, user_id) # Проверяем доступ

    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute(
            'INSERT INTO messages (chat_id, user_id, content, is_bot) VALUES (?, ?, ?, 0)',
            (chat_id, user_id, content)
        )
        message_id = cursor.lastrowid
        db.commit()

        # Получаем время создания из БД
        cursor.execute("SELECT created_at FROM messages WHERE id = ?", (message_id,))
        created_at_row = cursor.fetchone()
        created_at = created_at_row['created_at'] if created_at_row else datetime.now(timezone.utc)

        logger.info(f"Добавлено сообщение от пользователя ID={user_id} в чат ID={chat_id}")
        return {
            'id': message_id,
            'content': content,
            'is_bot': False,
            'created_at': created_at.isoformat().replace('+00:00', 'Z')
        }
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при добавлении сообщения пользователя в чат ID={chat_id}: {e}")
        db.rollback()
        raise ChatServiceError(f"Ошибка сервера при сохранении сообщения: {e}")

# Функция add_bot_message была перенесена внутрь get_gemini_response_stream в gemini_service,
# так как логично сохранять ответ бота после его получения.
# Если нужно добавить сообщение бота из другого места, можно создать похожую функцию здесь.