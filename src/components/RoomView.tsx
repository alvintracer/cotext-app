import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { githubApi, fetchAssetBlobUrl } from '../lib/supabase/functions';
import { useAuth } from '../contexts/AuthContext';
import { appendMessage, createInitialContent, createImageLink, createFileLink, generateAssetFileName } from '../lib/markdown/index';
import { compressImage, formatFileSize, isImageFile, MAX_FILE_SIZE } from '../lib/image/compress';
import type { Room, LocalDraft, SyncStatus } from '../types/room';
import type { Workspace } from '../types/workspace';
import MorphingComposer from './MorphingComposer';
import CommitBar from './CommitBar';
import CotextEditor from './CotextEditor';
import { AlertTriangle, Check, Loader2, Eye, Split, MessageSquare, Code, Clock } from 'lucide-react';

interface RoomViewProps {
  room: Room;
  workspace: Workspace;
  onRoomUpdate: (room: Room) => void;
}

type ViewMode = 'chat' | 'editor' | 'split' | 'preview';

export default function RoomView({ room, workspace, onRoomUpdate }: RoomViewProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [remoteContent, setRemoteContent] = useState('');
  const [remoteSha, setRemoteSha] = useState<string | null>(room.last_known_sha);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [commitMessage, setCommitMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Load initial content
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load draft from Supabase
        const { data: draft } = await supabase
          .from('local_drafts')
          .select('*')
          .eq('room_id', room.id)
          .eq('user_id', user!.id)
          .maybeSingle();

        if (draft) {
          setLocalDraft(draft);
          setContent(draft.content);
          setDirty(draft.dirty);
          setSyncStatus(draft.dirty ? 'draft' : 'synced');
        }

        // Try to pull from GitHub
        try {
          const result = await githubApi.getRoomContent(
            workspace.github_owner,
            workspace.github_repo,
            workspace.default_branch,
            room.cotext_file_path
          );

          setRemoteContent(result.content);
          setRemoteSha(result.sha);

          if (!draft || !draft.dirty) {
            setContent(result.content);
            setSyncStatus('synced');
          } else if (draft.base_sha !== result.sha) {
            setSyncStatus('conflict');
          }

          // Update room's last known SHA
          await supabase
            .from('rooms')
            .update({ last_known_sha: result.sha, updated_at: new Date().toISOString() })
            .eq('id', room.id);

          onRoomUpdate({ ...room, last_known_sha: result.sha });
        } catch (_err: unknown) {
          // File doesn't exist yet - that's OK for new rooms
          if (!draft) {
            const initial = createInitialContent(room.path);
            setContent(initial);
            setRemoteContent('');
          }
        }
      } catch (err) {
        console.error('Failed to load content:', err);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [room.id]);

  // Save draft to Supabase (debounced)
  const saveDraftRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    const isDirty = newContent !== remoteContent;
    setDirty(isDirty);
    setSyncStatus(isDirty ? 'draft' : 'synced');

    // Debounced save
    if (saveDraftRef.current) clearTimeout(saveDraftRef.current);
    saveDraftRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('local_drafts')
          .upsert({
            room_id: room.id,
            user_id: user!.id,
            content: newContent,
            base_sha: remoteSha,
            dirty: isDirty,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'room_id,user_id' });
      } catch (err) {
        console.error('Failed to save draft:', err);
      }
    }, 1000);
  }, [remoteContent, remoteSha, room.id, user]);

  // Append chat message
  const handleSendMessage = useCallback(async (message: string, files?: File[]) => {
    let attachments: string[] = [];

    // Handle file uploads
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          let uploadFile = file;

          if (isImageFile(file)) {
            const result = await compressImage(file);
            uploadFile = result.file;
          } else if (file.size > MAX_FILE_SIZE) {
            setError(`File ${file.name} exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
            continue;
          }

          const assetName = generateAssetFileName(
            uploadFile.name,
            isImageFile(uploadFile) ? 'image' : 'file'
          );

          // Convert to base64 for upload
          const base64 = await fileToBase64(uploadFile);

          const assetPath = `${room.cotext_file_path.replace(/[^/]+$/, '')}assets/${assetName}`;
          await githubApi.uploadAsset(
            workspace.github_owner,
            workspace.github_repo,
            workspace.default_branch,
            assetPath,
            base64,
            `cotext: upload ${assetName}`
          );

          if (isImageFile(uploadFile)) {
            attachments.push(createImageLink(assetName));
          } else {
            attachments.push(createFileLink(assetName, file.name));
          }
        } catch (err) {
          console.error('Failed to upload file:', err);
          setError(`Failed to upload ${file.name}`);
        }
      }
    }

    const newContent = appendMessage(content, message, attachments.length > 0 ? attachments : undefined);
    handleContentChange(newContent);

    // Scroll to bottom
    if (timelineRef.current) {
      setTimeout(() => {
        timelineRef.current?.scrollTo({
          top: timelineRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [content, handleContentChange, room.id]);

  // Pull from GitHub
  const handlePull = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('syncing');
    setError(null);
    try {
      const result = await githubApi.getRoomContent(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path
      );

      setRemoteContent(result.content);
      setRemoteSha(result.sha);

      if (!dirty) {
        setContent(result.content);
        setSyncStatus('synced');
      } else if (localDraft?.base_sha !== result.sha) {
        setSyncStatus('conflict');
      } else {
        setSyncStatus('draft');
      }

      await supabase
        .from('rooms')
        .update({ last_known_sha: result.sha })
        .eq('id', room.id);

      onRoomUpdate({ ...room, last_known_sha: result.sha });
    } catch (err: any) {
      setSyncStatus('error');
      setError('Failed to pull from GitHub');
    } finally {
      setSyncing(false);
    }
  }, [workspace, room, dirty, localDraft]);

  // Push to GitHub
  const handlePush = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('syncing');
    setError(null);
    try {
      const message = commitMessage.trim() || `cotext: update ${room.path}`;

      const result = await githubApi.pushRoom(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path,
        content,
        remoteSha,
        message
      );

      setRemoteContent(content);
      setRemoteSha(result.sha);
      setDirty(false);
      setSyncStatus('synced');
      setCommitMessage('');

      // Update draft
      await supabase
        .from('local_drafts')
        .upsert({
          room_id: room.id,
          user_id: user!.id,
          content,
          base_sha: result.sha,
          dirty: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'room_id,user_id' });

      await supabase
        .from('rooms')
        .update({ last_known_sha: result.sha })
        .eq('id', room.id);

      onRoomUpdate({ ...room, last_known_sha: result.sha });
    } catch (err: any) {
      setSyncStatus('error');
      setError(err.message || 'Failed to push to GitHub');
    } finally {
      setSyncing(false);
    }
  }, [content, remoteSha, commitMessage, room, workspace, user]);

  // Force push (overwrite remote)
  const handleForcePush = useCallback(async () => {
    // Re-pull to get latest SHA, then push
    try {
      const result = await githubApi.getRoomContent(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path
      );
      setRemoteSha(result.sha);
      // Now push with the latest SHA
      setTimeout(() => handlePush(), 100);
    } catch {
      handlePush();
    }
  }, [workspace, room, handlePush]);

  if (loading) {
    return (
      <div className="room-loading">
        <div className="spinner" />
        <p>Loading room...</p>
      </div>
    );
  }

  return (
    <div className="room-view">
      {/* Room header */}
      <div className="room-header">
        <div className="room-header-info">
          <h2>{room.path}</h2>
          <span className={`sync-badge sync-badge-${syncStatus}`}>
            {syncStatus === 'synced' && <><Check size={12} /> Synced</>}
            {syncStatus === 'draft' && <><Code size={12} /> Draft</>}
            {syncStatus === 'conflict' && <><AlertTriangle size={12} /> Conflict</>}
            {syncStatus === 'syncing' && <><Loader2 size={12} className="spin" /> Syncing</>}
            {syncStatus === 'error' && <><AlertTriangle size={12} /> Error</>}
          </span>
        </div>
        <div className="view-mode-tabs">
          {(['chat', 'editor', 'split', 'preview'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`view-mode-tab ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'chat' && <MessageSquare size={14} />}
              {mode === 'editor' && <Code size={14} />}
              {mode === 'split' && <Split size={14} />}
              {mode === 'preview' && <Eye size={14} />}
              <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Conflict banner */}
      {syncStatus === 'conflict' && (
        <div className="conflict-banner">
          <AlertTriangle size={14} />
          <span>Remote has changed since your last pull.</span>
          <div className="conflict-actions">
            <button className="btn btn-sm btn-ghost" onClick={handlePull}>Pull & Overwrite</button>
            <button className="btn btn-sm btn-primary" onClick={handleForcePush}>Push Anyway</button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className={`room-content room-content-${viewMode}`}>
        {(viewMode === 'chat' || viewMode === 'split') && (
          <div className="room-timeline" ref={timelineRef}>
            <TimelineView
              content={content}
              remoteContent={remoteContent}
              workspace={workspace}
              room={room}
            />
          </div>
        )}

        {(viewMode === 'editor' || viewMode === 'split') && (
          <div className="room-editor-pane">
            <CotextEditor
              content={content}
              onChange={handleContentChange}
              readOnly={false}
            />
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="room-preview">
            <div className="markdown-preview">
              <BlockContent text={content} workspace={workspace} room={room} />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      {(viewMode === 'chat' || viewMode === 'split') && (
        <MorphingComposer onSend={handleSendMessage} />
      )}

      {/* Commit bar */}
      <CommitBar
        commitMessage={commitMessage}
        onCommitMessageChange={setCommitMessage}
        onPull={handlePull}
        onPush={handlePush}
        syncStatus={syncStatus}
        syncing={syncing}
        dirty={dirty}
        roomPath={room.path}
      />
    </div>
  );
}

// Simple timeline renderer
function TimelineView({ content, remoteContent, workspace, room }: {
  content: string;
  remoteContent: string;
  workspace: Workspace;
  room: Room;
}) {
  const lines = content.split('\n');
  const remoteLines = new Set(remoteContent.split('\n'));
  const blocks: Array<{ lines: string[]; isPushed: boolean; timestamp?: string }> = [];
  let currentBlock: { lines: string[]; isPushed: boolean; timestamp?: string } | null = null;

  for (const line of lines) {
    const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (tsMatch) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        lines: [],
        isPushed: remoteLines.has(line),
        timestamp: tsMatch[1],
      };
    } else if (line.match(/^# /)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { lines: [line], isPushed: true };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  if (blocks.length === 0) {
    return (
      <div className="timeline-empty">
        <MessageSquare size={32} strokeWidth={1} />
        <p>No messages yet. Start typing below!</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {blocks.map((block, i) => (
        <div
          key={i}
          className={`timeline-block ${block.isPushed ? 'pushed' : 'draft'}`}
        >
          {block.timestamp && (
            <div className="timeline-timestamp">
              <Clock size={12} />
              <span>{block.timestamp}</span>
              {!block.isPushed && <span className="draft-badge">Draft</span>}
            </div>
          )}
          <div className="timeline-content">
            <BlockContent text={block.lines.join('\n')} workspace={workspace} room={room} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Render a block's content with inline images loaded from GitHub
function BlockContent({ text, workspace, room }: { text: string; workspace: Workspace; room: Room }) {
  // Split text into segments: regular text and image references
  const segments: Array<{ type: 'text' | 'image'; content: string; alt?: string; assetPath?: string }> = [];
  const imageRegex = /!\[([^\]]*)\]\(\.\/(assets\/[^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    // Text before this image
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'image', content: match[0], alt: match[1], assetPath: match[2] });
    lastIndex = match.index + match[0].length;
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'image' && seg.assetPath) {
          const basePath = room.cotext_file_path.replace(/[^/]+$/, '');
          const fullAssetPath = `${basePath}${seg.assetPath}`;
          return (
            <GitHubImage
              key={i}
              owner={workspace.github_owner}
              repo={workspace.github_repo}
              branch={workspace.default_branch}
              path={fullAssetPath}
              alt={seg.alt || seg.assetPath.split('/').pop() || 'image'}
            />
          );
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(seg.content) }} />;
      })}
    </>
  );
}

// GitHub image component that fetches from private repos via Edge Function
function GitHubImage({ owner, repo, branch, path, alt }: {
  owner: string; repo: string; branch: string; path: string; alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchAssetBlobUrl(owner, repo, branch, path)
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [owner, repo, branch, path]);

  if (loading) {
    return (
      <div className="timeline-image loading">
        <div className="image-loading-placeholder">
          <Loader2 size={20} className="spinner-icon" />
        </div>
        <span className="image-caption">{alt}</span>
      </div>
    );
  }

  if (error || !src) {
    return (
      <div className="timeline-image error">
        <div className="image-error-placeholder">⚠️ Failed to load</div>
        <span className="image-caption">{alt}</span>
      </div>
    );
  }

  return (
    <div className="timeline-image">
      <img src={src} alt={alt} loading="lazy" />
      <span className="image-caption">{alt}</span>
    </div>
  );
}

// Helper: simple markdown to HTML (text only, no images - images handled by BlockContent)
function simpleMarkdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Absolute URL images (public)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, '<div class="timeline-image"><img alt="$1" src="$2" loading="lazy" /></div>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((<li>.*<\/li>))/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<p>${html}</p>`;
}

// Helper: file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:*/*;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

