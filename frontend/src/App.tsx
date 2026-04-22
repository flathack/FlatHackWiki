import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './context/auth.store';
import { ToastProvider } from './context/toast.context';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import SpacePage from './pages/Space';
import CreateSpace from './pages/CreateSpace';
import PageView from './pages/PageView';
import PageEditor from './pages/PageEditor';
import Search from './pages/Search';
import AdminPage from './pages/Admin';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
