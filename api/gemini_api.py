import google.generativeai as genai
import os
from dotenv import load_dotenv
import logging
from enum import Enum
import markdown
import bleach
import re
import json

logger = logging.getLogger(__name__)
load_dotenv()

class GeminiModel(Enum):
    FLASH = "gemini-2.0-flash"
    FLASH_LITE = "gemini-2.0-flash-lite"
    PRO_EXP = "gemini-2.0-pro-exp-02-05"
    FLASH_THINKING = "gemini-2.0-flash-thinking-exp-01-21"
    FLASH_8B = "gemini-1.5-flash-8b"

# Конфигурация API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY не найден в переменных окружения")
    raise ValueError("GOOGLE_API_KEY не настроен")
genai.configure(api_key=GOOGLE_API_KEY)

class GeminiChat:
    def __init__(self, model_name=GeminiModel.FLASH_8B.value):
        try:
            self.model = genai.GenerativeModel(model_name)
            self.chat = self.model.start_chat(history=[])
            logger.debug(f"Инициализирован чат с моделью: {model_name}")
        except Exception as e:
            logger.error(f"Ошибка инициализации модели: {str(e)}")
            raise

    def format_markdown(self, text):
        """Форматирует текст в безопасный HTML с поддержкой Markdown"""
        try:
            text = re.sub(r'```(\w+)?\n(.*?)\n```', r'```\1\n\2\n```', text, flags=re.DOTALL)
            text = re.sub(r'`([^`]+)`', r'`\1`', text)
            text = re.sub(r'^\s*[-*+]\s', '• ', text, flags=re.MULTILINE)
            html = markdown.markdown(text, extensions=['fenced_code', 'codehilite'])
            allowed_tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em',
                           'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a']
            allowed_attrs = {'a': ['href']}
            return bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs)
        except Exception as e:
            logger.error(f"Ошибка форматирования Markdown: {str(e)}")
            return text  # Возвращаем исходный текст в случае ошибки

    def get_streaming_response(self, message):
        """Возвращает потоковый ответ от Gemini API"""
        try:
            response = self.chat.send_message(
                message,
                stream=True,
                generation_config={'temperature': 0.9, 'top_p': 0.8}
            )
            for chunk in response:
                if hasattr(chunk, 'text') and chunk.text:
                    yield f"data: {json.dumps({'content': chunk.text})}\n\n"
                else:
                    logger.warning("Получен пустой или некорректный чанк")
                    yield f"data: {json.dumps({'error': 'Неверный формат ответа от API'})}\n\n"
        except Exception as e:
            logger.error(f"Ошибка в Gemini API: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    def get_response(self, message):
        """Возвращает полный ответ от Gemini API"""
        try:
            response = self.chat.send_message(
                message,
                stream=True,
                generation_config={'temperature': 0.9, 'top_p': 0.8}
            )
            full_response = ""
            for chunk in response:
                if hasattr(chunk, 'text') and chunk.text:
                    full_response += chunk.text
            formatted_response = self.format_markdown(full_response.strip())
            return formatted_response
        except Exception as e:
            logger.error(f"Ошибка в Gemini API: {str(e)}")
            return "Извините, произошла ошибка при обработке запроса."

    def reset_chat(self):
        """Сбрасывает историю чата"""
        try:
            self.chat = self.model.start_chat(history=[])
            logger.debug("История чата сброшена")
        except Exception as e:
            logger.error(f"Ошибка сброса чата: {str(e)}")

    def change_model(self, model_name):
        """Меняет модель Gemini"""
        try:
            self.model = genai.GenerativeModel(model_name)
            self.reset_chat()
            logger.debug(f"Модель изменена на: {model_name}")
        except Exception as e:
            logger.error(f"Ошибка смены модели: {str(e)}")
            raise