// src/pages/ChatPage/ChatPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ChatPage.module.css';
// Marked и hljs используются внутри MessageItem
// import { marked } from 'marked';
// import hljs from 'highlight.js';

// Импортируем компонент для отображения сообщений
import MessageItem from '../../components/MessageItem/MessageItem';

// --- Типизация --- (Такая же, как использовалась в MessageItem)
interface User { id: string | number; name: string; email: string; }
interface Chat { id: string; title: string; last_message?: string; }
interface Model { id: string; name: string; }
interface Message {
    id: string;
    tempId?: string; // Временный ID для отслеживания плейсхолдера
    content: string; // Целевой контент
    is_bot: boolean;
    created_at: string;
    thoughts?: string | null;
    isStreaming?: boolean; // Флаг для MessageItem
    thinkingSeconds?: number; // Управляется таймером в ChatPage
    chat_id?: string;
    user_id?: string | number;
}

// --- Вспомогательная функция ---
function escapeHtml(text: string | undefined | null): string {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Основной Компонент ===
function ChatPage() {
    const navigate = useNavigate();

    // --- Состояния ---
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

    // --- Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Ref для таймеров размышлений (остается здесь)
    const thinkingTimersRef = useRef<{ [id: string]: number }>({});

    // --- URL и токен ---
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = localStorage.getItem('token');

    // --- Функция fetch (базовая) ---
    const baseFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
        const url = `${API_BASE_URL}${endpoint}`;
        // console.log(`Запрос: ${options.method || 'GET'} ${url}`);
        if (!token) { console.error("Нет токена"); navigate('/auth'); throw new Error("Нет токена"); }

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json', 'Accept': 'application/json', ...options.headers,
                },
            });
            // console.log(`Ответ: ${url} Статус ${response.status}`);
            if (response.status === 401) { console.error("401"); localStorage.clear(); navigate('/auth'); throw new Error("Unauthorized"); }
            if (!response.ok) {
                let errorData = { error: `Ошибка ${response.status}` }; try { errorData = await response.json(); } catch (e) { }
                const detail = (errorData as any)?.detail || (errorData as any)?.error || JSON.stringify(errorData);
                throw new Error(`Ошибка: ${detail}`);
            }
            if (response.status === 204 || options.method === 'HEAD') return null;
            return await response.json();
        } catch (err: any) {
            console.error(`Ошибка fetch к ${url}:`, err);
            // Пробрасываем оригинальную ошибку, чтобы вызывающая функция могла ее обработать
            throw err;
        }
    }, [token, navigate, API_BASE_URL]);

    // --- Функции Загрузки Данных ---
    const fetchModels = useCallback(async () => {
        if (isLoadingModels) return; setIsLoadingModels(true); setError(null);
        try {
            const data = await baseFetch(`/api/models`);
            if (data?.models?.length > 0) {
                setModels(data.models); setCurrentModel(prev => prev ?? data.models[0].id);
            } else { setModels([]); }
        } catch (err: any) { setError(err.message); setModels([]); }
        finally { setIsLoadingModels(false); }
    }, [baseFetch, isLoadingModels]); // Убрали currentModel, чтобы не перезапрашивать при его установке

    const fetchChats = useCallback(async () => {
        if (isLoadingChats) return; setIsLoadingChats(true); setError(null);
        try {
            const data: Chat[] = await baseFetch(`/api/chats`);
            setChats(data || []);
            if (!data || data.length === 0) {
                setCurrentChatId(null); setMessages([]);
            }
        } catch (err: any) { setError(err.message); setChats([]); }
        finally { setIsLoadingChats(false); }
    }, [baseFetch, isLoadingChats]);

    const fetchMessages = useCallback(async (chatId: string) => {
        if (!chatId || isLoadingMessages) return; setIsLoadingMessages(true); setError(null); setMessages([]);
        try {
            const data: Message[] = await baseFetch(`/api/chats/${chatId}/messages`);
            const messagesWithTime = (data || []).map(msg => ({
                ...msg, id: String(msg.id), thinkingSeconds: msg.thoughts ? 0 : undefined
            }));
            setMessages(messagesWithTime);
        } catch (err: any) { setError(err.message); setMessages([]); }
        finally { setIsLoadingMessages(false); }
    }, [baseFetch, isLoadingMessages]);

    // --- Эффекты ---
    useEffect(() => { /* Пользователь и токен */
        if (!token) { navigate('/auth'); return; }
        const storedUser = localStorage.getItem('user');
        if (storedUser) { try { setUser(JSON.parse(storedUser)); } catch { localStorage.clear(); navigate('/auth'); } }
        else { localStorage.clear(); navigate('/auth'); }
    }, [token, navigate]);

    useEffect(() => { /* Тема */ document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
    useEffect(() => { /* Первичная загрузка */ fetchModels(); fetchChats(); }, [fetchModels, fetchChats]);
    useEffect(() => { /* Загрузка сообщений */ if (currentChatId) { fetchMessages(currentChatId); setThoughtsVisibility({}); } else { setMessages([]); } }, [currentChatId, fetchMessages]);
    useEffect(() => { /* Автоскролл */ const t = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 100); return () => clearTimeout(t); }, [messages]);
    useEffect(() => { /* Авторесайз */ const ta = textareaRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`; } }, [newMessageContent]);

    // Эффект для таймера размышлений (остается здесь)
    useEffect(() => {
        const currentTimers = thinkingTimersRef.current;
        messages.forEach(msg => {
            // Запускаем таймер, если сообщение стримится, ЕСТЬ мысли, и таймер еще не запущен
            if (msg.isStreaming && msg.tempId && msg.thoughts && !(msg.tempId in currentTimers)) {
                const intervalId = window.setInterval(() => {
                    setMessages(prev => prev.map(m => m.tempId === msg.tempId ? { ...m, thinkingSeconds: (m.thinkingSeconds ?? 0) + 1 } : m));
                }, 1000);
                currentTimers[msg.tempId] = intervalId;
            }
        });
        // Очистка таймеров, которые больше не стримятся
        Object.keys(currentTimers).forEach(tempId => {
            if (!messages.some(m => m.tempId === tempId && m.isStreaming)) {
                clearInterval(currentTimers[tempId]);
                delete currentTimers[tempId];
            }
        });
        return () => { Object.values(currentTimers).forEach(clearInterval); thinkingTimersRef.current = {}; };
    }, [messages]); // Зависит только от messages

    // --- Обработчики событий ---
    const handleThemeToggle = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    const handleSelectChat = (chatId: string) => { if (chatId !== currentChatId) setCurrentChatId(chatId); setIsSidebarOpen(false); };
    const handleLogout = () => { localStorage.clear(); navigate('/auth'); };
    const handleToggleThoughts = (messageId: string) => setThoughtsVisibility(prev => ({ ...prev, [messageId]: !prev[messageId] }));

    const handleNewChat = useCallback(async () => {
        if (isLoadingChats || isSendingMessage) return; setIsLoadingChats(true);
        try {
            const newChat: Chat = await baseFetch(`/api/chats`, { method: 'POST', body: JSON.stringify({ title: 'Новый чат' }) });
            if (newChat) { await fetchChats(); setCurrentChatId(newChat.id); setIsSidebarOpen(false); setError(null); }
        } catch (err: any) { setError(err.message); } finally { setIsLoadingChats(false); }
    }, [baseFetch, fetchChats, isLoadingChats, isSendingMessage]);

    const handleModelChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newModelId = event.target.value;
        if (!currentChatId || newModelId === currentModel) return;
        const previousModel = currentModel; setCurrentModel(newModelId);
        try {
            await baseFetch(`/api/chats/${currentChatId}/model`, { method: 'POST', body: JSON.stringify({ model: newModelId }) });
            const modelName = models.find(m => m.id === newModelId)?.name || 'новую';
            const systemMessage: Message = { id: `system-${Date.now()}`, content: `Модель изменена на ${modelName}.`, is_bot: true, created_at: new Date().toISOString(), chat_id: currentChatId };
            setMessages(prev => [...prev, systemMessage]); setError(null);
        } catch (err: any) { setError(err.message); setCurrentModel(previousModel); }
    }, [baseFetch, currentChatId, currentModel, models]);

     const handleResetChat = useCallback(async () => {
         if (!currentChatId || !window.confirm('Сбросить контекст?')) return;
         try {
             await baseFetch(`/api/chats/${currentChatId}/reset`, { method: 'POST' });
             const systemMessage: Message = { id: `system-${Date.now()}`, content: 'Контекст чата сброшен.', is_bot: true, created_at: new Date().toISOString(), chat_id: currentChatId };
             setMessages(prev => [...prev, systemMessage]); setError(null);
         } catch (err: any) { setError(err.message); }
     }, [baseFetch, currentChatId]);

    // --- Отправка Сообщения (SSE) ---
    const handleSendMessage = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const content = newMessageContent.trim();
        if (!token || !currentChatId || !content || isSendingMessage) return;

        setIsSendingMessage(true); setError(null);

        const userMessage: Message = { id: `user-${Date.now()}`, content: content, is_bot: false, created_at: new Date().toISOString(), chat_id: currentChatId, user_id: user?.id };
        setMessages(prev => [...prev, userMessage]);
        setNewMessageContent('');

        const tempBotId = `bot-${Date.now()}`;
        const botPlaceholder: Message = {
            id: tempBotId, tempId: tempBotId, content: '', // Начинаем с пустого контента
            is_bot: true, created_at: new Date().toISOString(), chat_id: currentChatId,
            isStreaming: true, // Важно для MessageItem
            thinkingSeconds: undefined, // Начнет считаться, если придут мысли
        };
        setMessages(prev => [...prev, botPlaceholder]);

        let sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        const url = `${API_BASE_URL}/api/chats/${currentChatId}/messages`;
        console.log(`SSE Запрос: POST ${url}`);

        try {
            const response = await fetch(url, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                body: JSON.stringify({ content: content, model_id: currentModel })
            });
            console.log(`SSE Ответ: Статус ${response.status}`);

            if (response.status === 401) { localStorage.clear(); navigate('/auth'); throw new Error("Unauthorized"); }
            if (!response.ok) { let eB = { error: `Err ${response.status}` }; try { eB = await response.json(); } catch (e) { } throw new Error(`Ошибка: ${(eB as any)?.detail || (eB as any)?.error}`); }
            if (!response.body) throw new Error('Нет тела ответа.');

            sseReader = response.body.getReader(); const decoder = new TextDecoder();
            let buffer = ''; let accumulatedContent = ''; let accumulatedThoughts = ''; let finalMessageId: string | null = null;

            while (true) {
                const { value, done } = await sseReader.read(); if (done) break;
                buffer += decoder.decode(value, { stream: true }); let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) >= 0) {
                    const messageChunk = buffer.substring(0, boundaryIndex); buffer = buffer.substring(boundaryIndex + 2);
                    if (messageChunk.startsWith('data:')) {
                        try {
                            const data = JSON.parse(messageChunk.substring(5).trim());
                            if (data.error) throw new Error(data.error);
                            if (data.message_id) finalMessageId = String(data.message_id);
                            let contentChanged = false; let thoughtsChanged = false;
                            if (data.content) { accumulatedContent += data.content; contentChanged = true; }
                            if (data.thoughts) { accumulatedThoughts += data.thoughts; thoughtsChanged = true; }

                            if (contentChanged || thoughtsChanged) {
                                // Обновляем только целевой контент/мысли и секунды (если мысли появились)
                                setMessages(prev => prev.map(msg =>
                                    msg.tempId === tempBotId
                                     ? { ...msg,
                                         content: accumulatedContent,
                                         thoughts: accumulatedThoughts || msg.thoughts, // Используем накопленные или предыдущие
                                         thinkingSeconds: msg.thinkingSeconds ?? (accumulatedThoughts ? 0 : undefined)
                                       }
                                     : msg
                                ));
                            }
                        } catch (e: any) { /* ... обработка ошибок парсинга ... */ throw e; }
                    }
                }
            } // end while(reader)

            setMessages(prev => prev.map(msg => msg.tempId === tempBotId ? { ...msg, id: finalMessageId || msg.id, isStreaming: false, tempId: undefined, content: accumulatedContent, thoughts: accumulatedThoughts || null } : msg ));
            await fetchChats(); // Обновить список чатов

        } catch (error: any) {
            console.error('Ошибка SSE:', error); setError(error.message || 'Ошибка соединения');
            setMessages(prev => prev.map(msg => msg.tempId === tempBotId ? { ...msg, content: `<span class="${styles.errorMessageInline}">**Произошла ошибка**</span>`, isStreaming: false, thoughts: null, tempId: undefined } : msg ));
        } finally {
            setIsSendingMessage(false); if (sseReader && !sseReader.closed) { try { await sseReader.cancel(); } catch (e) {} }
        }
    }, [newMessageContent, token, currentChatId, currentModel, isSendingMessage, API_BASE_URL, user?.id, fetchChats, navigate]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(); } };

    // --- Рендеринг ---
    return (
        <div className={styles.chatContainer}>
            {/* Оверлей и Сайдбар */}
            <div className={`${styles.sidebarOverlay} ${isSidebarOpen ? styles.active : ''}`} onClick={() => setIsSidebarOpen(false)} />
            <div className={`${styles.chatSidebar} ${isSidebarOpen ? styles.active : ''}`}>
                <div className={styles.sidebarHeader}>
                    <button className={styles.newChatBtn} onClick={handleNewChat} disabled={isLoadingChats || isSendingMessage}>
                        {isLoadingChats ? '...' : 'Новый чат'}
                    </button>
                </div>
                <div className={styles.chatsList}>
                    {isLoadingChats && !chats.length && <p>Загрузка...</p>}
                    {!isLoadingChats && !chats.length && <p>Нет чатов.</p>}
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

            {/* Основная область чата */}
            <div className={styles.chatMain}>
                {/* Хедер */}
                <div className={styles.chatHeader}>
                    <button className={styles.toggleSidebarBtn} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
                    <div className={styles.userProfile}>
                        <span>{user?.name || '...'}</span>
                        <select id="modelSelect" className={styles.modelSelect} value={currentModel || ''} onChange={handleModelChange} disabled={isLoadingModels || !currentChatId || isSendingMessage}>
                            {isLoadingModels && <option value="">...</option>}
                            {!isLoadingModels && models.length === 0 && <option value="">Нет</option>}
                            {models.map(model => <option key={model.id} value={model.id}>{escapeHtml(model.name)}</option> )}
                        </select>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.themeToggle} title="Тема" onClick={handleThemeToggle}> {theme === 'light' ? '🌙' : '☀️'} </button>
                        <button className={styles.resetChatBtn} title="Сбросить" onClick={handleResetChat} disabled={!currentChatId || isSendingMessage}> 🔄 </button>
                    </div>
                </div>

                {/* Сообщения */}
                <div className={styles.messagesContainer}>
                    {error && <div className={styles.errorMessage}>{error}</div>}
                    {!currentChatId && !isLoadingChats && chats.length > 0 && <p className={styles.infoMessage}>Выберите чат.</p>}
                    {isLoadingMessages && <p className={styles.infoMessage}>Загрузка...</p>}
                    {!isLoadingMessages && messages.length === 0 && currentChatId && <p className={styles.infoMessage}>Нет сообщений.</p>}

                    {messages.map((msg) => (
                        <MessageItem
                            key={msg.id} // Ключ по финальному или временному ID
                            message={msg}
                            isThoughtsVisible={!!thoughtsVisibility[msg.id]}
                            onToggleThoughts={handleToggleThoughts}
                        />
                    ))}
                    <div ref={messagesEndRef} style={{ height: '1px' }} />
                </div>

                {/* Поле ввода */}
                <div className={styles.inputContainer}>
                    <form onSubmit={handleSendMessage}>
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