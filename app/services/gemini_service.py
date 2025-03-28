# app/services/gemini_service.py
import logging
import json
from time import time
from threading import Lock
import re
from ..external.gemini_api import GeminiChat, GeminiModel
# Используем относительный импорт для Config и database
from ..config import Config
from ..database import get_db
import sqlite3

logger = logging.getLogger(__name__)

# Словарь для хранения активных экземпляров GeminiChat {chat_id: {'instance': GeminiChat, 'last_used': timestamp}}
chat_instances = {}
instances_lock = Lock()

class GeminiServiceError(Exception):
    pass

class ChatInstanceError(GeminiServiceError):
    pass

def get_chat_instance(chat_id: int) -> GeminiChat:
    """Возвращает или создает экземпляр GeminiChat для указанного chat_id."""
    current_time = time()
    with instances_lock:
        if chat_id in chat_instances:
            chat_instances[chat_id]['last_used'] = current_time
            logger.debug(f"Используется существующий экземпляр Gemini для chat_id {chat_id}")
            return chat_instances[chat_id]['instance']
        else:
            try:
                logger.info(f"Создание нового экземпляра Gemini для chat_id {chat_id}")
                # TODO: Получать модель из настроек чата в БД, если нужно
                instance = GeminiChat() # Используем модель по умолчанию
                chat_instances[chat_id] = {'instance': instance, 'last_used': current_time}
                return instance
            except Exception as e:
                logger.error(f"Ошибка создания экземпляра GeminiChat для chat_id {chat_id}: {e}")
                # Логируем stack trace для подробной отладки
                logger.exception("Stack trace:")
                raise ChatInstanceError(f"Не удалось инициализировать нейросеть: {e}")

