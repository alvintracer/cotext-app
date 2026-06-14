import { useState, useRef, useEffect } from 'react';
import { ArrowDown, ArrowUp, Spinner as Loader2, CaretDown } from '@phosphor-icons/react';
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

const PRESETS = [
  { label: '📝 Update notes', msg: (p: string) => `cotext: update ${p}` },
  { label: '✅ Review & approve', msg: (p: string) => `cotext: reviewed ${p}` },
  { label: '🔀 Merge AI suggestions', msg: (p: string) => `cotext: merge AI notes in ${p}` },
  { label: '🧹 Clean up / reorganize', msg: (p: string) => `cotext: cleanup ${p}` },
  { label: '📌 Add decision / reference', msg: (p: string) => `cotext: add decision to ${p}` },
  { label: '✏️ Custom message…', msg: () => '' },
];

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
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when custom mode is activated
  useEffect(() => {
    if (customMode && inputRef.current) inputRef.current.focus();
  }, [customMode]);

  const selectPreset = (preset: typeof PRESETS[number]) => {
    if (preset.msg(roomPath) === '') {
      // Custom mode
      setCustomMode(true);
      onCommitMessageChange('');
      setOpen(false);
    } else {
      onCommitMessageChange(preset.msg(roomPath));
      setCustomMode(false);
      setOpen(false);
    }
  };

  const displayText = commitMessage || `cotext: update ${roomPath}`;

  return (
    <div className="commit-bar" ref={wrapperRef}>
      <div className="commit-input-wrapper">
        {customMode ? (
          <input
            ref={inputRef}
            type="text"
            className="commit-input"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            onBlur={() => { if (!commitMessage) setCustomMode(false); }}
            placeholder="Type your commit message…"
            disabled={syncing}
          />
        ) : (
          <button
            className="commit-selector"
            onClick={() => setOpen((v) => !v)}
            disabled={syncing}
          >
            <span className="commit-selector-text">{displayText}</span>
            <CaretDown size={12} weight="bold" className={`commit-caret ${open ? 'open' : ''}`} />
          </button>
        )}

        {open && (
          <div className="commit-presets">
            {PRESETS.map((p, i) => (
              <button key={i} className="commit-preset-item" onClick={() => selectPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

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
