# app/routes/chat_routes.py

# Импорты Flask и стандартных библиотек
from flask import Blueprint, request, jsonify, Response, g, stream_with_context
import logging
import json # Нужен для создания JSON в error_stream

# Импорты сервисов и ошибок
# Убедись, что импорт gemini_service и его ошибок есть
from ..services import chat_service, gemini_service
from ..services.chat_service import ChatNotFoundError, InvalidInputError, ChatServiceError
# Добавим импорт ошибок GeminiServiceError, ChatInstanceError
from ..services.gemini_service import GeminiServiceError, ChatInstanceError
# Импорт декоратора
from ..utils.decorators import token_required

# Создание Blueprint - убедимся, что имя 'chat_bp' совпадает с регистрацией в __init__.py
chat_bp = Blueprint('chats', __name__, url_prefix='/api/chats')
logger = logging.getLogger(__name__)

# --- Маршруты для чатов ---

@chat_bp.route('', methods=['GET'])
@token_required
def get_chats():
    """Получение списка чатов текущего пользователя."""
    user = g.current_user
    try:
        chats = chat_service.get_chats_for_user(user['id'])
        return jsonify(chats), 200
    except ChatServiceError as e:
        logger.error(f"Ошибка получения чатов для пользователя ID={user['id']}: {e}")
        return jsonify({'error': 'Ошибка сервера при получении чатов'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при получении чатов для user ID={user['id']}: {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500

@chat_bp.route('', methods=['POST'])
@token_required
def create_chat():
    """Создание нового чата."""
    user = g.current_user
    data = request.get_json() or {}
    title = data.get('title', 'Новый чат')

    try:
        new_chat = chat_service.create_chat(user['id'], title)
        return jsonify(new_chat), 201
    except InvalidInputError as e:
        logger.info(f"Ошибка валидации при создании чата пользователем ID={user['id']}: {e}")
        return jsonify({'error': str(e)}), 400
    except ChatServiceError as e:
        logger.error(f"Ошибка создания чата для пользователя ID={user['id']}: {e}")
        return jsonify({'error': 'Ошибка сервера при создании чата'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при создании чата для user ID={user['id']}: {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500

# --- Маршруты для сообщений ---

@chat_bp.route('/<int:chat_id>/messages', methods=['GET'])
@token_required
def get_messages(chat_id: int):
    """Получение сообщений конкретного чата."""
    user = g.current_user
    try:
        # Вызываем функцию из chat_service, которая теперь возвращает thoughts
        messages = chat_service.get_messages_for_chat(chat_id, user['id'])
        return jsonify(messages), 200
    except ChatNotFoundError as e:
        logger.warning(f"Доступ к сообщениям чата {chat_id} запрещен/не найден для user {user['id']}: {e}")
        return jsonify({'error': str(e)}), 404
    except ChatServiceError as e:
        logger.error(f"Ошибка получения сообщений чата {chat_id} для пользователя {user['id']}: {e}")
        return jsonify({'error': 'Ошибка сервера при получении сообщений'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при получении сообщений чата {chat_id} для user ID={user['id']}: {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500

@chat_bp.route('/<int:chat_id>/messages', methods=['POST'])
@token_required
def send_message(chat_id: int):
    """Отправка сообщения пользователя и получение потокового ответа от Gemini."""
    user = g.current_user
    data = request.get_json() or {}
    content = data.get('content')

    if not content or not content.strip():
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400

    try:
        # 1. Проверяем доступ к чату перед добавлением сообщения
        # _check_chat_access выбросит исключение, если доступа нет
        chat_service._check_chat_access(chat_id, user['id'])

        # 2. Сохраняем сообщение пользователя
        # Можно сохранить результат (созданное сообщение), если он нужен
        user_msg = chat_service.add_user_message(chat_id, user['id'], content.strip())
        logger.info(f"Сообщение пользователя {user_msg['id']} сохранено в чат {chat_id}")

        # 3. Получаем генератор потокового ответа от Gemini
        stream_generator = gemini_service.get_gemini_response_stream(
            chat_id, user['id'], content.strip()
        )

        # 4. Возвращаем потоковый ответ клиенту
        return Response(stream_with_context(stream_generator),
                        mimetype='text/event-stream',
                        headers={'Cache-Control': 'no-cache'})

    except ChatNotFoundError as e:
        # Эта ошибка теперь ловится при _check_chat_access или add_user_message
        logger.warning(f"Действие с чатом {chat_id} запрещено/не найдено для user {user['id']}: {e}")
        return jsonify({'error': str(e)}), 404
    except InvalidInputError as e:
        logger.info(f"Ошибка валидации сообщения в чате {chat_id} от user {user['id']}: {e}")
        return jsonify({'error': str(e)}), 400
    except ChatServiceError as e:
        # Ошибки БД при сохранении сообщения пользователя или проверке доступа
        logger.error(f"Ошибка сервиса чата при обработке сообщения для чата {chat_id}: {e}")
        return jsonify({'error': 'Ошибка сервера при обработке вашего сообщения'}), 500
    except (GeminiServiceError, ChatInstanceError) as e:
         # Ошибки инициализации Gemini или другие ошибки сервиса Gemini
         logger.error(f"Ошибка сервиса Gemini при отправке сообщения в чат {chat_id}: {e}")
         # Возвращаем ошибку в формате потока SSE
         def error_stream():
             # Формируем JSON с ошибкой
             error_payload = json.dumps({'content': None, 'thoughts': None, 'error': f'Ошибка нейросети: {e}'})
             yield f"data: {error_payload}\n\n"
         # Используем stream_with_context и здесь
         return Response(stream_with_context(error_stream()), mimetype='text/event-stream', headers={'Cache-Control': 'no-cache'})
    except Exception as e:
        # Ловим все остальные непредвиденные ошибки
        logger.critical(f"Неожиданная ошибка при отправке сообщения в чат {chat_id} для user ID={user['id']}: {e}", exc_info=True)
        def critical_error_stream():
             error_payload = json.dumps({'content': None, 'thoughts': None, 'error': 'Неожиданная внутренняя ошибка сервера'})
             yield f"data: {error_payload}\n\n"
        return Response(stream_with_context(critical_error_stream()), mimetype='text/event-stream', headers={'Cache-Control': 'no-cache'})


# --- Маршруты управления чатом Gemini (reset, model) ---

@chat_bp.route('/<int:chat_id>/reset', methods=['POST'])
@token_required
def reset_chat(chat_id: int):
    """Сброс состояния (истории) чата в Gemini для данного chat_id."""
    user = g.current_user
    try:
        chat_service._check_chat_access(chat_id, user['id'])
        gemini_service.reset_gemini_chat(chat_id)
        return jsonify({'message': 'Контекст чата сброшен'}), 200 # Изменил сообщение
    except ChatNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except GeminiServiceError as e:
        logger.error(f"Ошибка сброса чата Gemini {chat_id} пользователем {user['id']}: {e}")
        return jsonify({'error': f'Ошибка сброса контекста чата: {e}'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при сбросе чата {chat_id} для user ID={user['id']}: {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500

@chat_bp.route('/<int:chat_id>/model', methods=['POST'])
@token_required
def change_model(chat_id: int):
    """Смена модели Gemini для данного chat_id."""
    user = g.current_user
    data = request.get_json() or {}
    model_name = data.get('model')

    if not model_name or not model_name.strip():
        return jsonify({'error': 'Необходимо указать имя модели (model)'}), 400

    model_name = model_name.strip() # Используем очищенное имя

    try:
        chat_service._check_chat_access(chat_id, user['id'])
        gemini_service.change_gemini_model(chat_id, model_name)
        # Можно получить имя модели из сервиса или просто использовать переданное
        return jsonify({'message': f'Модель для чата изменена на {model_name}'}), 200
    except ChatNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except GeminiServiceError as e:
        logger.error(f"Ошибка смены модели чата Gemini {chat_id} на '{model_name}' пользователем {user['id']}: {e}")
        # Если ошибка из-за невалидного имени модели, вернуть 400
        if "Недопустимое имя модели" in str(e):
             return jsonify({'error': str(e)}), 400
        else:
             return jsonify({'error': f'Ошибка смены модели: {e}'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при смене модели чата {chat_id} для user ID={user['id']}: {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500