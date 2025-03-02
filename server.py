from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import sqlite3
import jwt
import os
import logging
from datetime import datetime, timezone, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from time import time
import json
import re
from api.gemini_api import GeminiChat, GeminiModel

# Инициализация приложения
app = Flask(__name__, static_folder='.', static_url_path='')

# Настройка CORS
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:8000", "http://127.0.0.1:8000", "*"],  # Разрешённые источники
        "methods": ["GET", "POST", "OPTIONS"],  # Разрешённые методы
        "allow_headers": ["Content-Type", "Authorization"]  # Разрешённые заголовки
    }
})

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Конфигурация
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', os.urandom(24).hex())
DATABASE = 'database.db'
chat_instances = {}

# Добавляем заголовки CORS ко всем ответам
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

# Обработка OPTIONS запросов вручную
@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return '', 204

# Инициализация базы данных
def init_db():
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            c.execute('''
                CREATE TABLE IF NOT EXISTS chats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            c.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    is_bot INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats (id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
        logger.info("База данных успешно инициализирована")
    except Exception as e:
        logger.error(f"Ошибка инициализации базы данных: {e}")
        raise

# Проверка токена
def token_required(f):
    @wraps(f)
    def decorator(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Токен отсутствует'}), 401
        try:
            token = token.split(' ')[1]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            with sqlite3.connect(DATABASE) as conn:
                c = conn.cursor()
                c.execute('SELECT id, name, email FROM users WHERE id = ?', (data['user_id'],))
                user = c.fetchone()
            if not user:
                return jsonify({'error': 'Пользователь не найден'}), 401
            return f(user, *args, **kwargs)
        except Exception as e:
            logger.warning(f"Ошибка проверки токена: {e}")
            return jsonify({'error': 'Неверный токен'}), 401
    return decorator

# Генерация JWT токена
def generate_token(user_id):
    try:
        payload = {
            'user_id': user_id,
            'exp': datetime.now(timezone.utc) + timedelta(days=7)
        }
        token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
        return token
    except Exception as e:
        logger.error(f"Ошибка генерации токена: {e}")
        return None

# Регистрация пользователя
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()

    if not name or len(name) < 2:
        return jsonify({'error': 'Имя должно содержать минимум 2 символа'}), 400
    if not email or not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        return jsonify({'error': 'Некорректный email'}), 400
    if not password or len(password) < 6:
        return jsonify({'error': 'Пароль должен содержать минимум 6 символов'}), 400

    hashed_password = generate_password_hash(password, 'sha256')
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', 
                     (name, email, hashed_password))
            conn.commit()
        logger.info(f"Зарегистрирован пользователь: {email}")
        return jsonify({'message': 'Регистрация успешна'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email уже зарегистрирован'}), 400
    except Exception as e:
        logger.error(f"Ошибка регистрации: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Вход пользователя
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'error': 'Укажите email и пароль'}), 400

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('SELECT id, name, email, password FROM users WHERE email = ?', (email,))
            user = c.fetchone()
            if not user or not check_password_hash(user[3], password):
                return jsonify({'error': 'Неверный email или пароль'}), 401
            token = generate_token(user[0])
            if not token:
                return jsonify({'error': 'Ошибка генерации токена'}), 500
            logger.info(f"Успешный вход: {email}")
            return jsonify({
                'token': token,
                'user': {'id': user[0], 'name': user[1], 'email': user[2]}
            }), 200
    except Exception as e:
        logger.error(f"Ошибка входа: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Получение списка чатов
@app.route('/api/chats', methods=['GET'])
@token_required
def get_chats(user):
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('''
                SELECT c.id, c.title, c.created_at, 
                       (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) 
                FROM chats c WHERE user_id = ? ORDER BY created_at DESC
            ''', (user[0],))
            chats = c.fetchall()
        return jsonify([{
            'id': chat[0],
            'title': chat[1],
            'created_at': chat[2],
            'last_message': chat[3] or 'Нет сообщений'
        } for chat in chats]), 200
    except Exception as e:
        logger.error(f"Ошибка получения чатов: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Создание чата
@app.route('/api/chats', methods=['POST'])
@token_required
def create_chat(user):
    data = request.get_json() or {}
    title = data.get('title', 'Новый чат').strip()
    if not title:
        return jsonify({'error': 'Название чата не может быть пустым'}), 400

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('INSERT INTO chats (user_id, title) VALUES (?, ?)', (user[0], title))
            chat_id = c.lastrowid
            conn.commit()
        logger.info(f"Создан чат {chat_id} для пользователя {user[2]}")
        return jsonify({'id': chat_id, 'title': title, 'created_at': datetime.now(timezone.utc).isoformat()}), 201
    except Exception as e:
        logger.error(f"Ошибка создания чата: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Получение сообщений чата
@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
@token_required
def get_messages(user, chat_id):
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('SELECT id FROM chats WHERE id = ? AND user_id = ?', (chat_id, user[0]))
            if not c.fetchone():
                return jsonify({'error': 'Чат не найден'}), 404
            c.execute('SELECT id, content, is_bot, created_at FROM messages WHERE chat_id = ? ORDER BY created_at', 
                     (chat_id,))
            messages = c.fetchall()
        return jsonify([{
            'id': m[0],
            'content': m[1],
            'is_bot': bool(m[2]),
            'created_at': m[3]
        } for m in messages]), 200
    except Exception as e:
        logger.error(f"Ошибка получения сообщений: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Отправка сообщения
@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
@token_required
def send_message(user, chat_id):
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('SELECT id FROM chats WHERE id = ? AND user_id = ?', (chat_id, user[0]))
            if not c.fetchone():
                return jsonify({'error': 'Чат не найден'}), 404
            c.execute('INSERT INTO messages (chat_id, user_id, content, is_bot) VALUES (?, ?, ?, 0)', 
                     (chat_id, user[0], content))
            conn.commit()

        if chat_id not in chat_instances:
            try:
                chat_instances[chat_id] = {'instance': GeminiChat(), 'last_used': time()}
            except Exception as e:
                logger.error(f"Ошибка инициализации GeminiChat: {e}")
                return jsonify({'error': 'Ошибка инициализации нейросети'}), 500
        chat_instances[chat_id]['last_used'] = time()

        def generate():
            full_response = ""
            try:
                for chunk in chat_instances[chat_id]['instance'].get_streaming_response(content):
                    try:
                        chunk_data = json.loads(chunk.replace('data: ', ''))
                        if 'error' in chunk_data:
                            raise ValueError(chunk_data['error'])
                        full_response += chunk_data['content']
                        yield chunk
                    except json.JSONDecodeError:
                        logger.warning(f"Некорректный чанк: {chunk}")
                        yield f"data: {json.dumps({'error': 'Некорректный ответ от нейросети'})}\n\n"
                        return
                with sqlite3.connect(DATABASE) as conn:
                    c = conn.cursor()
                    c.execute('INSERT INTO messages (chat_id, user_id, content, is_bot) VALUES (?, ?, ?, 1)', 
                             (chat_id, user[0], full_response))
                    conn.commit()
                logger.info(f"Ответ нейросети сохранён в чат {chat_id}")
            except Exception as e:
                logger.error(f"Ошибка в потоке Gemini: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            cleanup_chats()

        logger.info(f"Отправлено сообщение в чат {chat_id}")
        return Response(generate(), mimetype='text/event-stream', headers={'Cache-Control': 'no-cache'})
    except Exception as e:
        logger.error(f"Ошибка отправки сообщения: {e}")
        return jsonify({'error': f'Ошибка сервера: {str(e)}'}), 500

# Очистка старых чатов
def cleanup_chats():
    current_time = time()
    for chat_id in list(chat_instances.keys()):
        if current_time - chat_instances[chat_id]['last_used'] > 3600:
            del chat_instances[chat_id]
    logger.debug(f"Очистка чатов завершена. Активных чатов: {len(chat_instances)}")

# Список моделей
@app.route('/api/models', methods=['GET'])
def get_models():
    try:
        return jsonify({'models': [{'id': m.value, 'name': m.name} for m in GeminiModel]}), 200
    except Exception as e:
        logger.error(f"Ошибка получения моделей: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Сброс чата
@app.route('/api/chats/<int:chat_id>/reset', methods=['POST'])
@token_required
def reset_chat(user, chat_id):
    try:
        if chat_id in chat_instances:
            chat_instances[chat_id]['instance'].reset_chat()
            chat_instances[chat_id]['last_used'] = time()
        return jsonify({'message': 'Чат сброшен'}), 200
    except Exception as e:
        logger.error(f"Ошибка сброса чата: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Смена модели
@app.route('/api/chats/<int:chat_id>/model', methods=['POST'])
@token_required
def change_model(user, chat_id):
    data = request.get_json() or {}
    model_name = data.get('model', '').strip()
    if not model_name:
        return jsonify({'error': 'Укажите модель'}), 400
    try:
        if chat_id not in chat_instances:
            chat_instances[chat_id] = {'instance': GeminiChat(model_name), 'last_used': time()}
        else:
            chat_instances[chat_id]['instance'].change_model(model_name)
            chat_instances[chat_id]['last_used'] = time()
        logger.info(f"Модель изменена на {model_name} для чата {chat_id}")
        return jsonify({'message': 'Модель изменена'}), 200
    except Exception as e:
        logger.error(f"Ошибка смены модели: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

# Главная страница
@app.route('/')
def serve_index():
    logger.debug("Запрос к /")
    try:
        return app.send_static_file('index.html')
    except Exception as e:
        logger.error(f"Ошибка загрузки index.html: {e}")
        return "Сервер работает, но index.html не найден", 404
    
@app.route('/auth')
def auth():
    logger.debug("Запрос к /auth")
    try:
        return app.send_static_file('auth.html')
    except Exception as e:
        logger.error(f"Ошибка загрузки auth.html: {e}")
        return "Сервер работает, но auth.html не найден", 404

# Запуск сервера
if __name__ == '__main__':
    init_db()
    logger.info("Запуск сервера на порту 8000...")
    app.run(host='0.0.0.0', port=8000, debug=False)
