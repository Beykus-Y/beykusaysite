from functools import wraps
from flask import request, jsonify, g
import logging
from ..services.auth_service import verify_auth_token, InvalidTokenError, AuthServiceError

logger = logging.getLogger(__name__)

def token_required(f):
    """Декоратор для защиты маршрутов, требующих аутентификации по JWT."""
    @wraps(f)
    def decorator(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            logger.warning(f"Доступ к {request.path} без токена.")
            return jsonify({'error': 'Токен авторизации отсутствует'}), 401

        try:
            user_data = verify_auth_token(token)
            # Сохраняем данные пользователя в глобальный объект запроса 'g'
            # чтобы они были доступны внутри обработчика маршрута
            g.current_user = user_data
            logger.debug(f"Пользователь {user_data['email']} (ID: {user_data['id']}) авторизован для {request.path}")

        except InvalidTokenError as e:
             logger.warning(f"Ошибка верификации токена для {request.path}: {e}")
             return jsonify({'error': str(e)}), 401
        except AuthServiceError as e: # Ловим другие ошибки сервиса аутентификации
             logger.error(f"Сервисная ошибка при проверке токена для {request.path}: {e}")
             return jsonify({'error': 'Ошибка сервера при проверке авторизации'}), 500
        except Exception as e: # Ловим непредвиденные ошибки
            logger.critical(f"Неожиданная ошибка в декораторе token_required для {request.path}: {e}", exc_info=True)
            return jsonify({'error': 'Внутренняя ошибка сервера'}), 500

        # Передаем user_data первым аргументом в защищенную функцию
        # В Flask принято передавать через g, а не как аргумент, но так тоже можно
        # return f(user_data, *args, **kwargs)
        # Используем g.current_user в маршрутах вместо user_data как аргумента
        return f(*args, **kwargs)

    return decorator