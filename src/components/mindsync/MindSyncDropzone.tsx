import { FileArrowUp, FileText, Plus, X } from '@phosphor-icons/react';

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

interface MindSyncDropzoneProps {
  ko: boolean;
  dragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClickUpload: () => void;
  maxFileSize: string;
  maxTotalSize: string;
  maxCount: number;
  /** When sources are provided, shows file list instead of empty dropzone. */
  sources?: SourceItem[];
  onRemove?: (id: string) => void;
  formatSize?: (bytes: number) => string;
}

const FORMATS = ['PDF', 'DOCX', 'HWPX', 'PPTX', 'TXT', 'MD'] as const;

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

/**
 * Unified upload area: shows empty dropzone when no files,
 * transitions to file list with "+Add" button when files exist.
 */
export default function MindSyncDropzone({
  ko,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClickUpload,
  maxFileSize,
  maxTotalSize,
  maxCount,
  sources = [],
  onRemove,
  formatSize = (b) => `${(b / 1024).toFixed(1)} KB`,
}: MindSyncDropzoneProps) {
  const hasSources = sources.length > 0;

  return (
    <section
      className={`ms-dropzone${dragging ? ' ms-dropzone--active' : ''}${hasSources ? ' ms-dropzone--has-files' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...(!hasSources && {
        onClick: onClickUpload,
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickUpload(); }
        },
      })}
    >
      {!hasSources ? (
        /* ── Empty: classic dropzone ──────────────────────────── */
        <div className="ms-dropzone-content">
          <FileArrowUp size={32} weight="thin" className="ms-dropzone-icon" />
          <h2>{ko ? '여기에 파일을 끌어오세요' : 'Drop your files here'}</h2>
          <p className="ms-dropzone-hint">
            {ko ? '또는 클릭하여 파일 선택' : 'or click to browse files'}
          </p>
          <div className="ms-dropzone-formats">
            {FORMATS.map((fmt) => (
              <span key={fmt} className="ms-format-chip">{fmt}</span>
            ))}
          </div>
          <p className="ms-dropzone-limits">
            {ko
              ? `파일당 최대 ${maxFileSize} · 총 ${maxTotalSize} · 최대 ${maxCount}개`
              : `Up to ${maxFileSize} per file · ${maxTotalSize} total · max ${maxCount} files`}
          </p>
        </div>
      ) : (
        /* ── Has files: file list + add button ───────────────── */
        <div className="ms-dropzone-filelist">
          <div className="ms-dropzone-filelist-header">
            <span className="ms-dropzone-filelist-count">
              {ko ? `${sources.length}개 파일` : `${sources.length} file${sources.length > 1 ? 's' : ''}`}
            </span>
            <button
              className="ms-dropzone-add-btn"
              onClick={(e) => { e.stopPropagation(); onClickUpload(); }}
              type="button"
            >
              <Plus size={12} weight="bold" />
              {ko ? '추가' : 'Add'}
            </button>
          </div>

          <div className="ms-source-list">
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
                    <span>{statusLabel(src.status, src.progress, src.text.length, ko)}</span>
                  </span>
                  {onRemove && (
                    <button
                      className="ms-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemove(src.id); }}
                      type="button"
                      aria-label={ko ? '삭제' : 'Remove'}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {src.status === 'extracting' && (
                  <div className="ms-source-progress">
                    <div style={{ width: `${src.progress}%` }} />
                  </div>
                )}

                {src.status === 'error' && src.error && (
                  <p className="ms-source-error">{src.error}</p>
                )}
              </article>
            ))}
          </div>

          <p className="ms-dropzone-limits" style={{ textAlign: 'center', marginTop: 8, opacity: 0.5 }}>
            {ko
              ? `파일당 최대 ${maxFileSize} · 최대 ${maxCount}개`
              : `Up to ${maxFileSize} per file · max ${maxCount} files`}
          </p>
        </div>
      )}
    </section>
  );
}
