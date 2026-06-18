import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Warning, X } from '@phosphor-icons/react';

// React error boundary specifically for the MindSync graph view. Render-time
// throws inside d3-force / SVG handlers (e.g. malformed extracted graph,
// stale selection referencing a deleted node) previously crashed the whole app
// to a white screen — this catches the error, logs it, and offers a clean
// "close graph" recovery path so users never get stuck.

interface Props {
  /** Called when the user clicks "Close" in the recovery UI. */
  onClose?: () => void;
  /** Optional label for the recovery copy ("MindSync graph" / "Knowledge graph"). */
  surfaceLabel?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class NeuralGraphBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Don't swallow silently — the dev console still gets the full trace.
    console.error('[NeuralGraphBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const label = this.props.surfaceLabel ?? 'graph';
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: 480, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Warning size={22} weight="fill" color="var(--draft)" />
            <h3 style={{ margin: 0 }}>The {label} hit a rendering error</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
            Something in the graph data caused the view to crash. Your underlying data is safe —
            this is a render-time failure only. Close this panel and try again, or refresh the page.
          </p>
          <pre style={{
            margin: '12px 0',
            padding: '8px 10px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            maxHeight: 120,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>{this.state.error.message || String(this.state.error)}</pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={this.reset}>Retry</button>
            <button className="btn btn-primary btn-sm" onClick={() => { this.reset(); this.props.onClose?.(); }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}
