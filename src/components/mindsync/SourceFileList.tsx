import { FileText, Files, X } from '@phosphor-icons/react';

/* ── Types ─────────────────────────────────────────────────────── */

interface SourceItem {
  id: string;
  name: string;
  ext: string;
  size: number;
  status: 'queued' | 'extracting' | 'done' | 'error';
  progress: number;
  text: string;
  error?: string;
}

interface SourceFileListProps {
  ko: boolean;
  sources: SourceItem[];
  onRemove: (id: string) => void;
  formatSize: (bytes: number) => string;
  formatCount: (value: number) => string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function statusLabel(
  status: SourceItem['status'],
  progress: number,
  charCount: number,
  ko: boolean,
): string {
  switch (status) {
    case 'queued':
      return ko ? '대기' : 'Queued';
    case 'extracting':
      return ko ? `분석 중 ${progress}%` : `Analyzing ${progress}%`;
    case 'done':
      return ko ? `${charCount.toLocaleString()}자` : `${charCount.toLocaleString()} chars`;
    case 'error':
      return ko ? '오류' : 'Error';
  }
}

/* ── Component ─────────────────────────────────────────────────── */

export default function SourceFileList({
  ko,
  sources,
  onRemove,
  formatSize,
  formatCount,
}: SourceFileListProps) {
  return (
    <div className="ms-source-panel ms-glass-card">
      <div className="ms-panel-header">
        <h3>{ko ? '업로드된 파일' : 'Uploaded files'}</h3>
        <span className="ms-panel-count">
          {formatCount(sources.length)}
        </span>
      </div>

      <div className="ms-source-list">
        {/* Empty state */}
        {sources.length === 0 && (
          <div className="ms-empty">
            <Files size={24} />
            <p>{ko ? '아직 추가된 파일이 없습니다.' : 'No files yet.'}</p>
          </div>
        )}

        {/* Source cards */}
        {sources.map((src) => (
          <article key={src.id} className="ms-source-card">
            <div className="ms-source-info">
              <div className="ms-source-icon">
                <FileText size={18} />
              </div>
              <div className="ms-source-details">
                <strong>{src.name}</strong>
                <span className="ms-source-meta">
                  {src.ext.toUpperCase()} · {formatSize(src.size)}
                </span>
              </div>
            </div>

            <div className="ms-source-actions">
              <span className="ms-source-status">
                <span className={`ms-status-dot ${src.status}`} />
                <span>
                  {statusLabel(src.status, src.progress, src.text.length, ko)}
                </span>
              </span>
              <button
                className="ms-remove-btn"
                onClick={() => onRemove(src.id)}
                type="button"
                aria-label={ko ? '삭제' : 'Remove'}
              >
                <X size={14} />
              </button>
            </div>

            {/* Progress bar */}
            {src.status === 'extracting' && (
              <div className="ms-source-progress">
                <div style={{ width: `${src.progress}%` }} />
              </div>
            )}

            {/* Error message */}
            {src.status === 'error' && src.error && (
              <p className="ms-source-error">{src.error}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
