import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatCircleText, CheckCircle } from '@phosphor-icons/react';
import { fetchAssetBlobUrl } from '../lib/supabase/functions';
import type { Workspace } from '../types/workspace';
import { useEffect, useState } from 'react';
import { remarkCotextAnnotations } from '../lib/markdown/cotextAnnotations';
import MermaidBlock from './MermaidBlock';

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
  onEditDiagram?: (code: string) => void;
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
        remarkPlugins={[remarkGfm, remarkCotextAnnotations]}
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
