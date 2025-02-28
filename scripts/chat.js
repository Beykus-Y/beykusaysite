import { marked } from './markdown.js';

// Настройка marked
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return code;
    },
    breaks: true,
    gfm: true
});

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addMessage(message) {
    const messagesContainer = document.querySelector('.messages-container');
    let messageElement = message.id ? 
        document.getElementById(message.id) : 
        document.createElement('div');

    if (!messageElement) {
        messageElement = document.createElement('div');
        messageElement.id = message.id;
    }

    messageElement.className = `message ${message.is_bot ? 'ai' : 'user'}`;
    
    const time = new Date(message.created_at).toLocaleTimeString();
    
    // Используем marked для рендеринга Markdown
    const formattedContent = message.is_bot ? 
        marked.parse(message.content) : 
        `<p>${escapeHtml(message.content)}</p>`;
    
    messageElement.innerHTML = `
        ${message.is_bot ? '<div class="message-avatar">🤖</div>' : ''}
        <div class="message-content">
            <div class="message-text">${formattedContent}</div>
            <div class="message-time">${time}</div>
        </div>
        ${!message.is_bot ? '<div class="message-avatar">👤</div>' : ''}
    `;
    
    // Обработка ссылок
    messageElement.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });
    
    if (!document.getElementById(message.id)) {
        messagesContainer.appendChild(messageElement);
    }

    // Прокрутка к новому сообщению
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    // Подсветка синтаксиса кода
    messageElement.querySelectorAll('pre code').forEach(block => {
        hljs.highlightBlock(block);
    });
}

