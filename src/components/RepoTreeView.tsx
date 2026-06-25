/**
 * RepoTreeView — VS Code / PyCharm style repo directory browser for the sidebar.
 *
 * - Lazy expand: only fetches a folder's children when the user opens it
 *   (avoids one huge tree fetch up-front and keeps the GitHub API cheap).
 * - .cotext awareness: any folder containing a `.cotext` subdir (= has chats)
 *   gets a subtle blue glow, and so does every ancestor folder all the way up.
 *   So users can spot "where the chats live" at a glance.
 * - Per-folder "+" button → bubble up via onNewChatInFolder so the parent can
 *   open its existing add-room flow with the path pre-filled.
 * - Phase A: file clicks bubble via onFileClick but the parent ignores them
 *   (Phase B will route non-md files to a read-only editor).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretRight, CaretDown, Folder, FolderOpen, FileText, FileCode, FileJs, FileTs, FilePy, File as FileIcon, Plus, Spinner as Loader2 } from '@phosphor-icons/react';
import { githubApi, type GithubTreeItem } from '../lib/supabase/functions';

interface Props {
  workspace: {
    github_owner: string;
    github_repo: string;
    default_branch: string;
  };
  onNewChatInFolder?: (folderPath: string) => void;
  onFileClick?: (filePath: string, fileName: string) => void;
  /** Highlight the current chat's folder (so user sees where they are). */
  currentFolderPath?: string | null;
}

// File extension → icon. Falls back to generic FileIcon.
function iconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'mdx') return FileText;
  if (ext === 'ts' || ext === 'tsx') return FileTs;
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return FileJs;
  if (ext === 'py') return FilePy;
  if (['json', 'yml', 'yaml', 'toml', 'sql', 'sh', 'rs', 'go', 'java', 'rb', 'php', 'c', 'h', 'cpp', 'hpp', 'css', 'scss', 'html', 'xml'].includes(ext)) return FileCode;
  return FileIcon;
}

interface NodeProps {
  item: GithubTreeItem;
  depth: number;
  workspace: Props['workspace'];
  cotextFolders: Set<string>;          // exact paths that contain a `.cotext` subdir
  cotextAncestors: Set<string>;        // ancestor paths of any folder above
  childrenCache: Map<string, GithubTreeItem[]>;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  loadChildren: (path: string) => Promise<void>;
  loadingPaths: Set<string>;
  onNewChatInFolder?: (folderPath: string) => void;
  onFileClick?: (filePath: string, fileName: string) => void;
  currentFolderPath?: string | null;
}

