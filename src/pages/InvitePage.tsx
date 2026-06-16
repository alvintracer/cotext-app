import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { GitBranch, CheckCircle, Warning as AlertTriangle, SpinnerGap as Loader2 } from '@phosphor-icons/react';

interface InviteData {
  id: string;
  invite_code: string;
  created_by: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
  suggested_name: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
  inviter_profile?: {
    display_name: string;
    github_username: string;
  };
}

type InviteState = 'loading' | 'ready' | 'invalid' | 'expired' | 'already_connected' | 'accepting' | 'accepted';

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { user, signInWithGitHub } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [state, setState] = useState<InviteState>('loading');
  const [existingWorkspaceId, setExistingWorkspaceId] = useState<string | null>(null);

  // Load invite data
  useEffect(() => {
    if (!code) {
      setState('invalid');
      return;
    }

    const loadInvite = async () => {
      setState('loading');
      try {
        const { data, error } = await supabase
          .from('workspace_invites')
          .select('*')
          .eq('invite_code', code)
          .single();

        if (error || !data) {
          setState('invalid');
          return;
        }

        // Check expiration
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setState('expired');
          return;
        }

        // Check max uses
        if (data.max_uses && data.use_count >= data.max_uses) {
          setState('expired');
          return;
        }

        // Try to load inviter profile (best-effort, may fail for anon)
        let inviterProfile;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, github_username')
            .eq('id', data.created_by)
            .single();
          inviterProfile = profile || undefined;
        } catch {
          // Anon user can't read profiles — that's OK
        }

        setInvite({ ...data, inviter_profile: inviterProfile });
        setState('ready');
      } catch {
        setState('invalid');
      }
    };

    loadInvite();
  }, [code]);

  // Check if user already has this repo connected
  useEffect(() => {
    if (!user || !invite) return;

    const checkExisting = async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', user.id)
        .eq('github_owner', invite.github_owner)
        .eq('github_repo', invite.github_repo)
        .limit(1);

      if (data && data.length > 0) {
        setExistingWorkspaceId(data[0].id);
        setState('already_connected');
      }
    };

    checkExisting();
  }, [user, invite]);

  const handleAccept = useCallback(async () => {
    if (!user || !invite) return;

    setState('accepting');
    try {
      // Use security-definer RPC so we can join the inviter's workspace even if
      // RLS would otherwise hide it from us. The RPC is idempotent (no-op if
      // we're already a member) and increments use_count atomically.
      const { data, error } = await supabase.rpc('accept_workspace_invite', {
        p_invite_code: invite.invite_code,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to accept invite');

      setState('accepted');
      setTimeout(() => navigate(`/workspace/${data.workspace_id}`), 1200);
    } catch (err) {
      console.error('Failed to accept invite:', err);
      setState('ready');
    }
  }, [user, invite, navigate]);

  const handleLogin = useCallback(() => {
    // Store the current invite URL so we can redirect back after login
    localStorage.setItem('cotext-invite-redirect', window.location.pathname);
    signInWithGitHub();
  }, [signInWithGitHub]);

  // After login, check if we need to redirect to invite page
  useEffect(() => {
    if (user) {
      const redirect = localStorage.getItem('cotext-invite-redirect');
      if (redirect) {
        localStorage.removeItem('cotext-invite-redirect');
        // We're already on the invite page, just reload invite data
      }
    }
  }, [user]);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="invite-page" data-theme={isDark ? 'dark' : 'light'}>
      <div className="invite-card">
        {/* Logo */}
        <div className="invite-logo" onClick={() => navigate('/')}>
          <span className="app-logo-mark">:&gt;</span>
          <span className="app-logo-text">Cotext</span>
        </div>

        {state === 'loading' && (
          <div className="invite-loading">
            <Loader2 size={32} className="spin" />
          </div>
        )}

        {(state === 'invalid') && (
          <div className="invite-error">
            <AlertTriangle size={48} strokeWidth={1} />
            <h2>{t('invite.invalid')}</h2>
          </div>
        )}

        {(state === 'expired') && (
          <div className="invite-error">
            <AlertTriangle size={48} strokeWidth={1} />
            <h2>{t('invite.expired')}</h2>
          </div>
        )}

        {(state === 'ready' || state === 'accepting' || state === 'already_connected' || state === 'accepted') && invite && (
          <>
            <h1>{t('invite.title')}</h1>
            <p className="invite-desc">{t('invite.desc')}</p>

            {/* Repo info card */}
            <div className="invite-repo-card">
              <div className="invite-repo-icon">
                <GitBranch size={24} />
              </div>
              <div className="invite-repo-info">
                <span className="invite-repo-label">{t('invite.repo')}</span>
                <span className="invite-repo-name">{invite.github_owner}/{invite.github_repo}</span>
                <span className="invite-repo-branch">{invite.default_branch}</span>
              </div>
            </div>

            {/* Inviter info */}
            {invite.inviter_profile && (
              <div className="invite-inviter">
                <img
                  src={`https://github.com/${invite.inviter_profile.github_username}.png?size=32`}
                  alt=""
                  className="invite-inviter-avatar"
                />
                <span className="invite-inviter-text">
                  {t('invite.invitedBy')} <strong>{invite.inviter_profile.display_name || invite.inviter_profile.github_username}</strong>
                </span>
              </div>
            )}

            {/* Action area */}
            {!user ? (
              <div className="invite-actions">
                <p className="invite-login-hint">{t('invite.loginRequired')}</p>
                <button className="btn btn-primary btn-lg invite-btn" onClick={handleLogin}>
                  <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  {t('invite.loginBtn')}
                </button>
              </div>
            ) : state === 'already_connected' ? (
              <div className="invite-actions">
                <div className="invite-already">
                  <CheckCircle size={20} />
                  <span>{t('invite.alreadyConnected')}</span>
                </div>
                <button
                  className="btn btn-primary btn-lg invite-btn"
                  onClick={() => navigate(`/workspace/${existingWorkspaceId}`)}
                >
                  {t('invite.goToWorkspace')}
                </button>
              </div>
            ) : state === 'accepted' ? (
              <div className="invite-actions">
                <div className="invite-success">
                  <CheckCircle size={32} />
                </div>
              </div>
            ) : (
              <div className="invite-actions">
                <button
                  className="btn btn-primary btn-lg invite-btn"
                  onClick={handleAccept}
                  disabled={state === 'accepting'}
                >
                  {state === 'accepting' ? (
                    <><Loader2 size={18} className="spin" /> {t('invite.accepting')}</>
                  ) : (
                    t('invite.accept')
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
