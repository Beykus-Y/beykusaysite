document.addEventListener('DOMContentLoaded', () => {
    // Плавная прокрутка для навигации
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    const navLinks = document.querySelector('.nav-links');
const toggleButton = document.createElement('button');
toggleButton.textContent = '☰';
toggleButton.style.cssText = 'background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;';
document.querySelector('.nav').appendChild(toggleButton);

toggleButton.addEventListener('click', () => {
    navLinks.classList.toggle('active');
});
    // Анимация появления элементов при скролле
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    });

    document.querySelectorAll('.feature-card, .price-card, .about-content').forEach((el) => {
        observer.observe(el);
    });

    // Улучшенная мобильная навигация
    const mobileMenuButton = document.createElement('button');
    mobileMenuButton.classList.add('mobile-menu-button');
    mobileMenuButton.innerHTML = '☰';
    document.querySelector('.nav').appendChild(mobileMenuButton);

    mobileMenuButton.addEventListener('click', () => {
        document.querySelector('.nav-links').classList.toggle('active');
    });

    // Исправляем параллакс для производительности
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const hero = document.querySelector('.hero');
                const scrolled = window.pageYOffset;
                if (scrolled < window.innerHeight) {
                    hero.style.transform = `translateY(${scrolled * 0.3}px)`;
                }
                ticking = false;
            });
            ticking = true;
        }
    });

    // Добавляем валидацию формы
    const contactForm = document.querySelector('.contact-form');
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = contactForm.querySelector('input[type="email"]').value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
            alert('Пожалуйста, введите корректный email');
            return;
        }

        // Здесь можно добавить логику отправки формы
        alert('Спасибо за сообщение! Мы свяжемся с вами в ближайшее время.');
        contactForm.reset();
    });
});
