import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom'; // Для внутренних ссылок SPA
import styles from './HomePage.module.css';

// Импорт иконок Font Awesome или других, если используются в футере
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import { faTwitter, faFacebook, faLinkedin } from '@fortawesome/free-brands-svg-icons'

function HomePage() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null); // Ref для параллакса

    // --- Логика из main.js ---

    // 1. Плавная прокрутка к секциям
    const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
        // Для SPA, если секции на той же странице, используем scrollIntoView
        // Если это Link на другую страницу, React Router сделает свое дело
        if (targetId.startsWith('#')) {
            event.preventDefault();
            const targetElement = document.getElementById(targetId.substring(1));
            targetElement?.scrollIntoView({ behavior: 'smooth' });
            setIsMobileMenuOpen(false); // Закрыть меню при клике
        }
        // Если href не начинается с #, это будет обычная ссылка или Link,
        // и стандартное поведение или React Router сработают.
    };

    // 2. Переключение мобильного меню
    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    // 3. Анимация появления при скролле (Intersection Observer)
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add(styles.fadeIn || 'fade-in'); // Используем класс из модуля или глобальный
                    }
                    // Можно добавить else { entry.target.classList.remove(...) } для повторной анимации
                });
            },
            { threshold: 0.1 } // Порог срабатывания (10% элемента видно)
        );

        // Наблюдаем за элементами. Используем querySelectorAll для поиска внутри HomePage
        const elementsToObserve = document.querySelectorAll(
            `.${styles.featureCard}, .${styles.priceCard}, .${styles.aboutContent}`
        );
        elementsToObserve.forEach((el) => observer.observe(el));

        // Очистка при размонтировании компонента
        return () => elementsToObserve.forEach((el) => observer.unobserve(el));
    }, []); // Пустой массив зависимостей - запустить один раз

    // 4. Параллакс эффект (оптимизированный)
    useEffect(() => {
        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const heroElement = heroRef.current; // Используем ref
                    if (heroElement) {
                         const scrolled = window.pageYOffset;
                         // Ограничиваем эффект только в пределах видимости viewport, чтобы не двигать бесконечно
                         if (scrolled < window.innerHeight * 1.5) { // Увеличим немного диапазон
                             // Уменьшим коэффициент для менее выраженного эффекта
                             heroElement.style.transform = `translateY(${scrolled * 0.2}px)`;
                         }
                    }
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true }); // passive: true для производительности

        // Очистка слушателя при размонтировании
        return () => window.removeEventListener('scroll', handleScroll);
    }, []); // Пустой массив зависимостей

    // 5. Валидация формы контактов
    const [contactName, setContactName] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactMessage, setContactMessage] = useState('');
    const [contactError, setContactError] = useState('');
    const [contactSuccess, setContactSuccess] = useState('');
    const [contactLoading, setContactLoading] = useState(false);

    const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setContactError('');
        setContactSuccess('');
        if (contactLoading) return;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!contactName || !contactEmail || !contactMessage) {
            setContactError('Пожалуйста, заполните все поля.'); return;
        }
        if (!emailRegex.test(contactEmail)) {
            setContactError('Пожалуйста, введите корректный email.'); return;
        }

        setContactLoading(true);
        // --- Здесь логика отправки формы на бэкенд ---
        // Пример с использованием fetch (замените URL и метод)
        try {
             console.log('Отправка формы:', { name: contactName, email: contactEmail, message: contactMessage });
             // const response = await fetch('/api/contact', {
             //     method: 'POST',
             //     headers: { 'Content-Type': 'application/json' },
             //     body: JSON.stringify({ name: contactName, email: contactEmail, message: contactMessage })
             // });
             // if (!response.ok) throw new Error('Ошибка отправки формы');
             // const result = await response.json();

             // Имитация успешной отправки
             await new Promise(resolve => setTimeout(resolve, 1000));

             setContactSuccess('Спасибо за сообщение! Мы свяжемся с вами в ближайшее время.');
             // Очистка формы
             setContactName('');
             setContactEmail('');
             setContactMessage('');
         } catch (err: any) {
             setContactError(err.message || 'Не удалось отправить сообщение.');
         } finally {
             setContactLoading(false);
         }
    };

    return (
        <> {/* Используем фрагмент, так как у страницы нет единого корневого элемента */}
            <header className={styles.header}>
                {/* Навигация */}
                <nav className={styles.nav}>
                    <div className={styles.logo}>BeykuSay</div>
                    {/* Кнопка бургер-меню */}
                    <button className={styles.mobileMenuButton} onClick={toggleMobileMenu}>
                        ☰
                    </button>
                    {/* Ссылки навигации */}
                    <ul className={`${styles.navLinks} ${isMobileMenuOpen ? styles.active : ''}`}>
                        <li><a href="#features" onClick={(e) => handleNavClick(e, '#features')}>Возможности</a></li>
                        <li><a href="#about" onClick={(e) => handleNavClick(e, '#about')}>О нас</a></li>
                        <li><a href="#pricing" onClick={(e) => handleNavClick(e, '#pricing')}>Тарифы</a></li>
                        <li><a href="#contact" onClick={(e) => handleNavClick(e, '#contact')}>Контакты</a></li>
                        {/* Ссылка на авторизацию через React Router */}
                        <li><Link to="/auth">Войти</Link></li>
                    </ul>
                </nav>
                {/* Секция Hero */}
                <div className={styles.hero} ref={heroRef}> {/* Добавляем ref */}
                    <h1>Откройте новые возможности с BeykuSay</h1>
                    <p>Интеллектуальный ассистент на базе ИИ для решения ваших задач</p>
                    {/* Используем Link для перехода на страницу авторизации */}
                    <Link to="/auth" className={styles.ctaButton}>Попробовать бесплатно</Link>
                </div>
            </header>

            {/* Секция Возможности */}
            <section id="features" className={styles.features}>
            <h2 className={styles.sectionTitle}>Возможности</h2>
                <div className={styles.featuresGrid}>
                    <div className={styles.featureCard}>
                        <i className={styles.featureIcon}>🤖</i>
                        <h3>Умный диалог</h3>
                        <p>Естественное общение и понимание контекста</p>
                    </div>
                    <div className={styles.featureCard}>
                        <i className={styles.featureIcon}>📊</i>
                        <h3>Анализ данных</h3>
                        <p>Быстрая обработка и анализ информации</p>
                    </div>
                    <div className={styles.featureCard}>
                        <i className={styles.featureIcon}>🔒</i>
                        <h3>Безопасность</h3>
                        <p>Защита данных на высшем уровне</p>
                    </div>
                </div>
            </section>

            {/* Секция О нас */}
            <section id="about" className={styles.about}>
                <div className={styles.aboutContent}>
                <h2 className={styles.sectionTitle}>О нас</h2>
                    <p>BeykuSay - это передовое ИИ-решение, созданное для помощи в решении повседневных задач. Наша миссия - сделать искусственный интеллект доступным каждому.</p>
                </div>
            </section>

            {/* Секция Тарифы */}
            <section id="pricing" className={styles.pricing}>
            <h2 className={styles.sectionTitle}>Тарифы</h2>
                <div className={styles.pricingCards}>
                    <div className={styles.priceCard}>
                        <h3>Базовый</h3>
                        <p className={styles.price}>₽999/мес</p>
                        <ul>
                            <li>Базовые функции</li>
                            <li>5 запросов в день</li>
                            <li>Базовая поддержка</li>
                        </ul>
                        {/* Кнопки могут вести на страницу регистрации или оплаты */}
                        <Link to="/auth" className={styles.secondaryButton}>Выбрать</Link>
                    </div>
                    <div className={`${styles.priceCard} ${styles.featured}`}>
                        <h3>Про</h3>
                        <p className={styles.price}>₽2499/мес</p>
                        <ul>
                            <li>Все базовые функции</li>
                            <li>Неограниченные запросы</li>
                            <li>Приоритетная поддержка</li>
                        </ul>
                        <Link to="/auth" className={styles.primaryButton}>Выбрать</Link>
                    </div>
                     {/* Можно добавить еще тарифы */}
                </div>
            </section>

            {/* Секция Контакты */}
            <section id="contact" className={styles.contact}>
                <h2>Свяжитесь с нами</h2>
                <form className={styles.contactForm} onSubmit={handleContactSubmit}>
                     {contactError && <p style={{ color: 'red' }}>{contactError}</p>}
                     {contactSuccess && <p style={{ color: 'green' }}>{contactSuccess}</p>}
                    <input type="text" placeholder="Ваше имя" required
                           value={contactName} onChange={e => setContactName(e.target.value)}
                           disabled={contactLoading}/>
                    <input type="email" placeholder="Email" required autoComplete="email"
                           value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                           disabled={contactLoading}/>
                    <textarea placeholder="Сообщение" required
                              value={contactMessage} onChange={e => setContactMessage(e.target.value)}
                              disabled={contactLoading}></textarea>
                    <button type="submit" className={styles.submitButton} disabled={contactLoading}>
                        {contactLoading ? 'Отправка...' : 'Отправить'}
                    </button>
                </form>
            </section>

            {/* Футер */}
            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <div className={styles.footerLogo}>BeykuSay</div>
                    <div className={styles.footerLinks}>
                        {/* Замените # на реальные пути или обработчики */}
                        <a href="#">Политика конфиденциальности</a>
                        <a href="#">Условия использования</a>
                    </div>
                    <div className={styles.socialLinks}>
                        {/* Замените # на реальные ссылки */}
                        {/* Иконки лучше вставить как SVG или использовать библиотеку */}
                        <a href="#" aria-label="Twitter"><i className="fab fa-twitter"></i></a>
                        <a href="#" aria-label="Facebook"><i className="fab fa-facebook"></i></a>
                        <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin"></i></a>
                    </div>
                </div>
            </footer>
        </>
    );
}

export default HomePage;