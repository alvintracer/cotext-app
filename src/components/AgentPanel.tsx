import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CodepenLogo,
  X,
  GearSix,
  PaperPlaneRight,
  Copy,
  Check,
  ArrowClockwise,
  Warning,
  ArrowSquareOut,
  Plus,
  Wrench,
  SpinnerGap,
  MagicWand,
  Trash,
  Key,
  Lightning,
} from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import ManagedCreditsPanel from './ManagedCreditsPanel';
import { githubApi, managedAgentApi, type ManagedAgentChatResponse } from '../lib/supabase/functions';
import { appendMessage } from '../lib/markdown/index';
import { PROVIDERS, getProvider, formatCost } from '../lib/agent/models';
import type { ProviderId, TokenUsage } from '../lib/agent/models';
import { getKey, setKey, getPref, setPref } from '../lib/agent/keys';
import { runChat, runToolLoop } from '../lib/agent/providers';
import '../styles/agent.css';

interface PanelWorkspace {
  id: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
  name: string;
  cotext_folder_name?: string;
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
  rooms?: PanelRoom[];
  onSaved?: () => void;
  seed?: { text: string; nonce: number } | null;
  onApply?: (p: { text: string; source: string; replace: boolean }) => void;
  canReplace?: boolean;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  sourceId?: string;
  usage?: TokenUsage;
}

const STR = {
  en: {
    title: 'Agents',
    settings: 'Settings',
    close: 'Close',
    placeholder: 'Ask about this repo...',
    send: 'Send',
    grounded: 'Grounded on',
    noRoom: 'No chat selected - answering without repo context',
    thinking: 'Thinking...',
    copy: 'Copy',
    saveToChat: 'Save to chat',
    agentMode: 'Agent mode (tools)',
    agentModeOff: 'Agent mode: off',
    proposalTitle: 'Agent wants to save to',
    approve: 'Approve & save',
    reject: 'Reject',
    working: 'Working...',
    provider: 'Provider',
    model: 'Model',
    apiKey: 'API key',
    baseURL: 'Base URL',
    save: 'Save',
    getKey: 'Get key',
    byok: 'BYOK - keys stay in this browser only',
    needKey: 'Add an API key for this provider to start.',
    refresh: 'Reload context',
    empty: 'Every model here answers grounded on your repo. Pick a model, add your key, and ask.',
    sourceNote: 'AI replies are tagged with the model source. Copy or save them back into chat.',
    applyAdd: 'Add to chat',
    applyReplace: 'Replace original',
    myApiKey: 'My API Key',
    cotextModel: 'Cotext Model',
    managedNote: "Runs on Cotext's managed model. Workspace credits will be deducted.",
    managedToolsNote: 'Managed mode currently supports direct chat only.',
    keyMissing: 'key',
  },
  ko: {
    title: '에이전트',
    settings: '설정',
    close: '닫기',
    placeholder: '이 레포에 대해 물어보세요...',
    send: '전송',
    grounded: '컨텍스트',
    noRoom: '선택된 채팅이 없어 레포 컨텍스트 없이 답변합니다',
    thinking: '생각 중...',
    copy: '복사',
    saveToChat: '채팅에 저장',
    agentMode: '에이전트 모드 (도구)',
    agentModeOff: '에이전트 모드: 끔',
    proposalTitle: '에이전트가 저장하려는 위치',
    approve: '승인 후 저장',
    reject: '취소',
    working: '처리 중...',
    provider: '제공자',
    model: '모델',
    apiKey: 'API 키',
    baseURL: 'Base URL',
    save: '저장',
    getKey: '키 발급',
    byok: 'BYOK - 키는 이 브라우저에만 저장됩니다',
    needKey: '시작하려면 이 제공자의 API 키를 입력하세요.',
    refresh: '컨텍스트 새로고침',
    empty: '여기의 모든 모델은 레포 컨텍스트를 기반으로 답변합니다. 모델을 고르고 질문하세요.',
    sourceNote: 'AI 답변은 모델 source 태그와 함께 저장됩니다.',
    applyAdd: '채팅에 추가',
    applyReplace: '원본 교체',
    myApiKey: '내 API 키',
    cotextModel: 'Cotext 모델',
    managedNote: 'Cotext 관리형 모델로 실행됩니다. 워크스페이스 크레딧이 차감됩니다.',
    managedToolsNote: '관리형 모드에서는 현재 일반 채팅만 지원합니다.',
    keyMissing: '키 없음',
  },
};

