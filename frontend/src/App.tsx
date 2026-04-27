import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './context/auth.store';
import { ToastProvider } from './context/toast.context';
import { useThemeStore } from './context/theme.store';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import SpacePage from './pages/Space';
import CreateSpace from './pages/CreateSpace';
import PageView from './pages/PageView';
import PageEditor from './pages/PageEditor';
import Search from './pages/Search';
import AdminPage from './pages/Admin';
import CalendarContacts from './pages/CalendarContacts';
import BookmarksPage from './pages/Bookmarks';
import AmazonExpensesPage from './pages/AmazonExpenses';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const theme = useThemeStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const radius = Math.min(40, Math.max(8, user?.uiRadius ?? 28));
    document.documentElement.style.setProperty('--ui-radius', `${radius}px`);
    document.documentElement.style.setProperty('--ui-radius-sm', `${Math.max(8, radius - 10)}px`);
    document.documentElement.style.setProperty('--ui-radius-xs', `${Math.max(6, radius - 16)}px`);
  }, [user?.uiRadius]);

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/bookmarks" element={<ProtectedRoute><BookmarksPage /></ProtectedRoute>} />
        <Route path="/amazon-expenses" element={<ProtectedRoute><AmazonExpensesPage /></ProtectedRoute>} />
        <Route path="/calendar-contacts" element={<ProtectedRoute><CalendarContacts /></ProtectedRoute>} />
        <Route path="/spaces/new" element={<ProtectedRoute><CreateSpace /></ProtectedRoute>} />
        <Route path="/spaces/:key" element={<ProtectedRoute><SpacePage /></ProtectedRoute>} />
        <Route path="/spaces/:key/pages/new" element={<ProtectedRoute><PageEditor /></ProtectedRoute>} />
        <Route path="/spaces/:key/pages/new/:template" element={<ProtectedRoute><PageEditor /></ProtectedRoute>} />
        <Route path="/spaces/:key/pages/:slug/edit" element={<ProtectedRoute><PageEditor /></ProtectedRoute>} />
        <Route path="/spaces/:key/pages/:slug" element={<ProtectedRoute><PageView /></ProtectedRoute>} />
        <Route path="/admin/*" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      </Routes>
    </ToastProvider>
  );
}
