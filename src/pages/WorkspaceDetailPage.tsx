import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase/client';
import { githubApi } from '../lib/supabase/functions';
import type { Room } from '../types/room';
import RoomView from '../components/RoomView';
import {
  FolderOpen, Plus, ChevronLeft, Search, MessageSquare,
  FolderTree, ChevronRight
} from 'lucide-react';

interface TreeItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeItem[];
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen] = useState(true);

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
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, [workspaceId, user]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

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
      // If tree fails (empty repo or API issue), allow manual path entry
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
        </div>

        <div className="sidebar-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search rooms..."
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
            <span>New Room</span>
          </button>
        </div>

        <div className="room-list">
          {loadingRooms ? (
            <div className="loading-state-sm">
              <div className="spinner-sm" />
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="empty-state-sm">
              <p className="text-muted">No rooms yet</p>
            </div>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}
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
      </aside>

      {/* Main Content */}
      <main className="workspace-main">
        {selectedRoom ? (
          <RoomView
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
            <h3>Select a room</h3>
            <p className="text-muted">Choose a room from the sidebar or create a new one to start capturing context.</p>
          </div>
        )}
      </main>

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="modal-overlay" onClick={() => setShowAddRoom(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>Add Room</h2>
            <p className="text-muted mb-4">
              Select a directory from {workspace.github_owner}/{workspace.github_repo} to open as a room.
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
                Open as Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
