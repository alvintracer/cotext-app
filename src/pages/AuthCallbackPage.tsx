import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';

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
          const providerToken = (data.session as any).provider_token;
          if (providerToken) {
            // The provider token will be handled server-side via Edge Functions
            console.log('GitHub provider token received');
          }
          navigate('/workspaces');
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
