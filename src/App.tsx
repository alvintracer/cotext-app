import { useEffect, useRef } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
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
import KnowledgeStudioPage from './pages/KnowledgeStudioPage';
import KnowledgeThinkPage from './pages/KnowledgeThinkPage';
import MindSyncLandingPage from './pages/MindSyncLandingPage';
import PricingPage from './pages/PricingPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import RefundPolicyPage from './pages/RefundPolicyPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

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

// Paths we remember across app re-opens. We deliberately don't restore login,
// landing, share/invite/callback flows — those should always start fresh.
const RESTORABLE_PATTERNS = [
  /^\/workspaces$/,
  /^\/workspace\/[^/]+/,
  /^\/mindsync\/studio$/,
  /^\/mindsync\/think$/,
];
const isRestorablePath = (p: string) => RESTORABLE_PATTERNS.some((re) => re.test(p));

const LAST_PATH_KEY = 'cotext-last-path';

/**
 * On cold mount, if we land on '/' and the last visited path was a real screen
 * (workspace/mindsync), jump there once so phone re-opens don't dump the user
 * back to the landing page. Logo clicks navigate to '/' AFTER mount, so they
 * still work — this restore only fires once.
 */
function PathRestorer() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredRef = useRef(false);

  // One-shot restore on initial mount.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (location.pathname !== '/') return;
    try {
      const saved = localStorage.getItem(LAST_PATH_KEY);
      if (saved && isRestorablePath(saved) && saved !== location.pathname) {
        navigate(saved, { replace: true });
      }
    } catch {
      // localStorage unavailable (private mode etc.) — silently skip.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once-on-mount
  }, []);

  // Save on every navigation to a restorable path.
  useEffect(() => {
    if (!isRestorablePath(location.pathname)) return;
    try { localStorage.setItem(LAST_PATH_KEY, location.pathname); } catch { /* ignore */ }
  }, [location.pathname]);

  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const isNative = Capacitor.isNativePlatform();

  return (
    <Routes>
      <Route path="/" element={isNative ? (user && !loading ? <Navigate to="/workspaces" replace /> : <LoginPage />) : <LandingPage />} />
      <Route
        path="/login"
        element={user && !loading ? <Navigate to={(() => {
          try {
            const r = localStorage.getItem('cotext-post-login-redirect') || localStorage.getItem('cotext-invite-redirect');
            if (r && r.startsWith('/')) {
              localStorage.removeItem('cotext-post-login-redirect');
              localStorage.removeItem('cotext-invite-redirect');
              return r;
            }
          } catch {
            // Ignore invalid local redirect state and fall back to the default route.
          }
          return '/workspaces';
        })()} replace /> : <LoginPage />}
      />
      <Route path="/mindsync" element={<MindSyncLandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refund-policy" element={<RefundPolicyPage />} />
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
        <Route path="/mindsync/studio" element={<KnowledgeStudioPage />} />
        <Route path="/mindsync/think" element={<KnowledgeThinkPage />} />
        <Route path="/workspace/:workspaceId" element={<WorkspaceDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}

export default function App() {
  const isNative = Capacitor.isNativePlatform();
  const Router = isNative ? HashRouter : BrowserRouter;

  useEffect(() => {
    if (isNative) {
      document.documentElement.classList.add('native-app');
    }
  }, [isNative]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <Router>
            <AuthProvider>
              <PathRestorer />
              <AppRoutes />
            </AuthProvider>
          </Router>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
