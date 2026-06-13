import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { Plus, GitBranch, FolderSimple as FolderGit2, CaretRight as ChevronRight, Link, FilePlus, Spinner as Loader2, MagnifyingGlass as Search } from '@phosphor-icons/react';
import { githubApi } from '../lib/supabase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import type { Workspace } from '../types/workspace';
import { useLanguage } from '../contexts/LanguageContext';

type ModalMode = 'choose' | 'create' | 'connect';

interface GithubRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
}

export default function WorkspacesPage() {
  const { user } = useAuth();
  const { workspaces, loading, createWorkspace, selectWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<ModalMode>('choose');
  const [step, setStep] = useState(1);

  // Form fields
  const [repoName, setRepoName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);

  // Connect mode: repo list
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  const defaultOwner = user?.user_metadata?.user_name || '';

  const resetModal = useCallback(() => {
    setMode('choose');
    setStep(1);
    setRepoName('');
    setOwnerName('');
    setWorkspaceName('');
    setRepoSearch('');
  }, []);

  const openModal = useCallback(() => {
    resetModal();
    setShowModal(true);
  }, [resetModal]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  // Load repos when connect mode is selected
  useEffect(() => {
    if (mode === 'connect' && repos.length === 0 && !loadingRepos) {
      setLoadingRepos(true);
      githubApi.listRepos()
        .then((data) => {
          setRepos(data.repos || []);
        })
        .catch((err) => console.error('Failed to load repos:', err))
        .finally(() => setLoadingRepos(false));
    }
  }, [mode, repos.length, loadingRepos]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  const handleSelectRepo = useCallback((repo: GithubRepo) => {
    setRepoName(repo.name);
    setOwnerName(repo.owner.login);
    setWorkspaceName(repo.name);
    setStep(3); // Jump to workspace name step
  }, []);

  const handleCreate = useCallback(async () => {
    if (!workspaceName.trim() || !repoName.trim()) return;
    setCreating(true);
    try {
      const owner = ownerName.trim() || defaultOwner;
      await createWorkspace({
        name: workspaceName.trim(),
        github_owner: owner,
        github_repo: repoName.trim(),
      });
      closeModal();
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setCreating(false);
    }
  }, [workspaceName, repoName, ownerName, defaultOwner, createWorkspace, closeModal]);

  const handleOpenWorkspace = useCallback((ws: Workspace) => {
    selectWorkspace(ws);
    navigate(`/workspace/${ws.id}`);
  }, [selectWorkspace, navigate]);

  // Step navigation
  const canNext = () => {
    if (step === 1) return repoName.trim().length > 0;
    if (step === 2) return true; // owner has default
    return workspaceName.trim().length > 0;
  };

  const handleNext = () => {
    if (step === 1) {
      setOwnerName(ownerName || defaultOwner);
      setStep(2);
    } else if (step === 2) {
      if (!workspaceName) setWorkspaceName(repoName);
      setStep(3);
    }
  };

  const handleBack = () => {
    if (mode === 'connect' && step === 3) {
      // Go back to repo selection
      setStep(1);
      return;
    }
    if (step > 1) setStep(step - 1);
    else setMode('choose');
  };

  const renderModalContent = () => {
    // Step 0: Choose mode
    if (mode === 'choose') {
      return (
        <div className="ws-modal-content">
          <div className="ws-modal-header">
            <h2>{t('modal.title.choose')}</h2>
            <p className="text-muted">{t('modal.desc.choose')}</p>
          </div>
          <div className="ws-mode-choices">
            <button className="ws-mode-card" onClick={() => { setMode('connect'); setStep(1); }}>
              <div className="ws-mode-icon connect"><Link size={24} /></div>
              <div className="ws-mode-info">
                <h3>{t('modal.mode.connect')}</h3>
                <p>{t('modal.mode.connect.desc')}</p>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
            <button className="ws-mode-card" onClick={() => { setMode('create'); setStep(1); }}>
              <div className="ws-mode-icon create"><FilePlus size={24} /></div>
              <div className="ws-mode-info">
                <h3>{t('modal.mode.create')}</h3>
                <p>{t('modal.mode.create.desc')}</p>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
          </div>
        </div>
      );
    }

    // Connect mode: repo list
    if (mode === 'connect' && step === 1) {
      return (
        <div className="ws-modal-content">
          <div className="ws-modal-header">
            <button className="ws-back-btn" onClick={handleBack}>{t('modal.btn.back')}</button>
            <h2>{t('modal.title.repo')}</h2>
            <p className="text-muted">{t('modal.desc.repo')}</p>
          </div>
          <div className="ws-repo-search">
            <Search size={14} />
            <input
              type="text"
              placeholder={t('modal.search.placeholder')}
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="ws-repo-list">
            {loadingRepos ? (
              <div className="ws-repo-loading">
                <Loader2 size={20} className="spin" />
                <span>저장소 불러오는 중...</span>
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="ws-repo-empty">
                <p>{repoSearch ? '검색 결과 없음' : t('modal.empty.repo')}</p>
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <button
                  key={repo.full_name}
                  className="ws-repo-item"
                  onClick={() => handleSelectRepo(repo)}
                >
                  <GitBranch size={14} />
                  <div className="ws-repo-item-info">
                    <span className="ws-repo-name">{repo.full_name}</span>
                    {repo.description && (
                      <span className="ws-repo-desc">{repo.description}</span>
                    )}
                  </div>
                  {repo.private && <span className="ws-repo-badge">Private</span>}
                </button>
              ))
            )}
          </div>
        </div>
      );
    }

    // Create mode or Connect step 3: form steps
    return (
      <div className="ws-modal-content">
        <div className="ws-modal-header">
          <button className="ws-back-btn" onClick={handleBack}>{t('modal.btn.back')}</button>
          <h2>{mode === 'create' ? t('modal.title.create') : t('modal.title.settings')}</h2>
          <div className="ws-steps">
            {(mode === 'create' ? [1, 2, 3] : [3]).map((s) => (
              <div key={s} className={`ws-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && mode === 'create' && (
            <motion.div
              key="step1"
              className="ws-step-content"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <div className="form-group">
                <label>{t('modal.step.reponame')}</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="예: my-context-repo"
                  className="input"
                  autoFocus
                />
                <span className="form-hint">GitHub에 생성될 저장소 이름입니다</span>
              </div>
            </motion.div>
          )}

          {step === 2 && mode === 'create' && (
            <motion.div
              key="step2"
              className="ws-step-content"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <div className="form-group">
                <label>{t('modal.step.owner')}</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={defaultOwner || 'username'}
                  className="input"
                  autoFocus
                />
                <span className="form-hint">비워두면 '{defaultOwner}' 으로 설정됩니다</span>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              className="ws-step-content"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              {mode === 'connect' && (
                <div className="ws-selected-repo">
                  <GitBranch size={14} />
                  <span>{ownerName}/{repoName}</span>
                </div>
              )}
              <div className="form-group">
                <label>{t('modal.step.workspace')}</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="예: master-context"
                  className="input"
                  autoFocus
                />
                <span className="form-hint">Cotext에서 표시될 이름입니다</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="ws-modal-footer">
          {step < 3 && mode === 'create' ? (
            <button className="btn btn-primary" onClick={handleNext} disabled={!canNext()}>
              {t('modal.btn.next')}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !workspaceName.trim()}
            >
              {creating ? (
                <><Loader2 size={14} className="spin" /> {t('modal.btn.creating')}</>
              ) : (
                mode === 'connect' ? t('modal.btn.connect') : t('modal.btn.create')
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="workspaces-page">
      <div className="workspaces-header">
        <div>
          <h1>{t('workspaces.title')}</h1>
          <p className="text-muted">{t('workspaces.desc')}</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <Plus size={18} />
          <span>{t('workspaces.new')}</span>
        </button>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              className="ws-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
            />
            {/* Modal Container */}
            <div className="ws-modal-container" onClick={closeModal}>
              {/* Modal — desktop: center, mobile: bottom sheet */}
              <motion.div
                className="ws-modal"
                initial={{ opacity: 0, y: 60, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 60, scale: 0.97 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ws-modal-handle" />
                {renderModalContent()}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <div className="workspaces-grid">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>{t('workspaces.loading')}</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <FolderGit2 size={48} strokeWidth={1} />
            <h3>{t('workspaces.empty.title')}</h3>
            <p>{t('workspaces.empty.desc')}</p>
            <button className="btn btn-primary" onClick={openModal}>
              <Plus size={18} />
              <span>{t('workspaces.new')}</span>
            </button>
          </div>
        ) : (
          workspaces.map((ws) => (
            <div
              key={ws.id}
              className="workspace-card"
              onClick={() => handleOpenWorkspace(ws)}
            >
              <div className="workspace-card-header">
                <div className="workspace-card-icon">
                  <FolderGit2 size={20} />
                </div>
                <div className="workspace-card-info">
                  <h3>{ws.name}</h3>
                  <p className="text-muted text-sm">
                    <GitBranch size={12} />
                    {ws.github_owner}/{ws.github_repo}
                  </p>
                </div>
                <ChevronRight size={18} className="text-muted" />
              </div>
              <div className="workspace-card-meta">
                <span className="badge">
                  {ws.default_branch}
                </span>
                <span className="text-muted text-xs">
                  {new Date(ws.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
