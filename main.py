from http.server import HTTPServer, SimpleHTTPRequestHandler
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import jwt
from datetime import datetime, timezone, timedelta
from functools import wraps
import os
from api.gemini_api import GeminiChat, GeminiModel
import logging
import json

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Настройка логирования
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Добавляем обработчик OPTIONS запросов
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Конфигурация
app.config['SECRET_KEY'] = 'your-secret-key'  # Измените на реальный секретный ключ
DATABASE = 'database.db'

# Создание таблицы пользователей
def init_db():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    # Существующая таблица пользователей
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица чатов
    c.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблица сообщений
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_bot BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.commit()
    conn.close()

# Декоратор для проверки токена
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'message': 'Token отсутствует'}), 401

        try:
            token = token.split(' ')[1]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            
            with sqlite3.connect(DATABASE) as conn:
                c = conn.cursor()
                c.execute('SELECT * FROM users WHERE id = ?', (data['user_id'],))
                current_user = c.fetchone()

            if not current_user:
                return jsonify({'message': 'Пользователь не найден'}), 401

        except Exception as e:
            return jsonify({'message': 'Неверный токен'}), 401

        return f(current_user, *args, **kwargs)
    return decorated

# Маршруты API
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()

    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'message': 'Не все поля заполнены'}), 400

    hashed_password = generate_password_hash(password, method='sha256')

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                     (name, email, hashed_password))
        return jsonify({'message': 'Регистрация успешна'}), 201

    except sqlite3.IntegrityError:
        return jsonify({'message': 'Email уже зарегистрирован'}), 400
    except Exception as e:
        return jsonify({'message': 'Ошибка сервера'}), 500

def generate_token(user_id):
    try:
        token = jwt.encode({
            'user_id': user_id,
            'exp': datetime.now(timezone.utc) + timedelta(days=7)
        }, app.config['SECRET_KEY'])
        return token
    except Exception as e:
        logger.error(f"Ошибка генерации токена: {str(e)}")
        return None

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'message': 'Необходимы email и пароль'}), 400

        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('SELECT id, name, email, password FROM users WHERE email = ?', (email,))
            user = c.fetchone()

            if not user or not check_password_hash(user[3], password):
                return jsonify({'message': 'Неверный email или пароль'}), 401

            token = generate_token(user[0])
            if not token:
                return jsonify({'message': 'Ошибка генерации токена'}), 500

            return jsonify({
                'token': token,
                'user': {
                    'id': user[0],
                    'name': user[1],
                    'email': user[2]
                }
            }), 200

    except Exception as e:
        logger.error(f"Ошибка входа: {str(e)}")
        return jsonify({'message': 'Ошибка сервера'}), 500

# Добавляем новые маршруты для работы с чатами
@app.route('/api/chats', methods=['GET'])
@token_required
def get_chats(current_user):
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('''
                SELECT c.id, c.title, c.created_at, 
                       (SELECT content FROM messages 
                        WHERE chat_id = c.id 
                        ORDER BY created_at DESC LIMIT 1) as last_message
                FROM chats c
                WHERE c.user_id = ?
                ORDER BY c.created_at DESC
            ''', (current_user[0],))
            chats = c.fetchall()
            
            return jsonify([{
                'id': chat[0],
                'title': chat[1],
                'created_at': chat[2],
                'last_message': chat[3] or 'Нет сообщений'
            } for chat in chats]), 200

    except Exception as e:
        logger.error(f"Ошибка получения чатов: {str(e)}")
        return jsonify({'message': 'Ошибка сервера'}), 500

@app.route('/api/chats', methods=['POST'])
@token_required
def create_chat(current_user):
    try:
        data = request.get_json()
        title = data.get('title', 'Новый чат')

        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('''
                INSERT INTO chats (user_id, title)
                VALUES (?, ?)
            ''', (current_user[0], title))
            
            chat_id = c.lastrowid
            conn.commit()

            return jsonify({
                'id': chat_id,
                'title': title,
                'created_at': datetime.now(timezone.utc).isoformat()
            }), 201

    except Exception as e:
        logger.error(f"Ошибка создания чата: {str(e)}")
        return jsonify({'message': 'Ошибка сервера'}), 500

