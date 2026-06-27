import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatCircleText, CheckCircle } from '@phosphor-icons/react';
import { fetchAssetBlobUrl, githubApi } from '../lib/supabase/functions';
import type { Workspace } from '../types/workspace';
import { useEffect, useState } from 'react';
import { remarkCotextAnnotations } from '../lib/markdown/cotextAnnotations';
import MermaidBlock from './MermaidBlock';
import type { MermaidEditPayload } from './MermaidBlock';
import { normalizeDiagramRepoPath, remarkCotextDiagrams } from '../lib/markdown/cotextDiagrams';

interface Props {
  text: string;
  filePath: string;
  workspace: Pick<Workspace, 'github_owner' | 'github_repo' | 'default_branch'>;
  className?: string;
  /** When set, mermaid code blocks get a "🤖 에이전트로 수정" button that
   *  bubbles the raw mermaid source to the parent (typically AgentPanel seed). */
  onAgentFix?: (code: string) => void;
  /** When set, mermaid code blocks get a "🖊 편집" button — the parent should
   *  open the visual editor seeded with the original code, then string-replace
   *  the block on save. */
  onEditDiagram?: (payload: MermaidEditPayload) => void;
}

function initialsOf(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'CT';
}

export default function CotextMarkdown({ text, filePath, workspace, className, onAgentFix, onEditDiagram }: Props) {
  const basePath = filePath.replace(/[^/]+$/, '');
  return (
    <div className={className ?? 'timeline-md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCotextAnnotations, remarkCotextDiagrams]}
        components={{
          img: ({ src, alt }: any) => {
            if (typeof src === 'string' && /^\.\/assets\//.test(src)) {
              return (
                <GitHubImage
                  owner={workspace.github_owner}
                  repo={workspace.github_repo}
                  branch={workspace.default_branch || 'main'}
                  path={`${basePath}${src.replace(/^\.\//, '')}`}
                  alt={alt || src}
                />
              );
            }
            return <img src={src} alt={alt} loading="lazy" />;
          },
          a: ({ href, children }: any) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
          // ```mermaid fenced blocks render as real diagrams. Everything else
          // falls through to react-markdown's default code rendering.
          code: ({ className, children, inline, ...rest }: any) => {
            const lang = /language-(\w+)/.exec(className || '')?.[1];
            const codeStr = String(children).replace(/\n$/, '');
            if (!inline && lang === 'mermaid') {
              return <MermaidBlock code={codeStr} onAgentFix={onAgentFix} onEdit={onEditDiagram} />;
            }
            return <code className={className} {...rest}>{children}</code>;
          },
          'cotext-diagram': ({ path, code }: any) => (
            <DiagramEmbedBlock
              path={String(path || '')}
              fallbackCode={String(code || '')}
              filePath={filePath}
              workspace={workspace}
              onAgentFix={onAgentFix}
              onEditDiagram={onEditDiagram}
            />
          ),
          'cotext-mark': ({ children, ...props }: any) => {
            const author = String(props.author ?? 'teammate');
            const note = String(props.note ?? '');
            const color = String(props.color ?? 'amber');
            const resolved = String(props.resolved ?? 'false') === 'true';
            const display = String(props.display ?? 'inline');
            const initials = initialsOf(author);
            const cls = `cotext-annotation cotext-annotation-${color}${resolved ? ' is-resolved' : ''}${display === 'block' ? ' is-block' : ' is-inline'}`;
            if (display === 'block') {
              return (
                <div className={cls}>
                  <div className="cotext-annotation-body">{children}</div>
                  <div className="cotext-annotation-meta">
                    <span className="cotext-annotation-author-pill">{initials} {author}</span>
                    {note ? <p>{note}</p> : null}
                    {resolved ? <span className="cotext-annotation-resolved"><CheckCircle size={12} /> Resolved</span> : null}
                  </div>
                </div>
              );
            }
            return (
              <span className={cls}>
                <span className="cotext-annotation-body">{children}</span>
                <span className="cotext-annotation-inline-meta">
                  <span className="cotext-annotation-badge">{initials}</span>
                  {note ? <span className="cotext-annotation-note-dot"><ChatCircleText size={11} weight="fill" /></span> : null}
                </span>
                {(note || resolved) ? (
                  <span className="cotext-annotation-hovercard">
                    <strong>{author}</strong>
                    {note ? <span>{note}</span> : null}
                    {resolved ? <em>Resolved</em> : null}
                  </span>
                ) : null}
              </span>
            );
          },
        } as any}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function DiagramEmbedBlock({
  path,
  fallbackCode,
  filePath,
  workspace,
  onAgentFix,
  onEditDiagram,
}: {
  path: string;
  fallbackCode: string;
  filePath: string;
  workspace: Pick<Workspace, 'github_owner' | 'github_repo' | 'default_branch'>;
  onAgentFix?: (code: string) => void;
  onEditDiagram?: (payload: MermaidEditPayload) => void;
}) {
  const normalizedPath = normalizeDiagramRepoPath(path, filePath);
  const [remoteCode, setRemoteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = fallbackCode.trim() || remoteCode.trim();

  useEffect(() => {
    let cancelled = false;
    if (fallbackCode.trim()) {
      setRemoteCode('');
      setError(null);
      return () => { cancelled = true; };
    }
    githubApi.getRoomContent(
      workspace.github_owner,
      workspace.github_repo,
      workspace.default_branch || 'main',
      normalizedPath,
    )
      .then((res) => {
        if (!cancelled) {
          setRemoteCode(res.content);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRemoteCode('');
          setError(err instanceof Error ? err.message : 'Failed to load diagram');
        }
      });
    return () => { cancelled = true; };
  }, [fallbackCode, normalizedPath, workspace.github_owner, workspace.github_repo, workspace.default_branch]);

  if (!code) {
    return (
      <div className="mermaid-block mermaid-block-missing">
        <div className="mermaid-block-error">
          <summary>{normalizedPath}</summary>
          <pre>{error || 'Diagram file not found yet.'}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-embed-block">
      <div className="diagram-embed-label">{normalizedPath}</div>
      <MermaidBlock
        code={code}
        path={normalizedPath}
        onAgentFix={onAgentFix}
        onEdit={onEditDiagram}
      />
    </div>
  );
}

function GitHubImage({
  owner,
  repo,
  branch,
  path,
  alt,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAssetBlobUrl(owner, repo, branch, path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => { cancelled = true; };
  }, [owner, repo, branch, path]);

  if (!src) return <span className="text-muted">{alt}</span>;
  return <img src={src} alt={alt} loading="lazy" />;
}
