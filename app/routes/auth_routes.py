from flask import Blueprint, request, jsonify
import logging
from ..services import auth_service
from ..services.auth_service import (
    ValidationError, UserExistsError, InvalidCredentialsError, AuthServiceError
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Не предоставлены данные'}), 400

    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not all([name, email, password]):
        return jsonify({'error': 'Необходимо указать имя, email и пароль'}), 400

    try:
        user = auth_service.register_user(name, email, password)
        # Не возвращаем данные пользователя при регистрации из соображений безопасности,
        # он должен залогиниться
        return jsonify({'message': 'Регистрация прошла успешно'}), 201
    except ValidationError as e:
        logger.info(f"Ошибка валидации при регистрации ({email}): {e}")
        return jsonify({'error': str(e)}), 400
    except UserExistsError as e:
        logger.info(f"Попытка регистрации существующего email: {email}")
        return jsonify({'error': str(e)}), 409 # 409 Conflict лучше чем 400
    except AuthServiceError as e:
        logger.error(f"Сервисная ошибка при регистрации ({email}): {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера при регистрации'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при регистрации ({email}): {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Не предоставлены данные'}), 400

    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Необходимо указать email и пароль'}), 400

    try:
        result = auth_service.authenticate_user(email, password)
        return jsonify(result), 200
    except ValidationError as e: # Хотя authenticate_user может и не бросать ее явно
        logger.info(f"Ошибка валидации при входе ({email}): {e}")
        return jsonify({'error': str(e)}), 400
    except InvalidCredentialsError as e:
        logger.warning(f"Неудачная попытка входа для email: {email}")
        return jsonify({'error': str(e)}), 401 # 401 Unauthorized
    except AuthServiceError as e:
        logger.error(f"Сервисная ошибка при входе ({email}): {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера при входе'}), 500
    except Exception as e:
        logger.critical(f"Неожиданная ошибка при входе ({email}): {e}", exc_info=True)
        return jsonify({'error': 'Неожиданная внутренняя ошибка сервера'}), 500

# Пример защищенного маршрута для проверки токена (не обязательно)
# from ..utils.decorators import token_required
# @auth_bp.route('/verify_token', methods=['GET'])
# @token_required
# def verify():
#     # Если декоратор пропустил, токен валиден.
#     # Данные пользователя доступны в g.current_user
#     user = g.current_user
#     return jsonify({'message': 'Токен валиден', 'user': user}), 200