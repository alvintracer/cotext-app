import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain, Check, FileArrowUp, Files, FileText, GitMerge, Graph, Key, Lightning, Link as LinkIcon, Spinner as Loader2, Trash, UploadSimple, Warning, X,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { supabase } from '../lib/supabase/client';
import { githubApi, managedKnowledgeApi } from '../lib/supabase/functions';
import { appendMessage, createInitialContent } from '../lib/markdown';
import { previewWorkspaceMerge, executeWorkspaceMerge, type MergePreview, type MergeResult } from '../lib/knowledge/merge';
import NeuralGraphView from '../components/NeuralGraphView';
import NeuralGraphBoundary from '../components/NeuralGraphBoundary';
import ConnectMindSyncModal from '../components/ConnectMindSyncModal';
import ManagedCreditsPanel from '../components/ManagedCreditsPanel';
import { extractKind, extractText, isExtractable } from '../lib/extract';
import { generateKnowledgeGraph, type KnowledgeGraphResult } from '../lib/knowledge/oneShot';
import { generateKnowledgeGraphLLM, type LlmExtractResult } from '../lib/knowledge/llmExtract';
import { saveKnowledgeSnapshot } from '../lib/knowledge/session';
import { useLanguage } from '../contexts/LanguageContext';
import { PROVIDERS, getProvider, type ProviderId } from '../lib/agent/models';
import { getKey, setKey, getPref, setPref } from '../lib/agent/keys';

interface SourceItem {
  id: string;
  file: File;
  name: string;
  ext: string;
  size: number;
  status: 'queued' | 'extracting' | 'done' | 'error';
  progress: number;
  text: string;
  error?: string;
}

const ACCEPT_ATTR = '.pdf,.docx,.hwpx,.pptx,.txt,.md,.markdown,.csv,.json,.log';

