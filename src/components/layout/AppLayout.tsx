import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, SignOut as LogOut, User, ArrowsClockwise } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase/client';

import { useLanguage } from '../../contexts/LanguageContext';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const themeIcon = theme === 'dark' ? <Moon size={16} /> : theme === 'light' ? <Sun size={16} /> : <Monitor size={16} />;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  const handleChangeAccount = async () => {
    setProfileOpen(false);
    // Sign out first, then immediately redirect to GitHub OAuth
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin + '/workspaces' },
    });
  };

  const handleSignOut = () => {
    setProfileOpen(false);
    signOut();
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-left">
          <button className="app-logo" onClick={() => navigate('/workspaces')}>
            <span className="app-logo-mark">:&gt;</span>
            <span className="app-logo-text">Cotext</span>
          </button>
        </div>

        <div className="app-header-right">
          <button
            className="icon-button font-medium text-sm"
            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
            title="Toggle Language"
          >
            {language === 'en' ? 'A' : '한'}
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(nextTheme)}
            title={`Theme: ${theme}`}
          >
            {themeIcon}
          </button>

          <div className="user-menu" ref={profileRef}>
            <button className="user-info-btn" onClick={() => setProfileOpen((v) => !v)}>
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="avatar"
                  className="user-avatar"
                />
              ) : (
                <div className="user-avatar-placeholder">
                  <User size={14} />
                </div>
              )}
              <span className="user-name">
                {user?.user_metadata?.user_name || user?.email || 'User'}
              </span>
            </button>

            {profileOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <span className="profile-dropdown-name">{user?.user_metadata?.user_name || 'User'}</span>
                  <span className="profile-dropdown-email">{user?.email || ''}</span>
                </div>
                <div className="profile-dropdown-divider" />
                <button className="profile-dropdown-item" onClick={handleChangeAccount}>
                  <ArrowsClockwise size={14} />
                  <span>{language === 'ko' ? '계정 변경' : 'Change account'}</span>
                </button>
                <button className="profile-dropdown-item profile-dropdown-danger" onClick={handleSignOut}>
                  <LogOut size={14} />
                  <span>{language === 'ko' ? '로그아웃' : 'Sign out'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
