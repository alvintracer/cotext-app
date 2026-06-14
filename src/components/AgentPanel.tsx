import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CodepenLogo, X, GearSix, PaperPlaneRight, Copy, Check, ArrowClockwise,
  Warning, ArrowSquareOut, Plus, Wrench, SpinnerGap, MagicWand, Trash,
} from '@phosphor-icons/react';
import { useLanguage } from '../contexts/LanguageContext';
import { githubApi } from '../lib/supabase/functions';
import { appendMessage } from '../lib/markdown/index';
import { PROVIDERS, getProvider, formatCost } from '../lib/agent/models';
import type { ProviderId, TokenUsage } from '../lib/agent/models';
import { getKey, setKey, getPref, setPref } from '../lib/agent/keys';
import { runChat, runToolLoop } from '../lib/agent/providers';
import '../styles/agent.css';

interface PanelWorkspace {
  github_owner: string;
  github_repo: string;
  default_branch: string;
  name: string;
}
interface PanelRoom {
  path: string;
  cotext_file_path: string;
}
interface AgentPanelProps {
  open: boolean;
  onClose: () => void;
  workspace: PanelWorkspace;
  room: PanelRoom | null;
  /** All rooms in the workspace — lets agent-mode read/list other rooms. */
  rooms?: PanelRoom[];
  /** Called after an AI reply is appended to the room (so the chat view can refresh). */
  onSaved?: () => void;
  /** "Fix with Agent": when nonce changes, auto-fill a restructure prompt with this text and send. */
  seed?: { text: string; nonce: number } | null;
  /** Apply an AI reply to the room's LOCAL content (draft) — add, or replace the fixed origin block. */
  onApply?: (p: { text: string; source: string; replace: boolean }) => void;
  /** Whether a fix-origin block exists to replace (enables the "Replace original" button). */
  canReplace?: boolean;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  usage?: TokenUsage;
}

const STR = {
  en: {
    title: 'Agents', settings: 'Settings', close: 'Close',
    placeholder: 'Ask about this repo…', send: 'Send',
    grounded: 'Grounded on', noRoom: 'No chat selected — answering without repo context',
    thinking: 'Thinking…', copy: 'Copy', copied: 'Copied',
    saveToChat: 'Save to chat', saved: 'Saved', saving: 'Saving…',
    applyAdd: 'Add to chat', applyReplace: 'Replace original',
    agentMode: 'Agent mode (tools)', agentModeOff: 'Agent mode: off',
    proposalTitle: 'Agent wants to save to', approve: 'Approve & save', reject: 'Reject', working: 'Working…',
    provider: 'Provider', model: 'Model', apiKey: 'API key', baseURL: 'Base URL',
    save: 'Save', getKey: 'Get key', byok: 'BYOK — keys stay in this browser only',
    needKey: 'Add an API key for this provider to start.', refresh: 'Reload context',
    empty: 'Every model here answers grounded on your repo. Pick a model, add your key, and ask.',
    sourceNote: 'AI replies are tagged with the model (source). Copy to paste back into a chat.',
  },
  ko: {
    title: '에이전트', settings: '설정', close: '닫기',
    placeholder: '이 레포에 대해 물어보세요…', send: '전송',
    grounded: '컨텍스트', noRoom: '선택된 챗 없음 — 레포 컨텍스트 없이 답변',
    thinking: '생각 중…', copy: '복사', copied: '복사됨',
    saveToChat: '챗에 저장', saved: '저장됨', saving: '저장 중…',
    applyAdd: '챗에 추가', applyReplace: '원본 대체',
    agentMode: '에이전트 모드 (도구)', agentModeOff: '에이전트 모드: 꺼짐',
    proposalTitle: '에이전트가 저장하려는 곳', approve: '승인 후 저장', reject: '거절', working: '처리 중…',
    provider: '제공자', model: '모델', apiKey: 'API 키', baseURL: 'Base URL',
    save: '저장', getKey: '키 발급', byok: 'BYOK — 키는 이 브라우저에만 저장',
    needKey: '시작하려면 이 제공자의 API 키를 입력하세요.', refresh: '컨텍스트 새로고침',
    empty: '여기 모든 모델은 당신의 레포를 컨텍스트로 깔고 답합니다. 모델을 고르고 키를 넣고 물어보세요.',
    sourceNote: 'AI 답변은 모델(source)로 태그됩니다. 복사해서 채팅에 다시 붙여넣으세요.',
  },
};

