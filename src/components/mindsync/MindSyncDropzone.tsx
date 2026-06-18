import { FileArrowUp } from '@phosphor-icons/react';

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
}

const FORMATS = ['PDF', 'DOCX', 'HWPX', 'PPTX', 'TXT', 'MD'] as const;

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
}: MindSyncDropzoneProps) {
  return (
    <section
      className={`ms-dropzone${dragging ? ' ms-dropzone--active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClickUpload}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickUpload();
        }
      }}
    >
      <div className="ms-dropzone-content">
        <FileArrowUp size={32} weight="thin" />

        <h2>
          {ko ? '여기에 파일을 끌어오세요' : 'Drop your files here'}
        </h2>

        <p className="ms-dropzone-hint">
          {ko ? '또는 클릭하여 파일 선택' : 'or click to browse files'}
        </p>

        <div className="ms-dropzone-formats">
          {FORMATS.map((fmt) => (
            <span key={fmt} className="ms-format-chip">
              {fmt}
            </span>
          ))}
        </div>

        <p className="ms-dropzone-limits">
          {ko
            ? `파일당 최대 ${maxFileSize} · 총 ${maxTotalSize} · 최대 ${maxCount}개`
            : `Up to ${maxFileSize} per file · ${maxTotalSize} total · max ${maxCount} files`}
        </p>
      </div>
    </section>
  );
}
