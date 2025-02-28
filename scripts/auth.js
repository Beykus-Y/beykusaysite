document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Переключение между вкладками
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Активация кнопки
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Показ соответствующей формы
            authForms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${targetTab}Form`) {
                    form.classList.add('active');
                }
            });
        });
    });

    // Показать/скрыть пароль
    togglePasswordButtons.forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                button.textContent = '👁️‍🗨️';
            } else {
                input.type = 'password';
                button.textContent = '👁️';
            }
        });
    });

    // Валидация и отправка формы входа
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('#loginEmail').value;
        const password = loginForm.querySelector('#loginPassword').value;

        // Базовая валидация
        if (!validateEmail(email)) {
            showError('Пожалуйста, введите корректный email');
            return;
        }

        if (password.length < 6) {
            showError('Пароль должен содержать минимум 6 символов');
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Сохраняем токен
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Перенаправление на чат
            window.location.href = '/chat.html';
        } catch (error) {
            showError(error.message);
        }
    });

    // Валидация и отправка формы регистрации
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = registerForm.querySelector('#registerName').value;
        const email = registerForm.querySelector('#registerEmail').value;
        const password = registerForm.querySelector('#registerPassword').value;
        const confirmPassword = registerForm.querySelector('#confirmPassword').value;

        // Валидация
        if (name.length < 2) {
            showError('Имя должно содержать минимум 2 символа');
            return;
        }

        if (!validateEmail(email)) {
            showError('Пожалуйста, введите корректный email');
            return;
        }

        if (password.length < 6) {
            showError('Пароль должен содержать минимум 6 символов');
            return;
        }

        if (password !== confirmPassword) {
            showError('Пароли не совпадают');
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Автоматический вход после регистрации
            const loginResponse = await fetch('http://localhost:8000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const loginData = await loginResponse.json();

            if (!loginResponse.ok) {
                throw new Error(loginData.message);
            }

            // Сохраняем токен
            localStorage.setItem('token', loginData.token);
            localStorage.setItem('user', JSON.stringify(loginData.user));

            // Перенаправление на чат
            window.location.href = '/chat.html';
        } catch (error) {
            showError(error.message);
        }
    });

    // Вспомогательные функции
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Улучшенный вывод ошибок
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        // Удаляем предыдущие сообщения об ошибках
        document.querySelectorAll('.error-message').forEach(el => el.remove());
        
        // Добавляем новое сообщение
        const activeForm = document.querySelector('.auth-form.active');
        activeForm.insertBefore(errorDiv, activeForm.firstChild);
        
        // Автоматически удаляем сообщение через 5 секунд
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}); 