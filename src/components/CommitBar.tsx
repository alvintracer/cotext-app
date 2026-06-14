import { useState, useRef, useEffect } from 'react';
import { ArrowDown, ArrowUp, Spinner as Loader2, CaretDown } from '@phosphor-icons/react';
import { useLanguage } from '../contexts/LanguageContext';
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

interface Preset {
  icon: string;
  label: string;
  desc: string;
  msg: (p: string) => string;
}

const PRESETS_EN: Preset[] = [
  { icon: '📝', label: 'Update notes', desc: 'Save your edits to GitHub', msg: (p) => `cotext: update ${p}` },
  { icon: '✅', label: 'Review & approve', desc: 'Mark AI content as reviewed', msg: (p) => `cotext: reviewed ${p}` },
  { icon: '🔀', label: 'Merge AI suggestions', desc: 'Accept and push AI-generated notes', msg: (p) => `cotext: merge AI notes in ${p}` },
  { icon: '🧹', label: 'Clean up', desc: 'Reorganize or trim content', msg: (p) => `cotext: cleanup ${p}` },
  { icon: '📌', label: 'Add decision', desc: 'Record a key decision or reference', msg: (p) => `cotext: add decision to ${p}` },
  { icon: '✏️', label: 'Custom message…', desc: 'Write your own commit message', msg: () => '' },
];

const PRESETS_KO: Preset[] = [
  { icon: '📝', label: '노트 업데이트', desc: '편집 내용을 GitHub에 저장', msg: (p) => `cotext: update ${p}` },
  { icon: '✅', label: '검토 및 승인', desc: 'AI 콘텐츠를 검토 완료로 표시', msg: (p) => `cotext: reviewed ${p}` },
  { icon: '🔀', label: 'AI 제안 병합', desc: 'AI가 생성한 노트를 수용하고 push', msg: (p) => `cotext: merge AI notes in ${p}` },
  { icon: '🧹', label: '정리 / 재구성', desc: '콘텐츠 정리 또는 불필요한 내용 제거', msg: (p) => `cotext: cleanup ${p}` },
  { icon: '📌', label: '결정 사항 추가', desc: '핵심 결정이나 참고 자료를 기록', msg: (p) => `cotext: add decision to ${p}` },
  { icon: '✏️', label: '직접 입력…', desc: '커밋 메시지를 직접 작성', msg: () => '' },
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
  const { language } = useLanguage();
  const presets = language === 'ko' ? PRESETS_KO : PRESETS_EN;
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

  const selectPreset = (preset: Preset) => {
    if (preset.msg(roomPath) === '') {
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
            placeholder={language === 'ko' ? '커밋 메시지를 입력하세요…' : 'Type your commit message…'}
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
            {presets.map((p, i) => (
              <button key={i} className="commit-preset-item" onClick={() => selectPreset(p)}>
                <span className="commit-preset-label">{p.icon} {p.label}</span>
                <span className="commit-preset-desc">{p.desc}</span>
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
