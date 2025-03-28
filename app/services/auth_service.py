import jwt
import logging
from datetime import datetime, timezone, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from app.config import Config
from app.database import get_db
from ..utils.helpers import validate_email, validate_password, validate_name

logger = logging.getLogger(__name__)

class AuthServiceError(Exception):
    """Базовый класс для ошибок сервиса аутентификации."""
    pass

class UserExistsError(AuthServiceError):
    """Исключение для случая, когда пользователь уже существует."""
    pass

class InvalidCredentialsError(AuthServiceError):
    """Исключение для неверных учетных данных."""
    pass

class InvalidTokenError(AuthServiceError):
    """Исключение для неверного или истекшего токена."""
    pass

class ValidationError(AuthServiceError):
    """Исключение для ошибок валидации данных."""
    pass


def register_user(name, email, password):
    """Регистрирует нового пользователя."""
    name = name.strip()
    email = email.strip().lower() # Приводим email к нижнему регистру
    password = password.strip()

    if not validate_name(name):
        raise ValidationError('Имя должно содержать минимум 2 символа')
    if not validate_email(email):
        raise ValidationError('Некорректный формат email')
    if not validate_password(password):
        raise ValidationError('Пароль должен содержать минимум 6 символов')

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256') # Используем более современный метод

    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                         (name, email, hashed_password))
        db.commit()
        user_id = cursor.lastrowid
        logger.info(f"Зарегистрирован новый пользователь: ID={user_id}, Email={email}")
        return {'id': user_id, 'name': name, 'email': email} # Возвращаем данные пользователя
    except sqlite3.IntegrityError:
        logger.warning(f"Попытка регистрации существующего email: {email}")
        raise UserExistsError('Пользователь с таким email уже существует')
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при регистрации пользователя {email}: {e}")
        db.rollback() # Откатываем транзакцию
        raise AuthServiceError(f'Ошибка сервера при регистрации: {e}')


def authenticate_user(email, password):
    """Аутентифицирует пользователя и возвращает его данные и токен."""
    email = email.strip().lower()
    password = password.strip()

    if not email or not password:
        raise ValidationError('Необходимо указать email и пароль')

    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute('SELECT id, name, email, password FROM users WHERE email = ?', (email,))
        user_row = cursor.fetchone()

        if not user_row:
             logger.warning(f"Попытка входа для несуществующего email: {email}")
             raise InvalidCredentialsError('Неверный email или пароль')

        user = dict(user_row) # Преобразуем sqlite3.Row в dict

        if not check_password_hash(user['password'], password):
            logger.warning(f"Неудачная попытка входа для email: {email} (неверный пароль)")
            raise InvalidCredentialsError('Неверный email или пароль')

        token = generate_auth_token(user['id'])
        logger.info(f"Успешная аутентификация пользователя: ID={user['id']}, Email={email}")
        return {
            'token': token,
            'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}
        }
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при аутентификации пользователя {email}: {e}")
        raise AuthServiceError(f'Ошибка сервера при аутентификации: {e}')


def generate_auth_token(user_id, expires_in_days=7):
    """Генерирует JWT токен для пользователя."""
    try:
        payload = {
            'user_id': user_id,
            'exp': datetime.now(timezone.utc) + timedelta(days=expires_in_days),
            'iat': datetime.now(timezone.utc) # Время выпуска токена
        }
        token = jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')
        return token
    except Exception as e:
        logger.error(f"Ошибка генерации JWT токена для user_id={user_id}: {e}")
        raise AuthServiceError('Не удалось сгенерировать токен')


def verify_auth_token(token):
    """Проверяет JWT токен и возвращает данные пользователя."""
    if not token:
        raise InvalidTokenError("Токен отсутствует")

    try:
        # Убираем префикс 'Bearer ' если он есть
        if token.startswith('Bearer '):
            token = token.split(' ')[1]

        payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
        user_id = payload.get('user_id')
        if not user_id:
             raise InvalidTokenError("Некорректный токен (отсутствует user_id)")

        # Дополнительно проверяем, существует ли пользователь в БД
        db = get_db()
        cursor = db.cursor()
        cursor.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,))
        user_row = cursor.fetchone()

        if not user_row:
             logger.warning(f"Токен валиден, но пользователь ID={user_id} не найден в БД.")
             raise InvalidTokenError("Пользователь не найден")

        logger.debug(f"Токен успешно верифицирован для пользователя ID={user_id}")
        return dict(user_row) # Возвращаем данные пользователя в виде dict

    except jwt.ExpiredSignatureError:
        logger.info("Попытка использовать истекший токен")
        raise InvalidTokenError("Срок действия токена истек")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Неверный токен: {e}")
        raise InvalidTokenError("Неверный токен")
    except sqlite3.Error as e:
        logger.error(f"Ошибка БД при проверке пользователя по токену (user_id={user_id}): {e}")
        raise AuthServiceError(f"Ошибка сервера при проверке токена: {e}")
    except Exception as e: # Ловим другие возможные ошибки
        logger.error(f"Неожиданная ошибка при верификации токена: {e}")
        raise InvalidTokenError(f"Ошибка обработки токена: {e}")