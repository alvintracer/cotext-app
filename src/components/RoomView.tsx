import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { githubApi, fetchAssetBlobUrl, neuralApi, type NeuralClusterHit, type NeuralNodeHit } from '../lib/supabase/functions';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { appendMessage, createInitialContent, createImageLink, createFileLink, formatBlockMeta, generateAssetFileName, parseBlockMeta, parseBlocks } from '../lib/markdown/index';
import { compressImage, formatFileSize, isImageFile, MAX_FILE_SIZE } from '../lib/image/compress';
import type { Room, LocalDraft, SyncStatus } from '../types/room';
import type { Workspace } from '../types/workspace';
import MorphingComposer from './MorphingComposer';
import CommitBar from './CommitBar';
import CotextEditor from './CotextEditor';
import { Warning as AlertTriangle, Check, Spinner as Loader2, Eye, Columns as Split, ChatText as MessageSquare, Code, Clock, DotsThreeVertical as MoreVertical, Trash as Trash2, Export, ShareNetwork, Link as LinkIcon, X, PencilSimple, CodepenLogo, ArrowDown, Graph, Tag, Plus, MagnifyingGlass, LinkSimple, ArrowSquareOut, Brain } from '@phosphor-icons/react';
import { generateCotextGuide, generateCotextIndex, generateAgentsPointerBlock, upsertPointerBlock } from '../lib/contextGuide';
import {
  nodifyBlock, removeNodeFromBlock, parseNodeComment,
  emptyGraph, parseGraph, serializeGraph, upsertCluster, linkEdge, unlinkEdge, syncNodesFromContent, neuralFilePath,
  relatedNodes, clusterMembers, generateNeuralIndex, neuralIndexFilePath,
  type Cluster, type InlineNodeMeta, type NeuralGraph, type NeuralNode,
} from '../lib/neural';
import '../styles/neural.css';

interface RoomViewProps {
  room: Room;
  workspace: Workspace;
  onRoomUpdate: (room: Room) => void;
  /** Send a draft block's text to the agent panel for restructuring/cleanup. */
  onFixWithAgent?: (text: string, timestamp: string) => void;
  /** Apply an agent result to LOCAL content: append a block (and optionally replace the origin). */
  apply?: { text: string; source: string; replaceTimestamp?: string; nonce: number } | null;
  /** Navigate to another chat in the same repo (Neural Link cross-room jump). */
  onNavigateRoom?: (roomPath: string, blockTs: string) => void;
  /** After this room loads, scroll to this block (used by cross-room jump). */
  focusBlockTs?: string | null;
  /** All rooms in this workspace — used by the graph view to fetch cross-room block text. */
  rooms?: Room[];
}

type ViewMode = 'chat' | 'editor' | 'split' | 'preview';

