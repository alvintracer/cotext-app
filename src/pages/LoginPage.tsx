import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, Monitor, GitBranch } from 'lucide-react';

export default function LoginPage() {
  const { signInWithGitHub, loading } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      
      <div className="login-theme-toggle">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
          className="icon-button"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
        </button>
      </div>

      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" opacity="0.15" />
              <path d="M8 12h16M8 16h12M8 20h8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="24" cy="20" r="4" fill="var(--accent)" opacity="0.6" />
            </svg>
          </div>
          <h1 className="login-title">Cotext</h1>
          <p className="login-subtitle">GitHub-native context capture</p>
        </div>

        <div className="login-description">
          <p>채팅하듯 메모하고, GitHub에 Markdown으로 저장하세요.</p>
          <p className="login-description-sub">어디서든 접속 · 버전관리 · AI-ready context pool</p>
        </div>

        <button
          className="login-button"
          onClick={signInWithGitHub}
          disabled={loading}
        >
          <GitBranch size={20} />
          <span>{loading ? 'Connecting...' : 'Sign in with GitHub'}</span>
        </button>

        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-icon">📝</span>
            <span>Chat-style capture</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🔄</span>
            <span>GitHub sync</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🤖</span>
            <span>Agent-ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
