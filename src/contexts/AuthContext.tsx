import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase/client';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: Error | null;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Store GitHub provider token in github_connections table.
 * Called once after OAuth sign-in when provider_token is available.
 */
async function storeGitHubToken(userId: string, providerToken: string) {
  try {
    // Get GitHub username from the token
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${providerToken}`, 'User-Agent': 'Cotext' },
    });
    const ghUser = res.ok ? await res.json() : null;

    await supabase
      .from('github_connections')
      .upsert({
        user_id: userId,
        github_username: ghUser?.login || null,
        access_token_encrypted: providerToken,
        token_scope: 'repo,user:email',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    console.log('[Auth] GitHub token stored for user', userId);
  } catch (err) {
    console.error('[Auth] Failed to store GitHub token:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // If provider_token is available (right after OAuth redirect), store it
        if (currentSession?.provider_token && currentSession?.user?.id) {
          storeGitHubToken(currentSession.user.id, currentSession.provider_token);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to get session'));
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        setError(null);

        // Store provider_token on SIGNED_IN event (OAuth callback)
        if (event === 'SIGNED_IN' && newSession?.provider_token && newSession?.user?.id) {
          storeGitHubToken(newSession.user.id, newSession.provider_token);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGitHub = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          scopes: 'repo,user:email',
        },
      });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to sign in with GitHub'));
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to sign out'));
    } finally {
      setLoading(false);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    error,
    signInWithGitHub,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
