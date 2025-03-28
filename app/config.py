import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(24).hex()
    DATABASE_URL = os.environ.get('DATABASE_URL') or 'database.db'
    GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')

    # Проверяем, что GOOGLE_API_KEY установлен
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY не найден в переменных окружения (.env)")

    # Настройки CORS (можно расширить при необходимости)
    CORS_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000", "*"]
    CORS_METHODS = ["GET", "POST", "OPTIONS"]
    CORS_HEADERS = ["Content-Type", "Authorization"]

    # Время жизни экземпляра чата Gemini без активности (в секундах)
    CHAT_INSTANCE_TIMEOUT = 3600