# ИСПРАВЛЕННАЯ ФУНКЦИЯ
def get_gemini_response_stream(chat_id: int, user_id: int, user_message: str):
    """
    Получает потоковый ответ от Gemini, обрабатывает теги <think>,
    отправляет структурированный JSON через SSE и сохраняет видимый ответ и размышления в БД.
    """
    try:
        chat_instance = get_chat_instance(chat_id)
    except ChatInstanceError as e:
        yield f"data: {json.dumps({'content': None, 'thoughts': None, 'error': str(e)})}\n\n"
        return

    full_visible_response = "" # Текст для отображения и сохранения в content
    full_accumulated_thoughts = "" # Все размышления для сохранения в thoughts
    error_occurred = False
    current_thoughts_buffer = "" # Буфер для текущего блока <think>
    is_inside_think_tag = False

    try:
        for raw_chunk_str in chat_instance.get_streaming_response(user_message):
            chunk_to_yield = {"content": None, "thoughts": None, "error": None}
            processed_visible_chunk = ""
            send_chunk = False

            try:
                # --- Обработка ошибок/данных, полученных от gemini_api.py ---
                if raw_chunk_str.strip() and raw_chunk_str.startswith('data: '):
                    json_str = raw_chunk_str[len('data: '):].strip()
                    if json_str:
                        chunk_data = json.loads(json_str)
                        if chunk_data.get('error'):
                            logger.error(f"Ошибка от Gemini API уровня ниже для chat_id {chat_id}: {chunk_data['error']}")
                            chunk_to_yield["error"] = chunk_data['error']
                            error_occurred = True
                            send_chunk = True
                            yield f"data: {json.dumps(chunk_to_yield)}\n\n"
                            break # Прерываем обработку при ошибке API

                        raw_content = chunk_data.get('content', '')
                        if not raw_content:
                            continue
                    else:
                        logger.warning(f"Получен пустой JSON в нижележащем потоке для chat_id {chat_id}: '{raw_chunk_str}'")
                        continue
                else:
                    logger.debug(f"Пропуск строки не-SSE данных: '{raw_chunk_str[:50]}...'")
                    continue

                # --- Логика извлечения <think> тегов из raw_content ---
                temp_raw_content = raw_content
                while temp_raw_content:
                    if not is_inside_think_tag:
                        start_tag_pos = temp_raw_content.find("<think>")
                        if start_tag_pos != -1:
                            part = temp_raw_content[:start_tag_pos]
                            processed_visible_chunk += part
                            temp_raw_content = temp_raw_content[start_tag_pos + len("<think>"):]
                            is_inside_think_tag = True
                        else:
                            processed_visible_chunk += temp_raw_content
                            temp_raw_content = ""
                    else: # is_inside_think_tag is True
                        end_tag_pos = temp_raw_content.find("</think>")
                        if end_tag_pos != -1:
                            part = temp_raw_content[:end_tag_pos]
                            current_thoughts_buffer += part
                            # Добавляем завершенный блок размышлений к общему счету
                            # Используем .strip() для удаления возможных пробелов по краям
                            # и добавляем разделитель только если буфер не пустой
                            if current_thoughts_buffer.strip():
                                full_accumulated_thoughts += current_thoughts_buffer.strip() + "\n\n" # Двойной перенос для разделения блоков
                            temp_raw_content = temp_raw_content[end_tag_pos + len("</think>"):]
                            is_inside_think_tag = False
                            # Отправляем текущий блок размышлений клиенту
                            chunk_to_yield["thoughts"] = current_thoughts_buffer # РАСКОММЕНТИРОВАНО
                            send_chunk = True
                            logger.debug(f"Отправка размышлений (chat {chat_id}): {current_thoughts_buffer[:100]}...")
                            current_thoughts_buffer = "" # Очищаем буфер
                        else:
                            # Накапливаем часть размышлений
                            current_thoughts_buffer += temp_raw_content
                            # Не добавляем в full_accumulated_thoughts здесь, сделаем это в конце, если тег не закрылся
                            temp_raw_content = ""

                # --- Подготовка и отправка обработанного чанка клиенту ---
                if processed_visible_chunk:
                    chunk_to_yield["content"] = processed_visible_chunk
                    full_visible_response += processed_visible_chunk
                    send_chunk = True

                if send_chunk:
                    yield f"data: {json.dumps(chunk_to_yield)}\n\n"

            except json.JSONDecodeError:
                logger.error(f"Ошибка декодирования JSON из нижележащего потока для chat_id {chat_id}: '{raw_chunk_str}'")
                continue
            except Exception as e:
                logger.error(f"Ошибка обработки чанка из gemini_api для chat_id {chat_id}: {e}", exc_info=True)
                continue

    except Exception as e:
        logger.error(f"Критическая ошибка во время стриминга от Gemini для chat_id {chat_id}: {e}", exc_info=True)
        yield f"data: {json.dumps({'content': None, 'thoughts': None, 'error': f'Критическая ошибка сервера: {e}'})}\n\n"
        error_occurred = True

    # --- Добавляем незакрытые размышления в общий счетчик, если поток оборвался внутри тега ---
    if is_inside_think_tag and current_thoughts_buffer.strip():
        logger.warning(f"Поток завершился внутри тега <think> для chat_id {chat_id}. Добавляем остаток буфера.")
        full_accumulated_thoughts += current_thoughts_buffer.strip()

    # --- Сохранение в БД ---
    # Убираем лишние пробелы по краям перед сохранением
    cleaned_response = full_visible_response.strip()
    # Убираем лишние пробелы и пустые строки из размышлений, None если ничего нет
    cleaned_thoughts = "\n\n".join(filter(None, [p.strip() for p in full_accumulated_thoughts.split("\n\n")])) or None

    # Сохраняем, только если есть видимый ответ
    if cleaned_response:
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                'INSERT INTO messages (chat_id, user_id, content, is_bot, thoughts) VALUES (?, ?, ?, 1, ?)',
                (chat_id, user_id, cleaned_response, cleaned_thoughts)
            )
            db.commit()
            log_thoughts_info = f"с {len(cleaned_thoughts)} chars размышлений" if cleaned_thoughts else "без размышлений"
            logger.info(f"Ответ бота ({len(cleaned_response)} chars) {log_thoughts_info} сохранен в БД для chat_id {chat_id}")
        except sqlite3.Error as e:
            logger.error(f"Ошибка сохранения ответа бота в БД для chat_id {chat_id}: {e}")
            db.rollback()
            # Можно отправить предупреждение клиенту, но это опционально
            # yield f"data: {json.dumps({'content': None, 'thoughts': None, 'error': 'Ошибка сохранения ответа в историю'})}\n\n"

    # Очистка неактивных инстансов
    cleanup_inactive_chats()


# --- Остальные функции сервиса (reset_gemini_chat, change_gemini_model, cleanup_inactive_chats, get_available_models) ---

