/**
 * WikiSynthesisModal — "Channel chat → curated wiki" agent.
 *
 * Flow:
 *   1. Open with room content + (optional) existing NEURAL_INDEX.md.
 *   2. LLM analyzes captures → proposes N wiki docs (category/slug/title/tags/body).
 *   3. User reviews each proposal: select or skip, edit title/body/tags inline.
 *   4. Confirm → wikiBatchApi.pushBatch commits selected docs in ONE git commit
 *      → neural-compile workflow fires once → graph auto-updates within ~30s.
 *
 * Human-in-the-loop is mandatory — hallucinations land in wiki/* as PRs, not
 * silently as graph nodes. User can always edit the proposed markdown before push.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Sparkle, Check, Spinner as Loader2, PencilSimple, Tag, Brain } from '@phosphor-icons/react';
import { synthesizeWikiDocs, composeWikiDoc, wikiPath, type WikiProposal, type WikiCategory } from '../lib/knowledge/wikiSynthesize';
import { wikiBatchApi, wikiSynthesizeApi, githubApi } from '../lib/supabase/functions';
import { getKey } from '../lib/agent/keys';
import { PROVIDERS, getProvider, type ProviderId } from '../lib/agent/models';

interface Props {
  open: boolean;
  onClose: () => void;
  workspace: {
    id?: string;
    github_owner: string;
    github_repo: string;
    default_branch?: string | null;
  };
  /** Room cotext.md content (the captures to analyze). */
  roomContent: string;
  /** Room path label (for prompt context). */
  roomLabel: string;
  language: 'ko' | 'en';
}

// "managed" is a synthetic provider id meaning "Cotext Model (server-side LLM)".
// Real providers come from PROVIDERS in models.ts.
type ModelChoice =
  | { kind: 'byok'; providerId: ProviderId; model: string }
  | { kind: 'managed' };

type Phase = 'idle' | 'analyzing' | 'review' | 'pushing' | 'done' | 'error';

const CATEGORY_COLORS: Record<WikiCategory, string> = {
  decisions: '#3b9eff',
  concepts: '#a855f7',
  errors: '#ef4444',
  projects: '#10b981',
  design: '#f59e0b',
  'dev-tasks': '#06b6d4',
};

