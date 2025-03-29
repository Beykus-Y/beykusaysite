import { Routes, Route, Navigate } from 'react-router-dom';
import './app.css'; // Общие стили для App, если нужны

// Импорт компонентов страниц
import AuthPage from './pages/AuthPage/AuthPage';
import HomePage from './pages/HomePage/HomePage';
import ChatPage from './pages/ChatPage/ChatPage'; // Импортируем ChatPage

// Компонент для защиты роутов (пример)
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  // Простая проверка токена. В реальном приложении может быть сложнее
  if (!token) {
    // Если токена нет, перенаправляем на страницу входа
    return <Navigate to="/auth" replace />;
  }
  return children; // Если токен есть, рендерим дочерний компонент (ChatPage)
}

// Компонент для страниц, доступных только неавторизованным пользователям
function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  if (token) {
    // Если токен есть, перенаправляем на страницу чата
    return <Navigate to="/chat" replace />;
  }
  return children; // Если токена нет, рендерим (AuthPage)
}


function NotFoundPage() {
    return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
            <h1>404 - Страница не найдена</h1>
            <p>Извините, страница, которую вы ищете, не существует.</p>
            {/* Можно добавить ссылку на главную */}
        </div>
    );
}


function App() {
  return (
    // <div className="App"> {/* Обертка App часто не нужна, стили лучше применять к страницам */}
      <Routes>
          {/* Главная страница (лендинг) - доступна всем */}
          <Route path="/" element={<HomePage />} />

          {/* Страница авторизации - доступна только НЕавторизованным */}
          <Route
            path="/auth"
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          />

          {/* Страница чата - доступна только авторизованным */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />

          {/* Маршрут для всего остального (404) */}
          <Route path="*" element={<NotFoundPage />} />
      </Routes>
    // </div>
  );
}

export default App;