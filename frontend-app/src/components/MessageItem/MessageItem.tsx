// src/components/MessageItem/MessageItem.tsx
import React, { useState, useEffect, useRef, memo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import styles from '../../pages/ChatPage/ChatPage.module.css'; // Используем стили из ChatPage

// --- Типизация ---
// Скопируйте или импортируйте интерфейс Message из ChatPage.tsx
interface Message {
    id: string;
    tempId?: string;
    content: string; // Теперь это ЦЕЛЕВОЙ контент
    is_bot: boolean;
    created_at: string;
    thoughts?: string | null;
    isStreaming?: boolean;
    thinkingSeconds?: number;
    // Добавим опциональный callback для завершения подсветки
    onHighlightComplete?: (element: HTMLDivElement) => void;
}

interface MessageItemProps {
    message: Message;
    isThoughtsVisible: boolean;
    onToggleThoughts: (id: string) => void;
}

const TYPING_SPEED_MS = 25; // Скорость печати (мс на символ), настройте по желанию

// Используем memo для оптимизации, чтобы перерисовывать только при изменении props
const MessageItem: React.FC<MessageItemProps> = memo(({ message, isThoughtsVisible, onToggleThoughts }) => {
    const [displayedContent, setDisplayedContent] = useState('');
    const [displayedThoughts, setDisplayedThoughts] = useState(''); // Для мыслей тоже можно
    const contentRef = useRef<HTMLDivElement>(null); // Ref для контента сообщения
    const thoughtsContentRef = useRef<HTMLDivElement>(null); // Ref для контента мыслей
    const isTypewriterDone = useRef(false); // Флаг завершения печати основного контента

    // --- Эффект пишущей машинки для основного контента ---
    useEffect(() => {
        // Сбрасываем при смене сообщения или если оно перестало стримиться и еще не отображено полностью
        if (!message.isStreaming && message.content !== displayedContent) {
            setDisplayedContent(message.content);
            isTypewriterDone.current = true; // Помечаем, что сразу показали всё
            return; // Выходим, интервал не нужен
        }
        // Если не стримится и уже отображено, ничего не делаем
        if (!message.isStreaming && isTypewriterDone.current) {
            return;
        }
        // Если не бот, показываем сразу
        if (!message.is_bot) {
            setDisplayedContent(message.content);
            isTypewriterDone.current = true;
            return;
        }

        // --- Логика интервала ---
        isTypewriterDone.current = false; // Сбрасываем флаг при начале стриминга
        let charIndex = displayedContent.length; // Начинаем с текущей длины

        const intervalId = setInterval(() => {
            // Если целевой контент стал доступен и мы еще не все напечатали
            if (charIndex < message.content.length) {
                setDisplayedContent((prev) => message.content.substring(0, charIndex + 1));
                charIndex++;
            } else {
                // Если достигли конца И стриминг завершен
                if (!message.isStreaming) {
                    clearInterval(intervalId);
                    isTypewriterDone.current = true; // Помечаем завершение
                    console.log(`Typewriter done for message ${message.id}`);
                }
                // Если достигли конца, но стриминг еще идет, просто ждем новых данных (charIndex не увеличивается)
            }
        }, TYPING_SPEED_MS);

        // Очистка интервала
        return () => clearInterval(intervalId);

    }, [message.content, message.is_bot, message.isStreaming, message.id]); // Зависим от целевого контента и статуса стриминга

    // --- Эффект для "печати" размышлений (опционально, можно показывать сразу) ---
     useEffect(() => {
         // Показываем мысли сразу или можно добавить аналогичный typewriter
         if (message.thoughts && message.thoughts !== displayedThoughts) {
              setDisplayedThoughts(message.thoughts);
         } else if (!message.thoughts) {
             setDisplayedThoughts('');
         }
     }, [message.thoughts, displayedThoughts]);


    // --- Эффект для подсветки кода ПОСЛЕ завершения печати ---
    useEffect(() => {
        // Подсветка основного контента
        if (contentRef.current && isTypewriterDone.current) {
            contentRef.current.querySelectorAll<HTMLElement>('pre code:not(.hljs-highlighted)')
                .forEach((block) => {
                    try { hljs.highlightElement(block); block.classList.add('hljs-highlighted'); }
                    catch (e) { console.error("Ошибка подсветки:", e, block); }
                });
             // Обработка ссылок
             contentRef.current.querySelectorAll('a:not([target])')
                 .forEach(link => { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); });
        }
        // Подсветка размышлений (если они видимы и есть)
        if (thoughtsContentRef.current && isThoughtsVisible && displayedThoughts) {
             thoughtsContentRef.current.querySelectorAll<HTMLElement>('pre code:not(.hljs-highlighted)')
                .forEach((block) => {
                    try { hljs.highlightElement(block); block.classList.add('hljs-highlighted'); }
                    catch (e) { console.error("Ошибка подсветки мыслей:", e, block); }
                });
             thoughtsContentRef.current.querySelectorAll('a:not([target])')
                 .forEach(link => { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); });
        }
        // Зависит от отображенного контента, статуса завершения печати и видимости мыслей
    }, [displayedContent, displayedThoughts, isTypewriterDone, isThoughtsVisible]);


    // --- Парсинг Markdown ---
    // Используем useMemo для кэширования результата парсинга
    const parsedContentHtml = React.useMemo(() => {
        if (!message.is_bot) {
            return `<p>${escapeHtml(displayedContent)}</p>`; // Пользовательский текст просто экранируем
        }
         // Для бота парсим Markdown, даже если он не полностью напечатан
         // Примечание: парсинг неполного Markdown может давать странные результаты для разметки,
         // но для простого текста и кода обычно работает нормально.
         // Альтернатива: парсить только когда isTypewriterDone.current === true.
         return marked.parse(displayedContent || '');
    }, [displayedContent, message.is_bot]);

    const parsedThoughtsHtml = React.useMemo(() => {
        return message.thoughts ? marked.parse(displayedThoughts || '') : '';
    }, [displayedThoughts, message.thoughts]);


    return (
        <div className={`${styles.message} ${message.is_bot ? styles.ai : styles.user}`}>
            {message.is_bot && <div className={styles.messageAvatar}>🤖</div>}
            <div className={styles.messageContent}>
                {/* Блок Размышлений */}
                {message.thoughts && (
                    <div className={styles.thoughtsContainer}>
                        <div
                            className={styles.thoughtsHeader}
                            onClick={() => onToggleThoughts(message.id)}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleThoughts(message.id); }}
                        >
                            🤔 {isThoughtsVisible ? 'Скрыть' : 'Показать'} размышления
                            <span className={styles.thinkingTime}>
                                {message.thinkingSeconds !== undefined && `${message.thinkingSeconds}s`}
                            </span>
                        </div>
                        {isThoughtsVisible && (
                             <div
                                ref={thoughtsContentRef} // Добавляем ref
                                className={styles.thoughtsContent}
                                key={`${message.id}-thoughts-content`} // Ключ для сброса состояния подсветки
                                dangerouslySetInnerHTML={{ __html: parsedThoughtsHtml }}
                            />
                        )}
                    </div>
                )}

                {/* Основной Контент Сообщения */}
                {/* Используем displayedContent */}
                {(displayedContent || (message.is_bot && message.isStreaming && displayedContent === '')) ? ( // Показываем, если есть контент ИЛИ если это стриминг бота без контента (для индикатора)
                    <div
                        ref={contentRef} // Добавляем ref
                        className={styles.messageText}
                        key={`${message.id}-content`} // Ключ для сброса состояния подсветки
                        dangerouslySetInnerHTML={{ __html: parsedContentHtml }}
                    />
                ) : ( message.is_bot && message.isStreaming && // Индикатор только если контента еще нет
                    <div className={styles.typingIndicator}> <span/><span/><span/> </div>
                )}

                <div className={styles.messageTime}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
            {!message.is_bot && <div className={styles.messageAvatar}>👤</div>}
        </div>
    );
});

export default MessageItem;