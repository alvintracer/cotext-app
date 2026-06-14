import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase/client';
import { githubApi } from '../lib/supabase/functions';
import type { Room } from '../types/room';
import RoomView from '../components/RoomView';
import ApiKeyManager from '../components/ApiKeyManager';
import AgentPanel from '../components/AgentPanel';
import {
  FolderOpen, Plus, CaretLeft as ChevronLeft, MagnifyingGlass as Search, ChatText as MessageSquare,
  TreeStructure as FolderTree, CaretRight as ChevronRight, List as Menu, X,
  Link as LinkIcon, Copy, Check, Users, UserPlus, Robot, CodepenLogo
} from '@phosphor-icons/react';

interface TreeItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeItem[];
}

interface Teammate {
  user_id: string;
  display_name: string;
  github_username: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSaveKey, setAgentSaveKey] = useState(0);

  // Team & Invite state
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState<'7days' | '30days' | 'never'>('7days');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteTab, setInviteTab] = useState<'team' | 'agent'>('team');

  const workspace = currentWorkspace || workspaces.find((w) => w.id === workspaceId);

  useEffect(() => {
    if (workspace && !currentWorkspace) {
      selectWorkspace(workspace);
    }
  }, [workspace, currentWorkspace, selectWorkspace]);

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (!workspaceId || !user) return;
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setRooms(data || []);

      // Auto-create guide room if it doesn't exist
      if (data && data.length === 0 && user) {
        try {
          const { data: guideRoom } = await supabase
            .from('rooms')
            .insert({
              workspace_id: workspaceId,
              user_id: user.id,
              path: 'COTEXT_GUIDE',
              name: '📘 Cotext Guide',
            })
            .select()
            .single();
          if (guideRoom) {
            setRooms([guideRoom]);
          }
        } catch (err) {
          console.error('Failed to create guide room:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, [workspaceId, user]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Load teammates
  useEffect(() => {
    if (!workspace) return;

    const loadTeammates = async () => {
      try {
        const { data, error } = await supabase.rpc('get_repo_teammates', {
          p_github_owner: workspace.github_owner,
          p_github_repo: workspace.github_repo,
        });
        if (!error && data) {
          setTeammates(data as Teammate[]);
        }
      } catch (err) {
        console.error('Failed to load teammates:', err);
      }
    };

    loadTeammates();
  }, [workspace]);

  // Load repo tree for adding new room
  const loadTree = useCallback(async () => {
    if (!workspace) return;
    setLoadingTree(true);
    try {
      const result = await githubApi.getTree(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch
      );
      setTree(result.tree || []);
    } catch (err) {
      console.error('Failed to load tree:', err);
      setTree([]);
    } finally {
      setLoadingTree(false);
    }
  }, [workspace]);

  const handleAddRoom = useCallback(async () => {
    if (!workspace || !user || !selectedPath) return;

    const cotextFolder = workspace.cotext_folder_name || '.cotext';
    const cotextFilePath = selectedPath
      ? `${selectedPath}/${cotextFolder}/cotext.md`
      : `${cotextFolder}/cotext.md`;

    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          path: selectedPath || 'root',
          cotext_folder: cotextFolder,
          cotext_file_path: cotextFilePath,
        })
        .select()
        .single();

      if (error) throw error;
      setRooms((prev) => [data, ...prev]);
      setShowAddRoom(false);
      setSelectedPath('');
      setSelectedRoom(data);
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }, [workspace, user, selectedPath]);

  // Generate invite link
  const handleGenerateInvite = useCallback(async () => {
    if (!workspace || !user) return;
    setGeneratingInvite(true);
    setCopied(false);

    try {
      const code = generateInviteCode();
      let expiresAt: string | null = null;

      if (inviteExpiry === '7days') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (inviteExpiry === '30days') {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('workspace_invites')
        .insert({
          invite_code: code,
          created_by: user.id,
          github_owner: workspace.github_owner,
          github_repo: workspace.github_repo,
          default_branch: workspace.default_branch,
          suggested_name: workspace.name,
          expires_at: expiresAt,
        });

      if (error) throw error;

      const origin = window.location.origin;
      setInviteLink(`${origin}/invite/${code}`);
    } catch (err) {
      console.error('Failed to generate invite:', err);
    } finally {
      setGeneratingInvite(false);
    }
  }, [workspace, user, inviteExpiry]);

  const handleCopyLink = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteLink]);

  const filteredRooms = rooms.filter((r) =>
    r.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!workspace) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="workspace-detail">
      {/* Mobile sidebar toggle */}
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Agent panel toggle */}
      {!agentOpen && (
        <button className="agent-toggle" onClick={() => setAgentOpen(true)}>
          <CodepenLogo size={16} weight="duotone" />
          <span>{language === 'ko' ? '에이전트' : 'Agents'}</span>
        </button>
      )}

      {/* Sidebar */}
      <aside className={`workspace-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/workspaces')}>
            <ChevronLeft size={16} />
          </button>
          <div className="sidebar-title">
            <h2>{workspace.name}</h2>
            <span className="text-muted text-xs">
              {workspace.github_owner}/{workspace.github_repo}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowInviteModal(true);
              setInviteLink('');
              setCopied(false);
            }}
            title={t('team.invite')}
          >
            <LinkIcon size={16} />
          </button>
        </div>

        <div className="sidebar-search">
          <Search size={14} />
          <input
            type="text"
            placeholder={t('sidebar.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-actions">
          <button className="btn btn-ghost btn-sm btn-full" onClick={() => {
            setShowAddRoom(true);
            loadTree();
          }}>
            <Plus size={14} />
            <span>{t('sidebar.newChat')}</span>
          </button>
        </div>

        <div className="room-list">
          {loadingRooms ? (
            <div className="loading-state-sm">
              <div className="spinner-sm" />
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="empty-state-sm">
              <p className="text-muted">{t('sidebar.emptyChats')}</p>
            </div>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedRoom(room);
                  setSidebarOpen(false);
                }}
              >
                <MessageSquare size={14} />
                <span className="room-item-path">{room.path}</span>
                {room.last_known_sha && (
                  <span className="room-synced-dot" title="Synced" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Team section */}
        <div className="sidebar-team">
          <div className="sidebar-team-header">
            <Users size={14} />
            <span>{t('team.title')}</span>
            <span className="team-count">{teammates.length + 1}</span>
          </div>
          <div className="sidebar-team-list">
            {/* Current user */}
            <div className="team-member">
              <img
                src={user?.user_metadata?.avatar_url || `https://github.com/${user?.user_metadata?.user_name}.png?size=24`}
                alt=""
                className="team-member-avatar"
              />
              <span className="team-member-name">
                {user?.user_metadata?.user_name || 'You'}
                <span className="team-member-you">({t('team.you')})</span>
              </span>
            </div>
            {/* Teammates */}
            {teammates.map((mate) => (
              <div key={mate.user_id} className="team-member">
                <img
                  src={`https://github.com/${mate.github_username}.png?size=24`}
                  alt=""
                  className="team-member-avatar"
                />
                <span className="team-member-name">{mate.display_name || mate.github_username}</span>
              </div>
            ))}
            {teammates.length === 0 && (
              <button
                className="btn btn-ghost btn-xs team-invite-btn"
                onClick={() => {
                  setShowInviteModal(true);
                  setInviteLink('');
                  setCopied(false);
                }}
              >
                <UserPlus size={12} />
                <span>{t('team.invite')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="workspace-main">
        {selectedRoom ? (
          <RoomView
            key={`${selectedRoom.id}-${agentSaveKey}`}
            room={selectedRoom}
            workspace={workspace}
            onRoomUpdate={(updated) => {
              setSelectedRoom(updated);
              setRooms((prev) =>
                prev.map((r) => (r.id === updated.id ? updated : r))
              );
            }}
          />
        ) : (
          <div className="empty-room-state">
            <FolderOpen size={48} strokeWidth={1} />
            <h3>{t('chat.selectPrompt')}</h3>
            <p className="text-muted">{t('chat.selectDesc')}</p>
          </div>
        )}
      </main>

      {/* Embedded multi-model agent panel (right) */}
      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        workspace={workspace}
        room={selectedRoom}
        rooms={rooms}
        onSaved={() => setAgentSaveKey((k) => k + 1)}
      />

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="modal-overlay" onClick={() => setShowAddRoom(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>{t('modal.title.addChat')}</h2>
            <p className="text-muted mb-4">
              {t('modal.desc.addChat').replace('{repo}', `${workspace.github_owner}/${workspace.github_repo}`)}
            </p>

            <div className="form-group">
              <label>Directory Path</label>
              <input
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder="e.g., projects/my-project or inbox"
                className="input"
              />
            </div>

            {loadingTree ? (
              <div className="loading-state-sm">
                <div className="spinner-sm" />
                <p className="text-muted text-sm">Loading repository structure...</p>
              </div>
            ) : tree.length > 0 ? (
              <div className="tree-list">
                <p className="text-muted text-xs mb-2">Or select from repository:</p>
                {tree
                  .filter((item) => item.type === 'dir')
                  .map((item) => (
                    <button
                      key={item.path}
                      className={`tree-item ${selectedPath === item.path ? 'active' : ''}`}
                      onClick={() => setSelectedPath(item.path)}
                    >
                      <FolderTree size={14} />
                      <span>{item.path}</span>
                      <ChevronRight size={12} />
                    </button>
                  ))}
              </div>
            ) : null}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddRoom(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleAddRoom}
                disabled={!selectedPath.trim()}
              >
                {t('modal.btn.openChat')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal invite-modal" onClick={(e) => e.stopPropagation()}>
            {/* Tab header */}
            <div className="invite-tabs">
              <button
                className={`invite-tab ${inviteTab === 'team' ? 'active' : ''}`}
                onClick={() => setInviteTab('team')}
              >
                <Users size={16} /> {t('team.modal.title')}
              </button>
              <button
                className={`invite-tab ${inviteTab === 'agent' ? 'active' : ''}`}
                onClick={() => setInviteTab('agent')}
              >
                <Robot size={16} /> 에이전트 연결
              </button>
            </div>

            {inviteTab === 'team' ? (
              <>
                <p className="text-muted mb-4">{t('team.modal.desc')}</p>

                {/* Repo info */}
                <div className="invite-modal-repo">
                  <span className="invite-modal-repo-name">
                    {workspace.github_owner}/{workspace.github_repo}
                  </span>
                </div>

                {!inviteLink ? (
                  <>
                    {/* Expiry selector */}
                    <div className="invite-expiry-selector">
                      <label className="text-muted text-sm">{t('team.modal.expires')}</label>
                      <div className="invite-expiry-options">
                        {(['7days', '30days', 'never'] as const).map((opt) => (
                          <button
                            key={opt}
                            className={`invite-expiry-opt ${inviteExpiry === opt ? 'active' : ''}`}
                            onClick={() => setInviteExpiry(opt)}
                          >
                            {t(`team.modal.${opt}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="modal-actions">
                      <button className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                      <button
                        className="btn btn-primary"
                        onClick={handleGenerateInvite}
                        disabled={generatingInvite}
                      >
                        <LinkIcon size={14} />
                        {t('team.modal.generate')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Generated link */}
                    <div className="invite-link-box">
                      <input
                        type="text"
                        readOnly
                        value={inviteLink}
                        className="input invite-link-input"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        className={`btn ${copied ? 'btn-success' : 'btn-primary'} invite-copy-btn`}
                        onClick={handleCopyLink}
                      >
                        {copied ? <><Check size={14} /> {t('team.modal.copied')}</> : <><Copy size={14} /> {t('team.modal.copyLink')}</>}
                      </button>
                    </div>

                    <div className="modal-actions">
                      <button className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Done</button>
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Agent tab */
              <ApiKeyManager workspaceId={workspace.id} repoOwner={workspace.github_owner} repoName={workspace.github_repo} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