export default function RoomView({ room, workspace, onRoomUpdate, onFixWithAgent, apply, onNavigateRoom, focusBlockTs, rooms: _rooms }: RoomViewProps) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const currentAuthor = user?.user_metadata?.user_name || workspace.github_owner;
  const [content, setContent] = useState('');
  const [remoteContent, setRemoteContent] = useState('');
  const [remoteSha, setRemoteSha] = useState<string | null>(room.last_known_sha);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedPack, setCopiedPack] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<string>('24h');
  const [shareCreating, setShareCreating] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareScope, setShareScope] = useState<'room' | 'workspace'>('room');
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(room.name || 'cotext');
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Neural Link (P1): repo-wide graph (.cotext/neural.json) + node editor target
  const [graph, setGraph] = useState<NeuralGraph>(emptyGraph());
  const [nodeEditor, setNodeEditor] = useState<{ ts: string; meta: InlineNodeMeta | null } | null>(null);
  // Neural Link (P2): cluster members viewer
  const [clusterView, setClusterView] = useState<string | null>(null);
  // Neural Link (P2.5): node-to-node edge editor target (source node id + label)
  const [linkEditor, setLinkEditor] = useState<{ id: string; label: string } | null>(null);
  // Neural Link (P3): cross-repo search modal
  const [searchOpen, setSearchOpen] = useState(false);

  // Detect keyboard open/close via visualViewport to hide toolbars on mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const threshold = 150; // keyboard is at least 150px
    const handler = () => {
      const diff = window.innerHeight - vv.height;
      setKeyboardUp(diff > threshold);
    };
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);
  const focusedRef = useRef<string | null>(null);
  // Latest graph/content for ref-based persistence (edges persist without a content push)
  const graphRef = useRef(graph);
  const contentRef = useRef(content);
  const neuralTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { graphRef.current = graph; contentRef.current = content; }, [graph, content]);

  // Scroll the timeline to a block by timestamp, with a brief highlight.
  const jumpToBlock = useCallback((ts: string) => {
    const el = timelineRef.current?.querySelector(`[data-block-ts="${ts}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('block-flash');
    setTimeout(() => el.classList.remove('block-flash'), 1200);
  }, []);

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

  // Load Neural Link graph (.cotext/neural.json) — repo-wide, best-effort
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const path = neuralFilePath(workspace.cotext_folder_name || '.cotext');
        const res = await githubApi.getRoomContent(
          workspace.github_owner, workspace.github_repo, workspace.default_branch, path,
        );
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async load of neural graph
        if (!cancelled) setGraph(parseGraph(res.content));
      } catch { /* no neural.json yet — empty graph */ }
    })();
    return () => { cancelled = true; };
  }, [workspace.id]);

  // After content loads, scroll to a requested block (cross-room jump target).
  useEffect(() => {
    if (loading || !focusBlockTs) return;
    if (focusedRef.current === focusBlockTs) return;
    focusedRef.current = focusBlockTs;
    const id = setTimeout(() => jumpToBlock(focusBlockTs), 200);
    return () => clearTimeout(id);
  }, [loading, focusBlockTs, jumpToBlock]);

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

  // Neural Link (P1) — single write path shared by UI (here) and later MCP tools.
  // Nodify a block: write inline <!-- node: --> comment (cotext.md = source of truth),
  // upsert any new clusters into the in-memory registry, reconcile the node index.
  // Picks may carry an explicit `id` (from cross-repo index hits) so the slug is preserved.
  const handleSaveNode = useCallback((ts: string, label: string, picks: Array<{ name: string; id?: string }>) => {
    let g = graph;
    const clusterIds: string[] = [];
    for (const pick of picks) {
      const existing = g.clusters.find(
        (c) => (pick.id && c.id === pick.id) || c.name.toLowerCase() === pick.name.toLowerCase(),
      );
      if (existing) {
        clusterIds.push(existing.id);
      } else {
        const r = upsertCluster(g, { name: pick.name, id: pick.id });
        g = r.graph;
        clusterIds.push(r.cluster.id);
      }
    }
    const { content: newContent } = nodifyBlock(content, ts, { label, clusters: clusterIds });
    g = syncNodesFromContent(g, room.path, newContent);
    setGraph(g);
    handleContentChange(newContent);
    setNodeEditor(null);
  }, [graph, content, room.path, handleContentChange]);

  const handleRemoveNode = useCallback((ts: string) => {
    const newContent = removeNodeFromBlock(content, ts);
    setGraph(syncNodesFromContent(graph, room.path, newContent));
    handleContentChange(newContent);
  }, [graph, content, room.path, handleContentChange]);

  // Persist neural.json to repo. Re-fetch + merge so other rooms' clusters/edges
  // aren't clobbered, then reconcile this room's nodes from content. Reads latest
  // graph/content from refs so it's safe to call from debounced timers.
  const persistNeuralGraph = useCallback(async () => {
    const g0 = graphRef.current;
    const latestContent = contentRef.current;
    try {
      const path = neuralFilePath(workspace.cotext_folder_name || '.cotext');
      let sha: string | null = null;
      let base = g0;
      try {
        const ex = await githubApi.getRoomContent(
          workspace.github_owner, workspace.github_repo, workspace.default_branch, path,
        );
        sha = ex.sha;
        base = parseGraph(ex.content);
        for (const c of g0.clusters) base = upsertCluster(base, c).graph;
        for (const e of g0.edges) base = linkEdge(base, e.from, e.to, e.type);
      } catch { /* file doesn't exist yet — use in-memory graph */ }
      const merged = syncNodesFromContent(base, room.path, latestContent);
      setGraph(merged);
      await githubApi.pushRoom(
        workspace.github_owner, workspace.github_repo, workspace.default_branch,
        path, serializeGraph(merged), sha, 'cotext: sync neural graph',
      );
      // Also publish a human/agent-readable NEURAL_INDEX.md (P5.4 — option C grounding).
      // Best-effort: failure to publish the index never blocks the json sync.
      (async () => {
        try {
          const idxPath = neuralIndexFilePath(workspace.cotext_folder_name || '.cotext');
          let idxSha: string | null = null;
          try {
            const ex = await githubApi.getRoomContent(
              workspace.github_owner, workspace.github_repo, workspace.default_branch, idxPath,
            );
            idxSha = ex.sha;
          } catch { /* first time — no existing file */ }
          const md = generateNeuralIndex(merged, `${workspace.github_owner}/${workspace.github_repo}`);
          await githubApi.pushRoom(
            workspace.github_owner, workspace.github_repo, workspace.default_branch,
            idxPath, md, idxSha, 'cotext: sync neural index',
          );
        } catch (e) { console.warn('NEURAL_INDEX.md publish failed:', e); }
      })();
      // Mirror into the Supabase derived index (P3) — best-effort, enables cross-repo search
      neuralApi.sync(workspace.id, merged).catch((e) => console.warn('Neural index sync failed:', e));
    } catch (err) {
      console.warn('Neural graph sync failed:', err);
    }
  }, [room.path, workspace]);

  // Debounced persist for edge edits (which don't ride a content push).
  const scheduleNeuralPersist = useCallback(() => {
    if (neuralTimer.current) clearTimeout(neuralTimer.current);
    neuralTimer.current = setTimeout(() => { persistNeuralGraph(); }, 1500);
  }, [persistNeuralGraph]);

  // Node-to-node edges (P2.5) — single write path: graph state + debounced persist.
  const handleLinkEdge = useCallback((fromId: string, toId: string, type: string) => {
    setGraph((g) => linkEdge(g, fromId, toId, type));
    scheduleNeuralPersist();
  }, [scheduleNeuralPersist]);

  const handleUnlinkEdge = useCallback((fromId: string, toId: string) => {
    setGraph((g) => unlinkEdge(g, fromId, toId));
    scheduleNeuralPersist();
  }, [scheduleNeuralPersist]);

  // Apply an agent result to local content (from "Fix with Agent"): add a block,
  // optionally removing the original block being replaced. All local (draft) — no push.
  const applyNonce = apply?.nonce;
  useEffect(() => {
    if (!apply) return;
    let base = content;
    if (apply.replaceTimestamp) {
      const lines = base.split('\n');
      const kept: string[] = [];
      let skipping = false;
      for (const line of lines) {
        const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
        if (tsMatch && tsMatch[1] === apply.replaceTimestamp) { skipping = true; continue; }
        if (skipping && (line.match(/^## \d{4}/) || line.match(/^# /))) skipping = false;
        if (!skipping) kept.push(line);
      }
      base = kept.join('\n').replace(/\n{3,}/g, '\n\n');
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apply agent result to local draft on nonce change
    handleContentChange(appendMessage(base, apply.text, undefined, { source: apply.source, author: currentAuthor }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyNonce]);

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

    const newContent = appendMessage(content, message, attachments.length > 0 ? attachments : undefined, { source: 'me', author: currentAuthor });
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
  }, [content, currentAuthor, handleContentChange, room.id]);

  // Replace only a block's visible body in chat view. Metadata lines such as
  // source/node comments stay intact; any change makes the room a local draft
  // until the next push.
  const handleUpdateBlock = useCallback((blockTimestamp: string, nextBody: string) => {
    const lines = content.split('\n');
    const result: string[] = [];
    let inBlock = false;
    let replaced = false;
    let metadata: string[] = [];

    const flush = () => {
      if (replaced) {
        result.push(...metadata);
        if (metadata.length > 0) result.push('');
        const trimmed = nextBody.trim();
        if (trimmed) result.push(...trimmed.split('\n'));
        replaced = false;
        metadata = [];
      }
    };

    for (const line of lines) {
      const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
      if (tsMatch) {
        if (inBlock) flush();
        inBlock = tsMatch[1] === blockTimestamp;
        result.push(line);
        continue;
      }
      if (line.match(/^# /)) {
        if (inBlock) flush();
        inBlock = false;
        result.push(line);
        continue;
      }
      if (!inBlock) {
        result.push(line);
        continue;
      }
      if (!replaced && (parseBlockMeta(line) || parseNodeComment(line))) {
        metadata.push(line);
      } else {
        replaced = true;
      }
    }

    if (inBlock) flush();
    handleContentChange(result.join('\n').replace(/\n{3,}/g, '\n\n'));
  }, [content, handleContentChange]);

  const handleDeleteBlock = useCallback((blockTimestamp: string) => {
    const lines = content.split('\n');
    const result: string[] = [];
    let skipping = false;
    for (const line of lines) {
      const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
      if (tsMatch && tsMatch[1] === blockTimestamp) {
        skipping = true;
        continue;
      }
      if (skipping && (line.match(/^## \d{4}/) || line.match(/^# /))) {
        skipping = false;
      }
      if (!skipping) result.push(line);
    }
    handleContentChange(result.join('\n').replace(/\n{3,}/g, '\n\n'));
  }, [content, handleContentChange]);

  const handleChangeBlockSource = useCallback((blockTimestamp: string, newSource: string) => {
    const lines = content.split('\n');
    let inBlock = false;
    let changed = false;
    const result = lines.map((line) => {
      const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
      if (tsMatch) inBlock = tsMatch[1] === blockTimestamp;
      if (inBlock && !changed && parseBlockMeta(line)) {
        changed = true;
        return formatBlockMeta({ source: newSource, author: newSource === 'me' ? currentAuthor : workspace.github_owner });
      }
      return line;
    });
    handleContentChange(result.join('\n'));
  }, [content, currentAuthor, handleContentChange, workspace.github_owner]);

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

      // Sync guide files (best-effort, non-blocking)
      syncGuideFiles().catch(err => console.error('Guide sync failed:', err));

      // Persist Neural Link graph alongside the room (best-effort, non-blocking)
      persistNeuralGraph().catch(err => console.error('Neural sync failed:', err));
    } catch (err: any) {
      setSyncStatus('error');
      setError(err.message || 'Failed to push to GitHub');
    } finally {
      setSyncing(false);
    }
  }, [content, remoteSha, commitMessage, room, workspace, user, persistNeuralGraph]);

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

  // Rename chat
  const handleRename = useCallback(async () => {
    const newName = editNameValue.trim();
    if (!newName || newName === (room.name || 'cotext')) {
      setEditingName(false);
      return;
    }
    const safeName = newName.replace(/[^a-zA-Z0-9\uac00-\ud7a3_\-\s]/g, '').replace(/\s+/g, '-').toLowerCase() || 'cotext';
    const cotextFolder = workspace.cotext_folder_name || '.cotext';
    const newFilePath = room.path === 'root'
      ? `${cotextFolder}/${safeName}.md`
      : `${room.path}/${cotextFolder}/${safeName}.md`;

    try {
      const { error } = await supabase
        .from('rooms')
        .update({ name: newName, cotext_file_path: newFilePath })
        .eq('id', room.id);
      if (error) throw error;
      onRoomUpdate({ ...room, name: newName, cotext_file_path: newFilePath });
    } catch (err) {
      console.error('Failed to rename room:', err);
    }
    setEditingName(false);
  }, [room, editNameValue, workspace, onRoomUpdate]);

  // Copy Context Pack for LLM
  const handleCopyContextPack = useCallback(async () => {
    const now = new Date().toISOString().split('T')[0];

    // Filter: only include human-authored blocks (source: me or no source tag = legacy)
    const blocks = parseBlocks(content);
    const meBlocks = blocks.filter(b => !b.source || b.source === 'me');

    // Reconstruct content from me-only blocks
    let filteredContent = content;
    if (meBlocks.length < blocks.length) {
      // Get the content before the first block (header/title)
      const firstBlockIdx = content.indexOf('## ');
      const header = firstBlockIdx > 0 ? content.substring(0, firstBlockIdx) : '';
      const blockTexts = meBlocks.map(b =>
        `## ${b.timestamp}\n${formatBlockMeta({ source: 'me', author: b.author || workspace.github_owner })}\n${b.content.trimEnd()}`
      );
      filteredContent = header + blockTexts.join('\n\n') + '\n';
    }

    const totalBlocks = blocks.length;
    const includedBlocks = meBlocks.length;
    const filterNote = totalBlocks > includedBlocks
      ? `> Filter: ${includedBlocks}/${totalBlocks} blocks (me-only, ${totalBlocks - includedBlocks} agent blocks excluded)`
      : `> Blocks: ${totalBlocks} total (all human-authored)`;

    const pack = `# ${t('contextPack.title')} — ${workspace.github_owner}/${workspace.github_repo}

> Source: \`${workspace.github_owner}/${workspace.github_repo}\` / \`${room.path}\`
> Generated: ${now}
${filterNote}

## Instructions for Agent

This is a **Context Pack** from Cotext — a structured context pool stored in a GitHub repo.
The blocks below are my notes, decisions, and context. Use them to understand my thinking.

**Rules:**
1. When you generate content I'll save back, use this block format:
   \`\`\`
   ## YYYY-MM-DD HH:mm
   <!-- source: chatgpt; author: YOUR_GITHUB_USERNAME -->  ← or claude, gemini, etc.

   Your content here.
   \`\`\`
2. Always tag source and author — never omit \`<!-- source: ...; author: ... -->\`.
3. My blocks (\`source: me\`) are primary. Don't summarize or rewrite them.
4. Give me results as **markdown** so I can paste them back into Cotext.

---

${filteredContent}
`;
    try {
      await navigator.clipboard.writeText(pack);
      setCopiedPack(true);
      setTimeout(() => setCopiedPack(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = pack;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedPack(true);
      setTimeout(() => setCopiedPack(false), 2000);
    }
  }, [content, workspace, room, t]);

  // Sync guide files to repo (COTEXT_GUIDE.md, INDEX.md, AGENTS.md pointer)
  const syncGuideFiles = useCallback(async () => {
    if (!workspace || !user) return;

    // Fetch all rooms for this workspace to build the index (member-scoped via RLS)
    const { data: allRooms } = await supabase
      .from('rooms')
      .select('path, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false });

    const roomList = (allRooms || []).map(r => ({ path: r.path, updatedAt: r.updated_at }));

    // Generate guide content
    const guideContent = generateCotextGuide(workspace.github_owner, workspace.github_repo, roomList);
    const indexContent = generateCotextIndex(workspace.github_owner, workspace.github_repo, roomList);
    const pointerBlock = generateAgentsPointerBlock();

    const pushFile = async (path: string, fileContent: string, msg: string) => {
      try {
        // Try to get existing SHA
        let existingSha: string | null = null;
        try {
          const existing = await githubApi.getRoomContent(
            workspace.github_owner, workspace.github_repo, workspace.default_branch, path
          );
          existingSha = existing.sha;
        } catch { /* File doesn't exist yet */ }

        await githubApi.pushRoom(
          workspace.github_owner, workspace.github_repo, workspace.default_branch,
          path, fileContent, existingSha, msg
        );
      } catch (err) {
        console.warn(`Failed to sync ${path}:`, err);
      }
    };

    // Push guide files
    await pushFile('.cotext/COTEXT_GUIDE.md', guideContent, 'cotext: sync guide');
    await pushFile('.cotext/INDEX.md', indexContent, 'cotext: sync index');

    // AGENTS.md thin pointer (non-destructive)
    try {
      let agentsContent = '';
      let agentsSha: string | null = null;
      try {
        const existing = await githubApi.getRoomContent(
          workspace.github_owner, workspace.github_repo, workspace.default_branch, 'AGENTS.md'
        );
        agentsContent = existing.content;
        agentsSha = existing.sha;
      } catch { /* Doesn't exist */ }

      const updatedAgents = upsertPointerBlock(agentsContent, pointerBlock);
      if (updatedAgents !== agentsContent) {
        await githubApi.pushRoom(
          workspace.github_owner, workspace.github_repo, workspace.default_branch,
          'AGENTS.md', updatedAgents, agentsSha, 'cotext: sync agents pointer'
        );
      }
    } catch (err) {
      console.warn('Failed to sync AGENTS.md:', err);
    }
  }, [workspace, user]);

  // Create a share link
  const handleCreateShareLink = useCallback(async () => {
    if (!user || !workspace) return;
    setShareCreating(true);
    try {
      // Calculate expiry
      let expiresAt: string | null = null;
      const now = new Date();
      switch (shareExpiry) {
        case '1h': expiresAt = new Date(now.getTime() + 3600000).toISOString(); break;
        case '24h': expiresAt = new Date(now.getTime() + 86400000).toISOString(); break;
        case '7d': expiresAt = new Date(now.getTime() + 604800000).toISOString(); break;
        case '30d': expiresAt = new Date(now.getTime() + 2592000000).toISOString(); break;
        case 'never': expiresAt = null; break;
      }

      const { data, error: insertError } = await supabase
        .from('shared_links')
        .insert({
          workspace_id: workspace.id,
          room_id: shareScope === 'room' ? room.id : null,
          user_id: user.id,
          source_filter: 'me',
          expires_at: expiresAt,
          label: shareScope === 'room'
            ? `${room.path} — ${workspace.github_repo}`
            : `All chats — ${workspace.github_repo}`,
        })
        .select('token')
        .single();

      if (insertError) throw insertError;

      const baseUrl = window.location.origin;
      setShareLink(`${baseUrl}/share/${data.token}`);
    } catch (err) {
      console.error('Failed to create share link:', err);
      setError('Failed to create share link');
    } finally {
      setShareCreating(false);
    }
  }, [user, workspace, room, shareExpiry, shareScope]);

  if (loading) {
    return (
      <div className="room-loading">
        <div className="spinner" />
        <p>{t('chat.loading')}</p>
      </div>
    );
  }

  return (
    <div className="room-view">
      {/* Room header */}
      <div className="room-header">
        <div className="room-header-info">
          {editingName ? (
            <div className="room-name-edit">
              <input
                type="text"
                className="room-name-input"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  } else if (e.key === 'Escape') {
                    setEditingName(false);
                    setEditNameValue(room.name || 'cotext');
                  }
                }}
                onBlur={handleRename}
                autoFocus
              />
            </div>
          ) : (
            <button className="room-name-display" onClick={() => { setEditNameValue(room.name || 'cotext'); setEditingName(true); }}>
              <span className="room-name-path">{room.path === 'root' ? '/' : room.path} /</span>
              <span className="room-name-label">{room.name || 'cotext'}</span>
              <PencilSimple size={11} className="room-name-pencil" />
            </button>
          )}
          <span className={`sync-badge sync-badge-${syncStatus}`}>
            {syncStatus === 'synced' && <><Check size={12} /> Synced</>}
            {syncStatus === 'draft' && <><Code size={12} /> Draft</>}
            {syncStatus === 'conflict' && <><AlertTriangle size={12} /> Conflict</>}
            {syncStatus === 'syncing' && <><Loader2 size={12} className="spin" /> Syncing</>}
            {syncStatus === 'error' && <><AlertTriangle size={12} /> Error</>}
          </span>
        </div>
        <div className={`room-header-actions ${keyboardUp ? 'keyboard-up' : ''}`}>
          <div className="room-action-rail">
            {/* Mobile-only: Chat/Editor mode buttons merged into action rail */}
            <button
              className={`btn btn-ghost btn-sm context-pack-btn mobile-mode-btn ${viewMode === 'chat' ? 'active' : ''}`}
              onClick={() => setViewMode('chat')}
            >
              <MessageSquare size={14} /> Chat
            </button>
            <button
              className={`btn btn-ghost btn-sm context-pack-btn mobile-mode-btn ${viewMode === 'editor' ? 'active' : ''}`}
              onClick={() => setViewMode('editor')}
            >
              <Code size={14} /> Editor
            </button>
            <button
              className={`btn btn-ghost btn-sm context-pack-btn ${copiedPack ? 'copied' : ''}`}
              onClick={handleCopyContextPack}
              title={t('contextPack.copy')}
            >
              {copiedPack ? <><Check size={14} /> {t('contextPack.copied')}</> : <><Export size={14} /> {t('contextPack.copy')}</>}
            </button>
            <button
              className="btn btn-ghost btn-sm context-pack-btn"
              onClick={() => setShowShareModal(true)}
              title={t('share.title')}
            >
              <ShareNetwork size={14} /> {t('share.title')}
            </button>
            <button
              className="btn btn-ghost btn-sm context-pack-btn"
              onClick={() => setSearchOpen(true)}
              title={language === 'ko' ? '뉴런 검색 (레포 전체)' : 'Neuron search (across repos)'}
            >
              <Graph size={14} /> {language === 'ko' ? '뉴런 검색' : 'Neural'}
            </button>
          </div>
          <div className="room-mode-rail">
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
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content share-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><ShareNetwork size={18} /> {t('share.title')}</h3>
              <button className="icon-button" onClick={() => setShowShareModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {t('share.desc')}
              </p>
              <div className="share-options">
                <label>{t('share.scope')}</label>
                <select value={shareScope} onChange={e => { setShareScope(e.target.value as 'room' | 'workspace'); setShareLink(null); }}>
                  <option value="room">{t('share.scopeRoom')} ({room.path})</option>
                  <option value="workspace">{t('share.scopeAll')} ({workspace.github_repo})</option>
                </select>
              </div>
              <div className="share-options">
                <label>{t('share.expires')}</label>
                <select value={shareExpiry} onChange={e => setShareExpiry(e.target.value)}>
                  <option value="1h">{t('share.1h')}</option>
                  <option value="24h">{t('share.24h')}</option>
                  <option value="7d">{t('share.7d')}</option>
                  <option value="30d">{t('share.30d')}</option>
                  <option value="never">{t('share.never')}</option>
                </select>
              </div>
              {shareLink ? (
                <div className="share-link-result">
                  <input type="text" value={shareLink} readOnly className="share-link-input" />
                  <button
                    className={`btn btn-primary btn-sm ${shareCopied ? 'copied' : ''}`}
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareLink);
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    }}
                  >
                    {shareCopied ? <><Check size={14} /> {t('share.copied')}</> : <><LinkIcon size={14} /> {t('share.copy')}</>}
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleCreateShareLink}
                  disabled={shareCreating}
                >
                  {shareCreating ? <><Loader2 size={14} className="spin" /> {t('share.creating')}</> : <><LinkIcon size={14} /> {t('share.createLink')}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Node editor modal (Neural Link P1) */}
      {nodeEditor && (
        <NodeEditor
          initial={nodeEditor.meta && nodeEditor.meta.id ? nodeEditor.meta : null}
          seedLabel={nodeEditor.meta && !nodeEditor.meta.id ? nodeEditor.meta.label : undefined}
          workspaceId={workspace.id}
          clusters={graph.clusters}
          language={language}
          onClose={() => setNodeEditor(null)}
          onSave={(label, picks) => handleSaveNode(nodeEditor.ts, label, picks)}
        />
      )}

      {/* Cluster members modal (Neural Link P2) */}
      {clusterView && (
        <ClusterModal
          clusterId={clusterView}
          graph={graph}
          room={room}
          language={language}
          onClose={() => setClusterView(null)}
          onJump={(ts) => { setClusterView(null); jumpToBlock(ts); }}
          onNavigate={onNavigateRoom ? (path, ts) => { setClusterView(null); onNavigateRoom(path, ts); } : undefined}
        />
      )}


      {/* Cross-repo neural search modal (Neural Link P3) */}
      {searchOpen && (
        <NeuralSearchModal
          workspace={workspace}
          language={language}
          onClose={() => setSearchOpen(false)}
          onPick={(hit) => {
            setSearchOpen(false);
            if (hit.workspace_id === workspace.id) {
              if (hit.room === room.path) jumpToBlock(hit.block_ts);
              else onNavigateRoom?.(hit.room, hit.block_ts);
            } else {
              navigate(`/workspace/${hit.workspace_id}`);
            }
          }}
        />
      )}

      {/* Node link editor modal (Neural Link P2.5) */}
      {linkEditor && (
        <LinkEditor
          source={linkEditor}
          graph={graph}
          room={room}
          language={language}
          onClose={() => setLinkEditor(null)}
          onLink={(toId, type) => handleLinkEdge(linkEditor.id, toId, type)}
          onUnlink={(toId) => handleUnlinkEdge(linkEditor.id, toId)}
        />
      )}

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
          <div className="room-timeline" ref={timelineRef} onScroll={() => {
            const el = timelineRef.current;
            if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
          }}>
            <TimelineView
              content={content}
              remoteContent={remoteContent}
              workspace={workspace}
              room={room}
              graph={graph}
              onJump={jumpToBlock}
              onNavigateRoom={onNavigateRoom}
              onOpenCluster={(id) => setClusterView(id)}
              onNodify={(ts, meta) => setNodeEditor({ ts, meta })}
              onRemoveNode={(ts) => handleRemoveNode(ts)}
              onLinkNode={(id, label) => setLinkEditor({ id, label })}
              onToMindSync={(nodeId) => navigate(`/mindsync/studio?ws=${encodeURIComponent(workspace?.id || '')}&node=${encodeURIComponent(nodeId)}&view=editor`)}
              onFixWithAgent={onFixWithAgent}
              onDeleteBlock={handleDeleteBlock}
              onEditBlock={handleUpdateBlock}
              onChangeSource={handleChangeBlockSource}
            />
            {showScrollBtn && (
              <button
                className="scroll-bottom-btn"
                onClick={() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' })}
              >
                <ArrowDown size={16} weight="bold" />
              </button>
            )}
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

      {/* Syncing overlay toast */}
      {syncing && (
        <div className="sync-overlay-toast">
          <Loader2 size={16} className="spin" />
          <span>{syncStatus === 'syncing' ? 'Pushing to GitHub...' : 'Syncing...'}</span>
        </div>
      )}

      {/* Synced success toast */}
      {syncStatus === 'synced' && !syncing && dirty === false && (
        <SyncedToast />
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
function TimelineView({ content, remoteContent, workspace, room, graph, onDeleteBlock, onEditBlock, onChangeSource, onFixWithAgent, onNodify, onRemoveNode, onLinkNode, onJump, onNavigateRoom, onOpenCluster, onToMindSync }: {
  content: string;
  remoteContent: string;
  workspace: Workspace;
  room: Room;
  graph?: NeuralGraph;
  onDeleteBlock?: (timestamp: string) => void;
  onEditBlock?: (timestamp: string, nextBody: string) => void;
  onChangeSource?: (timestamp: string, newSource: string) => void;
  onFixWithAgent?: (text: string, timestamp: string) => void;
  onNodify?: (timestamp: string, meta: InlineNodeMeta | null) => void;
  onRemoveNode?: (timestamp: string) => void;
  onLinkNode?: (nodeId: string, label: string) => void;
  onJump?: (timestamp: string) => void;
  onNavigateRoom?: (roomPath: string, blockTs: string) => void;
  onOpenCluster?: (clusterId: string) => void;
  onToMindSync?: (nodeId: string) => void;
}) {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const clusterName = (id: string) => graph?.clusters.find((c) => c.id === id)?.name ?? id;
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [editingTs, setEditingTs] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  type Block = { lines: string[]; rawLines: string[]; rawText: string; isPushed: boolean; timestamp?: string; source?: string; author?: string; node?: InlineNodeMeta };

  function readBlocks(src: string): Block[] {
    const out: Block[] = [];
    let current: Omit<Block, 'rawText' | 'isPushed'> | null = null;
    for (const line of src.split('\n')) {
      const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
      if (tsMatch) {
        if (current) out.push({ ...current, rawText: current.rawLines.join('\n'), isPushed: false });
        current = { lines: [], rawLines: [line], timestamp: tsMatch[1] };
      } else if (line.match(/^# /)) {
        if (current) out.push({ ...current, rawText: current.rawLines.join('\n'), isPushed: false });
        current = { lines: [line], rawLines: [line] };
      } else if (current) {
        current.rawLines.push(line);
        const blockMeta = parseBlockMeta(line);
        const nodeMeta = parseNodeComment(line);
        if (blockMeta && !current.source) {
          current.source = blockMeta.source;
          current.author = blockMeta.author;
        }
        else if (nodeMeta) current.node = nodeMeta;
        else current.lines.push(line);
      }
    }
    if (current) out.push({ ...current, rawText: current.rawLines.join('\n'), isPushed: false });
    return out;
  }

  const remoteBlocks = readBlocks(remoteContent);
  const remoteByTs = new Map(remoteBlocks.filter((b) => b.timestamp).map((b) => [b.timestamp!, b.rawText]));
  const blocks = readBlocks(content).map((block) => ({
    ...block,
    isPushed: block.timestamp ? remoteByTs.get(block.timestamp) === block.rawText : true,
  }));

  const getAuthor = (block: Block) => block.author || workspace.github_owner;

  // Close menu on outside click
  useEffect(() => {
    if (openMenu === null) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  useEffect(() => {
    if (!editingTs) return;
    const block = blocks.find((b) => b.timestamp === editingTs);
    if (!block) {
      setEditingTs(null);
      setEditingValue('');
    }
  }, [blocks, editingTs]);

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
          data-block-ts={block.timestamp}
        >
          {block.timestamp && (
            <div className="timeline-timestamp">
              <Clock size={12} />
              <span>{block.timestamp}</span>
              {!block.isPushed && <span className="draft-badge">Draft</span>}
              <span className="timeline-author" title={getAuthor(block)}>
                <img
                  className="timeline-author-avatar"
                  src={`https://github.com/${getAuthor(block)}.png?size=24`}
                  alt={getAuthor(block)}
                />
                <span className="timeline-author-name">{getAuthor(block)}</span>
              </span>
              {block.source && block.source !== 'me' && block.timestamp ? (
                <span
                  className={`source-badge source-${block.source} source-clickable`}
                  title="Click to adopt as yours (source → me)"
                  onClick={() => onChangeSource?.(block.timestamp!, 'me')}
                >{block.source}</span>
              ) : block.source ? (
                <span className={`source-badge source-${block.source}`}>{block.source}</span>
              ) : null}
              {/* Neural Link node badge + cluster chips */}
              {block.node && (
                <span className="node-badge" title={ko ? '뉴런 노드' : 'Neuron node'}>
                  <Graph size={10} weight="bold" /> {block.node.label || (ko ? '노드' : 'node')}
                </span>
              )}
              {block.node && block.node.clusters.length > 0 && (
                <span className="timeline-clusters">
                  {block.node.clusters.map((id) => (
                    <button
                      key={id}
                      className="cluster-chip cluster-chip-btn"
                      onClick={() => onOpenCluster?.(id)}
                      title={ko ? '이 클러스터의 노드 보기' : 'View nodes in this cluster'}
                    >
                      <Tag size={9} /> {clusterName(id)}
                    </button>
                  ))}
                </span>
              )}
              {/* Three-dot menu (all blocks share the same local-edit workflow) */}
              {block.timestamp && (
                <div className="draft-menu-wrapper">
                  <button
                    className="draft-menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === i ? null : i);
                    }}
                    aria-label="More options"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {openMenu === i && (
                    <div className="draft-menu-popup" onClick={(e) => e.stopPropagation()}>
                      {onNodify && (
                        <button
                          className="draft-menu-item draft-menu-node"
                          onClick={() => {
                            setOpenMenu(null);
                            onNodify(block.timestamp!, block.node ?? null);
                          }}
                        >
                          <Graph size={13} />
                          <span>{block.node ? (ko ? '노드 편집' : 'Edit node') : (ko ? '노드로' : 'To node')}</span>
                        </button>
                      )}
                      {onEditBlock && (
                        <button
                          className="draft-menu-item"
                          onClick={() => {
                            setOpenMenu(null);
                            setEditingTs(block.timestamp!);
                            setEditingValue(block.lines.join('\n').trim());
                          }}
                        >
                          <PencilSimple size={13} />
                          <span>{ko ? '수정' : 'Edit'}</span>
                        </button>
                      )}
                      {block.node && onLinkNode && (
                        <button
                          className="draft-menu-item draft-menu-node"
                          onClick={() => {
                            setOpenMenu(null);
                            onLinkNode(block.node!.id, block.node!.label || block.node!.id);
                          }}
                        >
                          <LinkSimple size={13} />
                          <span>{ko ? '노드 연결' : 'Link node'}</span>
                        </button>
                      )}
                      {block.node && onRemoveNode && (
                        <button
                          className="draft-menu-item"
                          onClick={() => {
                            setOpenMenu(null);
                            onRemoveNode(block.timestamp!);
                          }}
                        >
                          <X size={13} />
                          <span>{ko ? '노드 해제' : 'Remove node'}</span>
                        </button>
                      )}
                      {block.node && (
                        <button
                          className="draft-menu-item draft-menu-node"
                          onClick={() => {
                            setOpenMenu(null);
                            onToMindSync?.(block.node!.id);
                          }}
                        >
                          <Brain size={13} weight="fill" />
                          <span>{ko ? '마인드싱크로' : 'To MindSync'}</span>
                        </button>
                      )}
                      {onFixWithAgent && (
                        <button
                          className="draft-menu-item"
                          onClick={() => {
                            setOpenMenu(null);
                            onFixWithAgent(block.lines.join('\n').trim(), block.timestamp!);
                          }}
                        >
                          <CodepenLogo size={13} />
                          <span>{ko ? 'Agent로' : 'To Agent'}</span>
                        </button>
                      )}
                      {onDeleteBlock && (
                        <button
                          className="draft-menu-item draft-menu-delete"
                          onClick={() => {
                            setOpenMenu(null);
                            onDeleteBlock?.(block.timestamp!);
                          }}
                        >
                          <Trash2 size={13} />
                          <span>{ko ? '삭제' : 'Delete'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="timeline-content">
            {editingTs === block.timestamp ? (
              <div className="timeline-edit">
                <textarea
                  className="timeline-edit-input"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  rows={Math.max(6, editingValue.split('\n').length + 1)}
                  autoFocus
                />
                <div className="timeline-edit-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditingTs(null);
                      setEditingValue('');
                    }}
                  >
                    {ko ? '취소' : 'Cancel'}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onEditBlock?.(block.timestamp!, editingValue);
                      setEditingTs(null);
                      setEditingValue('');
                    }}
                  >
                    {ko ? '로컬에 저장' : 'Save draft'}
                  </button>
                </div>
              </div>
            ) : (
              <BlockContent text={block.lines.join('\n')} workspace={workspace} room={room} />
            )}
          </div>
          {block.node && graph && (
            <RelatedStrip
              graph={graph}
              nodeId={block.node.id}
              room={room}
              ko={ko}
              clusterName={clusterName}
              onJump={onJump}
              onNavigateRoom={onNavigateRoom}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Related-nodes strip shown under a node block (Neural Link P2).
// Same-cluster + edge-linked nodes across the repo; same-room jumps scroll,
// cross-room jumps navigate to that chat.
function RelatedStrip({ graph, nodeId, room, ko, clusterName, onJump, onNavigateRoom }: {
  graph: NeuralGraph;
  nodeId: string;
  room: Room;
  ko: boolean;
  clusterName: (id: string) => string;
  onJump?: (timestamp: string) => void;
  onNavigateRoom?: (roomPath: string, blockTs: string) => void;
}) {
  const { sameCluster, linked } = relatedNodes(graph, nodeId);
  const seen = new Set<string>([nodeId]);
  const items: Array<{ n: NeuralNode; kind: 'link' | 'cluster' }> = [];
  for (const n of linked) { if (!seen.has(n.id)) { seen.add(n.id); items.push({ n, kind: 'link' }); } }
  for (const n of sameCluster) { if (!seen.has(n.id)) { seen.add(n.id); items.push({ n, kind: 'cluster' }); } }
  if (items.length === 0) return null;

  const go = (n: NeuralNode) => {
    if (n.room === room.path) onJump?.(n.blockTs);
    else onNavigateRoom?.(n.room, n.blockTs);
  };

  const shown = items.slice(0, 6);
  return (
    <div className="related-strip">
      <span className="related-label"><LinkSimple size={11} /> {ko ? '관련' : 'Related'}</span>
      {shown.map(({ n, kind }) => (
        (() => {
          const label = n.label || n.id;
          const showRoom = n.room !== room.path && label.length <= 26;
          const metaTitle = kind === 'link'
            ? (ko ? '직접 연결' : 'Linked')
            : (ko ? `클러스터: ${n.clusters.map(clusterName).join(', ')}` : `Cluster: ${n.clusters.map(clusterName).join(', ')}`);
          return (
            <button
              key={n.id}
              className="related-pill"
              onClick={() => go(n)}
              title={`${label}${n.room !== room.path ? ` · ${n.room}` : ''} · ${metaTitle}`}
            >
              {kind === 'link' ? <LinkSimple size={10} /> : <Tag size={10} />}
              <span className="related-pill-label">{label}</span>
              {showRoom && (
                <span className="related-room"><ArrowSquareOut size={9} /> {n.room}</span>
              )}
            </button>
          );
        })()
      ))}
      {items.length > shown.length && <span className="related-more">+{items.length - shown.length}</span>}
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

// Neural Link node editor — label + cluster picker (P1, P3 elastic index search)
type Pick = { name: string; id?: string };
function NodeEditor({ initial, seedLabel, workspaceId, clusters, language, onSave, onClose }: {
  initial: InlineNodeMeta | null;
  /** Prefill the label for a brand-new node (from text selection). */
  seedLabel?: string;
  /** Current workspace id — used to mark cross-repo hits in the picker. */
  workspaceId: string;
  clusters: Cluster[];
  language: string;
  onSave: (label: string, picks: Pick[]) => void;
  onClose: () => void;
}) {
  const ko = language === 'ko';
  const idToName = (id: string) => clusters.find((c) => c.id === id)?.name ?? id;
  const [label, setLabel] = useState(initial?.label ?? seedLabel ?? '');
  const [selected, setSelected] = useState<Pick[]>(
    (initial?.clusters ?? []).map((id) => ({ id, name: idToName(id) })),
  );
  const [query, setQuery] = useState('');
  const [indexHits, setIndexHits] = useState<NeuralClusterHit[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);

  // Debounced cross-repo index search — surfaces clusters created elsewhere that
  // the local neural.json hasn't seen yet (or live in other repos entirely).
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const qq = query.trim();
      if (!qq) { setIndexHits([]); setIndexLoading(false); return; }
      setIndexLoading(true);
      try {
        const res = await neuralApi.search(qq);
        if (!cancelled) setIndexHits(res.clusters ?? []);
      } catch { /* silent — local list still works */ }
      finally { if (!cancelled) setIndexLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  const q = query.trim();
  const ql = q.toLowerCase();

  const isSelected = (p: Pick) =>
    selected.some((s) => (p.id && s.id === p.id) || s.name.toLowerCase() === p.name.toLowerCase());

  const localMatches: Pick[] = clusters
    .filter((c) => !isSelected({ name: c.name, id: c.id }))
    .filter((c) => !q || c.name.toLowerCase().includes(ql) || c.id.includes(ql))
    .map((c) => ({ name: c.name, id: c.id }));

  // Index hits: dedupe vs local + selected; preserve workspace tagging for the chip.
  const localIds = new Set(clusters.map((c) => c.id));
  type IndexPick = Pick & { fromOtherRepo?: boolean };
  const indexMatches: IndexPick[] = indexHits
    .filter((h) => !localIds.has(h.cluster_id))
    .filter((h) => !isSelected({ name: h.name, id: h.cluster_id }))
    .map((h) => ({ name: h.name, id: h.cluster_id, fromOtherRepo: h.workspace_id !== workspaceId }));

  const exactExists =
    clusters.some((c) => c.name.toLowerCase() === ql) ||
    indexHits.some((h) => h.name.toLowerCase() === ql) ||
    selected.some((s) => s.name.toLowerCase() === ql);

  const add = (pick: Pick) => {
    const n = pick.name.trim();
    if (!n) return;
    if (!isSelected(pick)) setSelected([...selected, { ...pick, name: n }]);
    setQuery('');
  };
  const remove = (pick: Pick) => setSelected(selected.filter((s) => s !== pick));
  const canSave = label.trim().length > 0 || selected.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content node-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Graph size={18} /> {initial ? (ko ? '노드 편집' : 'Edit node') : (ko ? '노드로 만들기' : 'Make node')}</h3>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <label className="node-editor-label">{ko ? '라벨' : 'Label'}</label>
          <input
            className="input"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={ko ? '이 생각 묶음의 이름' : 'Name this thought node'}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave(label.trim(), selected); }}
          />

          <label className="node-editor-label">{ko ? '클러스터' : 'Clusters'}</label>
          {selected.length > 0 && (
            <div className="cluster-chips">
              {selected.map((p, i) => (
                <span key={`${p.id ?? p.name}-${i}`} className="cluster-chip selected">
                  <Tag size={11} /> {p.name}
                  <button onClick={() => remove(p)} aria-label="remove"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="cluster-search">
            <MagnifyingGlass size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ko ? '클러스터 검색 또는 생성 (다른 챗·레포 포함)…' : 'Search or create cluster (incl. other chats/repos)…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && q && !exactExists) add({ name: q }); }}
            />
            {indexLoading && <Loader2 size={12} className="spin" />}
          </div>
          {(localMatches.length > 0 || indexMatches.length > 0 || (q && !exactExists)) && (
            <div className="cluster-options">
              {localMatches.map((p) => (
                <button key={`l:${p.id}`} className="cluster-option" onClick={() => add(p)}>
                  <Tag size={12} /> {p.name} <span className="cluster-option-id">{p.id}</span>
                </button>
              ))}
              {indexMatches.map((p) => (
                <button key={`i:${p.id}`} className="cluster-option" onClick={() => add(p)}>
                  <Tag size={12} /> {p.name}
                  <span className="cluster-option-id">
                    {p.fromOtherRepo ? (ko ? '다른 레포' : 'other repo') : (ko ? '인덱스' : 'index')} · {p.id}
                  </span>
                </button>
              ))}
              {q && !exactExists && (
                <button className="cluster-option create" onClick={() => add({ name: q })}>
                  <Plus size={12} /> {ko ? `'${q}' 새 클러스터` : `New cluster '${q}'`}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="node-editor-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{ko ? '취소' : 'Cancel'}</button>
          <button className="btn btn-primary btn-sm" disabled={!canSave} onClick={() => onSave(label.trim(), selected)}>
            {ko ? '저장' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Cluster members viewer — all nodes in a cluster across the repo (Neural Link P2)
function ClusterModal({ clusterId, graph, room, language, onClose, onJump, onNavigate }: {
  clusterId: string;
  graph: NeuralGraph;
  room: Room;
  language: string;
  onClose: () => void;
  onJump: (timestamp: string) => void;
  onNavigate?: (roomPath: string, blockTs: string) => void;
}) {
  const ko = language === 'ko';
  const cluster = graph.clusters.find((c) => c.id === clusterId);
  const members = clusterMembers(graph, clusterId);

  const go = (n: NeuralNode) => {
    if (n.room === room.path) onJump(n.blockTs);
    else onNavigate?.(n.room, n.blockTs);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content cluster-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Tag size={18} /> {cluster?.name ?? clusterId}</h3>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="cluster-modal-count">
            {ko ? `${members.length}개 노드` : `${members.length} node${members.length === 1 ? '' : 's'}`}
            {cluster?.desc ? ` · ${cluster.desc}` : ''}
          </p>
          {members.length === 0 ? (
            <p className="text-muted">{ko ? '이 클러스터에 노드가 없습니다.' : 'No nodes in this cluster.'}</p>
          ) : (
            <div className="cluster-member-list">
              {members.map((n) => (
                <button key={n.id} className="cluster-member" onClick={() => go(n)}>
                  <Graph size={12} weight="bold" />
                  <span className="cluster-member-label">{n.label || n.id}</span>
                  <span className="cluster-member-room">
                    {n.room === room.path ? (ko ? '이 챗' : 'this chat') : <><ArrowSquareOut size={10} /> {n.room}</>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Node-to-node edge editor (Neural Link P2.5) — link/unlink + relation type
const EDGE_TYPES: Array<{ id: string; ko: string; en: string }> = [
  { id: 'relates', ko: '관련', en: 'Relates' },
  { id: 'supersedes', ko: '대체', en: 'Supersedes' },
  { id: 'supports', ko: '근거', en: 'Supports' },
];

function LinkEditor({ source, graph, room, language, onClose, onLink, onUnlink }: {
  source: { id: string; label: string };
  graph: NeuralGraph;
  room: Room;
  language: string;
  onClose: () => void;
  onLink: (toId: string, type: string) => void;
  onUnlink: (toId: string) => void;
}) {
  const ko = language === 'ko';
  const [type, setType] = useState('relates');
  const [query, setQuery] = useState('');

  const nodeOf = (id: string) => graph.nodes.find((n) => n.id === id);
  const links = graph.edges.filter((e) => e.from === source.id || e.to === source.id);
  const otherId = (e: { from: string; to: string }) => (e.from === source.id ? e.to : e.from);
  const linkedIds = new Set(links.map(otherId));

  const q = query.trim().toLowerCase();
  const candidates = graph.nodes
    .filter((n) => n.id !== source.id && !linkedIds.has(n.id))
    .filter((n) => !q || (n.label || n.id).toLowerCase().includes(q))
    .slice(0, 30);

  const typeLabel = (id?: string) => {
    const t = EDGE_TYPES.find((x) => x.id === id);
    return t ? (ko ? t.ko : t.en) : (id ?? '');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content link-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><LinkSimple size={18} /> {ko ? '노드 연결' : 'Link node'}</h3>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="link-source"><Graph size={12} weight="bold" /> {source.label}</p>

          {links.length > 0 && (
            <>
              <label className="node-editor-label">{ko ? '연결됨' : 'Linked'}</label>
              <div className="link-list">
                {links.map((e) => {
                  const oid = otherId(e);
                  const n = nodeOf(oid);
                  return (
                    <div key={oid} className="link-row">
                      <LinkSimple size={11} />
                      <span className="link-row-label">{n?.label || oid}</span>
                      {e.type && <span className="link-type-badge">{typeLabel(e.type)}</span>}
                      {n && n.room !== room.path && <span className="link-row-room">{n.room}</span>}
                      <button className="link-row-remove" onClick={() => onUnlink(oid)} aria-label="unlink"><X size={12} /></button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <label className="node-editor-label">{ko ? '관계 유형' : 'Relation'}</label>
          <div className="edge-type-row">
            {EDGE_TYPES.map((t) => (
              <button
                key={t.id}
                className={`edge-type-btn ${type === t.id ? 'active' : ''}`}
                onClick={() => setType(t.id)}
              >{ko ? t.ko : t.en}</button>
            ))}
          </div>

          <label className="node-editor-label">{ko ? '연결할 노드' : 'Link to'}</label>
          <div className="cluster-search">
            <MagnifyingGlass size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ko ? '노드 검색…' : 'Search nodes…'}
            />
          </div>
          <div className="cluster-options">
            {candidates.length === 0 ? (
              <p className="text-muted" style={{ padding: '8px 10px', fontSize: 'var(--text-xs)' }}>
                {ko ? '연결할 노드가 없습니다.' : 'No nodes to link.'}
              </p>
            ) : candidates.map((n) => (
              <button key={n.id} className="cluster-option" onClick={() => onLink(n.id, type)}>
                <Graph size={12} /> {n.label || n.id}
                {n.room !== room.path && <span className="cluster-option-id">{n.room}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Cross-repo neural search (Neural Link P3) — queries the Supabase derived index
function NeuralSearchModal({ workspace, language, onClose, onPick }: {
  workspace: Workspace;
  language: string;
  onClose: () => void;
  onPick: (hit: NeuralNodeHit) => void;
}) {
  const ko = language === 'ko';
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<NeuralClusterHit[]>([]);
  const [nodes, setNodes] = useState<NeuralNodeHit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const q = query.trim();
      if (!q) { if (!cancelled) { setClusters([]); setNodes([]); setError(null); setLoading(false); } return; }
      if (!cancelled) setLoading(true);
      try {
        const res = await neuralApi.search(q);
        if (cancelled) return;
        setClusters(res.clusters ?? []);
        setNodes(res.nodes ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  const repoLabel = (hit: NeuralClusterHit | NeuralNodeHit) =>
    hit.workspace_id === workspace.id
      ? (ko ? '이 레포' : 'this repo')
      : (hit.workspaces ? `${hit.workspaces.github_owner}/${hit.workspaces.github_repo}` : hit.workspace_id.slice(0, 8));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content neural-search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Graph size={18} /> {ko ? '뉴런 검색 — 레포 전체' : 'Neuron search — across repos'}</h3>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="cluster-search">
            <MagnifyingGlass size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ko ? '클러스터·노드 라벨 검색…' : 'Search clusters & node labels…'}
            />
            {loading && <Loader2 size={14} className="spin" />}
          </div>

          {error && <p className="agent-error" style={{ marginTop: 8 }}>{error}</p>}

          {query.trim() && !loading && clusters.length === 0 && nodes.length === 0 && !error && (
            <p className="text-muted" style={{ marginTop: 12, fontSize: 'var(--text-sm)' }}>
              {ko ? '결과 없음. push 후 인덱싱되며, 설정에서 재인덱스할 수 있어요.' : 'No results. Indexed on push — or run Reindex.'}
            </p>
          )}

          {clusters.length > 0 && (
            <>
              <label className="node-editor-label">{ko ? '클러스터' : 'Clusters'}</label>
              <div className="neural-search-clusters">
                {clusters.map((c) => (
                  <span key={`${c.workspace_id}:${c.cluster_id}`} className="cluster-chip" onClick={() => setQuery(c.name)} style={{ cursor: 'pointer' }}>
                    <Tag size={9} /> {c.name}
                    <span className="neural-search-repo">{repoLabel(c)}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {nodes.length > 0 && (
            <>
              <label className="node-editor-label">{ko ? '노드' : 'Nodes'}</label>
              <div className="cluster-member-list">
                {nodes.map((n) => (
                  <button key={`${n.workspace_id}:${n.node_id}`} className="cluster-member" onClick={() => onPick(n)}>
                    <Graph size={12} weight="bold" />
                    <span className="cluster-member-label">{n.label || n.node_id}</span>
                    <span className="cluster-member-room">
                      <ArrowSquareOut size={10} /> {repoLabel(n)}{n.room ? ` · ${n.room}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Synced success toast – auto-hides after 2s
function SyncedToast() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="sync-overlay-toast sync-toast-success">
      <Check size={16} />
      <span>Synced</span>
    </div>
  );
}
