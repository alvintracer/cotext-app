import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { Decoration, GutterMarker, gutter, keymap } from '@codemirror/view';
import {
  Warning as AlertTriangle, Check, Spinner as Loader2, Eye, Columns as Split,
  Code, ArrowSquareOut, Lock, PencilSimple, ChatText as ChatIcon,
} from '@phosphor-icons/react';
import { githubApi } from '../lib/supabase/functions';
import { parseBlocks, type BlockRefMeta } from '../lib/markdown/index';
import type { Room, SyncStatus } from '../types/room';
import type { Workspace } from '../types/workspace';
import CotextEditor from './CotextEditor';
import CommitBar from './CommitBar';
import CotextMarkdown from './CotextMarkdown';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  workspace: Pick<Workspace, 'github_owner' | 'github_repo' | 'default_branch'>;
  filePath: string;
  fileName: string;
  language: 'ko' | 'en';
  rooms: Room[];
  onAddSelectionToChat: (payload: {
    folderPath: string;
    text: string;
    ref: BlockRefMeta;
  }) => Promise<void>;
  onOpenReference: (roomPath: string, blockTs: string) => void;
  initialFocusRef?: BlockRefMeta;
  onClose: () => void;
}

type FileViewMode = 'editor' | 'split' | 'preview';

interface SelectionState {
  startLine: number;
  endLine: number;
}

interface FileCommentRef {
  roomPath: string;
  roomName: string;
  blockTs: string;
  ref: BlockRefMeta;
  stale: boolean;
  preview: string;
}

