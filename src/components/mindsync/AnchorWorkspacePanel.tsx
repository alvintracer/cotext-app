import { CirclesThreePlus } from '@phosphor-icons/react';

/* ── Types ─────────────────────────────────────────────────────── */

interface Workspace {
  id: string;
  name: string;
  github_owner: string;
  github_repo: string;
}

interface AnchorWorkspacePanelProps {
  ko: boolean;
  workspaces: Workspace[];
  anchorWorkspaceId: string;
  onAnchorChange: (id: string) => void;
  mode: 'generate' | 'augment';
  onModeChange: (mode: 'generate' | 'augment') => void;
  autoMerge: boolean;
  onAutoMergeChange: (val: boolean) => void;
  autoStatus?: string | null;
  anchorWs: Workspace | null;
  showSaveText?: boolean;
  onSaveText?: () => void;
  textSavingState?: { done: number; total: number; error?: string } | null;
}

/* ── Component ─────────────────────────────────────────────────── */

export default function AnchorWorkspacePanel({
  ko,
  workspaces,
  anchorWorkspaceId,
  onAnchorChange,
  mode,
  onModeChange,
  autoMerge,
  onAutoMergeChange,
  autoStatus,
  anchorWs,
  showSaveText,
  onSaveText,
  textSavingState,
}: AnchorWorkspacePanelProps) {
  /* ── Explanation note ─────────────────────────────────────────── */
  const noteText = anchorWs
    ? ko
      ? `결과가 '${anchorWs.name}' 워크스페이스에 ${mode === 'generate' ? '새로' : '추가로'} 저장됩니다.`
      : `Results will be ${mode === 'generate' ? 'saved to' : 'added to'} ${anchorWs.name}.`
    : ko
      ? '워크스페이스를 선택하지 않으면 결과는 임시로만 유지됩니다.'
      : 'Without a workspace, results are temporary only.';

  return (
    <section className="ms-anchor ms-glass-card">
      <div className="ms-anchor-header">
        <h3>
          <CirclesThreePlus size={16} />
          {ko ? '대상 워크스페이스' : 'Target workspace'}
        </h3>
      </div>

      {/* Workspace selector */}
      <div className="ms-anchor-row">
        <select
          className="ms-select"
          value={anchorWorkspaceId}
          onChange={(e) => onAnchorChange(e.target.value)}
        >
          <option value="">
            {ko ? '— 선택 안 함 (임시) —' : '— None (temporary) —'}
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mode + auto-merge controls */}
      <div className="ms-anchor-controls">
        <div className="ms-mode-control">
          <button
            className={`ms-track-btn${mode === 'generate' ? ' active' : ''}`}
            onClick={() => onModeChange('generate')}
            type="button"
          >
            {ko ? '새로 만들기' : 'Create new'}
          </button>
          <button
            className={`ms-track-btn${mode === 'augment' ? ' active' : ''}`}
            onClick={() => onModeChange('augment')}
            type="button"
          >
            {ko ? '기존에 추가' : 'Add to existing'}
          </button>
        </div>

        <label className="ms-toggle">
          <input
            type="checkbox"
            checked={autoMerge}
            onChange={(e) => onAutoMergeChange(e.target.checked)}
          />
          <span>{ko ? '생성 후 자동 저장' : 'Auto-save after creation'}</span>
        </label>
      </div>

      {/* Explanation note */}
      <p className="ms-note">{noteText}</p>

      {/* Save text button */}
      {showSaveText && anchorWs && onSaveText && (
        <button
          className="btn btn-ghost btn-sm ms-save-text-btn"
          onClick={onSaveText}
          type="button"
          disabled={!!textSavingState}
        >
          {textSavingState
            ? ko
              ? `저장 중 (${textSavingState.done}/${textSavingState.total})`
              : `Saving (${textSavingState.done}/${textSavingState.total})`
            : ko
              ? '텍스트 저장'
              : 'Save text'}
        </button>
      )}

      {/* Text saving error */}
      {textSavingState?.error && (
        <p className="ms-source-error">{textSavingState.error}</p>
      )}

      {/* Auto-merge status */}
      {autoStatus && (
        <p className="ms-auto-status">{autoStatus}</p>
      )}
    </section>
  );
}