export default function WikiSynthesisModal({
  open, onClose, workspace, roomContent, roomLabel, language,
}: Props) {
  const ko = language === 'ko';
  const branch = workspace.default_branch || 'main';
  const repoLabel = `${workspace.github_owner}/${workspace.github_repo}`;

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposals, setProposals] = useState<WikiProposal[]>([]);
  // Per-proposal edit state. Keyed by index in `proposals`.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, Partial<WikiProposal>>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pushResult, setPushResult] = useState<{ created: number; skipped: number; commit_sha?: string } | null>(null);

  // Model picker. Lists configured BYOK providers (those with a key set in
  // localStorage) + Cotext Model (managed). User can switch per synthesis run.
  const availableProviders = useMemo(
    () => PROVIDERS.filter((p) => getKey(p.id).trim().length > 0),
    [open], // recompute when modal re-opens (keys may have changed)
  );
  const [choice, setChoice] = useState<ModelChoice>(() => {
    const first = availableProviders[0];
    return first ? { kind: 'byok', providerId: first.id, model: first.defaultModel } : { kind: 'managed' };
  });

  // Reset state whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setErrorMsg(null);
    setProposals([]);
    setSelected(new Set());
    setEdits({});
    setExpanded(new Set());
    setPushResult(null);
  }, [open]);

  const merged = useMemo(() => proposals.map((p, i) => ({ ...p, ...(edits[i] || {}) } as WikiProposal)), [proposals, edits]);

  const handleAnalyze = useCallback(async () => {
    setPhase('analyzing');
    setErrorMsg(null);
    try {
      // Pull existing NEURAL_INDEX.md so the LLM can reuse [[slugs]].
      let existingIndex: string | undefined;
      try {
        const res = await githubApi.getRoomContent(
          workspace.github_owner, workspace.github_repo, branch, '.cotext/NEURAL_INDEX.md',
        );
        existingIndex = res.content;
      } catch { /* missing index is fine — first synthesis run */ }

      let docs: WikiProposal[];
      if (choice.kind === 'managed') {
        if (!workspace.id) throw new Error('workspace_id missing — managed mode requires a saved workspace');
        const res = await wikiSynthesizeApi.managed({
          workspace_id: workspace.id,
          room_content: roomContent,
          existing_index: existingIndex,
          repo_label: repoLabel,
          room_label: roomLabel,
        });
        docs = res.proposals as WikiProposal[];
      } else {
        const apiKey = getKey(choice.providerId);
        if (!apiKey) {
          throw new Error(ko
            ? `${choice.providerId.toUpperCase()} API 키가 없습니다. AgentPanel에서 설정 후 재시도.`
            : `${choice.providerId.toUpperCase()} API key missing. Set it in AgentPanel and retry.`);
        }
        docs = await synthesizeWikiDocs({
          providerId: choice.providerId,
          model: choice.model,
          apiKey,
          roomContent, existingIndex,
          repoLabel, roomLabel,
        });
      }
      setProposals(docs);
      setSelected(new Set(docs.map((_, i) => i))); // default: all selected
      setPhase(docs.length === 0 ? 'done' : 'review');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [ko, workspace.id, workspace.github_owner, workspace.github_repo, branch, repoLabel, roomLabel, roomContent, choice]);

  const handlePush = useCallback(async () => {
    const picks = merged.filter((_, i) => selected.has(i));
    if (picks.length === 0) return;
    setPhase('pushing');
    setErrorMsg(null);
    try {
      const files = picks.map((p) => ({ path: wikiPath(p), content: composeWikiDoc(p) }));
      const res = await wikiBatchApi.pushBatch({
        owner: workspace.github_owner,
        repo: workspace.github_repo,
        branch,
        files,
        message: `cotext: synthesize ${picks.length} wiki doc(s) from ${roomLabel}`,
      });
      setPushResult({ created: res.created, skipped: res.skipped, commit_sha: res.commit_sha });
      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [merged, selected, workspace.github_owner, workspace.github_repo, branch, roomLabel]);

  const toggleSel = (i: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const toggleExp = (i: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const updateEdit = (i: number, patch: Partial<WikiProposal>) =>
    setEdits((prev) => ({ ...prev, [i]: { ...(prev[i] || {}), ...patch } }));

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wiki-synth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header wiki-synth-header">
          <div>
            <h3><Sparkle size={18} weight="fill" /> {ko ? 'Wiki로 정리' : 'Synthesize to wiki'}</h3>
            <p className="wiki-synth-sub">
              {ko
                ? `${roomLabel} 채팅 → AI-Sessions/wiki/* 정제 문서 → 자동 컴파일`
                : `${roomLabel} captures → AI-Sessions/wiki/* docs → auto-compile`}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="close"><X size={16} /></button>
        </div>

        <div className="modal-body wiki-synth-body">
          {phase === 'idle' && (
            <div className="wiki-synth-cta">
              <p>
                {ko
                  ? '이 채팅의 메모들을 분석해서 wiki 문서로 정리할 후보를 제안합니다. 확인·수정 후 선택한 것만 GitHub에 푸시됩니다.'
                  : 'AI analyzes this room\'s captures and proposes wiki docs. You review, edit, pick — only selected docs are pushed to GitHub.'}
              </p>

              {/* Model picker — lists BYOK providers with keys + managed Cotext Model. */}
              <div className="wiki-synth-picker">
                <label className="wiki-synth-picker-label">
                  {ko ? '분석 모델' : 'Model'}
                </label>
                <div className="wiki-synth-picker-row">
                  <select
                    className="wiki-synth-select"
                    value={choice.kind === 'managed' ? 'managed' : `byok:${choice.providerId}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'managed') {
                        setChoice({ kind: 'managed' });
                      } else {
                        const providerId = v.slice('byok:'.length) as ProviderId;
                        const provider = getProvider(providerId);
                        setChoice({ kind: 'byok', providerId, model: provider.defaultModel });
                      }
                    }}
                  >
                    {availableProviders.map((p) => (
                      <option key={p.id} value={`byok:${p.id}`}>{p.label} (BYOK)</option>
                    ))}
                    <option value="managed">
                      {ko ? 'Cotext Model — 크레딧 차감' : 'Cotext Model — uses credits'}
                    </option>
                  </select>
                  {choice.kind === 'byok' && (
                    <select
                      className="wiki-synth-select"
                      value={choice.model}
                      onChange={(e) => setChoice({ ...choice, model: e.target.value })}
                    >
                      {getProvider(choice.providerId).models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
                {availableProviders.length === 0 && choice.kind === 'byok' && (
                  <p className="wiki-synth-picker-hint">
                    {ko
                      ? '※ BYOK 키가 없습니다. AgentPanel에서 키를 추가하거나 Cotext Model을 선택하세요.'
                      : '※ No BYOK keys set. Add one in AgentPanel or pick Cotext Model.'}
                  </p>
                )}
                {choice.kind === 'managed' && (
                  <p className="wiki-synth-picker-hint">
                    <Brain size={11} weight="fill" />{' '}
                    {ko
                      ? '서버 모델 (요청 크기에 비례해 크레딧이 차감됩니다)'
                      : 'Server-side model (credits debited proportional to request size)'}
                  </p>
                )}
              </div>

              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={availableProviders.length === 0 && choice.kind === 'byok'}
              >
                <Sparkle size={14} weight="fill" /> {ko ? '분석 시작' : 'Start analysis'}
              </button>
            </div>
          )}

          {phase === 'analyzing' && (
            <div className="wiki-synth-loading">
              <Loader2 size={28} className="spin" />
              <p>{ko ? 'LLM이 채팅을 분석하는 중...' : 'LLM analyzing captures...'}</p>
            </div>
          )}

          {phase === 'review' && merged.length > 0 && (
            <>
              <div className="wiki-synth-summary">
                {ko
                  ? `${merged.length}개 문서 제안 · ${selected.size}개 선택됨`
                  : `${merged.length} docs proposed · ${selected.size} selected`}
              </div>
              <div className="wiki-synth-list">
                {merged.map((p, i) => {
                  const isSel = selected.has(i);
                  const isExp = expanded.has(i);
                  const color = CATEGORY_COLORS[p.category];
                  return (
                    <div key={i} className={`wiki-synth-card ${isSel ? 'is-selected' : ''}`}>
                      <div className="wiki-synth-card-head">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSel(i)}
                          className="wiki-synth-check"
                        />
                        <span className="wiki-synth-cat" style={{ color, borderColor: color }}>
                          {p.category}
                        </span>
                        <input
                          className="wiki-synth-title"
                          value={p.title}
                          onChange={(e) => updateEdit(i, { title: e.target.value })}
                          spellCheck={false}
                        />
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => toggleExp(i)}
                          aria-label="toggle body editor"
                        >
                          <PencilSimple size={11} /> {isExp ? (ko ? '닫기' : 'Close') : (ko ? '편집' : 'Edit')}
                        </button>
                      </div>
                      <div className="wiki-synth-meta">
                        <code className="wiki-synth-path">{wikiPath(p)}</code>
                        {p.tags.length > 0 && (
                          <span className="wiki-synth-tags">
                            <Tag size={10} /> {p.tags.join(', ')}
                          </span>
                        )}
                      </div>
                      {p.rationale && !isExp && (
                        <p className="wiki-synth-rationale">{p.rationale}</p>
                      )}
                      {isExp && (
                        <div className="wiki-synth-edit">
                          <label>
                            <span>{ko ? '태그 (콤마 구분)' : 'Tags (comma-separated)'}</span>
                            <input
                              value={p.tags.join(', ')}
                              onChange={(e) => updateEdit(i, {
                                tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              })}
                              spellCheck={false}
                            />
                          </label>
                          <label>
                            <span>{ko ? '본문 (markdown, [[slug]] 가능)' : 'Body (markdown, [[slug]] supported)'}</span>
                            <textarea
                              rows={12}
                              value={p.body}
                              onChange={(e) => updateEdit(i, { body: e.target.value })}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {phase === 'pushing' && (
            <div className="wiki-synth-loading">
              <Loader2 size={28} className="spin" />
              <p>{ko ? 'GitHub에 푸시 중...' : 'Pushing to GitHub...'}</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="wiki-synth-done">
              {pushResult ? (
                <>
                  <Check size={36} weight="bold" color="#10b981" />
                  <h4>{ko ? '푸시 완료' : 'Pushed'}</h4>
                  <p>
                    {ko
                      ? `${pushResult.created}개 생성, ${pushResult.skipped}개 스킵(이미 존재). 약 30초 후 그래프가 자동 갱신됩니다.`
                      : `Created ${pushResult.created}, skipped ${pushResult.skipped} (already exist). Graph auto-updates within ~30s.`}
                  </p>
                  {pushResult.commit_sha && (
                    <a
                      className="wiki-synth-commit-link"
                      href={`https://github.com/${repoLabel}/commit/${pushResult.commit_sha}`}
                      target="_blank" rel="noopener noreferrer"
                    >
                      {ko ? '커밋 보기' : 'View commit'} ↗
                    </a>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {ko
                      ? '제안할 만한 문서가 없습니다. 더 많은 메모를 쌓고 다시 시도하세요.'
                      : 'No wiki-worthy proposals. Capture more notes and try again.'}
                  </p>
                </>
              )}
            </div>
          )}

          {phase === 'error' && errorMsg && (
            <div className="wiki-synth-error">
              <strong>{ko ? '오류' : 'Error'}</strong>
              <p>{errorMsg}</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase('idle')}>
                {ko ? '다시 시도' : 'Retry'}
              </button>
            </div>
          )}
        </div>

        {phase === 'review' && (
          <div className="modal-footer wiki-synth-footer">
            <button className="btn btn-ghost" onClick={onClose}>{ko ? '취소' : 'Cancel'}</button>
            <button
              className="btn btn-primary"
              onClick={handlePush}
              disabled={selected.size === 0}
            >
              <Sparkle size={14} weight="fill" />{' '}
              {ko
                ? `${selected.size}개 wiki에 푸시`
                : `Push ${selected.size} to wiki`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
