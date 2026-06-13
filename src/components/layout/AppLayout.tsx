import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, LogOut, User } from 'lucide-react';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const themeIcon = theme === 'dark' ? <Moon size={16} /> : theme === 'light' ? <Sun size={16} /> : <Monitor size={16} />;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-left">
          <button className="app-logo" onClick={() => navigate('/workspaces')}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" opacity="0.15" />
              <path d="M8 12h16M8 16h12M8 20h8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="24" cy="20" r="4" fill="var(--accent)" opacity="0.6" />
            </svg>
            <span className="app-logo-text">Cotext</span>
          </button>
        </div>

        <div className="app-header-right">
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
