/**
 * MermaidBlock — render a fenced ```mermaid code block as a real diagram.
 *
 * Mermaid is loaded lazily (~140 KB gzip) — only chats/files that actually
 * contain a mermaid block pay the cost. We re-init on theme change so the
 * dark/light contrast stays correct without a page reload.
 *
 * Errors fall back to the raw code so the user can still see what's there.
 */

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default);
  }
  return mermaidPromise;
}

let counter = 0;
function nextId() {
  counter += 1;
  return `mermaid-${counter}-${Date.now().toString(36)}`;
}

interface Props {
  code: string;
  /** Called when the user clicks an action button rendered next to the diagram. */
  onEdit?: (code: string) => void;
  onAgentFix?: (code: string) => void;
}

export default function MermaidBlock({ code, onEdit, onAgentFix }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark'
    || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    setError(null);
    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        const { svg } = await mermaid.render(nextId(), code.trim());
        if (cancelled) return;
        host.innerHTML = svg;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [code, isDark]);

  return (
    <div className="mermaid-block">
      {error ? (
        <details className="mermaid-block-error">
          <summary>Mermaid render error — click to see code</summary>
          <pre>{error}</pre>
          <pre>{code}</pre>
        </details>
      ) : (
        <div ref={hostRef} className="mermaid-block-svg" />
      )}
      {(onEdit || onAgentFix) && !error && (
        <div className="mermaid-block-actions">
          {onEdit && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(code)}>
              🖊 편집
            </button>
          )}
          {onAgentFix && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => onAgentFix(code)}>
              🤖 에이전트로 수정
            </button>
          )}
        </div>
      )}
    </div>
  );
}