def reset_gemini_chat(chat_id: int):
    """Сбрасывает состояние чата Gemini для указанного chat_id."""
    with instances_lock:
        if chat_id in chat_instances:
            try:
                instance_data = chat_instances[chat_id]
                instance_data['instance'].reset_chat()
                instance_data['last_used'] = time()
                logger.info(f"Чат Gemini для chat_id {chat_id} успешно сброшен.")
            except Exception as e:
                logger.error(f"Ошибка при сбросе чата Gemini для chat_id {chat_id}: {e}")
                if chat_id in chat_instances:
                    del chat_instances[chat_id]
                raise GeminiServiceError(f"Ошибка сброса состояния нейросети: {e}")
        else:
            logger.info(f"Попытка сброса несуществующего инстанса Gemini для chat_id {chat_id}.")


def change_gemini_model(chat_id: int, model_name: str):
    """Изменяет модель Gemini для указанного chat_id."""
    current_time = time()
    with instances_lock:
        try:
            # Проверка, валидно ли имя модели (если GeminiModel доступен)
            try:
                valid_models = [m.value for m in GeminiModel]
                if model_name not in valid_models:
                    raise ValueError(f"Недопустимое имя модели: {model_name}")
            except NameError:
                 logger.warning("Enum GeminiModel не найден, проверка имени модели пропускается.")


            if chat_id not in chat_instances:
                logger.info(f"Создание нового экземпляра Gemini с моделью {model_name} для chat_id {chat_id}")
                instance = GeminiChat(model_name=model_name)
                chat_instances[chat_id] = {'instance': instance, 'last_used': current_time}
            else:
                instance_data = chat_instances[chat_id]
                if instance_data['instance'].model_name != model_name:
                    logger.info(f"Смена модели с {instance_data['instance'].model_name} на {model_name} для инстанса chat_id {chat_id}")
                    instance_data['instance'].change_model(model_name)
                    instance_data['last_used'] = current_time
                else:
                    logger.info(f"Модель {model_name} уже используется для chat_id {chat_id}, сброс чата...")
                    instance_data['instance'].reset_chat()
                    instance_data['last_used'] = current_time

            logger.info(f"Модель для chat_id {chat_id} успешно установлена/обновлена на {model_name}")

        except ValueError as e: # Ловим ошибку невалидного имени модели
             logger.error(f"Ошибка смены модели для chat_id {chat_id}: {e}")
             # Передаем ошибку выше, чтобы контроллер вернул 400 или 500
             raise GeminiServiceError(str(e))
        except Exception as e:
             logger.error(f"Критическая ошибка при смене модели для chat_id {chat_id} на {model_name}: {e}", exc_info=True)
             if chat_id in chat_instances:
                 del chat_instances[chat_id]
             raise GeminiServiceError(f"Ошибка смены модели нейросети: {e}")


def cleanup_inactive_chats():
    """Удаляет неактивные экземпляры GeminiChat из памяти."""
    current_time = time()
    try:
        timeout = Config.CHAT_INSTANCE_TIMEOUT
    except AttributeError:
        logger.warning("CHAT_INSTANCE_TIMEOUT не найден в Config, используется значение по умолчанию 3600.")
        timeout = 3600

    cleaned_count = 0
    with instances_lock:
        # Копируем ключи для безопасной итерации и удаления
        chat_ids_to_check = list(chat_instances.keys())
        for chat_id in chat_ids_to_check:
            # Проверяем наличие chat_id снова, на случай удаления другим потоком
            if chat_id in chat_instances:
                last_used = chat_instances[chat_id].get('last_used', 0)
                if current_time - last_used > timeout:
                    try:
                        del chat_instances[chat_id]
                        logger.info(f"Удален неактивный экземпляр Gemini для chat_id {chat_id} (неактивен {current_time - last_used:.0f} сек)")
                        cleaned_count += 1
                    except KeyError:
                         # Уже удален, игнорируем
                         pass

    if cleaned_count > 0:
        logger.debug(f"Очистка завершена. Удалено {cleaned_count} неактивных инстансов. Осталось: {len(chat_instances)}")
    # else: logger.debug("Очистка чатов: неактивных инстансов не найдено.")


def get_available_models():
    """Возвращает список доступных моделей из Enum."""
    try:
        # Убедимся, что GeminiModel импортирован
        if 'GeminiModel' not in globals():
             raise NameError("Enum GeminiModel не импортирован в этот модуль.")
        return [{'id': m.value, 'name': m.name} for m in GeminiModel]
    except NameError as e:
        logger.error(f"{e}")
        return []
    except Exception as e:
        logger.error(f"Ошибка при получении списка моделей: {e}")
        return []