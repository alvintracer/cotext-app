import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
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
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to get session'));
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        setError(null);
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