const MAX_CONTEXT_CHARS = 60000;

export default function AgentPanel({ open, onClose, workspace, room, rooms = [], onSaved, seed, onApply, canReplace }: AgentPanelProps) {
  const { language } = useLanguage();
  const t = STR[language === 'ko' ? 'ko' : 'en'];

  const pref = getPref();
  const [providerId, setProviderId] = useState<ProviderId>(pref?.provider || 'gemini');
  const [model, setModel] = useState(pref?.model || getProvider('gemini').defaultModel);
  const [baseURL, setBaseURL] = useState(pref?.baseURL || '');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);

  const [context, setContext] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [proposal, setProposal] = useState<{ roomPath: string; content: string } | null>(null);
  const [approving, setApproving] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  const provider = getProvider(providerId);
  const hasKey = !!getKey(providerId);
  const effectiveBase = provider.editableBaseURL ? baseURL : provider.baseURL;
  const agentCapable = true; // all providers support tool calling

  // Load repo context for the current room
  const loadContext = useCallback(async () => {
    if (!room) { setContext(''); return; }
    setContextLoading(true);
    try {
      const res = await githubApi.getRoomContent(
        workspace.github_owner, workspace.github_repo, workspace.default_branch, room.cotext_file_path,
      );
      setContext((res.content || '').slice(0, MAX_CONTEXT_CHARS));
    } catch {
      setContext('');
    } finally {
      setContextLoading(false);
    }
  }, [room, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch toggles loading flag
    if (open) loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'auto' });
  }, [messages, loading]);

  // When provider changes, default the model & prefill key input
  const selectProvider = (id: ProviderId) => {
    const p = getProvider(id);
    setProviderId(id);
    setModel(p.defaultModel);
    setBaseURL(p.editableBaseURL ? baseURL : p.baseURL);
    setApiKeyInput('');
    setKeySaved(false);
  };

  const saveSettings = () => {
    if (apiKeyInput.trim()) setKey(providerId, apiKeyInput.trim());
    setPref({ provider: providerId, model, baseURL: provider.editableBaseURL ? baseURL : undefined });
    setApiKeyInput('');
    setKeySaved(true);
    setError('');
    setTimeout(() => { setKeySaved(false); setShowSettings(false); }, 800);
  };

  const buildSystem = (): string => {
    const head =
      `You are an AI assistant embedded in Cotext, working with the user's GitHub repository as the single source of truth.\n` +
      `Repository: ${workspace.github_owner}/${workspace.github_repo}` +
      (room ? `, current chat: ${room.path}` : '') + `.\n` +
      `Ground every answer in the CONTEXT below. If the context doesn't cover something, say so plainly.\n` +
      `When you produce content meant to be saved back, output clean Markdown. Your output is AI-generated; it will be tagged source:${model}.\n`;
    const body = context
      ? `\n--- CONTEXT (${room?.path || 'repo'}) ---\n${context}\n--- END CONTEXT ---`
      : `\n(No chat selected — answer without repo context.)`;
    return head + body;
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!getKey(providerId)) { setShowSettings(true); setError(t.needKey); return; }
    setError('');
    setProposal(null);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const sys = buildSystem();
      const convo = next.map((m) => ({ role: m.role, content: m.content }));

      // ── Agent mode (tool loop) — all providers ──
      if (agentMode && agentCapable) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '', model }]);
        let capturedUsage: TokenUsage | undefined;
        const turn = await runToolLoop({
          shape: provider.shape,
          baseURL: effectiveBase,
          apiKey: getKey(providerId),
          model,
          fallbackModel: provider.fallbackModel,
          system: sys,
          messages: convo,
          executeRead,
          signal: undefined,
          onUsage: (u) => { capturedUsage = u; },
        });
        if (turn.kind === 'proposal') {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: `📝 ${turn.roomPath}\n\n${turn.content}`, usage: capturedUsage };
            }
            return copy;
          });
          setProposal({ roomPath: turn.roomPath, content: turn.content });
        } else {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: turn.text || '(empty response)', usage: capturedUsage };
            }
            return copy;
          });
        }
      } else {
        // Direct providers: stream tokens into a placeholder assistant message
        setStreaming(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', model }]);
        let capturedUsage: TokenUsage | undefined;
        const full = await runChat({
          shape: provider.shape,
          baseURL: effectiveBase,
          apiKey: getKey(providerId),
          model,
          system: sys,
          messages: convo,
          onToken: (delta) => {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + delta };
              return copy;
            });
          },
          onUsage: (u) => { capturedUsage = u; },
        });
        setStreaming(false);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            copy[copy.length - 1] = { ...last, content: full || '(empty response)', usage: capturedUsage };
          } else if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, usage: capturedUsage };
          }
          return copy;
        });
      }
    } catch (e) {
      setStreaming(false);
      // drop a trailing empty placeholder if streaming failed before any token
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last && last.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev;
      });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, messages, provider, effectiveBase, providerId, model, context, room, workspace, agentMode]);

  // "Fix with Agent": auto-fill a restructure prompt with the seeded text and send it.
  const autoSend = useRef(false);
  const seedNonce = seed?.nonce;
  useEffect(() => {
    if (!seed) return;
    const refinePrompt = language === 'ko'
      ? `다음 메모를 이 레포의 맥락과 기존 지식에 근거해 정리·재구조화해줘. 의미는 보존하고, 제목/리스트 등 마크다운 구조를 복원·정리하고, 오탈자와 어색한 표현을 다듬어줘. 레포에 없는 사실은 지어내지 마. 결과는 깔끔한 마크다운으로만 출력해.\n\n---\n${seed.text}`
      : `Restructure and clean up the note below, grounded in this repo's context and knowledge. Preserve meaning, restore/organize Markdown structure (headings/lists), fix typos and awkward phrasing. Don't invent facts not in the repo. Output clean Markdown only.\n\n---\n${seed.text}`;
    /* eslint-disable react-hooks/set-state-in-effect -- prefill composer when a fix seed arrives */
    setShowSettings(false);
    setInput(refinePrompt);
    /* eslint-enable react-hooks/set-state-in-effect */
    autoSend.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  useEffect(() => {
    if (autoSend.current && input.trim() && !loading) {
      autoSend.current = false;
      send();
    }
  }, [input, loading, send]);

  const copyMsg = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // Write an AI reply back into the room's cotext.md, tagged with source:<provider>
  // Retries once on 409 conflict (SHA mismatch from concurrent edits).
  const saveToChat = async (idx: number, content: string) => {
    if (!room || savingIdx !== null) return;
    setSavingIdx(idx);
    setError('');
    const attempt = async () => {
      const cur = await githubApi.getRoomContent(
        workspace.github_owner, workspace.github_repo, workspace.default_branch, room.cotext_file_path,
      );
      const updated = appendMessage(cur.content || '', content, undefined, providerId);
      await githubApi.pushRoom(
        workspace.github_owner, workspace.github_repo, workspace.default_branch,
        room.cotext_file_path, updated, cur.sha, `cotext: agent (${providerId}) note`,
      );
    };
    try {
      try {
        await attempt();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Retry once on conflict (409 / SHA mismatch)
        if (msg.includes('409') || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('sha')) {
          await attempt();
        } else {
          throw e;
        }
      }
      setSavedIdx(idx);
      setTimeout(() => setSavedIdx(null), 2000);
      // Delay refresh so the UI doesn't flash/reset immediately
      setTimeout(() => onSaved?.(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingIdx(null);
    }
  };

  const resolveRoom = (path: string): PanelRoom | null =>
    rooms.find((r) => r.path === path) || (room && room.path === path ? room : null) || room;

  // Read-tool executor for agent mode (list_rooms / get_room). Writes go through approval.
  const executeRead = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (name === 'list_rooms') {
      const list = rooms.length ? rooms.map((r) => r.path) : room ? [room.path] : [];
      return JSON.stringify(list);
    }
    if (name === 'get_room') {
      const target = resolveRoom(String(args.room_path || ''));
      if (!target) return `Room not found: ${args.room_path}`;
      try {
        const c = await githubApi.getRoomContent(
          workspace.github_owner, workspace.github_repo, workspace.default_branch, target.cotext_file_path,
        );
        return (c.content || '(empty)').slice(0, 40000);
      } catch (e) {
        return `Error reading room: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return `Unknown tool: ${name}`;
  };

  const approveProposal = async () => {
    if (!proposal || approving) return;
    const target = resolveRoom(proposal.roomPath);
    if (!target) { setError(`Room not found: ${proposal.roomPath}`); return; }
    setApproving(true);
    setError('');
    try {
      const cur = await githubApi.getRoomContent(
        workspace.github_owner, workspace.github_repo, workspace.default_branch, target.cotext_file_path,
      );
      const updated = appendMessage(cur.content || '', proposal.content, undefined, providerId);
      await githubApi.pushRoom(
        workspace.github_owner, workspace.github_repo, workspace.default_branch,
        target.cotext_file_path, updated, cur.sha, `cotext: agent (${providerId}) auto-edit`,
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: `✓ ${target.path}\n\n${proposal.content}`, model }]);
      setProposal(null);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  if (!open) return null;

  return (
    <aside className="agent-panel">
      <div className="agent-panel-header">
        <div className="agent-panel-title">
          <CodepenLogo size={18} weight="duotone" />
          <span>{t.title}</span>
        </div>
        <div className="agent-panel-actions">
          <button className="icon-button" onClick={() => setShowSettings((s) => !s)} title={t.settings}>
            <GearSix size={18} />
          </button>
          <button className="icon-button" onClick={onClose} title={t.close}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Model bar */}
      <div className="agent-modelbar" onClick={() => setShowSettings((v) => !v)}>
        <span className="agent-model-name">{provider.label} · {model || '—'}</span>

        {!hasKey && <span className="agent-nokey"><Warning size={12} /> key</span>}
      </div>

      {/* Grounding indicator */}
      <div className="agent-ground">
        {room ? (
          <>
            <span className="agent-ground-dot" />
            {t.grounded}: <code>{room.path}</code>
            <button className="icon-button agent-ground-refresh" onClick={loadContext} title={t.refresh}>
              <ArrowClockwise size={13} className={contextLoading ? 'spin' : ''} />
            </button>
          </>
        ) : (
          <span className="text-dim">{t.noRoom}</span>
        )}
      </div>

      {/* Agent mode toggle */}
      {agentCapable && (
        <div className="agent-mode-bar">
          <label className="agent-mode-toggle">
            <input type="checkbox" checked={agentMode} onChange={(e) => setAgentMode(e.target.checked)} />
            <Wrench size={13} />
            <span>{agentMode ? t.agentMode : t.agentModeOff}</span>
          </label>
        </div>
      )}

      {showSettings && (
        <div className="agent-settings">
          <label className="agent-field-label">{t.provider}</label>
          <select value={providerId} onChange={(e) => selectProvider(e.target.value as ProviderId)} className="input">
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {provider.editableBaseURL && (
            <>
              <label className="agent-field-label">{t.baseURL}</label>
              <input className="input" value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://… /v1" />
            </>
          )}

          <label className="agent-field-label">{t.model}</label>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)}
            list={`models-${providerId}`} placeholder={provider.defaultModel} />
          <datalist id={`models-${providerId}`}>
            {provider.models.map((m) => <option key={m} value={m} />)}
          </datalist>

          <label className="agent-field-label">
            {t.apiKey}
            {provider.keyUrl && (
              <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="agent-getkey">
                {t.getKey} <ArrowSquareOut size={11} />
              </a>
            )}
          </label>
          <input className="input" type="password" value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={hasKey ? '•••••••• (saved)' : provider.keyLabel} />

          <button className="btn btn-primary btn-sm agent-save" onClick={saveSettings}>
            {keySaved ? <><Check size={14} /> {t.save}</> : t.save}
          </button>
          <p className="agent-byok">{t.byok}</p>
        </div>
      )}

      {/* Messages */}
      <div className="agent-msgs" ref={msgsRef}>
        {messages.length === 0 && !loading && (
          <div className="agent-empty">
            <CodepenLogo size={32} weight="duotone" />
            <p>{t.empty}</p>
            <p className="text-dim text-xs">{t.sourceNote}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`agent-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <div className="agent-msg-meta">
                <span className="agent-source">source: {m.model}</span>
                {room && onApply ? (
                  <>
                    <button className="agent-add-btn" title={t.applyAdd}
                      onClick={() => { onApply({ text: m.content, source: providerId, replace: false }); setSavedIdx(i); setTimeout(() => setSavedIdx(null), 1500); }}>
                      {savedIdx === i ? <Check size={12} weight="bold" /> : <Plus size={12} weight="bold" />}
                    </button>
                    {canReplace && (
                      <button className="agent-add-btn agent-replace-btn" title={t.applyReplace}
                        onClick={() => { onApply({ text: m.content, source: providerId, replace: true }); setSavedIdx(i); setTimeout(() => setSavedIdx(null), 1500); }}>
                        <MagicWand size={12} weight="bold" />
                      </button>
                    )}
                  </>
                ) : room && (
                  <button className="agent-add-btn" onClick={() => saveToChat(i, m.content)}
                    disabled={savingIdx !== null} title={t.saveToChat}>
                    {savedIdx === i ? <Check size={12} weight="bold" /> : savingIdx === i ? <SpinnerGap size={12} className="spin" /> : <Plus size={12} weight="bold" />}
                  </button>
                )}
                <button className="icon-button agent-copy" onClick={() => copyMsg(i, m.content)} title={t.copy}>
                  {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}
            <div className="agent-msg-body">{m.content || '…'}</div>
            {m.role === 'assistant' && (
              <div className="agent-msg-bottom-actions">
                <button className="agent-bottom-btn" onClick={() => copyMsg(i, m.content)} title={t.copy}>
                  {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                </button>
                {room && onApply ? (
                  <>
                    <button className="agent-bottom-btn" title={t.applyAdd}
                      onClick={() => { onApply({ text: m.content, source: providerId, replace: false }); setSavedIdx(i); setTimeout(() => setSavedIdx(null), 1500); }}>
                      {savedIdx === i ? <Check size={12} /> : <Plus size={12} />}
                    </button>
                    {canReplace && (
                      <button className="agent-bottom-btn agent-replace-btn" title={t.applyReplace}
                        onClick={() => { onApply({ text: m.content, source: providerId, replace: true }); setSavedIdx(i); setTimeout(() => setSavedIdx(null), 1500); }}>
                        <MagicWand size={12} />
                      </button>
                    )}
                  </>
                ) : room && (
                  <button className="agent-bottom-btn" onClick={() => saveToChat(i, m.content)}
                    disabled={savingIdx !== null} title={t.saveToChat}>
                    {savedIdx === i ? <Check size={12} /> : savingIdx === i ? <SpinnerGap size={12} className="spin" /> : <Plus size={12} />}
                  </button>
                )}
                <button className="agent-bottom-btn agent-delete-btn"
                  onClick={() => setMessages(prev => prev.filter((_, idx) => idx !== i))} title="Delete">
                  <Trash size={12} />
                </button>
              </div>
            )}
            {m.role === 'assistant' && m.usage && (m.usage.inputTokens > 0 || m.usage.outputTokens > 0) && (
              <div className="agent-usage">
                ⚡ {m.usage.inputTokens.toLocaleString()} in · {m.usage.outputTokens.toLocaleString()} out
                {m.model && (() => { const c = formatCost(m.model!, m.usage!); return c ? ` · ${c}` : ''; })()}
              </div>
            )}
          </div>
        ))}
        {loading && !streaming && <div className="agent-msg assistant"><div className="agent-msg-body text-dim">{t.thinking}</div></div>}
        {error && <div className="agent-error"><Warning size={14} /> {error}</div>}
      </div>

      {/* Proposal approval card */}
      {proposal && (
        <div className="agent-proposal">
          <div className="agent-proposal-header">
            <Wrench size={14} />
            <span>{t.proposalTitle}: <code>{proposal.roomPath}</code></span>
          </div>
          <pre className="agent-proposal-preview">{proposal.content}</pre>
          <div className="agent-proposal-actions">
            <button className="btn btn-primary btn-sm" onClick={approveProposal} disabled={approving}>
              {approving ? t.working : t.approve}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>{t.reject}</button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="agent-input-bar">
        <textarea
          className="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={t.placeholder}
          rows={1}
        />
        <button className="agent-send" onClick={send} disabled={loading || !input.trim()} title={t.send}>
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>
    </aside>
  );
}