// Добавьте в начало файла после импортов
function initTheme() {
    const themeToggle = document.querySelector('.theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// Основной код
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    // Проверка авторизации
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user) {
        window.location.href = '/auth.html';
        return;
    }

    // Отображаем имя пользователя
    const userProfileName = document.querySelector('.user-profile span');
    if (userProfileName) {
        userProfileName.textContent = user.name;
    }

    let currentChatId = null;
    let currentModel = null;

    // Загрузка чатов
    async function loadChats() {
        try {
            const response = await fetch('http://localhost:8000/api/chats', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Ошибка загрузки чатов');
            }

            const chats = await response.json();
            console.log('Загруженные чаты:', chats);

            const chatsList = document.querySelector('.chats-list');
            chatsList.innerHTML = '';

            chats.forEach(chat => {
                const chatElement = document.createElement('div');
                chatElement.className = 'chat-item';
                if (chat.id === currentChatId) {
                    chatElement.classList.add('active');
                }

                chatElement.innerHTML = `
                    <div class="chat-title">${escapeHtml(chat.title)}</div>
                    <div class="chat-preview">${escapeHtml(chat.last_message)}</div>
                `;

                chatElement.addEventListener('click', () => {
                    document.querySelectorAll('.chat-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    chatElement.classList.add('active');
                    loadMessages(chat.id);
                });

                chatsList.appendChild(chatElement);
            });

            // Если есть чаты, загружаем первый
            if (chats.length > 0 && !currentChatId) {
                loadMessages(chats[0].id);
            }

        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
        }
    }

    // Загрузка сообщений чата
    async function loadMessages(chatId) {
        currentChatId = chatId;
        try {
            const response = await fetch(`http://localhost:8000/api/chats/${chatId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const messages = await response.json();
            
            const messagesContainer = document.querySelector('.messages-container');
            messagesContainer.innerHTML = '';
            
            messages.forEach(message => {
                addMessage(message);
            });
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    }

    // Создание нового чата
    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('http://localhost:8000/api/chats', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ title: 'Новый чат' })
                });

                if (!response.ok) {
                    throw new Error('Ошибка создания чата');
                }

                const chat = await response.json();
                await loadChats();
                loadMessages(chat.id);
            } catch (error) {
                console.error('Ошибка создания чата:', error);
            }
        });
    }

    // Получаем элементы формы
    const messageForm = document.getElementById('messageForm');
    const messageInput = messageForm.querySelector('textarea');

    console.log('Form elements:', { messageForm, messageInput }); // Добавляем лог

    // Обновим обработчик отправки сообщения
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentChatId) {
            console.error('Чат не выбран');
            return;
        }

        const content = messageInput.value.trim();
        if (!content) return;

        try {
            // Добавляем сообщение пользователя
            addMessage({
                content: content,
                is_bot: false,
                created_at: new Date().toISOString()
            });

            // Создаем placeholder для ответа бота
            const botMessageId = 'bot-message-' + Date.now();
            addMessage({
                id: botMessageId,
                content: '',
                is_bot: true,
                created_at: new Date().toISOString()
            });
            
            messageInput.value = '';
            messageInput.style.height = 'auto';

            // Отправляем сообщение через POST запрос
            const response = await fetch(`http://localhost:8000/api/chats/${currentChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            if (!response.ok) {
                throw new Error('Ошибка отправки сообщения');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const botMessage = document.getElementById(botMessageId);
            const botMessageText = botMessage.querySelector('.message-text');
            let fullResponse = '';

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.error) {
                                console.error('Ошибка:', data.error);
                                botMessageText.innerHTML = `<p class="error">Ошибка: ${data.error}</p>`;
                                return;
                            }

                            fullResponse += data.content;
                            botMessageText.innerHTML = marked.parse(fullResponse);

                            // Подсветка кода
                            botMessage.querySelectorAll('pre code').forEach(block => {
                                hljs.highlightBlock(block);
                            });

                            // Прокрутка к последнему сообщению
                            botMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        } catch (error) {
                            console.error('Ошибка обработки данных:', error);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    });

    // Обработчик Enter для отправки
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            messageForm.dispatchEvent(new Event('submit'));
        }
    });

    // Добавьте функцию для обновления сообщений
    function updateMessages(messages) {
        const messagesContainer = document.querySelector('.messages-container');
        messagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            addMessage(message);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Загрузка списка моделей
    async function loadModels() {
        try {
            const response = await fetch('http://localhost:8000/api/models', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            const modelSelect = document.getElementById('modelSelect');
            modelSelect.innerHTML = data.models.map(model => 
                `<option value="${model.id}">${model.name}</option>`
            ).join('');
            
            // Установка текущей модели
            currentModel = data.models[0].id;
            modelSelect.value = currentModel;
        } catch (error) {
            console.error('Ошибка загрузки моделей:', error);
        }
    }

    // Обработчик смены модели
    document.getElementById('modelSelect').addEventListener('change', async (e) => {
        const newModel = e.target.value;
        if (!currentChatId || newModel === currentModel) return;
        
        try {
            const response = await fetch(`http://localhost:8000/api/chats/${currentChatId}/model`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: newModel })
            });
            
            if (response.ok) {
                currentModel = newModel;
                // Добавляем системное сообщение об изменении модели
                addMessage({
                    content: `Модель изменена на ${newModel}`,
                    is_bot: true,
                    created_at: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Ошибка при смене модели:', error);
        }
    });

    // Инициализация
    await loadModels();
    await loadChats();

    // Автоматическое изменение высоты текстового поля
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // Мобильная версия
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.chat-sidebar');
        const toggleButton = document.createElement('button');
        toggleButton.classList.add('toggle-sidebar');
        toggleButton.innerHTML = '☰';
        document.querySelector('.chat-header').prepend(toggleButton);

        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Добавьте функцию сброса чата
    async function resetChat(chatId) {
        try {
            const response = await fetch(`http://localhost:8000/api/chats/${chatId}/reset`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                loadMessages(chatId);
            }
        } catch (error) {
            console.error('Ошибка сброса чата:', error);
        }
    }

    // Добавьте обработчик для кнопки сброса
    document.querySelector('.reset-chat-btn').addEventListener('click', () => {
        if (currentChatId) {
            resetChat(currentChatId);
        }
    });
});

// Экспортируем функции, если они нужны в других модулях
export { addMessage, escapeHtml }; 