@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
@token_required
def get_messages(current_user, chat_id):
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            # Проверяем, принадлежит ли чат пользователю
            c.execute('SELECT id FROM chats WHERE id = ? AND user_id = ?',
                     (chat_id, current_user[0]))
            if not c.fetchone():
                return jsonify({'message': 'Чат не найден'}), 404
                
            c.execute('''
                SELECT id, content, is_bot, created_at
                FROM messages
                WHERE chat_id = ?
                ORDER BY created_at ASC
            ''', (chat_id,))
            messages = c.fetchall()
            
        return jsonify([{
            'id': msg[0],
            'content': msg[1],
            'is_bot': bool(msg[2]),
            'created_at': msg[3]
        } for msg in messages]), 200

    except Exception as e:
        return jsonify({'message': 'Ошибка сервера'}), 500

# Добавьте словарь для хранения экземпляров чата
chat_instances = {}

# Обновите обработчик сообщений для поддержки SSE
@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
@token_required
def send_message(current_user, chat_id):
    data = request.get_json()
    content = data.get('content')
    
    logger.debug(f"Получено сообщение: {content} для чата {chat_id}")

    if not content:
        logger.warning("Получено пустое сообщение")
        return jsonify({'message': 'Сообщение не может быть пустым'}), 400

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('SELECT id FROM chats WHERE id = ? AND user_id = ?',
                     (chat_id, current_user[0]))
            if not c.fetchone():
                logger.error(f"Чат {chat_id} не найден для пользователя {current_user[0]}")
                return jsonify({'message': 'Чат не найден'}), 404

            # Сохраняем сообщение пользователя
            c.execute('''
                INSERT INTO messages (chat_id, user_id, content, is_bot)
                VALUES (?, ?, ?, 0)
            ''', (chat_id, current_user[0], content))
            conn.commit()

        # Получаем или создаем экземпляр чата с Gemini
        if chat_id not in chat_instances:
            logger.debug(f"Создание нового экземпляра чата для {chat_id}")
            chat_instances[chat_id] = GeminiChat()

        def generate():
            full_response = ""
            for chunk in chat_instances[chat_id].get_streaming_response(content):
                full_response += json.loads(chunk.replace('data: ', ''))['content']
                yield chunk

            # После получения полного ответа сохраняем его в БД
            with sqlite3.connect(DATABASE) as conn:
                c = conn.cursor()
                c.execute('''
                    INSERT INTO messages (chat_id, user_id, content, is_bot)
                    VALUES (?, ?, ?, 1)
                ''', (chat_id, current_user[0], full_response))
                conn.commit()

        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )

    except Exception as e:
        logger.error(f"Ошибка при обработке сообщения: {str(e)}", exc_info=True)
        return jsonify({'message': f'Ошибка сервера: {str(e)}'}), 500

# Добавьте новый маршрут для сброса истории чата
@app.route('/api/chats/<int:chat_id>/reset', methods=['POST'])
@token_required
def reset_chat(current_user, chat_id):
    try:
        if chat_id in chat_instances:
            chat_instances[chat_id].reset_chat()
        return jsonify({'message': 'История чата сброшена'}), 200
    except Exception as e:
        return jsonify({'message': 'Ошибка сервера'}), 500

# Добавьте новый маршрут для получения списка моделей
@app.route('/api/models', methods=['GET'])
def get_models():
    return jsonify({
        'models': [
            {'id': model.value, 'name': model.name} 
            for model in GeminiModel
        ]
    })

# Добавьте маршрут для смены модели
@app.route('/api/chats/<int:chat_id>/model', methods=['POST'])
@token_required
def change_model(current_user, chat_id):
    data = request.get_json()
    model_name = data.get('model')
    
    if not model_name:
        return jsonify({'message': 'Модель не указана'}), 400

    try:
        if chat_id in chat_instances:
            chat_instances[chat_id].change_model(model_name)
        else:
            chat_instances[chat_id] = GeminiChat(model_name)
        
        return jsonify({'message': 'Модель успешно изменена'}), 200
    except Exception as e:
        logger.error(f"Ошибка при смене модели: {str(e)}")
        return jsonify({'message': 'Ошибка при смене модели'}), 500

# Статические файлы
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)

def run(server_class=HTTPServer, handler_class=SimpleHTTPRequestHandler):
    server_address = ('', 8000)
    httpd = server_class(server_address, handler_class)
    print('Запуск сервера на порту 8000...')
    try:
        init_db()  # Инициализируем базу данных при запуске
        app.run(host='', port=8000)
    except KeyboardInterrupt:
        print('\nВыключение сервера...')
        httpd.server_close()

if __name__ == '__main__':
    run()
