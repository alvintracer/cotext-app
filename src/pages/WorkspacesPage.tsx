import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { Plus, GitBranch, FolderGit2, ChevronRight } from 'lucide-react';
import type { Workspace } from '../types/workspace';

export default function WorkspacesPage() {
  const { user } = useAuth();
  const { workspaces, loading, createWorkspace, selectWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newRepo.trim()) return;
    setCreating(true);
    try {
      const owner = newOwner.trim() || user?.user_metadata?.user_name || '';
      await createWorkspace({
        name: newName.trim(),
        github_owner: owner,
        github_repo: newRepo.trim(),
      });
      setShowCreate(false);
      setNewName('');
      setNewRepo('');
      setNewOwner('');
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setCreating(false);
    }
  }, [newName, newRepo, newOwner, user, createWorkspace]);

  const handleOpenWorkspace = useCallback((ws: Workspace) => {
    selectWorkspace(ws);
    navigate(`/workspace/${ws.id}`);
  }, [selectWorkspace, navigate]);

  return (
    <div className="workspaces-page">
      <div className="workspaces-header">
        <div>
          <h1>Workspaces</h1>
          <p className="text-muted">Connect GitHub repositories as workspaces</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          <span>New Workspace</span>
        </button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Workspace</h2>
            <p className="text-muted mb-4">Connect a GitHub repository to start capturing context.</p>

            <div className="form-group">
              <label>Workspace Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., master-context"
                className="input"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>GitHub Owner</label>
              <input
                type="text"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder={user?.user_metadata?.user_name || 'username'}
                className="input"
              />
            </div>

            <div className="form-group">
              <label>Repository Name</label>
              <input
                type="text"
                value={newRepo}
                onChange={(e) => setNewRepo(e.target.value)}
                placeholder="e.g., my-context-repo"
                className="input"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newRepo.trim()}
              >
                {creating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="workspaces-grid">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading workspaces...</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <FolderGit2 size={48} strokeWidth={1} />
            <h3>No workspaces yet</h3>
            <p>Create your first workspace to connect a GitHub repository.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} />
              <span>Create Workspace</span>
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
