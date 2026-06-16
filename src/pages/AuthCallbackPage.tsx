import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';

// Pages that need return-to-here behavior (e.g., InvitePage) write the path
// to localStorage under this key before triggering OAuth. We consume it here
// after the session is established and redirect back, or fall back to home.
function consumePostLoginRedirect(): string {
  try {
    const inviteRedirect = localStorage.getItem('cotext-invite-redirect');
    if (inviteRedirect && inviteRedirect.startsWith('/')) {
      localStorage.removeItem('cotext-invite-redirect');
      return inviteRedirect;
    }
  } catch { /* localStorage may be unavailable */ }
  return '/workspaces';
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase Auth handles the token exchange via URL hash
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          navigate('/login');
          return;
        }

        if (data.session) {
          // Store provider token if available for GitHub API access
          const providerToken = (data.session as { provider_token?: string }).provider_token;
          if (providerToken) {
            // The provider token will be handled server-side via Edge Functions
            console.log('GitHub provider token received');
          }
          navigate(consumePostLoginRedirect());
        } else {
          navigate('/login');
        }
      } catch (err) {
        console.error('Auth callback failed:', err);
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="app-loading">
      <div className="app-loading-inner">
        <div className="spinner" />
        <p>Completing sign in...</p>
      </div>
    </div>
  );
}
