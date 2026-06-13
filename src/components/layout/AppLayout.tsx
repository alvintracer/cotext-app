import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, LogOut, User } from 'lucide-react';

import { useLanguage } from '../../contexts/LanguageContext';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const themeIcon = theme === 'dark' ? <Moon size={16} /> : theme === 'light' ? <Sun size={16} /> : <Monitor size={16} />;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

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

          <div className="user-menu">
            <div className="user-info">
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
            </div>
            <button className="icon-button" onClick={signOut} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
