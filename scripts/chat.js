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

// Базовый URL сервера
const BASE_URL = `${window.location.protocol}//${window.location.host}`;

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
    
    // Извлекаем размышления из контента, если они есть
    let thoughts = '';
    let content = message.content;
    
    if (message.is_bot) {
        // Пробуем различные варианты форматирования тега think
        const thinkPatterns = [
            /```<think>([\s\S]*?)<\/think>```/,
            /<think>([\s\S]*?)<\/think>/,
            /```think\n([\s\S]*?)```/,
            /\[think\]([\s\S]*?)\[\/think\]/
        ];

        for (const pattern of thinkPatterns) {
            const match = content.match(pattern);
            if (match) {
                thoughts = match[1].trim();
                content = content.replace(match[0], '').trim();
                break;
            }
        }

        // Удаляем оставшиеся теги think, если они есть
        content = content.replace(/<\/?think>/g, '')
                        .replace(/```think\n?/g, '')
                        .replace(/\[\/think\]/g, '')
                        .trim();
    }
    
    // Форматируем контент с помощью marked, но удаляем пустые pre
    const formattedContent = message.is_bot ? 
        marked.parse(content).replace(/<pre><code[^>]*>\s*<\/code><\/pre>/g, '') : 
        `<p>${escapeHtml(content)}</p>`;
    
    messageElement.innerHTML = `
        ${message.is_bot ? '<div class="message-avatar">🤖</div>' : ''}
        <div class="message-content">
            ${thoughts ? `
                <div class="thoughts-container">
                    <div class="thoughts-header" onclick="toggleThoughts(this)">
                        🤔 Показать размышления <span class="thinking-time">0s</span>
                    </div>
                    <div class="thoughts-content" style="display: none;">
                        ${marked.parse(thoughts)}
                    </div>
                </div>
            ` : ''}
            <div class="message-text">${formattedContent}</div>
            <div class="message-time">${time}</div>
        </div>
        ${!message.is_bot ? '<div class="message-avatar">👤</div>' : ''}
    `;

    // Добавляем логирование для отладки
    if (message.is_bot) {
        console.log('Original content:', message.content);
        console.log('Extracted thoughts:', thoughts);
        console.log('Cleaned content:', content);
    }
    
    // Обновляем время размышлений
    if (thoughts) {
        const thinkingTimeElement = messageElement.querySelector('.thinking-time');
        let seconds = 0;
        const timer = setInterval(() => {
            seconds++;
            thinkingTimeElement.textContent = `${seconds}s`;
        }, 1000);
        
        // Останавливаем таймер через 2 секунды после добавления сообщения
        setTimeout(() => {
            clearInterval(timer);
        }, 2000);
    }
    
    messageElement.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });
    
    if (!document.getElementById(message.id)) {
        messagesContainer.appendChild(messageElement);
    }

    messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    messageElement.querySelectorAll('pre code').forEach(block => {
        hljs.highlightBlock(block);
    });
}

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
        userProfileName.textContent = user.name;
    }

    let currentChatId = null;
    let currentModel = null;

    async function loadChats() {
        try {
            const response = await fetch(`${BASE_URL}/api/chats`, {
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

            if (chats.length > 0 && !currentChatId) {
                loadMessages(chats[0].id);
            }
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
        }
    }

    async function loadMessages(chatId) {
        currentChatId = chatId;
        try {
            const response = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
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

    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/chats`, {
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

    const messageForm = document.getElementById('messageForm');
    const messageInput = messageForm.querySelector('textarea');

    console.log('Form elements:', { messageForm, messageInput });

    // Обработчик Enter для Firefox
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            messageForm.dispatchEvent(new Event('submit'));
        }
    });

    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentChatId) {
            console.error('Чат не выбран');
            return;
        }

        const content = messageInput.value.trim();
        if (!content) return;

        try {
            addMessage({
                content: content,
                is_bot: false,
                created_at: new Date().toISOString()
            });

            const botMessageId = 'bot-message-' + Date.now();
            addMessage({
                id: botMessageId,
                content: '',
                is_bot: true,
                created_at: new Date().toISOString()
            });
            
            messageInput.value = '';
            messageInput.style.height = 'auto';

            const response = await fetch(`${BASE_URL}/api/chats/${currentChatId}/messages`, {
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

                            botMessage.querySelectorAll('pre code').forEach(block => {
                                hljs.highlightBlock(block);
                            });

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

    function updateMessages(messages) {
        const messagesContainer = document.querySelector('.messages-container');
        messagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            addMessage(message);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function loadModels() {
        try {
            const response = await fetch(`${BASE_URL}/api/models`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            const modelSelect = document.getElementById('modelSelect');
            modelSelect.innerHTML = data.models.map(model => 
                `<option value="${model.id}">${model.name}</option>`
            ).join('');
            
            currentModel = data.models[0].id;
            modelSelect.value = currentModel;
        } catch (error) {
            console.error('Ошибка загрузки моделей:', error);
        }
    }

    document.getElementById('modelSelect').addEventListener('change', async (e) => {
        const newModel = e.target.value;
        if (!currentChatId || newModel === currentModel) return;
        
        try {
            const response = await fetch(`${BASE_URL}/api/chats/${currentChatId}/model`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: newModel })
            });
            
            if (response.ok) {
                currentModel = newModel;
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

    await loadModels();
    await loadChats();

    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

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

    async function resetChat(chatId) {
        try {
            const response = await fetch(`${BASE_URL}/api/chats/${chatId}/reset`, {
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

    document.querySelector('.reset-chat-btn').addEventListener('click', () => {
        if (currentChatId) {
            resetChat(currentChatId);
        }
    });

    // Добавляем глобальную функцию toggleThoughts
    window.toggleThoughts = function(header) {
        const content = header.nextElementSibling;
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        const timeSpan = header.querySelector('.thinking-time');
        const time = timeSpan ? timeSpan.textContent : '';
        header.innerHTML = isHidden ? 
            `🤔 Скрыть размышления <span class="thinking-time">${time}</span>` : 
            `🤔 Показать размышления <span class="thinking-time">${time}</span>`;
    };
});

async function handleStreamingResponse(response, botMessageElement) {
    let fullResponse = '';
    let currentThoughts = '';
    let isCollectingThoughts = false;
    let thoughtsContainer = null;
    const botMessageContent = botMessageElement.querySelector('.message-content');
    const botMessageText = botMessageElement.querySelector('.message-text');
    let thinkingTimer = null;
    let thinkingSeconds = 0;

    // Функция для создания контейнера размышлений
    function createThoughtsContainer() {
        thoughtsContainer = document.createElement('div');
        thoughtsContainer.className = 'thoughts-container';
        thoughtsContainer.innerHTML = `
            <div class="thoughts-header" onclick="toggleThoughts(this)">
                🤔 Думает... <span class="thinking-time">0s</span>
            </div>
            <div class="thoughts-content" style="display: none;"></div>
        `;
        botMessageContent.insertBefore(thoughtsContainer, botMessageText);
        
        // Запускаем таймер
        thinkingTimer = setInterval(() => {
            thinkingSeconds++;
            const timeSpan = thoughtsContainer.querySelector('.thinking-time');
            if (timeSpan) {
                timeSpan.textContent = `${thinkingSeconds}s`;
            }
        }, 1000);
    }

    try {
        for await (const chunk of response) {
            const data = JSON.parse(chunk.replace('data: ', ''));
            if (data.error) {
                console.error('Ошибка:', data.error);
                botMessageText.innerHTML = `<p class="error">Ошибка: ${data.error}</p>`;
                return;
            }

            const content = data.content;

            // Проверяем начало тега think
            if (content.includes('<think>')) {
                isCollectingThoughts = true;
                if (!thoughtsContainer) {
                    createThoughtsContainer();
                }
                continue;
            }

            // Проверяем конец тега think
            if (content.includes('</think>')) {
                isCollectingThoughts = false;
                if (thoughtsContainer) {
                    const thoughtsContent = thoughtsContainer.querySelector('.thoughts-content');
                    thoughtsContent.innerHTML = marked.parse(currentThoughts);
                    thoughtsContainer.querySelector('.thoughts-header').innerHTML = 
                        `🤔 Показать размышления <span class="thinking-time">${thinkingSeconds}s</span>`;
                    if (thinkingTimer) {
                        clearInterval(thinkingTimer);
                    }
                }
                continue;
            }

            // Собираем контент
            if (isCollectingThoughts) {
                currentThoughts += content;
                if (thoughtsContainer) {
                    const thoughtsContent = thoughtsContainer.querySelector('.thoughts-content');
                    thoughtsContent.innerHTML = marked.parse(currentThoughts);
                }
            } else {
                fullResponse += content;
                botMessageText.innerHTML = marked.parse(fullResponse)
                    .replace(/<pre><code[^>]*>\s*<\/code><\/pre>/g, '');
            }

            // Прокручиваем к последнему сообщению
            botMessageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    } catch (error) {
        console.error('Ошибка обработки данных:', error);
        if (thinkingTimer) {
            clearInterval(thinkingTimer);
        }
    }
}

export { addMessage, escapeHtml };