import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkspacesPage from './pages/WorkspacesPage';
import WorkspaceDetailPage from './pages/WorkspaceDetailPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import InvitePage from './pages/InvitePage';
import SharePage from './pages/SharePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const isNative = Capacitor.isNativePlatform();
const Router = isNative ? HashRouter : BrowserRouter;

// Native platform setup: prevent WebView from rendering behind system bars
if (isNative) {
  document.documentElement.classList.add('native-app');
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" opacity="0.15" />
            <path d="M8 12h16M8 16h12M8 20h8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="24" cy="20" r="4" fill="var(--accent)" opacity="0.6" />
          </svg>
          <div className="spinner" />
          <p>Loading Cotext...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/" element={isNative ? (user && !loading ? <Navigate to="/workspaces" replace /> : <LoginPage />) : <LandingPage />} />
      <Route
        path="/login"
        element={user && !loading ? <Navigate to="/workspaces" replace /> : <LoginPage />}
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/invite/:code" element={<InvitePage />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route
        element={
          <ProtectedRoute>
            <WorkspaceProvider>
              <AppLayout />
            </WorkspaceProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/workspace/:workspaceId" element={<WorkspaceDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <Router>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </Router>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