// Upload guards (Phase 2): protect both the user's browser and our backend bandwidth.
// We never persist the original binary — extraction runs entirely client-side — but
// huge uploads still stall the page and waste user time.
const MAX_FILE_BYTES = 20 * 1024 * 1024;       // 20 MB per file
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;      // 80 MB combined across the session
const MAX_FILE_COUNT = 30;

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Normalize a paragraph to a hash key: lowercase, whitespace-collapsed. */
function paragraphKey(p: string): string {
  return p.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cross-document dedupe (Phase 2): remove paragraphs that appear verbatim in
 * earlier documents. Templates (signatures, headers, repeated boilerplate) are
 * the worst offenders — they bias keyword counts and clutter the graph.
 * The first occurrence of each paragraph wins; later docs lose duplicates only.
 */
function dedupeAcrossDocs(items: Array<{ name: string; text: string }>): Array<{ name: string; text: string; removed: number }> {
  const seen = new Set<string>();
  return items.map(({ name, text }) => {
    const paragraphs = text.split(/\n{2,}/);
    const kept: string[] = [];
    let removed = 0;
    for (const p of paragraphs) {
      const key = paragraphKey(p);
      if (key.length < 16) { kept.push(p); continue; } // keep short lines (titles)
      if (seen.has(key)) { removed += 1; continue; }
      seen.add(key);
      kept.push(p);
    }
    return { name, text: kept.join('\n\n'), removed };
  });
}

export default function KnowledgeStudioPage() {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [result, setResult] = useState<KnowledgeGraphResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Phase 3: LLM extraction progress + abort + failures + gaps
  const [llmProgress, setLlmProgress] = useState<{ phase: string; current: number; total: number; message?: string } | null>(null);
  const [llmFailures, setLlmFailures] = useState<LlmExtractResult['failures']>([]);
  const [llmGaps, setLlmGaps] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [useLlm, setUseLlm] = useState<boolean>(true);
  // Phase 4: merge into workspace
  const { workspaces } = useWorkspace();
  const navigate = useNavigate();
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergePreviewing, setMergePreviewing] = useState(false);
  const [mergeExecuting, setMergeExecuting] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeDone, setMergeDone] = useState<MergeResult | null>(null);
  // MindSync re-anchoring: target workspace (= the "brain" this session augments).
  // Stored in localStorage so the user doesn't have to reselect across visits.
  const [anchorWorkspaceId, setAnchorWorkspaceId] = useState<string>(() => {
    try { return localStorage.getItem('cotext-mindsync-anchor') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      if (anchorWorkspaceId) localStorage.setItem('cotext-mindsync-anchor', anchorWorkspaceId);
      else localStorage.removeItem('cotext-mindsync-anchor');
    } catch { /* localStorage unavailable */ }
  }, [anchorWorkspaceId]);
  const anchorWs = useMemo(
    () => workspaces.find((w) => w.id === anchorWorkspaceId) ?? null,
    [workspaces, anchorWorkspaceId],
  );
  // GENERATE = fresh seed (auto-merge after generate)
  // AUGMENT  = same, but UX framing is "add to existing brain"
  const [mode, setMode] = useState<'generate' | 'augment'>('generate');
  // Auto-merge after generate (only if anchor selected). Default on.
  const [autoMerge, setAutoMerge] = useState(true);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  // "Save extracted text as MD room" — append all ready-source text as blocks
  // into a per-session room called `mindsync-imports/`. One push per file.
  const [textSavingState, setTextSavingState] = useState<{ done: number; total: number; error?: string } | null>(null);
  // "How to connect" modal — shows MCP install commands per agent
  const [connectOpen, setConnectOpen] = useState(false);
  const [anchorApiKey, setAnchorApiKey] = useState<string>('');
  const [anchorApiKeyLoading, setAnchorApiKeyLoading] = useState(false);
  // Track B (managed): platform handles LLM inference + billing.
  // For this turn we render the toggle and the schema/edge function ship
  // separately; the toggle defaults to OFF and only flips intent.
  const [trackMode, setTrackMode] = useState<'byok' | 'managed'>('byok');
  const [managedInfo, setManagedInfo] = useState<{ providerId: string; model: string; billingMode: string } | null>(null);
  // Phase 1: BYOK LLM provider. Persists in localStorage (same store as AgentPanel).
  // Wired but not yet consumed by graph generation — Phase 3 will plug it in.
  const [providerId, setProviderId] = useState<ProviderId>(() => getPref()?.provider ?? 'gemini');
  const [model, setModel] = useState<string>(() => getPref()?.model ?? getProvider('gemini').defaultModel);
  const [apiKey, setApiKey] = useState<string>(() => getKey(getPref()?.provider ?? 'gemini'));
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read saved key when provider changes
    setApiKey(getKey(providerId));
  }, [providerId]);
  const provider = getProvider(providerId);
  const hasKey = !!apiKey.trim();
  const llmReady = trackMode === 'managed' || hasKey;
  const saveProviderPrefs = useCallback(() => {
    setKey(providerId, apiKey.trim());
    setPref({ provider: providerId, model });
    setShowKey(false);
  }, [providerId, apiKey, model]);

  useEffect(() => {
    let cancelled = false;
    const loadAnchorApiKey = async () => {
      if (!anchorWs) {
        setAnchorApiKey('');
        setAnchorApiKeyLoading(false);
        return;
      }
      setAnchorApiKeyLoading(true);
      try {
        const { data, error } = await supabase
          .from('api_keys')
          .select('key')
          .eq('workspace_id', anchorWs.id)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setAnchorApiKey(data?.key || '');
      } catch {
        if (!cancelled) setAnchorApiKey('');
      } finally {
        if (!cancelled) setAnchorApiKeyLoading(false);
      }
    };
    void loadAnchorApiKey();
    return () => {
      cancelled = true;
    };
  }, [anchorWs]);

  const updateSource = useCallback((id: string, patch: Partial<SourceItem>) => {
    setSources((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const extractBatch = useCallback(async (items: SourceItem[]) => {
    for (const item of items) {
      if (!isExtractable(item.file)) {
        updateSource(item.id, {
          status: 'error',
          error: ko ? '지원하지 않는 형식입니다.' : 'Unsupported file type.',
        });
        continue;
      }
      updateSource(item.id, { status: 'extracting', progress: 0, error: undefined });
      try {
        const text = await extractText(item.file, (progress) => updateSource(item.id, { progress }));
        updateSource(item.id, {
          status: text.trim() ? 'done' : 'error',
          progress: 100,
          text,
          error: text.trim() ? undefined : (ko ? '텍스트를 찾지 못했습니다.' : 'No text found.'),
        });
      } catch (error) {
        updateSource(item.id, {
          status: 'error',
          error: error instanceof Error ? error.message : (ko ? '추출 실패' : 'Extraction failed'),
        });
      }
    }
  }, [ko, updateSource]);

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setUploadError(null);

    // Phase 2 guards — per-file size, total session size, file count.
    setSources((prev) => {
      const currentTotal = prev.reduce((sum, s) => sum + s.size, 0);
      const currentCount = prev.length;
      const rejected: string[] = [];
      const accepted: SourceItem[] = [];
      let runningTotal = currentTotal;
      let runningCount = currentCount;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (runningCount >= MAX_FILE_COUNT) { rejected.push(`${file.name} (${ko ? '파일 개수 초과' : 'file count cap'})`); continue; }
        if (file.size > MAX_FILE_BYTES) { rejected.push(`${file.name} (${formatSize(file.size)})`); continue; }
        if (runningTotal + file.size > MAX_TOTAL_BYTES) { rejected.push(`${file.name} (${ko ? '총량 초과' : 'total cap'})`); continue; }
        if (file.size === 0) { rejected.push(`${file.name} (${ko ? '빈 파일' : 'empty'})`); continue; }
        runningTotal += file.size;
        runningCount += 1;
        accepted.push({
          id: `${file.name}-${file.size}-${Date.now()}-${i}`,
          file,
          name: file.name,
          ext: extractKind(file),
          size: file.size,
          status: 'queued' as const,
          progress: 0,
          text: '',
        });
      }
      if (rejected.length) {
        setUploadError(
          ko
            ? `${rejected.length}개 파일 제외 — ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? ' …' : ''}. 파일당 ${formatSize(MAX_FILE_BYTES)} · 세션 합계 ${formatSize(MAX_TOTAL_BYTES)} · 최대 ${MAX_FILE_COUNT}개 제한.`
            : `${rejected.length} file(s) rejected — ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? ' …' : ''}. Limits: ${formatSize(MAX_FILE_BYTES)}/file, ${formatSize(MAX_TOTAL_BYTES)}/session, ${MAX_FILE_COUNT} max.`,
        );
      }
      void extractBatch(accepted);
      return [...prev, ...accepted];
    });
  }, [extractBatch, ko]);

  const readySources = useMemo(
    () => sources.filter((item) => item.status === 'done' && item.text.trim()),
    [sources],
  );
  const totalChars = useMemo(
    () => readySources.reduce((sum, item) => sum + item.text.length, 0),
    [readySources],
  );

  // Auto-merge: run the Phase-4 merge orchestrator immediately after a generate
  // finishes, into the user's MindSync anchor workspace. No modal step.
  // Declared BEFORE handleGenerate so handleGenerate can close over it.
  const autoMergeIntoAnchor = useCallback(async (graphResult: KnowledgeGraphResult) => {
    if (!anchorWs || !autoMerge) return;
    setAutoStatus(ko ? `워크스페이스에 머지 중...` : `Merging into workspace...`);
    try {
      const preview = await previewWorkspaceMerge(anchorWs, graphResult.graph);
      const merged = await executeWorkspaceMerge(anchorWs, preview,
        mode === 'generate' ? 'cotext: MindSync seed generated' : 'cotext: MindSync augment');
      setAutoStatus(
        ko
          ? `머지됨 → ${anchorWs.name} (+${merged.stats.newClusters}/${merged.stats.newNodes}/${merged.stats.newEdges})`
          : `Merged into ${anchorWs.name} (+${merged.stats.newClusters}/${merged.stats.newNodes}/${merged.stats.newEdges})`,
      );
    } catch (e) {
      setAutoStatus(ko
        ? `머지 실패: ${e instanceof Error ? e.message : String(e)}`
        : `Merge failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [anchorWs, autoMerge, mode, ko]);

  const handleGenerate = useCallback(async () => {
    if (!readySources.length || generating) return;
    setGenerating(true);
    setGenError(null);
    setLlmProgress(null);
    setLlmFailures([]);
    setLlmGaps([]);
    setManagedInfo(null);
    // Phase 2: cross-document paragraph dedupe before passing to either generator.
    const raw = readySources.map((item) => ({ name: item.name, text: item.text }));
    const deduped = dedupeAcrossDocs(raw).map(({ name, text }) => ({ name, text }));

    // Phase 3: if user has a BYOK key and LLM toggle is on → LLM extraction.
    // Otherwise fall back to the heuristic generator.
    if (useLlm && trackMode === 'managed') {
      try {
        setLlmProgress({
          phase: 'extracting',
          current: 1,
          total: 1,
          message: ko ? '서버에서 MindSync 그래프를 추출하는 중...' : 'Extracting MindSync graph on the server...',
        });
        const managed = await managedKnowledgeApi.extract(deduped);
        const final: KnowledgeGraphResult = {
          graph: managed.result.graph as KnowledgeGraphResult['graph'],
          nodeTextById: managed.result.nodeTextById,
          blockTextByKey: managed.result.blockTextByKey,
          sourceCount: managed.result.sourceCount,
          sectionCount: managed.result.sectionCount,
        };
        startTransition(() => {
          saveKnowledgeSnapshot(final);
          setResult(final);
          setLlmFailures(managed.result.failures);
          setLlmGaps(managed.result.gaps ?? []);
          setManagedInfo(managed.managed);
          setGenerating(false);
          setLlmProgress(null);
        });
        autoMergeIntoAnchor(final);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setGenError(msg);
        setGenerating(false);
        setLlmProgress(null);
      }
      return;
    }

    if (useLlm && hasKey) {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const llmResult = await generateKnowledgeGraphLLM(
          deduped,
          { providerId, model: model || provider.defaultModel, apiKey: apiKey.trim() },
          {
            signal: controller.signal,
            onProgress: (info) => setLlmProgress(info),
          },
        );
        const final: KnowledgeGraphResult = {
          graph: llmResult.graph,
          nodeTextById: llmResult.nodeTextById,
          blockTextByKey: llmResult.blockTextByKey,
          sourceCount: llmResult.sourceCount,
          sectionCount: llmResult.sectionCount,
        };
        startTransition(() => {
          saveKnowledgeSnapshot(final);
          setResult(final);
          setLlmFailures(llmResult.failures);
          setLlmGaps(llmResult.gaps ?? []);
          setGenerating(false);
        });
        // Auto-merge into anchor workspace if user has selected one (fire-and-forget)
        autoMergeIntoAnchor(final);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setGenError(controller.signal.aborted ? (ko ? '취소됨' : 'Cancelled') : msg);
        setGenerating(false);
      } finally {
        abortRef.current = null;
      }
      return;
    }

    // Heuristic fallback (no key or LLM disabled)
    window.setTimeout(() => {
      const next = generateKnowledgeGraph(deduped);
      startTransition(() => {
        saveKnowledgeSnapshot(next);
        setResult(next);
        setGenerating(false);
      });
      autoMergeIntoAnchor(next);
    }, 0);
  }, [generating, readySources, useLlm, hasKey, trackMode, providerId, model, provider.defaultModel, apiKey, ko, autoMergeIntoAnchor]);

  const handleAbortGenerate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Save all extracted text into the anchor workspace as a single appended
  // block per file (room = "mindsync-imports/<filename>"). User can rename or
  // reorganize later inside the workspace.
  const saveExtractedTextToWorkspace = useCallback(async () => {
    if (!anchorWs || readySources.length === 0) return;
    const folder = anchorWs.cotext_folder_name || '.cotext';
    setTextSavingState({ done: 0, total: readySources.length });
    let done = 0;
    let lastError: string | undefined;
    for (const src of readySources) {
      // Sanitize a room slug from the filename
      const slug = src.name.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9가-힣_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'doc';
      const roomPath = `mindsync-imports/${slug}`;
      const filePath = `${roomPath}/${folder}/cotext.md`;
      try {
        let existing = '';
        let sha: string | null = null;
        try {
          const ex = await githubApi.getRoomContent(
            anchorWs.github_owner, anchorWs.github_repo, anchorWs.default_branch, filePath,
          );
          existing = ex.content;
          sha = ex.sha;
        } catch { /* first push for this room */ }
        const base = existing.trim() ? existing : createInitialContent(roomPath);
        const note = `## ${src.name}\n\n${src.text}`;
        const next = appendMessage(base, note, undefined, 'knowledge-studio');
        await githubApi.pushRoom(
          anchorWs.github_owner, anchorWs.github_repo, anchorWs.default_branch,
          filePath, next, sha, `cotext: MindSync import ${src.name}`,
        );
        done += 1;
        setTextSavingState({ done, total: readySources.length });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    setTextSavingState({ done, total: readySources.length, error: lastError });
  }, [anchorWs, readySources]);

  // Phase 4 — merge orchestrator
  const openMergeModal = useCallback(() => {
    if (!result?.graph.nodes.length) return;
    setMergeError(null);
    setMergeDone(null);
    setMergePreview(null);
    setMergeTargetId(workspaces[0]?.id ?? '');
    setMergeModalOpen(true);
  }, [result, workspaces]);

  const runMergePreview = useCallback(async () => {
    if (!result || !mergeTargetId) return;
    const ws = workspaces.find((w) => w.id === mergeTargetId);
    if (!ws) return;
    setMergePreviewing(true);
    setMergeError(null);
    setMergePreview(null);
    try {
      const p = await previewWorkspaceMerge(ws, result.graph);
      setMergePreview(p);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : String(e));
    } finally {
      setMergePreviewing(false);
    }
  }, [result, mergeTargetId, workspaces]);

  const runMergeExecute = useCallback(async () => {
    if (!mergePreview || !mergeTargetId) return;
    const ws = workspaces.find((w) => w.id === mergeTargetId);
    if (!ws) return;
    setMergeExecuting(true);
    setMergeError(null);
    try {
      const r = await executeWorkspaceMerge(ws, mergePreview);
      setMergeDone(r);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : String(e));
    } finally {
      setMergeExecuting(false);
    }
  }, [mergePreview, mergeTargetId, workspaces]);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const topClusters = useMemo(
    () => (result?.graph.clusters || []).slice(0, 10),
    [result],
  );

  return (
    <div className="knowledge-studio-page">
      <section className="knowledge-studio-hero">
        <div>
          <div className="knowledge-studio-eyebrow">
            <Brain size={14} weight="fill" />
            {ko ? '마인드싱크 (MindSync)' : 'MindSync'}
          </div>
          <h1>{ko ? '문서를 올리고 지식망을 만들어 워크스페이스에 심다' : 'Upload docs, build the brain, anchor it into a workspace'}</h1>
          <p>
            {ko
              ? '워드·한글·PPT·PDF에서 텍스트를 뽑고 BYOK LLM으로 노드·관계·클러스터를 추출합니다. 대상 워크스페이스를 고르면 결과가 그곳의 .cotext/neural.json에 시드되거나 증강됩니다.'
              : 'Extract text from Word, HWPX, PPT, PDF; let your BYOK LLM produce nodes, relations, and clusters. Pick a target workspace and the result is seeded (or augmented) into its .cotext/neural.json.'}
          </p>
        </div>
        <div className="knowledge-studio-actions">
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            <UploadSimple size={16} />
            {ko ? '문서 추가' : 'Add documents'}
          </button>
          {generating ? (
            <button className="btn btn-secondary" onClick={handleAbortGenerate}>
              <Loader2 size={16} className="spin" />
              {ko ? '취소' : 'Cancel'}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleGenerate} disabled={!readySources.length}>
              <Lightning size={16} />
              {ko ? '지식망 생성' : 'Generate graph'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setGraphOpen(true)} disabled={!result?.graph.nodes.length}>
            <Graph size={16} />
            {ko ? '그래프 보기' : 'Open graph'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/knowledge-think')} disabled={!result?.graph.nodes.length}>
            <Brain size={16} />
            {ko ? '질문하기' : 'Ask the brain'}
          </button>
          <button className="btn btn-ghost" onClick={() => setConnectOpen(true)} title={ko ? '에이전트 연결 가이드' : 'How to connect agents'}>
            <LinkIcon size={16} />
            {ko ? '에이전트 연결' : 'Connect agents'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={openMergeModal}
            disabled={!result?.graph.nodes.length || workspaces.length === 0}
            title={workspaces.length === 0 ? (ko ? '워크스페이스 없음' : 'No workspace') : undefined}
          >
            <GitMerge size={16} />
            {ko ? '워크스페이스에 머지' : 'Merge into workspace'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={(event) => {
              if (event.target.files?.length) handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </section>

      {/* Phase 1: BYOK LLM picker — required for Phase 3 (LLM-based extraction).
          Stored in localStorage; same store as AgentPanel so users only enter keys once. */}
      <section className="knowledge-studio-byok">
        <div className="knowledge-byok-row">
          <Key size={14} />
          <span className="knowledge-byok-label">{ko ? 'AI 모델' : 'AI model'}</span>
          <select
            className="knowledge-byok-select"
            value={providerId}
            onChange={(e) => {
              const id = e.target.value as ProviderId;
              setProviderId(id);
              setModel(getProvider(id).defaultModel);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}{p.id === 'gemini' ? ' · free tier' : ''}</option>
            ))}
          </select>
          <input
            className="knowledge-byok-model"
            list={`models-${providerId}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider.defaultModel}
          />
          <datalist id={`models-${providerId}`}>
            {provider.models?.map((m) => <option key={m} value={m} />)}
          </datalist>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
            {hasKey ? (ko ? '키 변경' : 'Change key') : (ko ? '키 입력' : 'Add key')}
          </button>
          <span className={`knowledge-byok-status ${hasKey ? 'ok' : 'missing'}`}>
            {hasKey ? (ko ? '키 저장됨' : 'Key saved') : (ko ? '키 필요' : 'No key')}
          </span>
        </div>
        {showKey && (
          <div className="knowledge-byok-row">
            <input
              type="password"
              className="knowledge-byok-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider.keyLabel || (ko ? 'API 키를 붙여넣으세요' : 'Paste API key')}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={saveProviderPrefs} disabled={!apiKey.trim()}>
              {ko ? '저장' : 'Save'}
            </button>
            {provider.keyUrl && (
              <a className="knowledge-byok-link" href={provider.keyUrl} target="_blank" rel="noreferrer">
                {ko ? '키 발급' : 'Get a key'}
              </a>
            )}
          </div>
        )}
        <div className="knowledge-byok-row">
          <label className="knowledge-llm-toggle">
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
              disabled={!llmReady}
            />
            <span>
              {ko ? 'LLM ?? ??' : 'Use LLM extraction'}
              {!llmReady && <em className="knowledge-byok-hint"> ? {ko ? '? ??' : 'key required'}</em>}
            </span>
          </label>
          <span className="knowledge-byok-note knowledge-byok-inline">
            {useLlm && trackMode === 'managed'
              ? (ko ? '??? ?? ?? ?????. ????? ?? LLM ?? ??? ???.' : 'Uses the platform-managed server key. No browser-side LLM key is required.')
              : useLlm && hasKey
                ? (ko ? 'LLM? entity?relation? ????? (BYOK ?? ??).' : 'LLM extracts entities and relations (BYOK costs apply).')
                : (ko ? '??? ?? ?? ?????? ????? (??, ?? ?? ??).' : 'Falls back to keyword-frequency heuristic (free, weak semantics).')}
          </span>
        </div>
        <p className="knowledge-byok-note">
          {trackMode === 'managed'
            ? (ko
              ? 'Managed Track B ??: ?? ?? ???? ??? ????? ?????. ??? ??? ??? ?? ???? ????.'
              : 'Managed Track B beta: extraction runs on a server-held key and only the result returns to the browser. Credit metering comes next.')
            : (ko
              ? 'BYOK ?? ? ?????? ?????. ?? ??? + JSON ?? + ??? ?? + ? ?? ??.'
              : 'BYOK key stays in this browser only. Uses chunked relay + JSON repair + incremental merge + gap analysis.')}
        </p>
        <div className="knowledge-byok-row knowledge-track-row" role="group" aria-label="track">
          <span className="knowledge-byok-label">{ko ? '?? ??' : 'Inference track'}</span>
          <div className="knowledge-track-segmented">
            <button
              className={`knowledge-track-btn ${trackMode === 'byok' ? 'active' : ''}`}
              onClick={() => setTrackMode('byok')}
            >
              BYOK
              <em>{ko ? '? ?' : 'your key'}</em>
            </button>
            <button
              className={`knowledge-track-btn ${trackMode === 'managed' ? 'active' : ''}`}
              onClick={() => setTrackMode('managed')}
              title={ko ? '??? ???? (??)' : 'Platform-managed (beta)'}
            >
              MANAGED
              <em>{ko ? '???' : 'credits'}</em>
            </button>
          </div>
          {trackMode === 'managed' && (
            <span className="knowledge-byok-note knowledge-byok-inline">
              {ko
                ? 'Managed beta? ?? ?? ??? ?????. ??? ??? ?? ?? ?? ?? ????, ?? ???? ??/?? UI? ????.'
                : 'Managed beta is now a real extraction path. It currently runs on a server-managed key without credit deduction; billing and balance UI come next.'}
            </span>
          )}
        </div>
        {managedInfo && trackMode === 'managed' && (
          <p className="knowledge-byok-note">
            {ko
              ? `?? managed ??: ${managedInfo.providerId} / ${managedInfo.model} / ${managedInfo.billingMode}`
              : `Latest managed extract: ${managedInfo.providerId} / ${managedInfo.model} / ${managedInfo.billingMode}`}
          </p>
        )}
        {trackMode === 'managed' && anchorWs && (
          <ManagedCreditsPanel workspaceId={anchorWs.id} compact />
        )}
      </section>

      {/* MindSync anchor — picks the workspace this session feeds into.
          Generate seeds it once; Augment keeps adding. Without an anchor the
          result stays ephemeral (snapshot only) and the user must merge manually. */}
      <section className="knowledge-studio-anchor">
        <div className="knowledge-anchor-row">
          <strong className="knowledge-anchor-title">
            <GitMerge size={14} /> {ko ? '마인드싱크 대상 워크스페이스' : 'MindSync target workspace'}
          </strong>
          <select
            className="knowledge-byok-select"
            value={anchorWorkspaceId}
            onChange={(e) => setAnchorWorkspaceId(e.target.value)}
          >
            <option value="">{ko ? '— 선택 안 함 (휘발성) —' : '— Not anchored (ephemeral) —'}</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.github_owner}/{w.github_repo})</option>
            ))}
          </select>
          <div className="knowledge-anchor-mode" role="group" aria-label="mode">
            <button
              className={`knowledge-mode-btn ${mode === 'generate' ? 'active' : ''}`}
              onClick={() => setMode('generate')}
              disabled={!anchorWorkspaceId}
              title={ko ? '워크스페이스의 첫 지식 시드' : 'Seed the workspace brain'}
            >GENERATE</button>
            <button
              className={`knowledge-mode-btn ${mode === 'augment' ? 'active' : ''}`}
              onClick={() => setMode('augment')}
              disabled={!anchorWorkspaceId}
              title={ko ? '기존 지식망에 증강' : 'Augment the existing brain'}
            >AUGMENT</button>
          </div>
          <label className="knowledge-anchor-toggle">
            <input
              type="checkbox"
              checked={autoMerge}
              onChange={(e) => setAutoMerge(e.target.checked)}
              disabled={!anchorWorkspaceId}
            />
            <span>{ko ? '생성 후 자동 머지' : 'Auto-merge on generate'}</span>
          </label>
        </div>
        <p className="knowledge-byok-note">
          {anchorWs
            ? (ko
                ? `결과는 '${anchorWs.name}'의 .cotext/neural.json·NEURAL_INDEX.md·Supabase 인덱스에 ${mode === 'generate' ? '시드로' : '증강으로'} 저장됩니다. 텍스트는 별도로 mindsync-imports/ 룸에 MD로 저장할 수 있습니다.`
                : `Results will be ${mode === 'generate' ? 'seeded into' : 'augmented onto'} ${anchorWs.name}'s .cotext/neural.json, NEURAL_INDEX.md and Supabase index. Extracted text can be saved separately as MD into the mindsync-imports/ room.`)
            : (ko
                ? '워크스페이스를 선택하지 않으면 결과는 브라우저에만 남아 새로고침 시 사라집니다.'
                : 'Without a workspace, the result stays in this browser only and is lost on refresh.')}
        </p>
        {anchorWs && readySources.length > 0 && (
          <div className="knowledge-anchor-row">
            <button
              className="btn btn-secondary"
              onClick={saveExtractedTextToWorkspace}
              disabled={!!textSavingState && textSavingState.done < textSavingState.total}
            >
              <FileText size={14} />
              {textSavingState && textSavingState.done < textSavingState.total
                ? (ko ? `저장 중 ${textSavingState.done}/${textSavingState.total}…` : `Saving ${textSavingState.done}/${textSavingState.total}…`)
                : (ko ? `추출 텍스트를 ${anchorWs.name}/mindsync-imports/ 에 MD로 저장` : `Save extracted text as MD into ${anchorWs.name}/mindsync-imports/`)}
            </button>
            {textSavingState && textSavingState.done === textSavingState.total && (
              <span className="knowledge-byok-note">
                <Check size={12} /> {ko ? `${textSavingState.done}개 저장됨` : `${textSavingState.done} saved`}
                {textSavingState.error ? ` · ${textSavingState.error}` : ''}
              </span>
            )}
          </div>
        )}
        {autoStatus && (
          <p className={`knowledge-anchor-status ${autoStatus.includes(ko ? '실패' : 'failed') ? 'error' : ''}`}>
            <GitMerge size={12} /> {autoStatus}
          </p>
        )}
      </section>

      {anchorWs && (
        <p className="knowledge-byok-note" style={{ marginTop: '10px' }}>
          {anchorApiKeyLoading
            ? (ko ? 'MindSync API ?ㅻ? ?뺤씤 以?..' : 'Checking MindSync API key...')
            : anchorApiKey
              ? (ko ? 'Connect agents ?⑤떖???ㅼ젣 ctx_ API ???먮룞 二쇱엯?⑸땲??' : 'Connect agents will auto-fill a live ctx_ API key for remote snippets.')
              : (ko ? '?꾨쭩 remote snippet? placeholder API ???대낫?듬땲??. ?뚰겕?ㅽ럹?댁뒪 ?ъ씠?쒕컮??API Keys?먯꽌 諛쒓툒 ?꾩슂.' : 'Remote snippets will show a placeholder API key until you create one in the workspace sidebar API Keys panel.')}
        </p>
      )}

      {uploadError && (
        <div className="knowledge-upload-error">
          <Warning size={14} weight="fill" />
          <span>{uploadError}</span>
          <button className="icon-button" onClick={() => setUploadError(null)} aria-label="dismiss">×</button>
        </div>
      )}

      {/* Phase 3: live LLM extraction progress */}
      {generating && llmProgress && (
        <div className="knowledge-llm-progress">
          <Loader2 size={14} className="spin" />
          <div className="knowledge-llm-progress-info">
            <strong>
              {llmProgress.phase === 'extracting'
                ? (ko ? `청크 ${llmProgress.current}/${llmProgress.total} 추출 중` : `Extracting chunk ${llmProgress.current}/${llmProgress.total}`)
                : llmProgress.phase === 'chunking'
                  ? (ko ? `청크 분할 (${llmProgress.total}개)` : `Chunking (${llmProgress.total})`)
                  : llmProgress.phase}
            </strong>
            {llmProgress.message && <span className="knowledge-llm-progress-msg">{llmProgress.message}</span>}
          </div>
          <div className="knowledge-llm-progress-bar">
            <div style={{ width: `${llmProgress.total ? (llmProgress.current / llmProgress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Phase 3: per-chunk failures (non-blocking, partial graph still usable) */}
      {!generating && llmFailures.length > 0 && (
        <div className="knowledge-llm-failures">
          <Warning size={14} weight="fill" />
          <div>
            <strong>{ko ? `${llmFailures.length}개 청크 추출 실패` : `${llmFailures.length} chunk(s) failed`}</strong>
            <ul>
              {llmFailures.slice(0, 4).map((f, i) => (
                <li key={i}>{f.source} #{f.chunkIndex + 1}: {f.error.slice(0, 100)}</li>
              ))}
              {llmFailures.length > 4 && <li>… +{llmFailures.length - 4}</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Phase 3-D: gap analysis (Anti-Blackbox signal) */}
      {!generating && llmGaps.length > 0 && (
        <div className="knowledge-llm-gaps">
          <Brain size={14} weight="fill" />
          <div>
            <strong>{ko ? '추가 정보가 있으면 좋은 부분' : 'Gaps the LLM noticed'}</strong>
            <ul>
              {llmGaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Phase 3: generation error (network, key, etc.) */}
      {genError && (
        <div className="knowledge-upload-error">
          <Warning size={14} weight="fill" />
          <span>{genError}</span>
          <button className="icon-button" onClick={() => setGenError(null)} aria-label="dismiss">×</button>
        </div>
      )}

      <section className="knowledge-studio-stats">
        <article className="knowledge-stat-card">
          <span>{ko ? '추출 완료 문서' : 'Extracted docs'}</span>
          <strong>{formatCount(readySources.length)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '텍스트 총량' : 'Total text'}</span>
          <strong>{formatCount(totalChars)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '생성 노드' : 'Generated nodes'}</span>
          <strong>{formatCount(result?.graph.nodes.length || 0)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '클러스터' : 'Clusters'}</span>
          <strong>{formatCount(result?.graph.clusters.length || 0)}</strong>
        </article>
      </section>

      <section
        className={`knowledge-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
        }}
      >
        <FileArrowUp size={28} />
        <h2>{ko ? '여기에 문서를 떨어뜨리세요' : 'Drop documents here'}</h2>
        <p>
          {ko
            ? `지원 형식: DOCX · HWPX · PPTX · PDF · TXT · MD · CSV · JSON · LOG  ·  최대 파일당 ${formatSize(MAX_FILE_BYTES)} / 세션 합계 ${formatSize(MAX_TOTAL_BYTES)} / ${MAX_FILE_COUNT}개`
            : `Supported: DOCX · HWPX · PPTX · PDF · TXT · MD · CSV · JSON · LOG  ·  Limits: ${formatSize(MAX_FILE_BYTES)}/file, ${formatSize(MAX_TOTAL_BYTES)}/session, ${MAX_FILE_COUNT} max`}
        </p>
      </section>

      <section className="knowledge-grid">
        <div className="knowledge-panel">
          <div className="knowledge-panel-header">
            <h3>{ko ? '소스 문서' : 'Source documents'}</h3>
            <span>{formatCount(sources.length)}</span>
          </div>
          <div className="knowledge-source-list">
            {sources.length === 0 && (
              <div className="knowledge-empty">
                <Files size={22} />
                <p>{ko ? '아직 추가된 문서가 없습니다.' : 'No documents added yet.'}</p>
              </div>
            )}
            {sources.map((item) => (
              <article key={item.id} className="knowledge-source-card">
                <div className="knowledge-source-top">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="knowledge-source-meta">
                      <span>{item.ext.toUpperCase() || 'FILE'}</span>
                      <span>{formatSize(item.size)}</span>
                    </div>
                  </div>
                  <button className="icon-button" onClick={() => removeSource(item.id)} aria-label="remove">
                    <Trash size={14} />
                  </button>
                </div>
                <div className="knowledge-source-status">
                  <span className={`chip ${item.status === 'done' ? 'chip-idea' : item.status === 'error' ? 'chip-question' : 'chip-source'}`}>
                    {item.status === 'queued' && (ko ? '대기' : 'Queued')}
                    {item.status === 'extracting' && (ko ? `추출 중 ${item.progress}%` : `Extracting ${item.progress}%`)}
                    {item.status === 'done' && (ko ? `${formatCount(item.text.length)}자` : `${formatCount(item.text.length)} chars`)}
                    {item.status === 'error' && (ko ? '오류' : 'Error')}
                  </span>
                  {item.error && <span className="knowledge-error-text">{item.error}</span>}
                </div>
                {item.status === 'extracting' && (
                  <div className="knowledge-progress">
                    <div style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="knowledge-panel">
          <div className="knowledge-panel-header">
            <h3>{ko ? '생성 결과' : 'Generated graph'}</h3>
            <span>{formatCount(result?.sectionCount || 0)}</span>
          </div>
          {!result ? (
            <div className="knowledge-empty">
              <Brain size={22} />
              <p>{ko ? '문서를 추출한 뒤 지식망 생성을 실행하세요.' : 'Extract documents, then generate the graph.'}</p>
            </div>
          ) : (
            <div className="knowledge-summary">
              <div className="knowledge-summary-copy">
                <p>
                  {ko
                    ? `${result.sourceCount}개 문서에서 ${formatCount(result.sectionCount)}개 섹션을 만들고, ${formatCount(result.graph.edges.length)}개 연결을 생성했습니다.`
                    : `Built ${formatCount(result.sectionCount)} sections and ${formatCount(result.graph.edges.length)} links from ${result.sourceCount} documents.`}
                </p>
              </div>
              <div className="knowledge-cluster-list">
                {topClusters.map((cluster) => (
                  <div key={cluster.id} className="knowledge-cluster-row">
                    <span className="knowledge-cluster-swatch" style={{ background: cluster.color || 'var(--accent)' }} />
                    <div>
                      <strong>{cluster.name}</strong>
                      <p>{cluster.desc || (ko ? '자동 생성 클러스터' : 'Auto-generated cluster')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {graphOpen && result && (
        <NeuralGraphBoundary
          surfaceLabel={ko ? '마인드싱크 그래프' : 'MindSync graph'}
          onClose={() => setGraphOpen(false)}
        >
          <NeuralGraphView
            graph={result.graph}
            currentRoom=""
            language={language}
            getBlockText={async (roomPath, blockTs) => result.blockTextByKey[`${roomPath}::${blockTs}`] || null}
            onClose={() => setGraphOpen(false)}
            onJump={() => {}}
          />
        </NeuralGraphBoundary>
      )}

      <ConnectMindSyncModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onOpenApiKeys={() => {
          if (!anchorWs) return;
          navigate(`/workspace/${anchorWs.id}#api-keys`);
        }}
        workspace={anchorWs ? {
          id: anchorWs.id,
          name: anchorWs.name,
          github_owner: anchorWs.github_owner,
          github_repo: anchorWs.github_repo,
          default_branch: anchorWs.default_branch || 'main',
        } : null}
        apiKey={anchorApiKey || undefined}
        language={ko ? 'ko' : 'en'}
      />

      {/* Phase 4: workspace merge modal */}
      {mergeModalOpen && (
        <div className="modal-overlay" onClick={() => !mergeExecuting && setMergeModalOpen(false)}>
          <div className="modal-content merge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><GitMerge size={18} /> {ko ? '워크스페이스에 머지' : 'Merge into workspace'}</h3>
              <button className="icon-button" onClick={() => setMergeModalOpen(false)} disabled={mergeExecuting} aria-label="close">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {mergeDone ? (
                <div className="merge-success">
                  <Check size={28} weight="bold" />
                  <h4>{ko ? '머지 완료' : 'Merged'}</h4>
                  <p>
                    {ko
                      ? `워크스페이스에 +${mergeDone.stats.newClusters} 클러스터 / +${mergeDone.stats.newNodes} 노드 / +${mergeDone.stats.newEdges} 엣지 추가됨.`
                      : `Added +${mergeDone.stats.newClusters} clusters / +${mergeDone.stats.newNodes} nodes / +${mergeDone.stats.newEdges} edges to the workspace.`}
                  </p>
                  <ul className="merge-success-checks">
                    <li>{mergeDone.pushed.neuralJson ? '✓' : '✗'} neural.json {ko ? '푸시' : 'pushed'}</li>
                    <li>{mergeDone.pushed.neuralIndex ? '✓' : '✗'} NEURAL_INDEX.md {ko ? '갱신' : 'updated'}</li>
                    <li>{mergeDone.pushed.supabaseSync ? '✓' : '✗'} {ko ? 'Supabase 인덱스 동기화' : 'Supabase index sync'}</li>
                  </ul>
                  <div className="merge-success-actions">
                    <button className="btn btn-primary" onClick={() => navigate(`/workspace/${mergeDone.workspaceId}`)}>
                      {ko ? '워크스페이스 열기' : 'Open workspace'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setMergeModalOpen(false)}>
                      {ko ? '닫기' : 'Close'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="merge-label">{ko ? '대상 워크스페이스' : 'Target workspace'}</label>
                  <select
                    className="merge-select"
                    value={mergeTargetId}
                    onChange={(e) => { setMergeTargetId(e.target.value); setMergePreview(null); }}
                    disabled={mergeExecuting || mergePreviewing}
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.github_owner}/{w.github_repo})</option>
                    ))}
                  </select>

                  {!mergePreview && (
                    <button
                      className="btn btn-secondary merge-preview-btn"
                      onClick={runMergePreview}
                      disabled={!mergeTargetId || mergePreviewing}
                    >
                      {mergePreviewing ? <><Loader2 size={14} className="spin" /> {ko ? '미리보기 계산 중...' : 'Computing preview...'}</> : (ko ? '머지 미리보기' : 'Preview merge')}
                    </button>
                  )}

                  {mergePreview && (
                    <div className="merge-preview">
                      <div className="merge-preview-grid">
                        <div className="merge-stat new">
                          <strong>+{mergePreview.stats.newClusters}</strong>
                          <span>{ko ? '새 클러스터' : 'new clusters'}</span>
                        </div>
                        <div className="merge-stat new">
                          <strong>+{mergePreview.stats.newNodes}</strong>
                          <span>{ko ? '새 노드' : 'new nodes'}</span>
                        </div>
                        <div className="merge-stat new">
                          <strong>+{mergePreview.stats.newEdges}</strong>
                          <span>{ko ? '새 엣지' : 'new edges'}</span>
                        </div>
                        <div className="merge-stat">
                          <strong>{mergePreview.stats.mergedClusters}</strong>
                          <span>{ko ? '클러스터 머지' : 'clusters merged'}</span>
                        </div>
                        <div className="merge-stat">
                          <strong>{mergePreview.stats.mergedNodes}</strong>
                          <span>{ko ? '노드 머지' : 'nodes merged'}</span>
                        </div>
                        <div className="merge-stat">
                          <strong>{mergePreview.stats.mergedEdges}</strong>
                          <span>{ko ? '엣지 머지' : 'edges merged'}</span>
                        </div>
                      </div>
                      {mergePreview.stats.droppedEdges > 0 && (
                        <p className="merge-preview-warn">
                          <Warning size={12} /> {ko ? `${mergePreview.stats.droppedEdges}개 엣지 폐기됨 (양 끝 노드 누락).` : `${mergePreview.stats.droppedEdges} edges dropped (endpoint missing).`}
                        </p>
                      )}
                      <p className="merge-preview-note">
                        {ko
                          ? '기존 클러스터·노드의 이름·색·설명은 보존되며, Studio 결과는 항상 "추가" 방향으로만 적용됩니다. 결과는 정본(.cotext/neural.json), NEURAL_INDEX.md, Supabase 인덱스에 동시 반영됩니다.'
                          : 'Existing cluster/node names, colors, and descriptions are preserved — Studio merge only adds. The merged result is written to .cotext/neural.json, NEURAL_INDEX.md, and the Supabase index.'}
                      </p>
                      <div className="merge-actions">
                        <button className="btn btn-ghost" onClick={() => setMergePreview(null)} disabled={mergeExecuting}>
                          {ko ? '뒤로' : 'Back'}
                        </button>
                        <button className="btn btn-primary" onClick={runMergeExecute} disabled={mergeExecuting}>
                          {mergeExecuting ? <><Loader2 size={14} className="spin" /> {ko ? '머지 중...' : 'Merging...'}</> : (ko ? '머지 실행' : 'Execute merge')}
                        </button>
                      </div>
                    </div>
                  )}

                  {mergeError && (
                    <p className="merge-error"><Warning size={14} /> {mergeError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
