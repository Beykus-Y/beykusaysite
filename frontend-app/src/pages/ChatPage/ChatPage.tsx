import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ChatPage.module.css';
// Импортируем библиотеки, если установлены как зависимости
import { marked } from 'marked';
import hljs from 'highlight.js';
// Импортируйте CSS для highlight.js глобально в main.tsx или index.css
// import 'highlight.js/styles/tokyo-night-dark.css';

// Типизация данных (упрощенная)
interface User {
    id: string | number;
    name: string;
    email: string;
}

interface Chat {
    id: string;
    title: string;
    last_message?: string; // Сделаем необязательным на всякий случай
}

interface Model {
    id: string;
    name: string;
}

interface Message {
    id?: string; // Может быть временным ID для UI
    content: string;
    is_bot: boolean;
    created_at: string;
    thoughts?: string | null;
    // Дополнительные поля с сервера?
    chat_id?: string;
    user_id?: string | number;
}

// Конфигурация Marked (можно вынести в отдельный файл)
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        try {
             return hljs.highlight(code, { language, ignoreIllegals: true }).value;
        } catch (__) {
             return hljs.highlightAuto(code).value;
        }
    }
});


// Вспомогательная функция (можно вынести)
function escapeHtml(text: string | undefined | null): string {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


function ChatPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [chats, setChats] = useState<Chat[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [currentModel, setCurrentModel] = useState<string | null>(null);
    const [newMessageContent, setNewMessageContent] = useState('');
    const [isLoadingChats, setIsLoadingChats] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Для мобильного меню

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null); // Для автоскролла
    const textareaRef = useRef<HTMLTextAreaElement>(null); // Для авторесайза

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = localStorage.getItem('token');

    // --- Эффекты для загрузки данных ---

    // Загрузка пользователя и проверка токена
    useEffect(() => {
        if (!token) {
            navigate('/auth');
            return;
        }
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            // Если пользователя нет, но есть токен, возможно, надо его запросить или выйти
            localStorage.removeItem('token');
            navigate('/auth');
        }
    }, [token, navigate]);

    // Применение темы
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Загрузка моделей
    const fetchModels = useCallback(async () => {
        if (!token) return;
        setIsLoadingModels(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/models`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Не удалось загрузить модели');
            const data = await response.json();
            if (data.models?.length > 0) {
                setModels(data.models);
                // Устанавливаем первую модель по умолчанию, если еще не выбрана
                if (!currentModel) {
                    setCurrentModel(data.models[0].id);
                }
            } else {
                setModels([]);
            }
        } catch (err: any) {
            setError(`Ошибка загрузки моделей: ${err.message}`);
        } finally {
            setIsLoadingModels(false);
        }
    }, [token, API_BASE_URL, currentModel]); // currentModel добавлен, чтобы не сбрасывать выбор

    // Загрузка списка чатов
    const fetchChats = useCallback(async () => {
        if (!token) return;
        setIsLoadingChats(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
             if (response.status === 401) {
                 localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/auth'); return;
             }
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            const data: Chat[] = await response.json();
            setChats(data);
            // Если текущий чат не установлен или больше не существует, выбираем первый
             if (data.length > 0 && (!currentChatId || !data.some(chat => chat.id === currentChatId))) {
                 // Не меняем currentChatId здесь, чтобы не вызывать лишнюю загрузку сообщений
                 // Установка будет при клике или в useEffect ниже
             } else if (data.length === 0) {
                 setCurrentChatId(null); // Если чатов нет, сбрасываем выбор
                 setMessages([]); // Очищаем сообщения
             }
        } catch (err: any) {
            setError(`Ошибка загрузки чатов: ${err.message}`);
             setChats([]); // Очищаем чаты при ошибке
        } finally {
            setIsLoadingChats(false);
        }
    }, [token, API_BASE_URL, navigate, currentChatId]); // Добавлен currentChatId

    // Загрузка сообщений для выбранного чата
    const fetchMessages = useCallback(async (chatId: string) => {
        if (!token || !chatId) return;
        setIsLoadingMessages(true);
        setError(null);
        setMessages([]); // Очищаем перед загрузкой
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/auth'); return; }
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            const data: Message[] = await response.json();
            setMessages(data);
        } catch (err: any) {
            setError(`Ошибка загрузки сообщений: ${err.message}`);
        } finally {
            setIsLoadingMessages(false);
        }
    }, [token, API_BASE_URL, navigate]);

     // Эффект для первоначальной загрузки чатов и моделей
     useEffect(() => {
         fetchModels();
         fetchChats();
     }, [fetchModels, fetchChats]); // Зависимости - сами функции

    // Эффект для загрузки сообщений при смене currentChatId
     useEffect(() => {
         if (currentChatId) {
             fetchMessages(currentChatId);
         } else {
             setMessages([]); // Очистить сообщения, если чат не выбран
         }
     }, [currentChatId, fetchMessages]); // Зависимости - ID чата и функция

    // Эффект для автоскролла вниз при появлении новых сообщений
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]); // Срабатывает при изменении массива сообщений

    // Эффект для авторесайза textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto'; // Сброс высоты
            const scrollHeight = ta.scrollHeight;
            const maxHeight = 200; // Из вашего CSS
            ta.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
        }
    }, [newMessageContent]); // Срабатывает при изменении текста

    // --- Обработчики событий ---

    const handleThemeToggle = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleSelectChat = (chatId: string) => {
        if (chatId !== currentChatId) {
             setCurrentChatId(chatId);
             setIsSidebarOpen(false); // Закрыть сайдбар на мобильных при выборе чата
        }
    };

    const handleNewChat = async () => {
        if (!token) return;
        // TODO: Добавить состояние загрузки для кнопки
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Новый чат' }) // Можно запросить имя у пользователя
            });
            if (!response.ok) throw new Error('Не удалось создать чат');
            const newChat: Chat = await response.json();
            await fetchChats(); // Обновляем список чатов
            setCurrentChatId(newChat.id); // Сразу переключаемся на новый чат
            setIsSidebarOpen(false); // Закрыть сайдбар
        } catch (err: any) {
            setError(`Ошибка создания чата: ${err.message}`);
        }
    };

    const handleModelChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newModelId = event.target.value;
         if (!token || !currentChatId || newModelId === currentModel) return;

         const previousModel = currentModel; // Сохраняем предыдущую модель для отката
         setCurrentModel(newModelId); // Оптимистичное обновление UI

         try {
             const response = await fetch(`${API_BASE_URL}/api/chats/${currentChatId}/model`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                 body: JSON.stringify({ model: newModelId })
             });
             if (!response.ok) {
                 const errorData = await response.json().catch(()=>({}));
                 throw new Error(errorData.error || `Ошибка ${response.status}`);
             }
              // Можно добавить системное сообщение об успешной смене модели
              // addSystemMessage(`Модель изменена на ${models.find(m => m.id === newModelId)?.name || 'новую'}.`);
         } catch (error: any) {
             setError(`Не удалось сменить модель: ${error.message}`);
             setCurrentModel(previousModel); // Откат UI в случае ошибки
         }
    };

     const handleResetChat = async () => {
         if (!token || !currentChatId || !window.confirm('Сбросить контекст этого чата для ИИ? Сообщения останутся.')) {
             return;
         }
         try {
             const response = await fetch(`${API_BASE_URL}/api/chats/${currentChatId}/reset`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}` }
             });
             if (!response.ok) throw new Error(`Ошибка ${response.status}`);
              // Добавить системное сообщение
              // addSystemMessage('Контекст чата для ИИ сброшен.');
         } catch (error: any) {
             setError(`Ошибка сброса чата: ${error.message}`);
         }
     };

    // Отправка сообщения (с SSE)
    const handleSendMessage = async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const content = newMessageContent.trim();
        if (!token || !currentChatId || !content || isSendingMessage) return;

        setIsSendingMessage(true);
        setError(null);

        const userMessage: Message = {
            id: `user-${Date.now()}`, // Временный ID
            content: content,
            is_bot: false,
            created_at: new Date().toISOString(),
            chat_id: currentChatId,
            user_id: user?.id
        };

        // Оптимистичное добавление сообщения пользователя
        setMessages(prev => [...prev, userMessage]);
        setNewMessageContent(''); // Очистка поля ввода

        // Добавление плейсхолдера для ответа бота
        const botPlaceholderId = `bot-${Date.now()}`;
        const botPlaceholder: Message = {
            id: botPlaceholderId,
            content: '', // Пустое, будет индикатор загрузки в рендеринге
            is_bot: true,
            created_at: new Date().toISOString(),
            chat_id: currentChatId,
        };
        setMessages(prev => [...prev, botPlaceholder]);

        // --- Запрос SSE ---
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${currentChatId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content, model_id: currentModel }) // Отправляем и модель
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Ошибка: ${response.statusText}` }));
                throw new Error(errorData.error || `Ошибка ${response.status}`);
            }
            if (!response.body) {
                throw new Error('Ответ сервера не содержит тело для стриминга.');
            }

            // Обработка потока
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';
            let accumulatedThoughts = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) >= 0) {
                    const messageChunk = buffer.substring(0, boundaryIndex);
                    buffer = buffer.substring(boundaryIndex + 2);

                    if (messageChunk.startsWith('data:')) {
                        try {
                            const data = JSON.parse(messageChunk.substring(5).trim());

                            if (data.error) {
                                throw new Error(data.error); // Обрабатываем ошибку из потока
                            }

                            if (data.content) {
                                accumulatedContent += data.content;
                            }
                            if (data.thoughts) {
                                accumulatedThoughts += data.thoughts;
                            }

                            // Обновляем сообщение-плейсхолдер
                            setMessages(prev => prev.map(msg =>
                                msg.id === botPlaceholderId
                                    ? { ...msg, content: accumulatedContent, thoughts: accumulatedThoughts || msg.thoughts }
                                    : msg
                            ));

                        } catch (e: any) {
                            console.error('Ошибка парсинга или обработки чанка SSE:', e);
                            // Обновляем сообщение бота с ошибкой парсинга
                            setMessages(prev => prev.map(msg =>
                                msg.id === botPlaceholderId
                                ? { ...msg, content: `${msg.content}\n\n**Ошибка обработки ответа**`, thoughts: null }
                                : msg
                             ));
                            // Прерываем цикл чтения потока
                            await reader.cancel(); // Закрываем ридер
                            throw e; // Пробрасываем ошибку дальше в catch внешнего try
                        }
                    }
                } // end while(boundaryIndex)
            } // end while(true) reader loop

            // Поток завершен успешно
            // Можно сделать финальную очистку или обновление ID сообщения, если бэкенд его присылает

            await fetchChats(); // Обновить список чатов (для last_message)

        } catch (error: any) {
            console.error('Ошибка при отправке/получении сообщения:', error);
             // Обновляем сообщение бота с текстом ошибки
            setMessages(prev => prev.map(msg =>
                 msg.id === botPlaceholderId
                 ? { ...msg, content: `**Произошла ошибка:** ${error.message || 'Неизвестная ошибка'}`, thoughts: null }
                 : msg
             ));
        } finally {
            setIsSendingMessage(false);
        }
    };

     // Обработчик нажатия Enter в textarea
     const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
         if (event.key === 'Enter' && !event.shiftKey) {
             event.preventDefault();
             handleSendMessage();
         }
     };

    // --- Рендеринг ---
    return (
        <div className={styles.chatContainer}>
            {/* Сайдбар */}
            <div className={`${styles.chatSidebar} ${isSidebarOpen ? styles.active : ''}`}>
                <div className={styles.sidebarHeader}>
                    <button className={styles.newChatBtn} onClick={handleNewChat} disabled={isLoadingChats}>
                        Новый чат
                    </button>
                </div>
                <div className={styles.chatsList}>
                    {isLoadingChats && <p>Загрузка чатов...</p>}
                    {!isLoadingChats && chats.length === 0 && <p>Нет доступных чатов.</p>}
                    {!isLoadingChats && chats.map(chat => (
                        <div
                            key={chat.id}
                            className={`${styles.chatItem} ${chat.id === currentChatId ? styles.active : ''}`}
                            onClick={() => handleSelectChat(chat.id)}
                        >
                            <div className={styles.chatTitle}>{escapeHtml(chat.title)}</div>
                            {chat.last_message && (
                                <div className={styles.chatPreview}>{escapeHtml(chat.last_message)}</div>
                            )}
                        </div>
                    ))}
                </div>
                 {/* Можно добавить футер сайдбара с информацией о пользователе или выходом */}
            </div>
            

            {/* Основная область чата */}
            <div className={styles.chatMain}>
                {/* Шапка чата */}
                <div className={styles.chatHeader}>
                     {/* Кнопка мобильного меню */}
                     <button className={styles.toggleSidebarBtn} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>

                    <div className={styles.userProfile}>
                        {/* Отображение имени пользователя */}
                        <span>{user?.name || 'Загрузка...'}</span>
                        {/* Селектор моделей */}
                        <select
                            id="modelSelect"
                            className={styles.modelSelect}
                            value={currentModel || ''}
                            onChange={handleModelChange}
                            disabled={isLoadingModels || !currentChatId} // Блокируем, если нет чата
                        >
                            {isLoadingModels && <option value="">Загрузка моделей...</option>}
                            {!isLoadingModels && models.length === 0 && <option value="">Модели не найдены</option>}
                            {!isLoadingModels && models.map(model => (
                                <option key={model.id} value={model.id}>{escapeHtml(model.name)}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.themeToggle} title="Переключить тему" onClick={handleThemeToggle}>
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>
                        <button className={styles.resetChatBtn} title="Сбросить контекст чата"
                                onClick={handleResetChat} disabled={!currentChatId}>
                            🔄
                        </button>
                         {/* Кнопка Выход */}
                         <button title="Выйти" className={styles.resetChatBtn} onClick={() => {
                             localStorage.removeItem('token');
                             localStorage.removeItem('user');
                             navigate('/auth');
                         }}>
                             🚪
                         </button>
                    </div>
                </div>

                {/* Контейнер сообщений */}
                <div className={styles.messagesContainer}>
                     {error && <p style={{color: 'red', textAlign:'center'}}>Ошибка: {error}</p>}
                     {!currentChatId && !isLoadingChats && <p style={{textAlign:'center'}}>Выберите или создайте чат, чтобы начать общение.</p>}
                     {isLoadingMessages && <p style={{textAlign:'center'}}>Загрузка сообщений...</p>}
                     {!isLoadingMessages && messages.length === 0 && currentChatId && <p style={{textAlign:'center'}}>Сообщений пока нет.</p>}

                    {messages.map((msg, index) => (
                        <div key={msg.id || `msg-${index}`} className={`${styles.message} ${msg.is_bot ? styles.ai : styles.user}`}>
                            {msg.is_bot && <div className={styles.messageAvatar}>🤖</div>}
                            <div className={styles.messageContent}>
                                {msg.thoughts && (
                                    <div className={styles.thoughtsContainer}>
                                        {/* TODO: Реализовать логику сворачивания/разворачивания */}
                                        <div className={styles.thoughtsHeader}>
                                             🤔 Размышления <span className={styles.thinkingTime}></span> {/* Таймер сюда? */}
                                         </div>
                                         <div className={styles.thoughtsContent}
                                              dangerouslySetInnerHTML={{ __html: marked.parse(msg.thoughts) }}>
                                         </div>
                                    </div>
                                )}
                                {/* Индикатор загрузки для плейсхолдера */}
                                {msg.is_bot && msg.content === '' && !msg.thoughts && (
                                     <div className={styles.messageText}><i>Печатает...</i></div>
                                )}
                                 {/* Отображение контента */}
                                 {msg.content && (
                                    <div className={styles.messageText}
                                         dangerouslySetInnerHTML={{ __html: msg.is_bot ? marked.parse(msg.content) : `<p>${escapeHtml(msg.content)}</p>` }}>
                                    </div>
                                )}
                                <div className={styles.messageTime}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                            {!msg.is_bot && <div className={styles.messageAvatar}>👤</div>}
                        </div>
                    ))}
                    {/* Элемент для скролла */}
                    <div ref={messagesEndRef} />
                </div>

                {/* Поле ввода */}
                <div className={styles.inputContainer}>
                    <form onSubmit={handleSendMessage}>
                        <textarea
                            ref={textareaRef}
                            placeholder={currentChatId ? "Введите сообщение..." : "Выберите чат"}
                            rows={1}
                            maxLength={2000} // Уточните максимальную длину
                            value={newMessageContent}
                            onChange={(e) => setNewMessageContent(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={!currentChatId || isSendingMessage} // Блокируем ввод
                        />
                        <div className={styles.inputActions}>
                            <button type="button" className={styles.attachBtn} title="Прикрепить файл (не реализовано)" disabled={!currentChatId || isSendingMessage}>📎</button>
                            <button type="submit" className={styles.sendBtn} title="Отправить" disabled={!currentChatId || !newMessageContent.trim() || isSendingMessage}>
                                {isSendingMessage ? '...' : '➤'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default ChatPage;