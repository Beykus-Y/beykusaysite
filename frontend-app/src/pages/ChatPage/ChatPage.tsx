// src/pages/ChatPage/ChatPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ChatPage.module.css';
import { marked } from 'marked';
import hljs from 'highlight.js';
// Убедитесь, что CSS импортирован глобально (например, в index.css или main.tsx)
// import 'highlight.js/styles/tokyo-night-dark.css';

// --- Типизация --- (без изменений)
interface User { id: string | number; name: string; email: string; }
interface Chat { id: string; title: string; last_message?: string; }
interface Model { id: string; name: string; }
interface Message {
    id: string; tempId?: string; content: string; is_bot: boolean;
    created_at: string; thoughts?: string | null; isStreaming?: boolean;
    thinkingSeconds?: number; chat_id?: string; user_id?: string | number;
}

// --- Конфигурация Marked --- (без изменений)
marked.setOptions({ breaks: true, gfm: true });

// --- Вспомогательная функция --- (без изменений)
function escapeHtml(text: string | undefined | null): string {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Основной Компонент ===
function ChatPage() {
    const navigate = useNavigate();

    // --- Состояния --- (без изменений)
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
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [thoughtsVisibility, setThoughtsVisibility] = useState<{ [id: string]: boolean }>({});

    // --- Refs --- (без изменений)
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const thinkingTimersRef = useRef<{ [id: string]: number }>({});

    // --- Получаем URL и токен --- (без изменений)
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = localStorage.getItem('token');

    // --- Функция fetch (базовая) ---
    // Объявляем до useCallback, чтобы они могли её использовать
    const baseFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log(`Запрос: ${options.method || 'GET'} ${url}`); // Упрощенный лог

        if (!token) {
            console.error("Нет токена");
            navigate('/auth');
            throw new Error("Нет токена");
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers,
            },
        });

        console.log(`Ответ: ${url} Статус ${response.status}`);

        if (response.status === 401) {
            console.error("Ошибка 401");
            localStorage.clear();
            navigate('/auth');
            throw new Error("Unauthorized");
        }

        if (!response.ok) {
            let errorData = { error: `Ошибка ${response.status}` };
            try { errorData = await response.json(); } catch (e) {}
            const detail = (errorData as any)?.detail || (errorData as any)?.error || JSON.stringify(errorData);
            console.error("Ошибка запроса:", detail);
            throw new Error(`Ошибка: ${detail}`);
        }

        if (response.status === 204 || options.method === 'HEAD') return null;
        return await response.json();

    }, [token, navigate, API_BASE_URL]); // Зависит от стабильных значений

    // --- Функции Загрузки Данных (Используют baseFetch) ---
    const fetchModels = useCallback(async () => {
        // Проверка isLoading остается внутри, перед запросом
        if (isLoadingModels) { console.log("fetchModels: уже загружается"); return; }
        setIsLoadingModels(true);
        setError(null); // Сбрасываем ошибку перед запросом
        try {
            const data = await baseFetch(`/api/models`, {}, 'Не удалось загрузить модели');
            if (data?.models?.length > 0) {
                setModels(data.models);
                // Устанавливаем модель по умолчанию ТОЛЬКО ЕСЛИ она еще не установлена
                setCurrentModel(prev => prev ?? data.models[0].id);
            } else {
                setModels([]);
            }
        } catch (err: any) {
            setError(err.message); // Устанавливаем ошибку
        } finally {
            setIsLoadingModels(false);
        }
        // УБИРАЕМ isLoadingModels ИЗ ЗАВИСИМОСТЕЙ!
        // Зависим только от baseFetch и currentModel (для установки по умолчанию)
    }, [baseFetch, currentModel]);

    const fetchChats = useCallback(async () => {
        if (isLoadingChats) { console.log("fetchChats: уже загружается"); return; }
        setIsLoadingChats(true);
        setError(null);
        try {
            const data: Chat[] = await baseFetch(`/api/chats`, {}, 'Не удалось загрузить чаты');
            setChats(data || []);
            // Если чатов нет, сбрасываем текущий ID
            if (!data || data.length === 0) {
                setCurrentChatId(null);
                setMessages([]); // Очищаем сообщения, если чатов нет
            }
            // НЕ ВЫБИРАЕМ ЧАТ АВТОМАТИЧЕСКИ ЗДЕСЬ
            // Выбор должен происходить либо из URL (если будет), либо кликом пользователя,
            // либо если currentChatId оказывается невалидным после загрузки.
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoadingChats(false);
        }
        // УБИРАЕМ isLoadingChats ИЗ ЗАВИСИМОСТЕЙ!
        // Зависим только от baseFetch
    }, [baseFetch]);

    const fetchMessages = useCallback(async (chatId: string) => {
        // Проверка chatId и isLoading остается
        if (!chatId || isLoadingMessages) {
             console.log(`fetchMessages: пропуск (chatId: ${chatId}, isLoading: ${isLoadingMessages})`);
             return;
        }
        setIsLoadingMessages(true);
        setError(null); // Сбрасываем ошибку перед запросом сообщений
        setMessages([]); // Очищаем старые сообщения
        try {
            const data: Message[] = await baseFetch(`/api/chats/${chatId}/messages`, {}, 'Не удалось загрузить сообщения');
            const messagesWithTime = (data || []).map(msg => ({
                ...msg,
                id: String(msg.id), // Гарантируем строку
                thinkingSeconds: msg.thoughts ? 0 : undefined
            }));
            setMessages(messagesWithTime);
        } catch (err: any) {
            setError(err.message); // Устанавливаем ошибку, если не удалось загрузить
        } finally {
            setIsLoadingMessages(false);
        }
        // УБИРАЕМ isLoadingMessages ИЗ ЗАВИСИМОСТЕЙ!
        // Зависим только от baseFetch
    }, [baseFetch]);

    // --- Эффекты ---
    useEffect(() => { /* Пользователь и токен */
        if (!token) { navigate('/auth'); return; }
        const storedUser = localStorage.getItem('user');
        if (storedUser) { try { setUser(JSON.parse(storedUser)); } catch { localStorage.clear(); navigate('/auth'); } }
        else { localStorage.clear(); navigate('/auth'); }
    }, [token, navigate]);

    useEffect(() => { /* Применение темы */
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Эффект для первичной загрузки моделей и чатов
    useEffect(() => {
        console.log("Первичный useEffect [fetchModels, fetchChats]");
        fetchModels(); // Загружаем модели
        fetchChats(); // Загружаем чаты
    // Зависимости ТОЛЬКО от функций useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchModels, fetchChats]);

    // Эффект для загрузки сообщений ТОЛЬКО при изменении ID чата
    useEffect(() => {
        console.log(`useEffect [currentChatId]: ${currentChatId}`);
        if (currentChatId) {
            fetchMessages(currentChatId); // Загружаем сообщения для нового чата
            setThoughtsVisibility({}); // Сбрасываем видимость размышлений
        } else {
            setMessages([]); // Очищаем сообщения, если чат не выбран (например, после удаления всех чатов)
        }
    // Зависим ТОЛЬКО от currentChatId. fetchMessages стабильна благодаря useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentChatId]);

    useEffect(() => { /* Автоскролл */
        const timer = setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
        return () => clearTimeout(timer);
    }, [messages]);

    useEffect(() => { /* Авторесайз textarea */
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            const maxHeight = 150; // Из CSS
            ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
        }
    }, [newMessageContent]);

    useEffect(() => { /* Подсветка синтаксиса */
        if (messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            container.querySelectorAll<HTMLElement>('pre code:not(.hljs-highlighted)')
                .forEach((block) => {
                    try { hljs.highlightElement(block); block.classList.add('hljs-highlighted'); }
                    catch (e) { console.error("Ошибка подсветки:", e, block); }
                });
            container.querySelectorAll('a:not([target])')
                 .forEach(link => { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); });
        }
    }, [messages, thoughtsVisibility]);

    useEffect(() => { /* Таймер размышлений */
        const currentTimers = thinkingTimersRef.current;
        messages.forEach(msg => {
            if (msg.isStreaming && msg.tempId && !(msg.tempId in currentTimers)) {
                const intervalId = window.setInterval(() => {
                    setMessages(prev => prev.map(m => m.tempId === msg.tempId ? { ...m, thinkingSeconds: (m.thinkingSeconds ?? 0) + 1 } : m ));
                }, 1000);
                currentTimers[msg.tempId] = intervalId;
            }
        });
        Object.keys(currentTimers).forEach(tempId => {
            if (!messages.some(m => m.tempId === tempId && m.isStreaming)) {
                clearInterval(currentTimers[tempId]);
                delete currentTimers[tempId];
            }
        });
        return () => { Object.values(currentTimers).forEach(clearInterval); thinkingTimersRef.current = {}; };
    }, [messages]);

    // --- Обработчики событий ---
    const handleThemeToggle = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    const handleSelectChat = (chatId: string) => {
         console.log("Выбор чата:", chatId);
         if (chatId !== currentChatId) {
             setCurrentChatId(chatId); // Это вызовет useEffect для загрузки сообщений
         }
         setIsSidebarOpen(false);
    };
    const handleLogout = () => { localStorage.clear(); navigate('/auth'); };
    const handleToggleThoughts = (messageId: string) => setThoughtsVisibility(prev => ({ ...prev, [messageId]: !prev[messageId] }));

    const handleNewChat = useCallback(async () => {
        // Проверка isLoading здесь, а не в зависимостях
        if (isLoadingChats || isSendingMessage) return;
        setIsLoadingChats(true); // Ставим флаг только на время выполнения этой функции
        try {
            const newChat: Chat = await baseFetch(`/api/chats`, {
                method: 'POST',
                body: JSON.stringify({ title: 'Новый чат' })
            }, 'Не удалось создать чат');
            if (newChat) {
                 await fetchChats(); // Перезагружаем список чатов
                 setCurrentChatId(newChat.id); // Устанавливаем ID нового чата, useEffect загрузит сообщения
                 setIsSidebarOpen(false);
                 setError(null);
            }
        } catch (err: any) { setError(err.message); }
        finally { setIsLoadingChats(false); } // Снимаем флаг
        // Зависим только от baseFetch и fetchChats (стабильных)
    }, [baseFetch, fetchChats, isLoadingChats, isSendingMessage]);

    const handleModelChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newModelId = event.target.value;
        if (!currentChatId || newModelId === currentModel) return;
        const previousModel = currentModel;
        setCurrentModel(newModelId);
        try {
            await baseFetch(`/api/chats/${currentChatId}/model`, {
                method: 'POST',
                body: JSON.stringify({ model: newModelId })
            }, 'Не удалось сменить модель');
            const modelName = models.find(m => m.id === newModelId)?.name || 'новую';
            const systemMessage: Message = {
                 id: `system-${Date.now()}`, content: `Модель изменена на ${modelName}.`,
                 is_bot: true, created_at: new Date().toISOString(), chat_id: currentChatId,
             };
            setMessages(prev => [...prev, systemMessage]);
            setError(null);
        } catch (err: any) {
             setError(err.message);
             setCurrentModel(previousModel); // Откат
        }
        // Зависим от baseFetch, currentChatId, currentModel, models (для имени)
    }, [baseFetch, currentChatId, currentModel, models]);

     const handleResetChat = useCallback(async () => {
         if (!currentChatId || !window.confirm('Сбросить контекст этого чата для ИИ?')) return;
         try {
             await baseFetch(`/api/chats/${currentChatId}/reset`, { method: 'POST' }, 'Ошибка сброса чата');
             const systemMessage: Message = {
                 id: `system-${Date.now()}`, content: 'Контекст чата для ИИ сброшен.',
                 is_bot: true, created_at: new Date().toISOString(), chat_id: currentChatId,
             };
             setMessages(prev => [...prev, systemMessage]);
             setError(null);
         } catch (err: any) { setError(err.message); }
         // Зависим от baseFetch, currentChatId
     }, [baseFetch, currentChatId]);

    // --- Отправка Сообщения (SSE) ---
    // Используем стандартный fetch для SSE
    const handleSendMessage = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const content = newMessageContent.trim();
        // Перепроверяем все условия перед отправкой
        if (!token || !currentChatId || !content || isSendingMessage) {
             console.warn("Отправка сообщения прервана:", {token: !!token, currentChatId, content, isSendingMessage});
             return;
        }

        setIsSendingMessage(true);
        setError(null);

        const userMessage: Message = {
            id: `user-${Date.now()}`, content: content, is_bot: false,
            created_at: new Date().toISOString(), chat_id: currentChatId, user_id: user?.id
        };
        setMessages(prev => [...prev, userMessage]);
        setNewMessageContent('');

        const tempBotId = `bot-${Date.now()}`;
        const botPlaceholder: Message = {
            id: tempBotId, tempId: tempBotId, content: '', is_bot: true,
            created_at: new Date().toISOString(), chat_id: currentChatId,
            isStreaming: true, thinkingSeconds: 0,
        };
        setMessages(prev => [...prev, botPlaceholder]);

        let sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        const url = `${API_BASE_URL}/api/chats/${currentChatId}/messages`;
        console.log(`SSE Запрос: POST ${url}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({ content: content, model_id: currentModel }) // Убедимся, что модель передается
            });
            console.log(`SSE Ответ: Статус ${response.status}`);

            if (response.status === 401) { localStorage.clear(); navigate('/auth'); throw new Error("Unauthorized"); }
            if (!response.ok) {
                 let errorBody = { error: `Ошибка ${response.status}` };
                 try { errorBody = await response.json(); } catch (e) { }
                 throw new Error(`Ошибка отправки: ${ (errorBody as any)?.detail || (errorBody as any)?.error || JSON.stringify(errorBody)}`);
            }
            if (!response.body) throw new Error('Нет тела ответа для стриминга.');

            sseReader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';
            let accumulatedThoughts = '';
            let finalMessageId: string | null = null;

            while (true) {
                const { value, done } = await sseReader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) >= 0) {
                    const messageChunk = buffer.substring(0, boundaryIndex);
                    buffer = buffer.substring(boundaryIndex + 2);
                    if (messageChunk.startsWith('data:')) {
                        try {
                            const data = JSON.parse(messageChunk.substring(5).trim());
                            if (data.error) throw new Error(data.error);
                            if (data.message_id) finalMessageId = String(data.message_id);
                            if (data.content) accumulatedContent += data.content;
                            if (data.thoughts) accumulatedThoughts += data.thoughts;
                            setMessages(prev => prev.map(msg =>
                                msg.tempId === tempBotId ? { ...msg, content: accumulatedContent, thoughts: accumulatedThoughts || msg.thoughts } : msg
                            ));
                        } catch (e: any) {
                             console.error('Ошибка парсинга SSE:', e, 'Chunk:', messageChunk);
                             setMessages(prev => prev.map(msg =>
                                 msg.tempId === tempBotId ? { ...msg, content: `${msg.content || ''}\n\n<span class="${styles.errorMessageInline}">**Ошибка обработки ответа**</span>`, isStreaming: false, thoughts: null } : msg
                             ));
                             if(sseReader) await sseReader.cancel().catch(e=>console.error("Err cancel:",e));
                             throw e;
                        }
                    }
                }
            } // end while(reader)

            // Обновляем финальное сообщение
            setMessages(prev => prev.map(msg =>
                msg.tempId === tempBotId
                 ? { ...msg,
                     id: finalMessageId || msg.id, // Обновляем ID если он пришел
                     isStreaming: false, // Завершаем стрим
                     // Убираем tempId после завершения
                     tempId: undefined
                   }
                 : msg
            ));
            // Перезагружаем чаты для обновления last_message
             await fetchChats();

        } catch (error: any) {
            console.error('Ошибка SSE:', error);
            setError(error.message || 'Ошибка соединения');
            setMessages(prev => prev.map(msg =>
                msg.tempId === tempBotId
                ? { ...msg, content: `<span class="${styles.errorMessageInline}">**Произошла ошибка**</span>`, isStreaming: false, thoughts: null, tempId: undefined }
                : msg
            ));
        } finally {
            setIsSendingMessage(false);
            if (sseReader && !sseReader.closed) {
                 try { await sseReader.cancel(); } catch (e) {console.error("Ошибка отмены ридера:", e)}
            }
        }
        // Зависимости: все состояния, которые используются внутри + token/API_BASE_URL
    }, [newMessageContent, token, currentChatId, currentModel, isSendingMessage, API_BASE_URL, user?.id, fetchChats, navigate]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    };

    // --- Рендеринг --- (JSX остается таким же, как в предыдущем ответе)
    return (
        <div className={styles.chatContainer}>
            <div className={`${styles.sidebarOverlay} ${isSidebarOpen ? styles.active : ''}`} onClick={() => setIsSidebarOpen(false)} />
            <div className={`${styles.chatSidebar} ${isSidebarOpen ? styles.active : ''}`}>
                 <div className={styles.sidebarHeader}>
                     <button className={styles.newChatBtn} onClick={handleNewChat} disabled={isLoadingChats || isSendingMessage}>
                         {isLoadingChats ? 'Создание...' : 'Новый чат'}
                     </button>
                 </div>
                 <div className={styles.chatsList}>
                     {/* ... рендер списка чатов ... */}
                     {isLoadingChats && chats.length === 0 && <p>Загрузка...</p>}
                     {!isLoadingChats && chats.length === 0 && <p>Нет чатов.</p>}
                     {chats.map(chat => (
                         <div key={chat.id} className={`${styles.chatItem} ${chat.id === currentChatId ? styles.active : ''}`} onClick={() => handleSelectChat(chat.id)}>
                             <div className={styles.chatTitle}>{escapeHtml(chat.title)}</div>
                             {chat.last_message && <div className={styles.chatPreview}>{escapeHtml(chat.last_message)}</div>}
                         </div>
                     ))}
                 </div>
                  <div className={styles.sidebarFooter}>
                     <button onClick={handleLogout} className={styles.logoutBtn}>Выйти</button>
                  </div>
            </div>

            <div className={styles.chatMain}>
                <div className={styles.chatHeader}>
                    <button className={styles.toggleSidebarBtn} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
                    <div className={styles.userProfile}>
                        <span>{user?.name || '...'}</span>
                        <select id="modelSelect" className={styles.modelSelect} value={currentModel || ''} onChange={handleModelChange} disabled={isLoadingModels || !currentChatId || isSendingMessage}>
                            {isLoadingModels && <option value="">Загрузка...</option>}
                            {!isLoadingModels && models.length === 0 && <option value="">Нет моделей</option>}
                            {models.map(model => <option key={model.id} value={model.id}>{escapeHtml(model.name)}</option> )}
                        </select>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.themeToggle} title="Тема" onClick={handleThemeToggle}> {theme === 'light' ? '🌙' : '☀️'} </button>
                        <button className={styles.resetChatBtn} title="Сбросить" onClick={handleResetChat} disabled={!currentChatId || isSendingMessage}> 🔄 </button>
                    </div>
                </div>

                <div className={styles.messagesContainer} ref={messagesContainerRef}>
                    {error && <div className={styles.errorMessage}>{error}</div>}
                    {/* ... информационные сообщения ... */}
                    {!currentChatId && !isLoadingChats && chats.length > 0 && <p className={styles.infoMessage}>Выберите чат.</p>}
                    {isLoadingMessages && <p className={styles.infoMessage}>Загрузка...</p>}
                    {!isLoadingMessages && messages.length === 0 && currentChatId && <p className={styles.infoMessage}>Нет сообщений.</p>}

                    {messages.map((msg) => (
                        <div key={msg.id} className={`${styles.message} ${msg.is_bot ? styles.ai : styles.user}`}>
                            {msg.is_bot && <div className={styles.messageAvatar}>🤖</div>}
                            <div className={styles.messageContent}>
                                {/* ... рендер размышлений ... */}
                                {msg.thoughts && (
                                    <div className={styles.thoughtsContainer}>
                                        <div className={styles.thoughtsHeader} onClick={() => handleToggleThoughts(msg.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleThoughts(msg.id); }}>
                                            🤔 {thoughtsVisibility[msg.id] ? 'Скрыть' : 'Показать'} размышления
                                            <span className={styles.thinkingTime}> {msg.thinkingSeconds !== undefined && `${msg.thinkingSeconds}s`} </span>
                                        </div>
                                        {thoughtsVisibility[msg.id] && (
                                             <div className={styles.thoughtsContent} key={`${msg.id}-thoughts`} dangerouslySetInnerHTML={{ __html: marked.parse(msg.thoughts) }} />
                                        )}
                                    </div>
                                )}
                                {/* ... рендер основного контента ... */}
                                {msg.content ? (
                                    <div className={styles.messageText} key={`${msg.id}-content`} dangerouslySetInnerHTML={{ __html: msg.is_bot ? marked.parse(msg.content) : `<p>${escapeHtml(msg.content)}</p>` }} />
                                ) : ( msg.is_bot && msg.isStreaming && <div className={styles.typingIndicator}> <span/><span/><span/> </div> )
                                }
                                {/* ... рендер времени ... */}
                                <div className={styles.messageTime}> {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} </div>
                            </div>
                            {!msg.is_bot && <div className={styles.messageAvatar}>👤</div>}
                        </div>
                    ))}
                    <div ref={messagesEndRef} style={{ height: '1px' }} />
                </div>

                <div className={styles.inputContainer}>
                    <form onSubmit={handleSendMessage}>
                        {/* ... поле ввода и кнопки ... */}
                         <textarea ref={textareaRef} placeholder={currentChatId ? "Введите сообщение..." : "Выберите чат"} rows={1} maxLength={2000} value={newMessageContent} onChange={(e) => setNewMessageContent(e.target.value)} onKeyDown={handleKeyDown} disabled={!currentChatId || isSendingMessage} />
                        <div className={styles.inputActions}>
                            <button type="button" className={styles.attachBtn} title="Прикрепить" disabled>📎</button>
                            <button type="submit" className={styles.sendBtn} title="Отправить" disabled={!currentChatId || !newMessageContent.trim() || isSendingMessage}> {isSendingMessage ? '...' : '➤'} </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default ChatPage;