// src/App.tsx

import React from 'react'; // Добавлен импорт React
import { Routes, Route, Navigate } from 'react-router-dom';
import './app.css'; // Файл может быть пустым или содержать специфичные стили для App

// Импорт компонентов страниц
import AuthPage from './pages/AuthPage/AuthPage';
import HomePage from './pages/HomePage/HomePage';
import ChatPage from './pages/ChatPage/ChatPage';
import NotFoundPage from './pages/NotFoundPage/NotFoundPage.tsx';

// --- Компонент для защиты роутов (остается без изменений) ---
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

// --- Компонент для неавторизованных (остается без изменений) ---
function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  if (token) {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

// --- Компонент-обертка для скроллящихся страниц ---
// Этот компонент нужен, чтобы разрешить скролл для конкретных страниц,
// в то время как глобальные стили (index.css) запрещают скролл для body/#root.
function ScrollablePage({ children }: { children: JSX.Element }) {
  return (
    <div style={{
        flex: 1, // Занимает все доступное пространство в flex-родителе (#root)
        overflowY: 'auto', // !!! Разрешает вертикальный скролл ТОЛЬКО для этой обертки !!!
        overflowX: 'hidden', // Запрещает горизонтальный
        display: 'flex', // Позволяет внутреннему контенту корректно работать с высотой
        flexDirection: 'column'
    }}>
      {children}
    </div>
  );
}

// --- Основной компонент приложения ---
function App() {
  return (
    // Обертка <div className="App"> не нужна, #root уже является контейнером
    <Routes>
      {/* Главная страница (лендинг) - оборачиваем в ScrollablePage */}
      <Route
        path="/"
        element={
          <ScrollablePage>
            <HomePage />
          </ScrollablePage>
        }
      />

      {/* Страница авторизации - оборачиваем в ScrollablePage */}
      <Route
        path="/auth"
        element={
          <PublicOnlyRoute>
            <ScrollablePage>
              <AuthPage />
            </ScrollablePage>
          </PublicOnlyRoute>
        }
      />

      {/* Страница чата - НЕ оборачиваем, т.к. она сама управляет своим макетом и скроллом */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />

      {/* Страница 404 - оборачиваем в ScrollablePage */}
      <Route
        path="*"
        element={
          <ScrollablePage>
            <NotFoundPage />
          </ScrollablePage>
        }
      />
    </Routes>
  );
}

export default App;