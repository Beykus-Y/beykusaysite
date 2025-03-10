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
    BEYKUS_SMALL = "gemini-2.0-flash"
    BEYKUS_CHAT = "gemini-1.5-flash-8b"
    BEYKUS_SMALL_R = "gemini-2.0-pro-exp-02-05"

# Конфигурация API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY не найден в переменных окружения")
    raise ValueError("GOOGLE_API_KEY не настроен")
genai.configure(api_key=GOOGLE_API_KEY)

class GeminiChat:
    def __init__(self, model_name=GeminiModel.BEYKUS_SMALL.value):
        try:
            self.model = genai.GenerativeModel(model_name)
            self.model_name = model_name
            self.system_prompt = self._load_system_prompt()
            # Изменяем инициализацию чата, добавляя системный промпт как роль
            self.chat = self.model.start_chat(history=[
                {'role': 'user', 'parts': ['System: ' + self.system_prompt]},
                {'role': 'model', 'parts': ['Understood. I will act according to these instructions.']}
            ])
            logger.info(f"Инициализирован чат с моделью: {model_name}")
            logger.info(f"Загружен системный промпт: {self.system_prompt[:100]}...")  # Логируем для отладки
        except Exception as e:
            logger.error(f"Ошибка инициализации модели: {str(e)}")
            raise

    def _load_system_prompt(self):
        """Загружает и комбинирует системные промпты"""
        try:
            # Определяем имя файла модели на основе значения модели
            model_map = {
                GeminiModel.BEYKUS_SMALL.value: "BeykusSmall.txt",
                GeminiModel.BEYKUS_SMALL_R.value: "BeykusSmallR.txt",
                GeminiModel.BEYKUS_CHAT.value: "BeykusChat.txt"
            }
            
            prompts_dir = os.path.join(os.path.dirname(__file__), 'prompts')
            logger.debug(f"Путь к директории промптов: {prompts_dir}")  # Добавляем лог
            
            # Проверяем существование директории
            if not os.path.exists(prompts_dir):
                logger.error(f"Директория промптов не найдена: {prompts_dir}")
                os.makedirs(prompts_dir)
                raise FileNotFoundError(f"Директория промптов не найдена: {prompts_dir}")
            
            default_prompt_path = os.path.join(prompts_dir, 'default.txt')
            # Проверяем существование файла default.txt
            if not os.path.exists(default_prompt_path):
                logger.error(f"Файл default.txt не найден: {default_prompt_path}")
                raise FileNotFoundError(f"Файл default.txt не найден: {default_prompt_path}")
            
            # Загружаем общий промпт
            with open(default_prompt_path, 'r', encoding='utf-8') as f:
                default_prompt = f.read().strip()
            
            # Загружаем специфичный промпт для модели
            model_file = model_map.get(self.model_name)
            if not model_file:
                logger.warning(f"Файл промпта не найден для модели {self.model_name}")
                return default_prompt
            
            model_prompt_path = os.path.join(prompts_dir, model_file)
            if not os.path.exists(model_prompt_path):
                logger.error(f"Файл промпта модели не найден: {model_prompt_path}")
                return default_prompt
                
            with open(model_prompt_path, 'r', encoding='utf-8') as f:
                model_prompt = f.read().strip()
            
            # Комбинируем промпты
            final_prompt = f"{default_prompt}\n\n{model_prompt}"
            logger.debug(f"Загружен промпт для модели {self.model_name}: {final_prompt[:100]}...")  # Добавляем лог
            return final_prompt
        except Exception as e:
            logger.error(f"Ошибка загрузки системного промпта: {str(e)}")
            return "You are a helpful AI assistant."

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
            # Добавляем напоминание о системном промпте перед каждым сообщением
            prompt_reminder = f"Remember your role and instructions: {self.system_prompt[:100]}...\n\nUser message: {message}"
            response = self.chat.send_message(
                prompt_reminder,
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
            # Изменяем инициализацию чата при сбросе
            self.chat = self.model.start_chat(history=[
                {'role': 'user', 'parts': ['System: ' + self.system_prompt]},
                {'role': 'model', 'parts': ['Understood. I will act according to these instructions.']}
            ])
            logger.debug("История чата сброшена")
        except Exception as e:
            logger.error(f"Ошибка сброса чата: {str(e)}")

    def change_model(self, model_name):
        """Меняет модель Gemini"""
        try:
            self.model = genai.GenerativeModel(model_name)
            self.model_name = model_name
            self.system_prompt = self._load_system_prompt()
            self.reset_chat()
            logger.debug(f"Модель изменена на: {model_name}")
        except Exception as e:
            logger.error(f"Ошибка смены модели: {str(e)}")
            raise