const MAX_CONTEXT_CHARS = 60000;

export default function AgentPanel({
  open,
  onClose,
  workspace,
  room,
  rooms = [],
  onSaved,
  seed,
  onApply,
  canReplace,
}: AgentPanelProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const currentAuthor = user?.user_metadata?.user_name || workspace.github_owner;
  const t = STR[language === 'ko' ? 'ko' : 'en'];

  const pref = getPref();
  const [trackMode, setTrackMode] = useState<'byok' | 'managed'>(pref?.trackMode || 'byok');
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
  const [managedInfo, setManagedInfo] = useState<ManagedAgentChatResponse['managed'] | null>(null);
  const [proposal, setProposal] = useState<{ roomPath: string; content: string } | null>(null);
  const [approving, setApproving] = useState(false);
  const [neuralSummary, setNeuralSummary] = useState('');
  const msgsRef = useRef<HTMLDivElement>(null);

  const provider = getProvider(providerId);
  const hasKey = !!getKey(providerId);
  const llmReady = trackMode === 'managed' || hasKey;
  const effectiveBase = provider.editableBaseURL ? baseURL : provider.baseURL;
  const agentCapable = trackMode === 'byok';

  useEffect(() => {
    if (trackMode === 'managed' && agentMode) setAgentMode(false);
  }, [trackMode, agentMode]);

  const loadContext = useCallback(async () => {
    if (!room) {
      setContext('');
      return;
    }
    setContextLoading(true);
    try {
      const res = await githubApi.getRoomContent(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path,
      );
      setContext((res.content || '').slice(0, MAX_CONTEXT_CHARS));
    } catch {
      setContext('');
    } finally {
      setContextLoading(false);
    }
  }, [room, workspace]);

  useEffect(() => {
    if (open) void loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    if (!open || !room) {
      setNeuralSummary('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const folder = workspace.cotext_folder_name || '.cotext';
        const neuralPath = `${folder}/neural.json`;
        const res = await githubApi.getRoomContent(
          workspace.github_owner,
          workspace.github_repo,
          workspace.default_branch,
          neuralPath,
        );
        if (cancelled) return;
        setNeuralSummary(buildNeuralSummary(res.content || '', context, room.path));
      } catch {
        if (!cancelled) setNeuralSummary('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, room, workspace, context]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'auto' });
  }, [messages, loading]);

  const selectProvider = (id: ProviderId) => {
    const nextProvider = getProvider(id);
    setProviderId(id);
    setModel(nextProvider.defaultModel);
    setBaseURL(nextProvider.editableBaseURL ? baseURL : nextProvider.baseURL);
    setApiKeyInput('');
    setKeySaved(false);
  };

  const saveSettings = () => {
    if (trackMode === 'byok' && apiKeyInput.trim()) setKey(providerId, apiKeyInput.trim());
    setPref({
      provider: providerId,
      model,
      baseURL: provider.editableBaseURL ? baseURL : undefined,
      trackMode,
    });
    setApiKeyInput('');
    setKeySaved(true);
    setError('');
    setTimeout(() => {
      setKeySaved(false);
      setShowSettings(false);
    }, 800);
  };

  const buildSystem = (): string => {
    const sourceModel = trackMode === 'managed' ? (managedInfo?.model || 'managed-model') : model;
    const head =
      `You are an AI assistant embedded in Cotext, working with the user's GitHub repository as the single source of truth.\n` +
      `Repository: ${workspace.github_owner}/${workspace.github_repo}` +
      (room ? `, current chat: ${room.path}` : '') +
      `.\n` +
      `Ground every answer in the CONTEXT below. If the context does not cover something, say so plainly.\n` +
      `When you produce content meant to be saved back, output clean Markdown. Your output is AI-generated; it will be tagged source:${sourceModel}.\n`;
    const body = context
      ? `\n--- CONTEXT (${room?.path || 'repo'}) ---\n${context}\n--- END CONTEXT ---`
      : `\n(No chat selected - answer without repo context.)`;
    const neural = neuralSummary
      ? `\n--- NEURAL LINK GRAPH ---\n${neuralSummary}\n--- END NEURAL ---`
      : '';
    return head + body + neural;
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (trackMode === 'byok' && !getKey(providerId)) {
      setShowSettings(true);
      setError(t.needKey);
      return;
    }

    setError('');
    setProposal(null);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const system = buildSystem();
      const convo = next.map((m) => ({ role: m.role, content: m.content }));

      if (trackMode === 'managed') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '', model: 'Cotext Model', sourceId: 'managed' }]);
        const managed = await managedAgentApi.chat(workspace.id, system, convo);
        setManagedInfo(managed.managed);
        window.dispatchEvent(new CustomEvent('mindsync:managed-credits-updated', { detail: { workspaceId: workspace.id } }));
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              content: managed.text || '(empty response)',
              model: managed.managed.model,
              sourceId: managed.managed.providerId,
              usage: managed.usage,
            };
          }
          return copy;
        });
        return;
      }

      if (agentMode && agentCapable) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '', model, sourceId: providerId }]);
        let capturedUsage: TokenUsage | undefined;
        const turn = await runToolLoop({
          shape: provider.shape,
          baseURL: effectiveBase,
          apiKey: getKey(providerId),
          model,
          fallbackModel: provider.fallbackModel,
          system,
          messages: convo,
          executeRead,
          signal: undefined,
          onUsage: (usage) => {
            capturedUsage = usage;
          },
        });
        if (turn.kind === 'proposal') {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                content: `-> ${turn.roomPath}\n\n${turn.content}`,
                usage: capturedUsage,
                sourceId: providerId,
              };
            }
            return copy;
          });
          setProposal({ roomPath: turn.roomPath, content: turn.content });
        } else {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                content: turn.text || '(empty response)',
                usage: capturedUsage,
                sourceId: providerId,
              };
            }
            return copy;
          });
        }
      } else {
        setStreaming(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', model, sourceId: providerId }]);
        let capturedUsage: TokenUsage | undefined;
        const full = await runChat({
          shape: provider.shape,
          baseURL: effectiveBase,
          apiKey: getKey(providerId),
          model,
          system,
          messages: convo,
          onToken: (delta) => {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + delta };
              }
              return copy;
            });
          },
          onUsage: (usage) => {
            capturedUsage = usage;
          },
        });
        setStreaming(false);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            copy[copy.length - 1] = {
              ...last,
              content: full || '(empty response)',
              usage: capturedUsage,
              sourceId: providerId,
            };
          } else if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, usage: capturedUsage, sourceId: providerId };
          }
          return copy;
        });
      }
    } catch (e) {
      setStreaming(false);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last && last.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev;
      });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [input, loading, trackMode, providerId, t.needKey, messages, workspace.id, workspace.github_owner, workspace.github_repo, room, context, model, managedInfo?.model, neuralSummary, agentMode, agentCapable, provider.shape, provider.fallbackModel, effectiveBase]);

  const autoSend = useRef(false);
  const seedNonce = seed?.nonce;
  useEffect(() => {
    if (!seed) return;
    const refinePrompt = language === 'ko'
      ? `다음 메모를 이 레포의 맥락에 맞게 정리해 주세요. 의미는 유지하고, 제목/리스트 등 Markdown 구조를 복원하고, 오탈자와 어색한 표현을 다듬어 주세요. 레포에 없는 사실은 추가하지 말고 결과는 Markdown만 출력하세요.\n\n---\n${seed.text}`
      : `Restructure and clean up the note below, grounded in this repo's context. Preserve meaning, restore Markdown structure, fix typos, and do not invent facts. Output Markdown only.\n\n---\n${seed.text}`;
    setShowSettings(false);
    setInput(refinePrompt);
    autoSend.current = true;
  }, [seedNonce, language, seed]);

  useEffect(() => {
    if (autoSend.current && input.trim() && !loading) {
      autoSend.current = false;
      void send();
    }
  }, [input, loading, send]);

  const copyMsg = (idx: number, content: string) => {
    void navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const saveToChat = async (idx: number, content: string, sourceId: string) => {
    if (!room || savingIdx !== null) return;
    setSavingIdx(idx);
    setError('');
    const attempt = async () => {
      const cur = await githubApi.getRoomContent(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path,
      );
      const updated = appendMessage(cur.content || '', content, undefined, { source: sourceId, author: currentAuthor });
      await githubApi.pushRoom(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        room.cotext_file_path,
        updated,
        cur.sha,
        `cotext: agent (${sourceId}) note`,
      );
    };
    try {
      try {
        await attempt();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('409') || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('sha')) {
          await attempt();
        } else {
          throw e;
        }
      }
      setSavedIdx(idx);
      setTimeout(() => setSavedIdx(null), 2000);
      setTimeout(() => onSaved?.(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingIdx(null);
    }
  };

  const resolveRoom = (path: string): PanelRoom | null =>
    rooms.find((r) => r.path === path) || (room && room.path === path ? room : null) || room;

  const executeRead = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (name === 'list_rooms') {
      const list = rooms.length ? rooms.map((r) => r.path) : room ? [room.path] : [];
      return JSON.stringify(list);
    }
    if (name === 'get_room') {
      const target = resolveRoom(String(args.room_path || ''));
      if (!target) return `Room not found: ${args.room_path}`;
      try {
        const contentRes = await githubApi.getRoomContent(
          workspace.github_owner,
          workspace.github_repo,
          workspace.default_branch,
          target.cotext_file_path,
        );
        return (contentRes.content || '(empty)').slice(0, 40000);
      } catch (e) {
        return `Error reading room: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return `Unknown tool: ${name}`;
  };

  const approveProposal = async () => {
    if (!proposal || approving) return;
    const target = resolveRoom(proposal.roomPath);
    if (!target) {
      setError(`Room not found: ${proposal.roomPath}`);
      return;
    }
    setApproving(true);
    setError('');
    try {
      const cur = await githubApi.getRoomContent(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        target.cotext_file_path,
      );
      const updated = appendMessage(cur.content || '', proposal.content, undefined, { source: providerId, author: currentAuthor });
      await githubApi.pushRoom(
        workspace.github_owner,
        workspace.github_repo,
        workspace.default_branch,
        target.cotext_file_path,
        updated,
        cur.sha,
        `cotext: agent (${providerId}) auto-edit`,
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: `Saved to ${target.path}\n\n${proposal.content}`, model, sourceId: providerId }]);
      setProposal(null);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  if (!open) return null;

  const modelBarLabel = trackMode === 'managed'
    ? `Cotext Model - ${managedInfo?.providerId || 'managed'} / ${managedInfo?.model || 'server default'}`
    : `${provider.label} - ${model || 'default'}`;

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

      <div className="agent-modelbar" onClick={() => setShowSettings((v) => !v)}>
        <span className="agent-model-name">{modelBarLabel}</span>
        {trackMode === 'byok' && !hasKey && (
          <span className="agent-nokey">
            <Warning size={12} />
            {t.keyMissing}
          </span>
        )}
      </div>

      <div className="agent-ground">
        {room ? (
          <>
            <span className="agent-ground-dot" />
            {t.grounded}: <code>{room.path}</code>
            <button className="icon-button agent-ground-refresh" onClick={() => void loadContext()} title={t.refresh}>
              <ArrowClockwise size={13} className={contextLoading ? 'spin' : ''} />
            </button>
          </>
        ) : (
          <span className="text-dim">{t.noRoom}</span>
        )}
      </div>

      {trackMode === 'byok' && agentCapable && (
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
          <div className="agent-track-control">
            <div
              className="agent-track-slider"
              style={{ transform: trackMode === 'managed' ? 'translateX(100%)' : 'translateX(0)' }}
            />
            <button
              type="button"
              className={`agent-track-btn${trackMode === 'byok' ? ' active' : ''}`}
              onClick={() => setTrackMode('byok')}
            >
              <Key size={14} />
              {t.myApiKey}
            </button>
            <button
              type="button"
              className={`agent-track-btn${trackMode === 'managed' ? ' active' : ''}`}
              onClick={() => setTrackMode('managed')}
            >
              <Lightning size={14} />
              {t.cotextModel}
            </button>
          </div>

          {trackMode === 'byok' && (
            <>
              <label className="agent-field-label">{t.provider}</label>
              <select value={providerId} onChange={(e) => selectProvider(e.target.value as ProviderId)} className="input">
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>

              {provider.editableBaseURL && (
                <>
                  <label className="agent-field-label">{t.baseURL}</label>
                  <input
                    className="input"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="https://.../v1"
                  />
                </>
              )}

              <label className="agent-field-label">{t.model}</label>
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list={`models-${providerId}`}
                placeholder={provider.defaultModel}
              />
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
              <input
                className="input"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={hasKey ? '******** (saved)' : provider.keyLabel}
              />

              <button className="btn btn-primary btn-sm agent-save" onClick={saveSettings}>
                {keySaved ? <><Check size={14} /> {t.save}</> : t.save}
              </button>
              <p className="agent-byok">{t.byok}</p>
            </>
          )}

          {trackMode === 'managed' && (
            <div className="agent-managed-block">
              <p className="agent-managed-note">{t.managedNote}</p>
              <p className="agent-managed-subnote">{t.managedToolsNote}</p>
              {managedInfo && (
                <div className="agent-managed-info">
                  <span>{managedInfo.providerId} / {managedInfo.model}</span>
                  <span>{managedInfo.chargedCredits} credits</span>
                </div>
              )}
              <ManagedCreditsPanel workspaceId={workspace.id} compact />
              <button className="btn btn-primary btn-sm agent-save" onClick={saveSettings}>
                {keySaved ? <><Check size={14} /> {t.save}</> : t.save}
              </button>
            </div>
          )}
        </div>
      )}

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
                    <button
                      className="agent-add-btn"
                      title={t.applyAdd}
                      onClick={() => {
                        onApply({ text: m.content, source: m.sourceId || providerId, replace: false });
                        setSavedIdx(i);
                        setTimeout(() => setSavedIdx(null), 1500);
                      }}
                    >
                      {savedIdx === i ? <Check size={12} weight="bold" /> : <Plus size={12} weight="bold" />}
                    </button>
                    {canReplace && (
                      <button
                        className="agent-add-btn agent-replace-btn"
                        title={t.applyReplace}
                        onClick={() => {
                          onApply({ text: m.content, source: m.sourceId || providerId, replace: true });
                          setSavedIdx(i);
                          setTimeout(() => setSavedIdx(null), 1500);
                        }}
                      >
                        <MagicWand size={12} weight="bold" />
                      </button>
                    )}
                  </>
                ) : room && (
                  <button
                    className="agent-add-btn"
                    onClick={() => void saveToChat(i, m.content, m.sourceId || providerId)}
                    disabled={savingIdx !== null}
                    title={t.saveToChat}
                  >
                    {savedIdx === i ? <Check size={12} weight="bold" /> : savingIdx === i ? <SpinnerGap size={12} className="spin" /> : <Plus size={12} weight="bold" />}
                  </button>
                )}
                <button className="icon-button agent-copy" onClick={() => copyMsg(i, m.content)} title={t.copy}>
                  {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}

            <div className="agent-msg-body">{m.content || '...'}</div>

            {m.role === 'assistant' && (
              <div className="agent-msg-bottom-actions">
                <button className="agent-bottom-btn" onClick={() => copyMsg(i, m.content)} title={t.copy}>
                  {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                </button>
                {room && onApply ? (
                  <>
                    <button
                      className="agent-bottom-btn"
                      title={t.applyAdd}
                      onClick={() => {
                        onApply({ text: m.content, source: m.sourceId || providerId, replace: false });
                        setSavedIdx(i);
                        setTimeout(() => setSavedIdx(null), 1500);
                      }}
                    >
                      {savedIdx === i ? <Check size={12} /> : <Plus size={12} />}
                    </button>
                    {canReplace && (
                      <button
                        className="agent-bottom-btn agent-replace-btn"
                        title={t.applyReplace}
                        onClick={() => {
                          onApply({ text: m.content, source: m.sourceId || providerId, replace: true });
                          setSavedIdx(i);
                          setTimeout(() => setSavedIdx(null), 1500);
                        }}
                      >
                        <MagicWand size={12} />
                      </button>
                    )}
                  </>
                ) : room && (
                  <button
                    className="agent-bottom-btn"
                    onClick={() => void saveToChat(i, m.content, m.sourceId || providerId)}
                    disabled={savingIdx !== null}
                    title={t.saveToChat}
                  >
                    {savedIdx === i ? <Check size={12} /> : savingIdx === i ? <SpinnerGap size={12} className="spin" /> : <Plus size={12} />}
                  </button>
                )}
                <button
                  className="agent-bottom-btn agent-delete-btn"
                  onClick={() => setMessages((prev) => prev.filter((_, idx) => idx !== i))}
                  title="Delete"
                >
                  <Trash size={12} />
                </button>
              </div>
            )}

            {m.role === 'assistant' && m.usage && (m.usage.inputTokens > 0 || m.usage.outputTokens > 0) && (
              <div className="agent-usage">
                {m.usage.inputTokens.toLocaleString()} in / {m.usage.outputTokens.toLocaleString()} out
                {m.model && (() => {
                  const cost = formatCost(m.model, m.usage!);
                  return cost ? ` - ${cost}` : '';
                })()}
              </div>
            )}
          </div>
        ))}

        {loading && !streaming && <div className="agent-msg assistant"><div className="agent-msg-body text-dim">{t.thinking}</div></div>}
        {error && <div className="agent-error"><Warning size={14} /> {error}</div>}
      </div>

      {proposal && (
        <div className="agent-proposal">
          <div className="agent-proposal-header">
            <Wrench size={14} />
            <span>{t.proposalTitle}: <code>{proposal.roomPath}</code></span>
          </div>
          <pre className="agent-proposal-preview">{proposal.content}</pre>
          <div className="agent-proposal-actions">
            <button className="btn btn-primary btn-sm" onClick={() => void approveProposal()} disabled={approving}>
              {approving ? t.working : t.approve}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>{t.reject}</button>
          </div>
        </div>
      )}

      <div className="agent-input-bar">
        <textarea
          className="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t.placeholder}
          rows={1}
        />
        <button className="agent-send" onClick={() => void send()} disabled={loading || !input.trim() || !llmReady} title={t.send}>
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>
    </aside>
  );
}

function buildNeuralSummary(neuralJson: string, roomContent: string, currentRoom: string): string {
  if (!neuralJson.trim()) return '';
  type Cluster = { id: string; name: string };
  type Edge = { from: string; to: string; type?: string };
  let graph: { clusters?: Cluster[]; edges?: Edge[] };
  try {
    graph = JSON.parse(neuralJson);
  } catch {
    return '';
  }

  const clusters = graph.clusters ?? [];
  const edges = graph.edges ?? [];
  type InlineNode = { id: string; label: string; clusters: string[]; ts: string };
  const myNodes: InlineNode[] = [];
  let currentTs: string | null = null;

  for (const line of roomContent.split('\n')) {
    const tsMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (tsMatch) {
      currentTs = tsMatch[1];
      continue;
    }
    const nodeMatch = line.match(/^<!--\s*node:\s*(.*?)\s*-->\s*$/);
    if (nodeMatch && currentTs) {
      const body = nodeMatch[1];
      const idMatch = body.match(/\bid=(\S+)/);
      const labelMatch = body.match(/\blabel="([^"]*)"/);
      const clustersMatch = body.match(/\bclusters=\[([^\]]*)\]/);
      if (idMatch) {
        myNodes.push({
          id: idMatch[1],
          label: labelMatch ? labelMatch[1] : '',
          clusters: clustersMatch ? clustersMatch[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
          ts: currentTs,
        });
      }
    }
  }

  if (clusters.length === 0 && myNodes.length === 0) return '';

  const clusterName = (id: string) => clusters.find((cluster) => cluster.id === id)?.name ?? id;
  const lines: string[] = [
    'Use this graph to identify thought clusters and explicit relationships.',
    'Same cluster means implicit relation. Explicit edge means a stronger relation.',
    '',
  ];

  if (clusters.length > 0) {
    lines.push(`Clusters in repo: ${clusters.map((c) => `${c.name} [${c.id}]`).slice(0, 20).join(', ')}`);
  }

  if (myNodes.length > 0) {
    lines.push('');
    lines.push(`Nodes in this chat (${currentRoom}):`);
    for (const node of myNodes.slice(0, 30)) {
      const clusterText = node.clusters.length ? ` | clusters:[${node.clusters.map(clusterName).join(', ')}]` : '';
      lines.push(`- [${node.id}] ${node.label || '(no label)'}${clusterText} | block:${node.ts}`);
    }
  }

  const myIds = new Set(myNodes.map((node) => node.id));
  const touchingEdges = edges.filter((edge) => myIds.has(edge.from) || myIds.has(edge.to));
  if (touchingEdges.length > 0) {
    lines.push('');
    lines.push('Explicit edges touching these nodes:');
    for (const edge of touchingEdges.slice(0, 20)) {
      lines.push(`- ${edge.from} -[${edge.type ?? 'relates'}]-> ${edge.to}`);
    }
  }

  const out = lines.join('\n');
  return out.length > 1500 ? `${out.slice(0, 1500)}\n...(truncated)` : out;
}