const MAX_BYTES = 50 * 1024;
const MD_EXTS = new Set(['md', 'mdx', 'markdown']);

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isMarkdown(name: string): boolean {
  return MD_EXTS.has(extOf(name));
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function nearestRoomPath(filePath: string, rooms: Room[]): string {
  const dir = dirOf(filePath);
  const segments = dir ? dir.split('/') : [];
  for (let i = segments.length; i >= 1; i -= 1) {
    const candidate = segments.slice(0, i).join('/');
    if (rooms.some((room) => room.path === candidate)) return candidate;
  }
  return dir || 'root';
}

function relativeRefPath(roomPath: string, targetFilePath: string): string {
  if (!roomPath || roomPath === 'root') return targetFilePath;
  return targetFilePath.startsWith(`${roomPath}/`)
    ? targetFilePath.slice(roomPath.length + 1)
    : targetFilePath;
}

function absoluteRefPath(roomPath: string, refPath: string): string {
  return roomPath && roomPath !== 'root' ? `${roomPath}/${refPath}` : refPath;
}

function isRoomAncestor(roomPath: string, targetFilePath: string): boolean {
  if (!roomPath || roomPath === 'root') return true;
  return targetFilePath === roomPath || targetFilePath.startsWith(`${roomPath}/`);
}

class CommentCountMarker extends GutterMarker {
  private readonly count: number;
  private readonly stale: boolean;

  constructor(count: number, stale: boolean) {
    super();
    this.count = count;
    this.stale = stale;
  }

  toDOM() {
    const el = document.createElement('button');
    el.className = `file-viewer-comment-gutter${this.stale ? ' is-stale' : ''}`;
    el.type = 'button';
    el.textContent = String(this.count);
    return el;
  }
}

function buildCommentExtensions(
  refs: FileCommentRef[],
  onOpenReference: (roomPath: string, blockTs: string) => void,
  view: EditorView,
) {
  const grouped = new Map<number, FileCommentRef[]>();
  for (const ref of refs) {
    for (let line = ref.ref.startLine; line <= ref.ref.endLine; line += 1) {
      const arr = grouped.get(line);
      if (arr) arr.push(ref);
      else grouped.set(line, [ref]);
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const [lineNumber, items] of grouped) {
    const stale = items.every((item) => item.stale);
    const pos = view.state.doc.line(lineNumber).from;
    builder.add(
      pos,
      pos,
      Decoration.line({
        attributes: { class: `file-viewer-line-has-comment${stale ? ' is-stale' : ''}` },
      }),
    );
  }

  return [
    EditorView.decorations.of(builder.finish()),
    gutter({
      class: 'file-viewer-comment-gutter-host',
      lineMarker(_view, block) {
        const lineNumber = view.state.doc.lineAt(block.from).number;
        const items = grouped.get(lineNumber);
        if (!items) return null;
        return new CommentCountMarker(items.length, items.every((item) => item.stale));
      },
      domEventHandlers: {
        mousedown(_view, block, event) {
          const target = event.target as HTMLElement | null;
          if (!target?.closest('.file-viewer-comment-gutter')) return false;
          const lineNumber = view.state.doc.lineAt(block.from).number;
          const items = grouped.get(lineNumber);
          const first = items?.[0];
          if (!first) return false;
          onOpenReference(first.roomPath, first.blockTs);
          return true;
        },
      },
    }),
  ];
}

export default function FileViewer({
  workspace,
  filePath,
  fileName,
  language,
  rooms,
  onAddSelectionToChat,
  onOpenReference,
  initialFocusRef,
  onClose,
}: Props) {
  const { user } = useAuth();
  const ko = language === 'ko';
  const branch = workspace.default_branch || 'main';
  const markdownFile = isMarkdown(fileName);
  const editable = markdownFile;
  const annotationAuthor = user?.user_metadata?.user_name || workspace.github_owner;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [remoteContent, setRemoteContent] = useState('');
  const [remoteSha, setRemoteSha] = useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [viewMode, setViewMode] = useState<FileViewMode>('editor');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [syncing, setSyncing] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [commentRefs, setCommentRefs] = useState<FileCommentRef[]>([]);
  const [addingRef, setAddingRef] = useState(false);

  const dirty = editable && content !== remoteContent;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSelection(null);
      try {
        const res = await githubApi.getRoomContent(workspace.github_owner, workspace.github_repo, branch, filePath);
        if (cancelled) return;
        const bytes = new TextEncoder().encode(res.content).length;
        if (!markdownFile && bytes > MAX_BYTES) {
          setError(
            ko
              ? `파일이 너무 큽니다 (${(bytes / 1024).toFixed(1)} KB). GitHub에서 직접 열어 주세요.`
              : `File too large (${(bytes / 1024).toFixed(1)} KB). Open it on GitHub instead.`,
          );
          setLoading(false);
          return;
        }
        setContent(res.content);
        setRemoteContent(res.content);
        setRemoteSha(res.sha);
        setSizeBytes(bytes);
        setSyncStatus('synced');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace.github_owner, workspace.github_repo, branch, filePath, ko, markdownFile]);

  useEffect(() => {
    let cancelled = false;
    if (loading || error || markdownFile || !remoteSha) {
      setCommentRefs([]);
      return undefined;
    }
    (async () => {
      try {
        const candidates = rooms.filter((room) => isRoomAncestor(room.path, filePath));
        const results = await Promise.all(candidates.map(async (room) => {
          try {
            const res = await githubApi.getRoomContent(
              workspace.github_owner,
              workspace.github_repo,
              branch,
              room.cotext_file_path,
            );
            return { room, content: res.content };
          } catch {
            return null;
          }
        }));
        if (cancelled) return;
        const refs: FileCommentRef[] = [];
        for (const item of results) {
          if (!item) continue;
          for (const block of parseBlocks(item.content)) {
            if (!block.ref) continue;
            if (absoluteRefPath(item.room.path, block.ref.path) !== filePath) continue;
            refs.push({
              roomPath: item.room.path,
              roomName: item.room.name || 'cotext',
              blockTs: block.timestamp,
              ref: block.ref,
              stale: !!block.ref.commit && block.ref.commit !== remoteSha,
              preview: block.content.trim().split('\n').find(Boolean)?.slice(0, 140) || '',
            });
          }
        }
        setCommentRefs(refs);
      } catch {
        if (!cancelled) setCommentRefs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, error, markdownFile, remoteSha, rooms, workspace.github_owner, workspace.github_repo, branch, filePath]);

  const handlePull = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('syncing');
    setError(null);
    try {
      const result = await githubApi.getRoomContent(workspace.github_owner, workspace.github_repo, branch, filePath);
      setRemoteSha(result.sha);
      setSizeBytes(new TextEncoder().encode(result.content).length);
      if (!dirty) {
        setContent(result.content);
        setRemoteContent(result.content);
        setSyncStatus('synced');
      } else if (result.sha !== remoteSha) {
        setRemoteContent(result.content);
        setSyncStatus('conflict');
      } else {
        setSyncStatus('draft');
      }
    } catch (err) {
      setSyncStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to pull from GitHub');
    } finally {
      setSyncing(false);
    }
  }, [workspace.github_owner, workspace.github_repo, branch, filePath, dirty, remoteSha]);

  const handlePush = useCallback(async () => {
    if (!editable) return;
    setSyncing(true);
    setSyncStatus('syncing');
    setError(null);
    try {
      const message = commitMessage.trim() || `cotext: update ${filePath}`;
      const result = await githubApi.pushRoom(
        workspace.github_owner,
        workspace.github_repo,
        branch,
        filePath,
        content,
        remoteSha,
        message,
      );
      setRemoteContent(content);
      setRemoteSha(result.sha);
      setCommitMessage('');
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to push to GitHub');
    } finally {
      setSyncing(false);
    }
  }, [editable, commitMessage, filePath, content, remoteSha, workspace.github_owner, workspace.github_repo, branch]);

  const handleAddComment = useCallback(async (ref: BlockRefMeta) => {
    setAddingRef(true);
    try {
      await onAddSelectionToChat({
        folderPath: nearestRoomPath(filePath, rooms),
        text: '',
        ref,
      });
    } finally {
      setAddingRef(false);
    }
  }, [filePath, onAddSelectionToChat, rooms]);

  const ghUrl = useMemo(
    () => `https://github.com/${workspace.github_owner}/${workspace.github_repo}/blob/${branch}/${filePath}`,
    [workspace.github_owner, workspace.github_repo, branch, filePath],
  );

  const modeTabs = markdownFile
    ? (['editor', 'split', 'preview'] as FileViewMode[])
    : (['editor'] as FileViewMode[]);

  if (loading) {
    return (
      <div className="room-loading">
        <div className="spinner" />
        <p>{ko ? '불러오는 중...' : 'Loading...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="room-view">
        <div className="error-banner">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <a className="btn btn-primary btn-sm" href={ghUrl} target="_blank" rel="noopener noreferrer">
            <ArrowSquareOut size={12} /> GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="room-view file-room-view">
      <div className="room-header">
        <div className="room-header-info">
          <div className="room-name-display file-name-display">
            <span className="room-name-path">{dirOf(filePath) || '/'} /</span>
            <span className="room-name-label">{fileName}</span>
            <span className="file-viewer-size">{(sizeBytes / 1024).toFixed(1)} KB</span>
            {!editable && <Lock size={11} className="room-name-pencil" />}
            {editable && <PencilSimple size={11} className="room-name-pencil" />}
          </div>
          <span className={`sync-badge sync-badge-${syncStatus}`}>
            {syncStatus === 'synced' && <><Check size={12} /> Synced</>}
            {syncStatus === 'draft' && <><Code size={12} /> Draft</>}
            {syncStatus === 'conflict' && <><AlertTriangle size={12} /> Conflict</>}
            {syncStatus === 'syncing' && <><Loader2 size={12} className="spin" /> Syncing</>}
            {syncStatus === 'error' && <><AlertTriangle size={12} /> Error</>}
          </span>
          {!editable && (
            <span className="file-readonly-pill">
              {ko ? '읽기 전용' : 'Read-only'}
            </span>
          )}
        </div>
        <div className="room-header-actions">
          <div className="room-action-rail">
            <a
              className="btn btn-ghost btn-sm context-pack-btn"
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowSquareOut size={14} /> GitHub
            </a>
            <button className="btn btn-ghost btn-sm context-pack-btn" onClick={onClose}>
              {ko ? '닫기' : 'Close'}
            </button>
          </div>
          <div className="room-mode-rail">
            <div className="view-mode-tabs">
              {modeTabs.map((mode) => (
                <button
                  key={mode}
                  className={`view-mode-tab ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
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

      {syncStatus === 'conflict' && editable && (
        <div className="conflict-banner">
          <AlertTriangle size={14} />
          <span>{ko ? '원격 파일이 변경되었습니다. 먼저 Pull 해서 확인하세요.' : 'Remote file changed. Pull first to review it.'}</span>
        </div>
      )}

      <div className={`room-content room-content-${viewMode}`}>
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div className="room-editor-pane">
            {markdownFile ? (
              <CotextEditor
                content={content}
                onChange={(next) => { setContent(next); setSyncStatus(next === remoteContent ? 'synced' : 'draft'); }}
                readOnly={false}
                annotationAuthor={annotationAuthor}
              />
            ) : (
              <CodeFileEditor
                filePath={filePath}
                fileName={fileName}
                content={content}
                commentRefs={commentRefs}
                initialFocusRef={initialFocusRef}
                onOpenReference={onOpenReference}
                onSelectionChange={setSelection}
              />
            )}
          </div>
        )}

        {markdownFile && (viewMode === 'preview' || viewMode === 'split') && (
          <div className="room-preview">
            <MarkdownFilePreview
              text={content}
              filePath={filePath}
              workspace={workspace}
            />
          </div>
        )}
      </div>

      {!markdownFile && selection && (
        <div className="file-viewer-selection-bar">
          <div className="file-viewer-selection-copy">
            <strong>{ko ? '선택한 코드' : 'Selected code'}</strong>
            <span>{filePath}:{selection.startLine}-{selection.endLine}</span>
          </div>
          <button
            className="btn btn-primary btn-xs"
            onClick={() => handleAddComment({
              path: relativeRefPath(nearestRoomPath(filePath, rooms), filePath),
              startLine: selection.startLine,
              endLine: selection.endLine,
              commit: remoteSha ?? undefined,
            })}
            disabled={addingRef}
          >
            {addingRef ? <Loader2 size={11} className="spin" /> : <ChatIcon size={11} />}
            {addingRef ? (ko ? '추가 중' : 'Adding') : (ko ? '코멘트 추가' : 'Add comment')}
          </button>
        </div>
      )}

      {!markdownFile && commentRefs.length > 0 && (
        <div className="file-viewer-ref-list">
          {commentRefs.slice(0, 6).map((ref) => (
            <button
              key={`${ref.roomPath}-${ref.blockTs}-${ref.ref.startLine}`}
              className={`file-viewer-ref-item${ref.stale ? ' is-stale' : ''}`}
              onClick={() => onOpenReference(ref.roomPath, ref.blockTs)}
            >
              <span className="file-viewer-ref-item-head">
                <strong>{ref.roomName}</strong>
                <code>{ref.ref.startLine}-{ref.ref.endLine}</code>
              </span>
              <span className="file-viewer-ref-item-body">{ref.preview || filePath}</span>
            </button>
          ))}
        </div>
      )}

      {editable && (
        <CommitBar
          commitMessage={commitMessage}
          onCommitMessageChange={setCommitMessage}
          onPull={handlePull}
          onPush={handlePush}
          syncStatus={dirty ? (syncStatus === 'conflict' ? 'conflict' : 'draft') : syncStatus}
          syncing={syncing}
          dirty={dirty}
          roomPath={filePath}
        />
      )}
    </div>
  );
}

function CodeFileEditor({
  filePath,
  fileName,
  content,
  commentRefs,
  initialFocusRef,
  onOpenReference,
  onSelectionChange,
}: {
  filePath: string;
  fileName: string;
  content: string;
  commentRefs: FileCommentRef[];
  initialFocusRef?: BlockRefMeta;
  onOpenReference: (roomPath: string, blockTs: string) => void;
  onSelectionChange: (selection: SelectionState | null) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef(new Compartment());
  const commentCompartmentRef = useRef(new Compartment());
  const focusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        keymap.of([...defaultKeymap, indentWithTab]),
        langCompartmentRef.current.of([]),
        commentCompartmentRef.current.of([]),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace" },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace" },
          '.cm-content': { padding: '16px' },
          '.cm-gutters': {
            backgroundColor: 'var(--surface)',
            color: 'var(--text-muted)',
            border: 'none',
            borderRight: '1px solid var(--border)',
          },
          '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--surface-2)' },
          '.cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important',
          },
          '.cm-focused .cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--accent) 36%, transparent) !important',
          },
          '.cm-content ::selection': {
            backgroundColor: 'color-mix(in srgb, var(--accent) 36%, transparent)',
            color: 'var(--text)',
          },
          '&.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.selectionSet) return;
          const main = update.state.selection.main;
          if (main.empty) {
            onSelectionChange(null);
            return;
          }
          onSelectionChange({
            startLine: update.state.doc.lineAt(main.from).number,
            endLine: update.state.doc.lineAt(main.to).number,
          });
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    const desc = LanguageDescription.matchFilename(languages, fileName);
    if (desc) {
      desc.load().then((lang: LanguageSupport) => {
        view.dispatch({ effects: langCompartmentRef.current.reconfigure(lang) });
      }).catch(() => {});
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content, fileName, onSelectionChange]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: commentCompartmentRef.current.reconfigure(
        buildCommentExtensions(commentRefs, onOpenReference, view),
      ),
    });
  }, [commentRefs, onOpenReference]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !initialFocusRef) return;
    const key = `${filePath}:${initialFocusRef.startLine}-${initialFocusRef.endLine}:${initialFocusRef.commit ?? ''}`;
    if (focusKeyRef.current === key) return;
    focusKeyRef.current = key;
    const startLine = Math.min(Math.max(initialFocusRef.startLine, 1), view.state.doc.lines);
    const endLine = Math.min(Math.max(initialFocusRef.endLine, startLine), view.state.doc.lines);
    const from = view.state.doc.line(startLine).from;
    const to = view.state.doc.line(endLine).to;
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
  }, [filePath, initialFocusRef]);

  return <div ref={editorRef} className="cotext-editor file-code-editor" />;
}

function MarkdownFilePreview({
  text,
  filePath,
  workspace,
}: {
  text: string;
  filePath: string;
  workspace: Pick<Workspace, 'github_owner' | 'github_repo' | 'default_branch'>;
}) {
  return (
    <CotextMarkdown
      text={text}
      filePath={filePath}
      workspace={workspace}
      className="markdown-preview timeline-md"
    />
  );
}
