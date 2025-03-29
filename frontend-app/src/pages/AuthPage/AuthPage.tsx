import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Импортируем useNavigate
import styles from './AuthPage.module.css';

// Импортируем иконки (путь зависит от вашей структуры)
import googleIcon from '../../assets/google-icon.svg';
import githubIcon from '../../assets/github-icon.svg';

function AuthPage() {
    const navigate = useNavigate(); // Инициализируем хук навигации
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [registerName, setRegisterName] = useState('');
    const [registerEmail, setRegisterEmail] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false); // Состояние для "Запомнить меня"
    const [termsAccepted, setTermsAccepted] = useState(false); // Состояние для "Условий"
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false); // Состояние загрузки

    const handleTabClick = (tab: 'login' | 'register') => {
        setActiveTab(tab);
        setError(null);
        // Сброс полей при смене вкладки
        setLoginEmail(''); setLoginPassword('');
        setRegisterName(''); setRegisterEmail(''); setRegisterPassword(''); setConfirmPassword('');
    };

    const togglePasswordVisibility = (inputId: string) => {
        setShowPassword(prev => ({ ...prev, [inputId]: !prev[inputId] }));
    };

    function validateEmail(email: string): boolean {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        if (loading) return; // Не отправлять, если уже идет загрузка

        if (!validateEmail(loginEmail)) {
            setError('Пожалуйста, введите корректный email'); return;
        }
        if (loginPassword.length < 6) {
            setError('Пароль должен содержать минимум 6 символов'); return;
        }

        setLoading(true); // Начинаем загрузку
        const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
        console.log("Submitting login to:", `${BASE_URL}/api/login`);

        try {
            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: loginEmail, password: loginPassword })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Ошибка входа');
            }
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            // TODO: Если 'rememberMe', использовать localStorage, иначе sessionStorage?
            // Для простоты пока используем localStorage всегда.
            navigate('/chat'); // Перенаправляем на чат после успешного входа
        } catch (err: any) {
            setError(err.message || 'Неизвестная ошибка входа');
        } finally {
            setLoading(false); // Заканчиваем загрузку
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        if (loading) return;

        if (!termsAccepted) {
             setError('Пожалуйста, примите условия использования'); return;
        }
        if (registerName.length < 2) {
             setError('Имя должно содержать минимум 2 символа'); return;
        }
        if (!validateEmail(registerEmail)) {
             setError('Пожалуйста, введите корректный email'); return;
        }
        if (registerPassword.length < 6) {
             setError('Пароль должен содержать минимум 6 символов'); return;
        }
        if (registerPassword !== confirmPassword) {
             setError('Пароли не совпадают'); return;
        }

        setLoading(true);
        const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
        console.log("Submitting registration to:", `${BASE_URL}/api/register`);

        try {
            const regResponse = await fetch(`${BASE_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: registerName, email: registerEmail, password: registerPassword })
            });
            const regData = await regResponse.json();
            if (!regResponse.ok) {
                throw new Error(regData.message || 'Ошибка регистрации');
            }

            // Автоматический вход
            const loginResponse = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registerEmail, password: registerPassword })
            });
            const loginData = await loginResponse.json();
            if (!loginResponse.ok) {
                // Успешная регистрация, но ошибка входа - сообщаем пользователю
                setError(`Регистрация прошла успешно, но войти не удалось: ${loginData.message || 'Ошибка входа'}. Попробуйте войти вручную.`);
                setActiveTab('login'); // Переключаем на вкладку входа
                // Не перенаправляем
                return; // Выходим из try-блока здесь
            }

            localStorage.setItem('token', loginData.token);
            localStorage.setItem('user', JSON.stringify(loginData.user));
            navigate('/chat'); // Перенаправляем на чат
        } catch (err: any) {
            setError(err.message || 'Неизвестная ошибка регистрации');
        } finally {
             setLoading(false);
        }
    };

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    return (
        <div className={styles.authPage}>
            <div className={styles.authContainer}>
                <div className={styles.authBox}>
                    <div className={styles.authHeader}>
                        <div className={styles.logo}>BeykuSay</div>
                        <div className={styles.authTabs}>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'login' ? styles.active : ''}`}
                                onClick={() => handleTabClick('login')}
                                disabled={loading}
                            >
                                Вход
                            </button>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'register' ? styles.active : ''}`}
                                onClick={() => handleTabClick('register')}
                                disabled={loading}
                            >
                                Регистрация
                            </button>
                        </div>
                    </div>

                     {error && <div className={styles.errorMessage}>{error}</div>}

                    {/* Форма входа */}
                    <form
                        id="loginForm"
                        className={`${styles.authForm} ${activeTab === 'login' ? styles.active : ''}`}
                        onSubmit={handleLoginSubmit}
                    >
                        <div className={styles.formGroup}>
                            <label htmlFor="loginEmail">Email</label>
                            <input
                                 type="email" id="loginEmail" required autoComplete="email"
                                 value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                                 disabled={loading}
                             />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="loginPassword">Пароль</label>
                            <div className={styles.passwordInput}>
                                <input
                                     type={showPassword['loginPassword'] ? 'text' : 'password'}
                                     id="loginPassword" required autoComplete="current-password"
                                     value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                                     disabled={loading}
                                 />
                                <button type="button" className={styles.togglePassword}
                                     onClick={() => togglePasswordVisibility('loginPassword')}
                                     disabled={loading}>
                                     {showPassword['loginPassword'] ? '👁️‍🗨️' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div className={`${styles.formGroup} ${styles.rememberMe}`}>
                            <label>
                                <input type="checkbox" checked={rememberMe}
                                       onChange={(e) => setRememberMe(e.target.checked)}
                                       disabled={loading}/> Запомнить меня
                            </label>
                            <a href="#" className={styles.forgotPassword}>Забыли пароль?</a>
                        </div>
                        <button type="submit" className={styles.authSubmit} disabled={loading}>
                            {loading ? 'Вход...' : 'Войти'}
                        </button>
                        <div className={styles.socialAuth}>
                            <p>Или войдите через</p>
                            <div className={styles.socialButtons}>
                                <button type="button" className={`${styles.socialBtn} ${styles.google}`} disabled={loading}>
                                    <img src={googleIcon} alt="Google" /> Google
                                </button>
                                <button type="button" className={`${styles.socialBtn} ${styles.github}`} disabled={loading}>
                                    <img src={githubIcon} alt="GitHub" /> GitHub
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Форма регистрации */}
                    <form
                        id="registerForm"
                        className={`${styles.authForm} ${activeTab === 'register' ? styles.active : ''}`}
                        onSubmit={handleRegisterSubmit}
                    >
                        <div className={styles.formGroup}>
                             <label htmlFor="registerName">Имя</label>
                             <input type="text" id="registerName" required autoComplete="name"
                                    value={registerName} onChange={(e) => setRegisterName(e.target.value)}
                                    disabled={loading}/>
                         </div>
                         <div className={styles.formGroup}>
                             <label htmlFor="registerEmail">Email</label>
                             <input type="email" id="registerEmail" required autoComplete="email"
                                    value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)}
                                    disabled={loading}/>
                         </div>
                         <div className={styles.formGroup}>
                             <label htmlFor="registerPassword">Пароль</label>
                             <div className={styles.passwordInput}>
                                 <input type={showPassword['registerPassword'] ? 'text' : 'password'}
                                        id="registerPassword" required autoComplete="new-password"
                                        value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)}
                                        disabled={loading}/>
                                 <button type="button" className={styles.togglePassword}
                                         onClick={() => togglePasswordVisibility('registerPassword')}
                                         disabled={loading}>
                                     {showPassword['registerPassword'] ? '👁️‍🗨️' : '👁️'}
                                 </button>
                             </div>
                         </div>
                         <div className={styles.formGroup}>
                             <label htmlFor="confirmPassword">Подтвердите пароль</label>
                             <div className={styles.passwordInput}>
                                 <input type={showPassword['confirmPassword'] ? 'text' : 'password'}
                                        id="confirmPassword" required autoComplete="new-password"
                                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={loading}/>
                                 <button type="button" className={styles.togglePassword}
                                         onClick={() => togglePasswordVisibility('confirmPassword')}
                                         disabled={loading}>
                                     {showPassword['confirmPassword'] ? '👁️‍🗨️' : '👁️'}
                                 </button>
                             </div>
                         </div>
                         <div className={`${styles.formGroup} ${styles.terms}`}>
                             <label>
                                 <input type="checkbox" required checked={termsAccepted}
                                        onChange={(e) => setTermsAccepted(e.target.checked)}
                                        disabled={loading}/>
                                 Я согласен с <a href="#">условиями использования</a>
                             </label>
                         </div>
                        <button type="submit" className={styles.authSubmit} disabled={loading}>
                            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default AuthPage;