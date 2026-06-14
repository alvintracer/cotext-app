import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Sun, Moon, Monitor, GithubLogo, ArrowsClockwise } from '@phosphor-icons/react';

import { useState, useRef, useEffect } from 'react';

export default function LoginPage() {
  const { signInWithGitHub, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language } = useLanguage();
  const [switching, setSwitching] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Poll for popup close → auto-trigger OAuth
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleSwitchAccount = () => {
    setSwitching(true);
    const popup = window.open(
      'https://github.com/logout',
      'github_logout',
      'width=500,height=600,left=200,top=100',
    );
    popupRef.current = popup;

    // Poll every 500ms — when popup closes, trigger sign-in
    timerRef.current = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        clearInterval(timerRef.current);
        popupRef.current = null;
        setSwitching(false);
        // Auto-trigger GitHub OAuth (GitHub session is now cleared)
        signInWithGitHub();
      }
    }, 500);
  };

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
            <span className="login-logo-mark">:&gt;</span>
          </div>
          <h1 className="login-title">Cotext</h1>
          <p className="login-subtitle">GitHub-native context capture</p>
        </div>

        <div className="login-description">
          <p>{language === 'ko'
            ? '채팅하듯 메모하고, GitHub에 Markdown으로 저장하세요.'
            : 'Capture notes like chat, stored as Markdown on GitHub.'}</p>
          <p className="login-description-sub">{language === 'ko'
            ? '어디서든 접속 · 버전관리 · AI-ready context pool'
            : 'Access anywhere · Version control · AI-ready context pool'}</p>
        </div>

        <button
          className="login-button"
          onClick={signInWithGitHub}
          disabled={loading}
        >
          <GithubLogo size={20} />
          <span>{loading ? 'Connecting...' : 'Sign in with GitHub'}</span>
        </button>

        <button
          className="login-switch-account"
          onClick={handleSwitchAccount}
          disabled={switching || loading}
        >
          <ArrowsClockwise size={14} className={switching ? 'spin' : ''} />
          <span>{switching
            ? (language === 'ko' ? 'GitHub 로그아웃 중…' : 'Logging out of GitHub…')
            : (language === 'ko' ? '다른 GitHub 계정으로 로그인' : 'Sign in with a different GitHub account')
          }</span>
        </button>
      </div>
    </div>
  );
}
