import google.generativeai as genai
import os
from dotenv import load_dotenv
import logging
from enum import Enum
import markdown
import bleach
import re
from flask import Response
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
genai.configure(api_key=GOOGLE_API_KEY)

class GeminiChat:
    def __init__(self, model_name=GeminiModel.FLASH_8B.value):
        self.model = genai.GenerativeModel(model_name)
        self.chat = self.model.start_chat(history=[])
    
    def format_markdown(self, text):
        # Обработка блоков кода
        text = re.sub(r'```(\w+)?\n(.*?)\n```', r'```\1\n\2\n```', text, flags=re.DOTALL)
        
        # Обработка инлайн кода
        text = re.sub(r'`([^`]+)`', r'`\1`', text)
        
        # Обработка списков
        text = re.sub(r'^\s*[-*+]\s', '• ', text, flags=re.MULTILINE)
        
        # Конвертация Markdown в HTML
        html = markdown.markdown(text, extensions=['fenced_code', 'codehilite'])
        
        # Очистка HTML от потенциально опасных тегов
        allowed_tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 
                       'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a']
        allowed_attrs = {'a': ['href']}
        html = bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs)
        
        return html
    
    def get_streaming_response(self, message):
        try:
            response = self.chat.send_message(
                message,
                stream=True,
                generation_config={
                    'temperature': 0.9,
                    'top_p': 0.8,
                }
            )
            
            for chunk in response:
                if chunk.text:
                    # Форматируем каждый чанк как событие SSE
                    yield f"data: {json.dumps({'content': chunk.text})}\n\n"
                    
        except Exception as e:
            logger.error(f"Error in Gemini API: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    def get_response(self, message):
        try:
            response = self.chat.send_message(
                message,
                stream=True,
                generation_config={
                    'temperature': 0.9,
                    'top_p': 0.8,
                }
            )
            
            full_response = ""
            for chunk in response:
                if chunk.text:
                    full_response += chunk.text
            
            # Форматируем ответ в HTML с поддержкой Markdown
            formatted_response = self.format_markdown(full_response.strip())
            return formatted_response
            
        except Exception as e:
            logger.error(f"Error in Gemini API: {e}")
            return "Извините, произошла ошибка при обработке запроса."

    def reset_chat(self):
        self.chat = self.model.start_chat(history=[])

    def change_model(self, model_name):
        self.model = genai.GenerativeModel(model_name)
        self.reset_chat() 