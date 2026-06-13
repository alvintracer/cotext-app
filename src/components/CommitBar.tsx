import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import type { SyncStatus } from '../types/room';

interface CommitBarProps {
  commitMessage: string;
  onCommitMessageChange: (msg: string) => void;
  onPull: () => void;
  onPush: () => void;
  syncStatus: SyncStatus;
  syncing: boolean;
  dirty: boolean;
  roomPath: string;
}

export default function CommitBar({
  commitMessage,
  onCommitMessageChange,
  onPull,
  onPush,
  syncStatus,
  syncing,
  dirty,
  roomPath,
}: CommitBarProps) {
  return (
    <div className="commit-bar">
      <input
        type="text"
        className="commit-input"
        value={commitMessage}
        onChange={(e) => onCommitMessageChange(e.target.value)}
        placeholder={`cotext: update ${roomPath}`}
        disabled={syncing}
      />

      <div className="commit-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onPull}
          disabled={syncing}
          title="Pull from GitHub"
        >
          {syncing && syncStatus === 'syncing' ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <ArrowDown size={14} />
          )}
          <span>Pull</span>
        </button>

        <button
          className="btn btn-primary btn-sm"
          onClick={onPush}
          disabled={syncing || !dirty}
          title="Push to GitHub"
        >
          {syncing ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <ArrowUp size={14} />
          )}
          <span>Push</span>
        </button>
      </div>

      <div className={`commit-status status-${syncStatus}`}>
        {syncStatus === 'synced' && '✓ Synced'}
        {syncStatus === 'draft' && '● Draft'}
        {syncStatus === 'conflict' && '⚠ Conflict'}
        {syncStatus === 'syncing' && '↻ Syncing...'}
        {syncStatus === 'error' && '✕ Error'}
      </div>
    </div>
  );
}