function TreeNode({
  item, depth, workspace, cotextFolders, cotextAncestors, childrenCache,
  expanded, toggleExpand, loadChildren, loadingPaths,
  onNewChatInFolder, onFileClick, currentFolderPath,
}: NodeProps) {
  const isFolder = item.type === 'dir';
  const isExpanded = expanded.has(item.path);
  const isLoading = loadingPaths.has(item.path);
  // .cotext folder itself ALSO glows (in addition to its parent folder that
  // gets the glow via cotextFolders set). That way users see the badge both
  // on the "container" folder and on the literal `.cotext` directory inside it.
  const isCotextFolder = isFolder && item.name === '.cotext';
  const hasCotext = cotextFolders.has(item.path) || isCotextFolder;
  const isAncestor = cotextAncestors.has(item.path);
  const isCurrent = currentFolderPath === item.path;
  const Icon = isFolder
    ? (isExpanded ? FolderOpen : Folder)
    : iconFor(item.name);

  const handleClick = useCallback(async () => {
    if (isFolder) {
      toggleExpand(item.path);
      if (!isExpanded && !childrenCache.has(item.path)) {
        await loadChildren(item.path);
      }
    } else {
      onFileClick?.(item.path, item.name);
    }
  }, [isFolder, isExpanded, item.path, item.name, toggleExpand, childrenCache, loadChildren, onFileClick]);

  const children = childrenCache.get(item.path) || [];

  return (
    <>
      <div
        className={[
          'repo-tree-row',
          isFolder ? 'is-folder' : 'is-file',
          hasCotext ? 'has-cotext' : '',
          isAncestor ? 'is-cotext-ancestor' : '',
          isCurrent ? 'is-current' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        title={item.path}
      >
        {isFolder ? (
          isLoading
            ? <Loader2 size={10} className="spin" />
            : (isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />)
        ) : (
          <span style={{ width: 10 }} />
        )}
        <Icon size={13} weight={hasCotext ? 'fill' : 'regular'} />
        <span className="repo-tree-name">{item.name}</span>
        {isFolder && onNewChatInFolder && (
          <button
            className="repo-tree-add"
            onClick={(e) => { e.stopPropagation(); onNewChatInFolder(item.path); }}
            title="+ 새 채팅"
          >
            <Plus size={10} weight="bold" />
          </button>
        )}
      </div>
      {isFolder && isExpanded && children.map((child) => (
        <TreeNode
          key={child.path}
          item={child}
          depth={depth + 1}
          workspace={workspace}
          cotextFolders={cotextFolders}
          cotextAncestors={cotextAncestors}
          childrenCache={childrenCache}
          expanded={expanded}
          toggleExpand={toggleExpand}
          loadChildren={loadChildren}
          loadingPaths={loadingPaths}
          onNewChatInFolder={onNewChatInFolder}
          onFileClick={onFileClick}
          currentFolderPath={currentFolderPath}
        />
      ))}
    </>
  );
}

export default function RepoTreeView({ workspace, onNewChatInFolder, onFileClick, currentFolderPath }: Props) {
  const [root, setRoot] = useState<GithubTreeItem[]>([]);
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Map<string, GithubTreeItem[]>>(new Map());
  // Set of folder paths known to contain a `.cotext` subfolder. Computed
  // up-front from the recursive tree (one extra API call at mount), then used
  // to mark glow-blue and propagate up through ancestors.
  const [cotextFolders, setCotextFolders] = useState<Set<string>>(new Set());

  // Initial load: top-level tree + recursive .cotext probe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRoot(true);
      setError(null);
      try {
        const [top] = await Promise.all([
          githubApi.getTree(workspace.github_owner, workspace.github_repo, workspace.default_branch),
        ]);
        if (cancelled) return;
        setRoot(top.tree || []);

        // Probe for .cotext folders anywhere in the tree (one recursive call).
        try {
          // Use GitHub trees API recursive flag — our github-tree Edge Function may
          // not pass it, so fall back to scanning top-level + AI-Sessions/raw heuristics.
          // For v1: detect known root folders that often contain .cotext.
          const cotextPaths = new Set<string>();
          // The simple way: check each top-level dir for a .cotext subdir.
          const dirChecks = (top.tree || []).filter((it) => it.type === 'dir');
          const results = await Promise.allSettled(dirChecks.map(async (d) => {
            try {
              const sub = await githubApi.getTree(
                workspace.github_owner, workspace.github_repo, workspace.default_branch, d.path,
              );
              const hasCotext = (sub.tree || []).some((c) => c.type === 'dir' && c.name === '.cotext');
              if (hasCotext) cotextPaths.add(d.path);
              return { path: d.path, children: sub.tree || [] };
            } catch { return null; }
          }));
          // Also check root itself (root cotext.md lives at .cotext/ in repo root)
          if ((top.tree || []).some((c) => c.type === 'dir' && c.name === '.cotext')) {
            cotextPaths.add('');
          }
          // Cache children we already fetched.
          const cache = new Map<string, GithubTreeItem[]>();
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              cache.set(r.value.path, r.value.children);
            }
          }
          if (!cancelled) {
            setCotextFolders(cotextPaths);
            setChildrenCache(cache);
          }
        } catch (probeErr) {
          console.warn('[RepoTreeView] cotext probe failed:', probeErr);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingRoot(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace.github_owner, workspace.github_repo, workspace.default_branch]);

  // Ancestor set: every path that has a descendant in cotextFolders.
  // Used to glow the breadcrumb up to the chat-holding folder.
  const cotextAncestors = useMemo(() => {
    const set = new Set<string>();
    for (const p of cotextFolders) {
      const parts = p.split('/');
      // accumulate '', 'a', 'a/b', 'a/b/c' (but not the leaf itself)
      let cur = '';
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? `${cur}/${parts[i]}` : parts[i];
        set.add(cur);
      }
    }
    return set;
  }, [cotextFolders]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const loadChildren = useCallback(async (path: string) => {
    if (childrenCache.has(path)) return;
    setLoadingPaths((p) => new Set(p).add(path));
    try {
      const res = await githubApi.getTree(
        workspace.github_owner, workspace.github_repo, workspace.default_branch, path,
      );
      setChildrenCache((c) => new Map(c).set(path, res.tree || []));
      // Detect .cotext on the fly for deeper folders too.
      if ((res.tree || []).some((c) => c.type === 'dir' && c.name === '.cotext')) {
        setCotextFolders((s) => new Set(s).add(path));
      }
    } catch (err) {
      console.error('[RepoTreeView] loadChildren failed:', err);
    } finally {
      setLoadingPaths((p) => { const n = new Set(p); n.delete(path); return n; });
    }
  }, [workspace.github_owner, workspace.github_repo, workspace.default_branch, childrenCache]);

  if (loadingRoot) {
    return (
      <div className="repo-tree-empty">
        <Loader2 size={18} className="spin" />
      </div>
    );
  }
  if (error) {
    return <div className="repo-tree-empty repo-tree-error">{error}</div>;
  }

  return (
    <div className="repo-tree">
      {/* Root "+ new chat here" — for repo-root chats */}
      {onNewChatInFolder && (
        <div className="repo-tree-row is-folder is-root" onClick={() => {/* no-op */}}>
          <span style={{ width: 10 }} />
          <FolderOpen size={13} weight="fill" />
          <span className="repo-tree-name">{workspace.github_owner}/{workspace.github_repo}</span>
          <button
            className="repo-tree-add"
            onClick={(e) => { e.stopPropagation(); onNewChatInFolder(''); }}
            title="+ 새 채팅 (루트)"
          >
            <Plus size={10} weight="bold" />
          </button>
        </div>
      )}
      {root.map((item) => (
        <TreeNode
          key={item.path}
          item={item}
          depth={0}
          workspace={workspace}
          cotextFolders={cotextFolders}
          cotextAncestors={cotextAncestors}
          childrenCache={childrenCache}
          expanded={expanded}
          toggleExpand={toggleExpand}
          loadChildren={loadChildren}
          loadingPaths={loadingPaths}
          onNewChatInFolder={onNewChatInFolder}
          onFileClick={onFileClick}
          currentFolderPath={currentFolderPath}
        />
      ))}
    </div>
  );
}
