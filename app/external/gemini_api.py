import google.generativeai as genai
import os
import logging
from enum import Enum
import markdown
import bleach
import re
import json
from app.config import Config # Импортируем конфигурацию

logger = logging.getLogger(__name__)

# Используем API ключ из конфигурации
GOOGLE_API_KEY = Config.GOOGLE_API_KEY
if not GOOGLE_API_KEY:
    # Эта проверка уже есть в Config, но для надежности можно оставить
    logger.critical("GOOGLE_API_KEY не найден!")
    raise ValueError("GOOGLE_API_KEY не настроен")

try:
    genai.configure(api_key=GOOGLE_API_KEY)
    logger.info("Google Generative AI SDK сконфигурирован.")
except Exception as e:
    logger.critical(f"Ошибка конфигурации Google Generative AI SDK: {e}")
    raise

class GeminiModel(Enum):
    BEYKUS_SMALL = "gemini-2.0-flash"
    BEYKUS_CHAT = "gemini-1.5-flash-8b"
    BEYKUS_SMALL_R = "gemini-2.0-pro-exp-02-05"

class GeminiChat:
    def __init__(self, model_name=GeminiModel.BEYKUS_SMALL.value):
        self.model_name = model_name
        self.system_prompt = "" # Будет загружен в _initialize_model
        self.model = None
        self.chat = None
        try:
            self._initialize_model()
            logger.info(f"Инициализирован экземпляр GeminiChat с моделью: {model_name}")
        except Exception as e:
            logger.error(f"Критическая ошибка инициализации GeminiChat ({model_name}): {e}")
            raise # Передаем исключение выше

    def _initialize_model(self):
        """Инициализирует модель и чат, включая загрузку промпта."""
        try:
            self.model = genai.GenerativeModel(self.model_name)
            self.system_prompt = self._load_system_prompt()
            # Сразу начинаем чат с системным промптом
            self.chat = self.model.start_chat(history=[
                {'role': 'user', 'parts': [f'System: {self.system_prompt}']}, # Явное указание роли System
                {'role': 'model', 'parts': ['Understood. I will follow these instructions.']}
            ])
            logger.info(f"Модель {self.model_name} и чат инициализированы.")
            logger.debug(f"Загружен системный промпт (начало): {self.system_prompt[:150]}...")
        except Exception as e:
            logger.error(f"Ошибка при инициализации модели {self.model_name} или чата: {e}")
            raise

    def _load_system_prompt(self):
        """Загружает и комбинирует системные промпты."""
        try:
            model_map = {
                GeminiModel.BEYKUS_SMALL.value: "BeykusSmall.txt",
                GeminiModel.BEYKUS_SMALL_R.value: "BeykusSmallR.txt",
                GeminiModel.BEYKUS_CHAT.value: "BeykusChat.txt"
            }
            # Важно: Путь относительно текущего файла gemini_api.py
            prompts_dir = os.path.join(os.path.dirname(__file__), '..', 'prompts') # Поднимаемся на уровень выше

            # Проверка существования директории
            if not os.path.isdir(prompts_dir):
                logger.error(f"Директория промптов не найдена: {prompts_dir}")
                # Можно создать директорию или вернуть дефолтный промпт
                # os.makedirs(prompts_dir)
                # raise FileNotFoundError(f"Директория промптов не найдена: {prompts_dir}")
                return "You are a helpful AI assistant. [Error: Prompts directory not found]"


            default_prompt_path = os.path.join(prompts_dir, 'default.txt')
            default_prompt = ""
            if os.path.exists(default_prompt_path):
                 with open(default_prompt_path, 'r', encoding='utf-8') as f:
                    default_prompt = f.read().strip()
            else:
                 logger.warning(f"Файл default.txt не найден в {prompts_dir}")


            model_file = model_map.get(self.model_name)
            model_prompt = ""
            if model_file:
                model_prompt_path = os.path.join(prompts_dir, model_file)
                if os.path.exists(model_prompt_path):
                    with open(model_prompt_path, 'r', encoding='utf-8') as f:
                        model_prompt = f.read().strip()
                else:
                    logger.warning(f"Файл промпта {model_file} не найден для модели {self.model_name}")

            # Комбинируем промпты: специфичный для модели важнее, если он есть
            if default_prompt and model_prompt:
                 final_prompt = f"{default_prompt}\n\n{model_prompt}"
            elif model_prompt:
                 final_prompt = model_prompt
            elif default_prompt:
                 final_prompt = default_prompt
            else:
                 logger.error(f"Не удалось загрузить ни один файл промпта из {prompts_dir}")
                 final_prompt = "You are a helpful AI assistant. [Error: No prompt files loaded]"

            logger.debug(f"Финальный промпт для {self.model_name} собран.")
            return final_prompt

        except Exception as e:
            logger.error(f"Ошибка загрузки системного промпта: {e}")
            return "You are a helpful AI assistant. [Error loading system prompt]"

    # format_markdown остается без изменений

    def format_markdown(self, text):
        """Форматирует текст в безопасный HTML с поддержкой Markdown"""
        try:
            # Улучшенная обработка блоков кода
            def replace_code_block(match):
                lang = match.group(1) or ''
                code = match.group(2)
                # Экранирование HTML внутри блока кода, если нужно
                # code = bleach.clean(code, tags=[], strip=True)
                return f'<pre><code class="language-{lang}">{code}</code></pre>'

            text = re.sub(r'```(\w+)?\s*\n(.*?)\n```', replace_code_block, text, flags=re.DOTALL)

            # Обработка inline-кода
            text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)

            # Базовое форматирование Markdown в HTML
            html = markdown.markdown(text, extensions=['fenced_code', 'tables', 'nl2br']) # nl2br для переносов строк

            # Очистка HTML
            allowed_tags = [
                'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'strong', 'em', 'b', 'i',
                'ul', 'ol', 'li',
                'code', 'pre', # Добавляем класс для подсветки, если используется JS библиотека
                'blockquote', 'a',
                'table', 'thead', 'tbody', 'tr', 'th', 'td'
            ]
            allowed_attrs = {
                'a': ['href', 'title'],
                'pre': [], # Можно добавить 'class' если используется JS подсветка
                'code': ['class'], # Для 'language-...'
            }
            # Включить strip=True, чтобы удалить неразрешенные теги полностью
            cleaned_html = bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs, strip=True)
            return cleaned_html
        except Exception as e:
            logger.error(f"Ошибка форматирования Markdown: {str(e)}")
            # В случае ошибки вернуть текст, обернутый в <pre> для сохранения форматирования
            safe_text = bleach.clean(text, tags=[], strip=True)
            return f"<pre>{safe_text}</pre>"


    # get_streaming_response остается почти без изменений
    def get_streaming_response(self, message):
        """Возвращает потоковый ответ от Gemini API"""
        if not self.chat:
             logger.error("Попытка отправить сообщение без инициализированного чата.")
             yield f"data: {json.dumps({'error': 'Chat not initialized'})}\n\n"
             return

        try:
            # Системный промпт уже в истории, не нужно добавлять его снова
            # prompt_reminder = f"User message: {message}" # Просто отправляем сообщение пользователя
            response = self.chat.send_message(
                message, # Отправляем чистое сообщение
                stream=True,
                generation_config={'temperature': 0.8, 'top_p': 0.9} # Немного другие параметры для примера
            )
            for chunk in response:
                # Проверка на наличие текста и обработка ошибок API
                if chunk.parts:
                    text = ''.join(part.text for part in chunk.parts if hasattr(part, 'text'))
                    if text:
                        yield f"data: {json.dumps({'content': text})}\n\n"
                    # else: # Не логируем каждый пустой чанк, их может быть много
                    #     logger.debug("Получен чанк без текстового содержимого")
                elif chunk.prompt_feedback and chunk.prompt_feedback.block_reason:
                    reason = chunk.prompt_feedback.block_reason
                    logger.warning(f"Запрос заблокирован API Gemini по причине: {reason}")
                    yield f"data: {json.dumps({'error': f'Content blocked by API: {reason}'})}\n\n"
                    return # Прекращаем поток при блокировке

        except google.api_core.exceptions.GoogleAPIError as e:
             logger.error(f"Ошибка Google API при стриминге: {e}")
             yield f"data: {json.dumps({'error': f'Google API Error: {e.message}'})}\n\n"
        except Exception as e:
            # Ловим более общие ошибки, которые могли не обработаться выше
            error_type = type(e).__name__
            logger.error(f"Неожиданная ошибка {error_type} в get_streaming_response: {e}")
            # Не выводим все детали ошибки пользователю из соображений безопасности
            yield f"data: {json.dumps({'error': 'An unexpected error occurred on the server.'})}\n\n"


    def reset_chat(self):
        """Сбрасывает историю чата, переинициализируя его с системным промптом."""
        try:
            # Переинициализируем модель и чат
            self._initialize_model()
            logger.info(f"История чата для модели {self.model_name} сброшена.")
        except Exception as e:
            logger.error(f"Ошибка сброса чата: {e}")
            # В случае ошибки сброса, старый чат может остаться. Попробуем его обнулить.
            self.chat = None
            self.model = None


    def change_model(self, new_model_name):
        """Меняет модель Gemini и сбрасывает чат."""
        # Проверяем, существует ли такая модель в нашем Enum (опционально, но полезно)
        valid_model = False
        for model_enum in GeminiModel:
            if model_enum.value == new_model_name:
                valid_model = True
                break
        if not valid_model:
             logger.error(f"Попытка сменить на невалидную модель: {new_model_name}")
             raise ValueError(f"Invalid model name: {new_model_name}")

        if new_model_name == self.model_name:
             logger.info(f"Модель уже установлена на {new_model_name}. Сброс чата...")
             self.reset_chat() # Просто сбрасываем чат
             return

        logger.info(f"Смена модели с {self.model_name} на {new_model_name}...")
        try:
            self.model_name = new_model_name
            # Переинициализация полностью обновит модель, промпт и чат
            self._initialize_model()
            logger.info(f"Модель успешно изменена на: {new_model_name}")
        except Exception as e:
            logger.error(f"Ошибка смены модели на {new_model_name}: {e}")
            # Попытка вернуть предыдущее состояние или сообщить о критической ошибке
            # Здесь может потребоваться более сложная логика восстановления
            raise # Передаем ошибку выше