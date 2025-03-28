// static/scripts/chat.js

// Импортируем marked из локального файла, который импортирует его из CDN
// Если используешь сборщик, замени на: import { marked } from 'marked';
import { marked } from './markdown.js';

// Предполагаем, что hljs доступен глобально из CDN
// Если используешь сборщик, замени на: import hljs from 'highlight.js/lib/core';
// и импортируй нужные языки: import javascript from 'highlight.js/lib/languages/javascript'; hljs.registerLanguage('javascript', javascript);

// Настройка marked
marked.setOptions({
    // Опция highlight больше не нужна здесь, так как подсветка делается отдельно
    breaks: true, // Сохраняем для переносов строк
    gfm: true     // Сохраняем для GitHub Flavored Markdown
});

const BASE_URL = `${window.location.protocol}//${window.location.host}`;

// Вспомогательные функции
function escapeHtml(text) {
    if (typeof text !== 'string') return ''; // Добавим проверку типа
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Добавляет или обновляет сообщение в DOM.
 * @param {object} message - Объект сообщения.
 * @param {string} [message.id] - ID для обновления существующего сообщения.
 * @param {string} message.content - Основной текст сообщения.
 * @param {string|null} [message.thoughts] - Текст размышлений ИИ (если бэкенд их отправляет).
 * @param {boolean} message.is_bot - True, если сообщение от бота.
 * @param {string} message.created_at - ISO строка времени создания.
 */
function addMessage(message) {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;



    // Определяем элемент и флаг isNewMessage СНАЧАЛА
    let messageElement = message.id ? document.getElementById(message.id) : null;
    const isNewMessage = !messageElement; // <--- ОБЪЯВЛЕНИЕ ЗДЕСЬ

    if (!messageElement) { // Создаем элемент, если он новый
        messageElement = document.createElement('div');
        if (message.id) {
            messageElement.id = message.id;
        }
        // Устанавливаем класс сразу
        messageElement.className = `message ${message.is_bot ? 'ai' : 'user'}`;
    }

    // Используем более короткий формат времени
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Обеспечиваем значение по умолчанию для content, обрабатываем плейсхолдер
    const visibleContent = message.content || (message.is_bot && isNewMessage ? '...' : '');
    const thoughtsContent = message.thoughts || '';

    // Генерируем или обновляем HTML
    if (isNewMessage) { // Генерируем всю структуру для нового сообщения
        const userAvatar = !message.is_bot ? '<div class="message-avatar">👤</div>' : '';
        const botAvatar = message.is_bot ? '<div class="message-avatar">🤖</div>' : '';

        messageElement.innerHTML = `
            ${botAvatar}
            <div class="message-content">
                <div class="message-text"></div>
                <div class="message-time">${time}</div>
            </div>
            ${userAvatar}
        `;

        const messageTextElement = messageElement.querySelector('.message-text');
        if (messageTextElement) {
             if (message.is_bot) {
                 // Сразу парсим Markdown для сообщений, загруженных из истории
                 messageTextElement.innerHTML = marked.parse(visibleContent || '');
             } else {
                 // Пользовательский текст просто экранируем и оборачиваем в <p>
                 messageTextElement.innerHTML = `<p>${escapeHtml(visibleContent)}</p>`;
             }
        }

        // Добавляем размышления, если они есть при создании
        if (thoughtsContent) {
            updateThoughtsInDOM(messageElement, thoughtsContent, 0);
        }

    } else { // Обновление существующего сообщения (обычно при стриминге)
        const messageTextElement = messageElement.querySelector('.message-text');
        // Обновляем видимый текст
        // Вариант Б: Парсим Markdown для красивого стрима
        if (messageTextElement && message.is_bot && message.content !== undefined) {
            messageTextElement.innerHTML = marked.parse(message.content || '');
        }
        // Вариант А (быстрее, но виден Markdown):
        // if (messageTextElement && message.is_bot && message.content !== undefined) {
        //    messageTextElement.textContent = message.content || '';
        // }


        // Обновляем/добавляем размышления, если они пришли в этом чанке
        if (thoughtsContent) {
            const timerData = window.thinkingTimers ? window.thinkingTimers[message.id] : null;
            const seconds = timerData ? timerData.seconds : 0;
            updateThoughtsInDOM(messageElement, thoughtsContent, seconds);
        }

        // Обновляем время (на всякий случай, если оно изменилось)
         const timeElement = messageElement.querySelector('.message-time');
         if (timeElement) timeElement.textContent = time;
    }

    // Добавляем в DOM, если элемент новый
    if (isNewMessage) {
        messagesContainer.appendChild(messageElement);
    }

    // Прокрутка
    const scrollBehavior = !message.is_bot && isNewMessage ? 'instant' : 'smooth';
    if (messageElement && typeof messageElement.scrollIntoView === 'function') {
        // Задержка для 'smooth', чтобы браузер успел отрисовать
        requestAnimationFrame(() => {
            messageElement.scrollIntoView({ behavior: scrollBehavior, block: 'end' });
        });
    }

    // Подсветка будет применяться позже (в loadMessages или конце submit)
}

// Обработчик клика для размышлений
function handleToggleThoughts(event) {
    const header = event.currentTarget;
    const content = header.nextElementSibling;
    if (!content) return;

    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.setAttribute('data-toggled', isHidden.toString());

    const timeSpan = header.querySelector('.thinking-time');
    const time = timeSpan ? timeSpan.textContent : '';
    // Обновляем текст кнопки
    header.innerHTML = isHidden
        ? `🤔 Скрыть размышления <span class="thinking-time">${time}</span>`
        : `🤔 Показать размышления <span class="thinking-time">${time}</span>`;
}

// Функция для обновления/создания блока размышлений
function updateThoughtsInDOM(messageElement, thoughtsText, seconds) {
    if (!messageElement) return;
    let thoughtsContainer = messageElement.querySelector('.thoughts-container');
    const messageTextElement = messageElement.querySelector('.message-text');
    const messageContentDiv = messageElement.querySelector('.message-content');

    if (!messageContentDiv) return;

    // Создаем контейнер, если его нет
    if (!thoughtsContainer) {
        thoughtsContainer = document.createElement('div');
        thoughtsContainer.className = 'thoughts-container';
        if (messageTextElement) {
            messageContentDiv.insertBefore(thoughtsContainer, messageTextElement);
        } else {
            messageContentDiv.appendChild(thoughtsContainer); // Добавляем в конец, если текста еще нет
        }
        // Создаем внутреннюю структуру
        thoughtsContainer.innerHTML = `
            <div class="thoughts-header" data-toggled="false">
                <!-- Текст будет обновлен ниже -->
            </div>
            <div class="thoughts-content" style="display: none;"></div>
        `;
        // Вешаем обработчик
        thoughtsContainer.querySelector('.thoughts-header').addEventListener('click', handleToggleThoughts);
    }

    // Обновляем контент размышлений
    const thoughtsContentElement = thoughtsContainer.querySelector('.thoughts-content');
    if (thoughtsContentElement) {
        // Сначала текст для безопасности, потом парсинг Markdown
        thoughtsContentElement.textContent = thoughtsText || ''; // Убедимся, что текст не null/undefined
        if (thoughtsText) { // Парсим, только если есть что парсить
             thoughtsContentElement.innerHTML = marked.parse(thoughtsText);
        }
    }

    // Обновляем заголовок и время
    const thoughtsHeader = thoughtsContainer.querySelector('.thoughts-header');
    if (thoughtsHeader) {
        const isHidden = thoughtsContentElement?.style.display === 'none';
        const toggledState = thoughtsHeader.getAttribute('data-toggled') === 'true';

        thoughtsHeader.innerHTML = (isHidden && !toggledState) || (!isHidden && toggledState)
            ? `🤔 Показать размышления <span class="thinking-time">${seconds}s</span>`
            : `🤔 Скрыть размышления <span class="thinking-time">${seconds}s</span>`;
    }

    // Подсветка кода внутри размышлений (если он там есть)
    applySyntaxHighlighting(thoughtsContainer);
}


// Функция для применения подсветки синтаксиса
function applySyntaxHighlighting(parentElement) {
    if (!parentElement || typeof hljs === 'undefined') return;

    parentElement.querySelectorAll('pre code:not(.hljs-highlighted)').forEach((block) => {
        // console.debug("Подсветка блока:", block); // Лог для отладки
        try {
            // Используем highlightElement, который добавляет класс hljs
            hljs.highlightElement(block);
            // Добавляем кастомный класс, чтобы не подсвечивать повторно
            block.classList.add('hljs-highlighted');
        } catch (e) {
            console.error("Ошибка подсветки блока:", e, block);
        }
    });

    // Обеспечиваем открытие ссылок в новой вкладке
    parentElement.querySelectorAll('a').forEach(link => {
        if (!link.target) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
}

// --- Управление темой ---
function initTheme() {
    const themeToggle = document.querySelector('.theme-toggle');
    if (!themeToggle) return;
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// --- Основная логика при загрузке страницы ---
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user) {
        window.location.href = '/auth.html';
        return;
    }

    const userProfileName = document.querySelector('.user-profile span');
    if (userProfileName) {
        userProfileName.textContent = user.name || 'Пользователь';
    }

    let currentChatId = null;
    let currentModel = null;
    // Объект для хранения таймеров размышлений
    window.thinkingTimers = {};

    // --- Функции загрузки данных ---
    async function loadChats() {
        const chatsList = document.querySelector('.chats-list');
        if (!chatsList) return;
        chatsList.innerHTML = '<p>Загрузка чатов...</p>';

        try {
            const response = await fetch(`${BASE_URL}/api/chats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 if (response.status === 401) {
                      localStorage.removeItem('token');
                      localStorage.removeItem('user');
                      window.location.href = '/auth.html';
                      return;
                 }
                throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
            }
            const chats = await response.json();
            chatsList.innerHTML = '';

            if (chats.length === 0) {
                chatsList.innerHTML = '<p>Нет доступных чатов.</p>';
            } else {
                chats.forEach(chat => {
                    const chatElement = document.createElement('div');
                    chatElement.className = 'chat-item';
                    chatElement.dataset.chatId = chat.id;
                    if (chat.id === currentChatId) {
                        chatElement.classList.add('active');
                    }

                    chatElement.innerHTML = `
                        <div class="chat-title">${escapeHtml(chat.title)}</div>
                        <div class="chat-preview">${escapeHtml(chat.last_message)}</div>
                    `;

                    chatElement.addEventListener('click', () => {
                        document.querySelectorAll('.chat-item.active').forEach(item => item.classList.remove('active'));
                        chatElement.classList.add('active');
                        loadMessages(chat.id);
                    });
                    chatsList.appendChild(chatElement);
                });

                if (!currentChatId && chats.length > 0) {
                     const firstChatElement = chatsList.querySelector('.chat-item');
                     if (firstChatElement) { // Добавим проверку
                         firstChatElement.classList.add('active');
                         loadMessages(chats[0].id);
                     }
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
            chatsList.innerHTML = `<p class="error">Не удалось загрузить чаты.</p>`;
        }
    }

    async function loadMessages(chatId) {
        if (!chatId) return;
        currentChatId = chatId;
        Object.values(window.thinkingTimers || {}).forEach(timer => clearInterval(timer.intervalId));
        window.thinkingTimers = {};

        const messagesContainer = document.querySelector('.messages-container');
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '<p>Загрузка сообщений...</p>';

        try {
            const response = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 if (response.status === 401) { window.location.href = '/auth.html'; return; }
                 if (response.status === 404) { throw new Error('Чат не найден.'); }
                throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
            }
            const messages = await response.json();
            messagesContainer.innerHTML = '';

            if (messages.length === 0) {
                messagesContainer.innerHTML = '<p>В этом чате пока нет сообщений.</p>';
            } else {
                messages.forEach(message => {
                    // Вызываем addMessage, который теперь сам парсит Markdown для ботов
                    addMessage(message);
                    // Запускаем таймер, если нужно
                    if (message.is_bot && message.id && message.thoughts) {
                        const messageElement = document.getElementById(message.id);
                        if (messageElement?.querySelector('.thoughts-container')) {
                           startThinkingTimer(message.id);
                        }
                    }
                });
                // Применяем подсветку ко всему контейнеру ПОСЛЕ добавления всех
                applySyntaxHighlighting(messagesContainer);
            }
            // Прокрутка в конец
            requestAnimationFrame(() => {
               messagesContainer.scrollTop = messagesContainer.scrollHeight;
            });
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
            messagesContainer.innerHTML = `<p class="error">Не удалось загрузить сообщения: ${escapeHtml(error.message || 'Неизвестная ошибка')}</p>`;
        }
    }

    async function loadModels() {
        const modelSelect = document.getElementById('modelSelect');
        if (!modelSelect) return;
        try {
            const response = await fetch(`${BASE_URL}/api/models`, {
                 headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            const data = await response.json();

            if (data.models && data.models.length > 0) {
                modelSelect.innerHTML = data.models.map(model =>
                    `<option value="${model.id}">${escapeHtml(model.name)}</option>`
                ).join('');
                currentModel = data.models[0].id;
                modelSelect.value = currentModel;
            } else {
                 modelSelect.innerHTML = '<option value="">Модели не найдены</option>';
            }
        } catch (error) {
            console.error('Ошибка загрузки моделей:', error);
            modelSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }
    }

    // --- Обработчики событий ---
    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/chats`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'Новый чат' })
                });
                if (!response.ok) throw new Error(`Ошибка ${response.status}`);
                const newChat = await response.json();
                await loadChats();
                // Активируем и загружаем новый чат
                const newChatElement = document.querySelector(`.chat-item[data-chat-id="${newChat.id}"]`);
                document.querySelectorAll('.chat-item.active').forEach(item => item.classList.remove('active'));
                if (newChatElement) newChatElement.classList.add('active');
                loadMessages(newChat.id);
            } catch (error) {
                console.error('Ошибка создания чата:', error);
                alert(`Не удалось создать чат: ${error.message}`);
            }
        });
    }

    const messageForm = document.getElementById('messageForm');
    const messageInput = messageForm?.querySelector('textarea');

    if (messageForm && messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                messageForm.requestSubmit();
            }
        });

        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentChatId) {
                alert('Пожалуйста, выберите или создайте чат.');
                return;
            }
            const content = messageInput.value.trim();
            if (!content) return;

            // 1. Добавляем сообщение пользователя
            addMessage({
                content: content,
                is_bot: false,
                created_at: new Date().toISOString()
            });
            messageInput.value = '';
            messageInput.style.height = 'auto';

            // 2. Плейсхолдер для ответа бота
            const botMessageId = 'bot-message-' + crypto.randomUUID();
            // Создаем и добавляем плейсхолдер с помощью addMessage
            addMessage({
                id: botMessageId,
                content: '', // Отобразится как '...'
                is_bot: true,
                created_at: new Date().toISOString()
            });
            startThinkingTimer(botMessageId);

            // 3. Запрос к бэкенду
            try {
                const response = await fetch(`${BASE_URL}/api/chats/${currentChatId}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });

                if (!response.ok) {
                     const errorData = await response.json().catch(() => ({ error: `Ошибка: ${response.statusText}` }));
                     throw new Error(errorData.error || `Ошибка ${response.status}`);
                }
                if (!response.body) {
                     throw new Error('Ответ сервера не содержит тело для стриминга.');
                }

                // 4. Обработка потока SSE
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let currentFullVisibleResponse = ''; // Видимый ответ для текущего сообщения
                let currentAccumulatedThoughts = ''; // Размышления для текущего сообщения

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    let boundaryIndex;
                    while ((boundaryIndex = buffer.indexOf('\n\n')) >= 0) {
                        const message = buffer.substring(0, boundaryIndex);
                        buffer = buffer.substring(boundaryIndex + 2);

                        if (message.startsWith('data:')) {
                            try {
                                const data = JSON.parse(message.substring(5).trim());
                                const currentBotElement = document.getElementById(botMessageId);
                                if (!currentBotElement) break; // Элемент мог быть удален

                                if (data.error) {
                                    console.error('Ошибка от сервера в потоке:', data.error);
                                    currentBotElement.querySelector('.message-text').innerHTML = `<p class="error">Произошла ошибка: ${escapeHtml(data.error)}</p>`;
                                    stopThinkingTimer(botMessageId);
                                    return;
                                }

                                let contentChanged = false;
                                let thoughtsChanged = false;

                                if (data.content) {
                                    currentFullVisibleResponse += data.content;
                                    contentChanged = true;
                                }
                                if (data.thoughts) { // Если бэкенд шлет размышления
                                    currentAccumulatedThoughts += data.thoughts;
                                    thoughtsChanged = true;
                                }

                                // Обновляем DOM через addMessage (который теперь умеет обновлять)
                                if (contentChanged || thoughtsChanged) {
                                     addMessage({ // Вызываем addMessage для обновления
                                         id: botMessageId,
                                         content: currentFullVisibleResponse, // Передаем полный накопленный текст
                                         thoughts: currentAccumulatedThoughts,
                                         is_bot: true,
                                         created_at: new Date().toISOString() // Время можно не обновлять, но для консистентности
                                     });
                                }

                            } catch (e) {
                                console.error('Ошибка парсинга JSON из SSE:', e, 'Сообщение:', message);
                            }
                        }
                    } // end while(boundaryIndex)
                } // end while(true) - reader loop

                 // 5. Пост-обработка после завершения потока
                stopThinkingTimer(botMessageId);
                const finalBotMessageElement = document.getElementById(botMessageId);
                if (finalBotMessageElement) {
                    // Финальное обновление текста с парсингом Markdown (на случай если стрим был с textContent)
                    const messageTextElement = finalBotMessageElement.querySelector('.message-text');
                    if (messageTextElement) {
                         messageTextElement.innerHTML = marked.parse(currentFullVisibleResponse || '');
                    }
                    // Финальное обновление размышлений
                    const timerData = window.thinkingTimers ? window.thinkingTimers[botMessageId] : null;
                    updateThoughtsInDOM(finalBotMessageElement, currentAccumulatedThoughts, timerData ? timerData.seconds : 0);
                    // Удаляем контейнер, если размышлений не было
                    if (!currentAccumulatedThoughts && finalBotMessageElement.querySelector('.thoughts-container')) {
                         finalBotMessageElement.querySelector('.thoughts-container').remove();
                    }
                    // Финальная подсветка кода всего сообщения
                    applySyntaxHighlighting(finalBotMessageElement);
                    // Прокрутка
                    requestAnimationFrame(() => {
                       finalBotMessageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    });
                }

                 await loadChats(); // Обновляем список чатов

            } catch (error) {
                console.error('Ошибка при отправке/получении сообщения:', error);
                const botMsgElem = document.getElementById(botMessageId);
                if (botMsgElem) {
                    botMsgElem.querySelector('.message-text').innerHTML = `<p class="error">Не удалось получить ответ: ${escapeHtml(error.message)}</p>`;
                    stopThinkingTimer(botMessageId);
                    const thoughtsContainer = botMsgElem.querySelector('.thoughts-container');
                     if (thoughtsContainer) thoughtsContainer.remove();
                }
            }
        });

         messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            const maxHeight = 200;
            this.style.height = Math.min(this.scrollHeight, maxHeight) + 'px';
        });
    } else {
        console.error("Форма или поле ввода не найдены!");
    }

    // --- Остальные обработчики (смена модели, сброс чата, мобильное меню) ---
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        modelSelect.addEventListener('change', async (e) => {
            const newModel = e.target.value;
            if (!currentChatId || !newModel || newModel === currentModel) return;
            console.log(`Попытка сменить модель на ${newModel} для чата ${currentChatId}`);
            try {
                const response = await fetch(`${BASE_URL}/api/chats/${currentChatId}/model`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: newModel })
                });
                if (!response.ok) {
                     const errorData = await response.json().catch(()=>({error: `Ошибка ${response.status}`}));
                     throw new Error(errorData.error || `Ошибка ${response.status}`);
                }
                currentModel = newModel;
                console.log(`Модель успешно изменена на ${newModel}`);
                addMessage({
                    id: `system-message-${Date.now()}`,
                    content: `Модель чата изменена на ${modelSelect.options[modelSelect.selectedIndex].text}.`,
                    is_bot: true,
                    created_at: new Date().toISOString()
                });
            } catch (error) {
                console.error('Ошибка при смене модели:', error);
                alert(`Не удалось сменить модель: ${error.message}`);
                modelSelect.value = currentModel;
            }
        });
    }

    const resetBtn = document.querySelector('.reset-chat-btn');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (currentChatId && confirm('Вы уверены, что хотите сбросить историю этого чата для ИИ? Сообщения останутся видимыми.')) {
                 resetChat(currentChatId);
            }
        });
    }

    async function resetChat(chatId) {
        console.log(`Сброс чата ${chatId}`);
        try {
            const response = await fetch(`${BASE_URL}/api/chats/${chatId}/reset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            console.log(`Чат ${chatId} успешно сброшен на сервере.`);
            addMessage({
                id: `system-message-${Date.now()}`,
                content: 'Контекст чата для ИИ был сброшен.',
                is_bot: true,
                created_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Ошибка сброса чата:', error);
            alert(`Не удалось сбросить чат: ${error.message}`);
        }
    }

    // Адаптация для мобильных устройств
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.chat-sidebar');
        const chatHeader = document.querySelector('.chat-main .chat-header');
        if (sidebar && chatHeader && !chatHeader.querySelector('.toggle-sidebar')) {
            const toggleButton = document.createElement('button');
            toggleButton.classList.add('toggle-sidebar');
            toggleButton.innerHTML = '☰';
             toggleButton.style.cssText = `
                background: none; border: none; font-size: 1.5rem; cursor: pointer;
                color: var(--text-primary); margin-right: 10px; padding: 5px; order: -1;
            `;
            chatHeader.prepend(toggleButton);

            toggleButton.addEventListener('click', (e) => {
                 e.stopPropagation();
                sidebar.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                 if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && !toggleButton.contains(e.target)) {
                      sidebar.classList.remove('active');
                 }
            });
        }
    }


    // --- Функции для таймера размышлений ---
    function startThinkingTimer(messageId) {
        if (!messageId) return; // Добавим проверку
        if (window.thinkingTimers[messageId]) {
            clearInterval(window.thinkingTimers[messageId].intervalId);
        }
        window.thinkingTimers[messageId] = { intervalId: null, seconds: 0 };

        window.thinkingTimers[messageId].intervalId = setInterval(() => {
            if (window.thinkingTimers[messageId]) { // Проверка на случай удаления таймера
                window.thinkingTimers[messageId].seconds++;
                const messageElement = document.getElementById(messageId);
                const timeSpan = messageElement?.querySelector('.thoughts-container .thinking-time');
                if (timeSpan) {
                    timeSpan.textContent = `${window.thinkingTimers[messageId].seconds}s`;
                }
            } else {
                // Таймер был удален, останавливаем интервал
                 const timerId = window.thinkingTimers[messageId]?.intervalId;
                 if (timerId) clearInterval(timerId);
            }
        }, 1000);
    }

    function stopThinkingTimer(messageId) {
         if (!messageId) return;
        if (window.thinkingTimers[messageId]) {
            clearInterval(window.thinkingTimers[messageId].intervalId);
            // Можно сохранить финальное время перед удалением, если нужно
            // delete window.thinkingTimers[messageId];
        }
    }

    // --- Инициализация ---
    await loadModels();
    await loadChats();

}); // Конец DOMContentLoaded