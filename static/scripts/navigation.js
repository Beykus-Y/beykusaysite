// Компонент навигации
function createNavigation() {
    const nav = document.createElement('nav');
    nav.className = 'nav-container';
    
    nav.innerHTML = `
        <div class="nav">
            <a href="/" class="logo">
                <img src="/assets/logo.svg" alt="BeykuSay">
                BeykuSay
            </a>
            <div class="nav-links">
                <a href="/" class="nav-link">Главная</a>
                <a href="/chat.html" class="nav-link">Чат</a>
                <button id="logoutBtn" class="button button-secondary">Выйти</button>
            </div>
        </div>
    `;

    // Обработчик выхода
    nav.querySelector('#logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    });

    return nav;
}

// Добавляем навигацию на все страницы
document.addEventListener('DOMContentLoaded', () => {
    const nav = createNavigation();
    document.body.insertBefore(nav, document.body.firstChild);
    
    // Подсвечиваем текущую страницу
    const currentPage = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
});

export { createNavigation }; 