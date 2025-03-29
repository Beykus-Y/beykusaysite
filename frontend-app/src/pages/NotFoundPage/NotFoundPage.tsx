// src/pages/NotFoundPage/NotFoundPage.tsx
import React from 'react';
import { Link } from 'react-router-dom'; // Для ссылки на главную
import styles from './NotFoundPage.module.css'; // Импортируем стили

function NotFoundPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>404</h1>
      <p className={styles.message}>Страница не найдена</p>
      <p className={styles.description}>
        Извините, страница, которую вы ищете, не существует, была перемещена или удалена.
      </p>
      <Link to="/" className={styles.homeLink}>
        Вернуться на главную
      </Link>
    </div>
  );
}

// !!! ВАЖНО: Экспортируем компонент по умолчанию !!!
export default NotFoundPage;