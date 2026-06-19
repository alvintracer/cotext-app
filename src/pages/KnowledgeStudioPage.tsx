import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain, Check, GitMerge, Globe, Graph, Lightning, Link as LinkIcon, Spinner as Loader2, UploadSimple, Warning, X,
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
import { getProvider, type ProviderId } from '../lib/agent/models';
import { getKey, setKey, getPref, setPref } from '../lib/agent/keys';

// New MindSync sub-components
import MindSyncDropzone from '../components/mindsync/MindSyncDropzone';
import InferenceSettings from '../components/mindsync/InferenceSettings';
import StatsBar from '../components/mindsync/StatsBar';
import SourceFileList from '../components/mindsync/SourceFileList';
import AnchorWorkspacePanel from '../components/mindsync/AnchorWorkspacePanel';

import '../styles/mindsync-studio.css';

// Lazy-load 3D globe — keeps three.js out of the main bundle
const NeuralGlobe = lazy(() => import('../components/NeuralGlobe'));

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
  const [globeOpen, setGlobeOpen] = useState(false);
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
  // Track B (managed): platform handles LLM inference + billing.
  const [trackMode, setTrackMode] = useState<'byok' | 'managed'>('byok');
  const [managedInfo, setManagedInfo] = useState<{
    providerId: string;
    model: string;
    billingMode: string;
    chargedCredits: number;
    requestChars: number;
    chargeSkipped?: boolean;
    chargeError?: string | null;
  } | null>(null);
  const [managedCreditsRefresh, setManagedCreditsRefresh] = useState(0);
  // Phase 1: BYOK LLM provider. Persists in localStorage (same store as AgentPanel).
  const [providerId, setProviderId] = useState<ProviderId>(() => getPref()?.provider ?? 'gemini');
  const [model, setModel] = useState<string>(() => getPref()?.model ?? getProvider('gemini').defaultModel);
  const [apiKey, setApiKey] = useState<string>(() => getKey(getPref()?.provider ?? 'gemini'));
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
  }, [providerId, apiKey, model]);

  useEffect(() => {
    let cancelled = false;
    const loadAnchorApiKey = async () => {
      if (!anchorWs) {
        setAnchorApiKey('');
        return;
      }
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
    setAutoStatus(ko ? `워크스페이스에 저장 중...` : `Saving to workspace...`);
    try {
      const preview = await previewWorkspaceMerge(anchorWs, graphResult.graph);
      const merged = await executeWorkspaceMerge(anchorWs, preview,
        mode === 'generate' ? 'cotext: MindSync seed generated' : 'cotext: MindSync augment');
      setAutoStatus(
        ko
          ? `저장 완료 → ${anchorWs.name} (+${merged.stats.newClusters}/${merged.stats.newNodes}/${merged.stats.newEdges})`
          : `Saved to ${anchorWs.name} (+${merged.stats.newClusters}/${merged.stats.newNodes}/${merged.stats.newEdges})`,
      );
    } catch (e) {
      setAutoStatus(ko
        ? `저장 실패: ${e instanceof Error ? e.message : String(e)}`
        : `Save failed: ${e instanceof Error ? e.message : String(e)}`);
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
      if (!anchorWs) {
        setGenError(ko ? 'Cotext 모델을 사용하려면 대상 워크스페이스를 선택하세요.' : 'Select a target workspace to use Cotext Model.');
        setGenerating(false);
        return;
      }
      const managedAbort = new AbortController();
      abortRef.current = managedAbort;
      try {
        setLlmProgress({
          phase: 'extracting',
          current: 0,
          total: 1,
          message: ko ? '서버에서 지식망을 추출하는 중...' : 'Building knowledge graph on the server...',
        });
        const managed = await managedKnowledgeApi.extract(
          anchorWs.id,
          deduped,
          (info) => setLlmProgress(info),
          managedAbort.signal,
        );
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
          setGlobeOpen(true); // Auto-open 3D globe after extraction
          setLlmFailures(managed.result.failures);
          setLlmGaps(managed.result.gaps ?? []);
          setManagedInfo({
            providerId: managed.managed.providerId,
            model: managed.managed.model,
            billingMode: managed.managed.billingMode,
            chargedCredits: managed.managed.chargedCredits,
            requestChars: managed.managed.requestChars,
            chargeSkipped: managed.managed.chargeSkipped,
            chargeError: managed.managed.chargeError,
          });
          setManagedCreditsRefresh((n) => n + 1);
          setGenerating(false);
          setLlmProgress(null);
        });
        window.dispatchEvent(new CustomEvent('mindsync:managed-credits-updated', { detail: { workspaceId: anchorWs.id } }));
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
          setGlobeOpen(true); // Auto-open 3D globe after LLM extraction
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
        setGlobeOpen(true); // Auto-open 3D globe after extraction
        setGenerating(false);
      });
      autoMergeIntoAnchor(next);
    }, 0);
  }, [generating, readySources, useLlm, hasKey, trackMode, providerId, model, provider.defaultModel, apiKey, ko, autoMergeIntoAnchor, anchorWs]);

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
    <div className="ms-page">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="ms-hero ms-glass-card">
        <div className="ms-hero-content">
          <div className="ms-eyebrow">
            <Brain size={14} weight="fill" />
            MindSync
          </div>
          <h1>{ko ? '데이터를 두뇌로, 두뇌를 워크스페이스로' : 'Docs into a brain, brain into your workspace'}</h1>
          <p>
            {ko
              ? '파일을 업로드하면 AI가 자동으로 지식망(노드·관계·클러스터)을 추출합니다. 대상 워크스페이스를 선택하면 결과가 자동 저장됩니다.'
              : 'Upload files and AI will automatically extract a knowledge graph — nodes, relations, and clusters. Select a target workspace and results are saved automatically.'}
          </p>
        </div>
        <div className="ms-hero-actions">
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            <UploadSimple size={16} />
            {ko ? '파일 추가' : 'Add files'}
          </button>
          {generating ? (
            <button className="btn btn-secondary" onClick={handleAbortGenerate}>
              <Loader2 size={16} className="spin" />
              {ko ? '취소' : 'Cancel'}
            </button>
          ) : (
            <button
              className={`btn btn-secondary ${readySources.length && !result ? 'btn-pulse' : ''}`}
              onClick={handleGenerate}
              disabled={!readySources.length}
            >
              <Lightning size={16} />
              {ko ? '지식망 생성' : 'Build graph'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setGraphOpen(true)} disabled={!result?.graph.nodes.length}>
            <Graph size={16} />
            {ko ? '그래프 보기' : 'Open graph'}
          </button>
          <button className="btn btn-ghost" onClick={() => setGlobeOpen(true)} disabled={!result?.graph.nodes.length}>
            <Globe size={16} />
            {ko ? '3D 글로브' : '3D Globe'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/mindsync/think')} disabled={!result?.graph.nodes.length}>
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
            {ko ? '워크스페이스에 저장' : 'Save to workspace'}
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

      {/* ── Generation Progress ──────────────────────────────── */}
      {generating && (
        <section className="ms-progress-section ms-glass-card">
          <div className="ms-progress-header">
            <Loader2 size={16} className="spin" />
            <span className="ms-progress-phase">
              {llmProgress?.message || (ko ? '지식망을 추출하고 있습니다...' : 'Extracting knowledge graph...')}
            </span>
            {llmProgress && (
              <span className="ms-progress-count">
                {llmProgress.current}/{llmProgress.total}
              </span>
            )}
          </div>
          <div className="ms-progress-bar-track">
            <div
              className="ms-progress-bar-fill"
              style={{ width: llmProgress ? `${Math.round((llmProgress.current / Math.max(llmProgress.total, 1)) * 100)}%` : '0%' }}
            />
          </div>
          {llmProgress && (
            <div className="ms-progress-pct">
              {Math.round((llmProgress.current / Math.max(llmProgress.total, 1)) * 100)}%
            </div>
          )}
        </section>
      )}

      {/* ── Source Files & Results ─────────────────────────────── */}
      <section className="ms-content-grid">
        <SourceFileList
          ko={ko}
          sources={sources}
          onRemove={removeSource}
          formatSize={formatSize}
          formatCount={formatCount}
        />

        {/* Result panel */}
        <div className="ms-result ms-glass-card">
          <div className="ms-panel-header">
            <h3>{ko ? '생성 결과' : 'Results'}</h3>
            <span>{formatCount(result?.sectionCount || 0)}</span>
          </div>
          {!result ? (
            <div className="ms-empty">
              <Brain size={22} />
              <p>{ko ? '파일을 추가한 뒤 지식망을 생성하세요.' : 'Add files, then build the graph.'}</p>
            </div>
          ) : (
            <div className="ms-result-body">
              <p className="ms-note">
                {ko
                  ? `${result.sourceCount}개 파일에서 ${formatCount(result.sectionCount)}개 섹션, ${formatCount(result.graph.edges.length)}개 연결을 생성했습니다.`
                  : `Built ${formatCount(result.sectionCount)} sections and ${formatCount(result.graph.edges.length)} links from ${result.sourceCount} files.`}
              </p>
              <div className="ms-cluster-list">
                {topClusters.map((cluster) => (
                  <div key={cluster.id} className="ms-cluster-row">
                    <span className="ms-cluster-swatch" style={{ background: cluster.color || 'var(--accent)' }} />
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

      {/* ── Upload Dropzone ──────────────────────────────────────── */}
      <MindSyncDropzone
        ko={ko}
        dragging={dragging}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        onClickUpload={() => inputRef.current?.click()}
        maxFileSize={formatSize(MAX_FILE_BYTES)}
        maxTotalSize={formatSize(MAX_TOTAL_BYTES)}
        maxCount={MAX_FILE_COUNT}
      />

      {/* ── Alerts ───────────────────────────────────────────────── */}
      {uploadError && (
        <div className="ms-alert ms-alert--error">
          <Warning size={14} weight="fill" />
          <span>{uploadError}</span>
          <button className="ms-alert-dismiss" onClick={() => setUploadError(null)} aria-label="dismiss">×</button>
        </div>
      )}

      {genError && (
        <div className="ms-alert ms-alert--error">
          <Warning size={14} weight="fill" />
          <span>{genError}</span>
          <button className="ms-alert-dismiss" onClick={() => setGenError(null)} aria-label="dismiss">×</button>
        </div>
      )}

      {!generating && llmFailures.length > 0 && (
        <div className="ms-alert ms-alert--warning">
          <Warning size={14} weight="fill" />
          <div>
            <strong>{ko ? `${llmFailures.length}개 블록 분석 실패` : `${llmFailures.length} block(s) failed`}</strong>
            <ul>
              {llmFailures.slice(0, 4).map((f, i) => (
                <li key={i}>{f.source} #{f.chunkIndex + 1}: {f.error.slice(0, 100)}</li>
              ))}
              {llmFailures.length > 4 && <li>… +{llmFailures.length - 4}</li>}
            </ul>
          </div>
        </div>
      )}

      {!generating && llmGaps.length > 0 && (
        <div className="ms-alert ms-alert--info">
          <Brain size={14} weight="fill" />
          <div>
            <strong>{ko ? '보완 가능한 영역' : 'Areas to improve'}</strong>
            <ul>
              {llmGaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── Stats Bar ────────────────────────────────────────────── */}
      <StatsBar
        ko={ko}
        extractedDocs={readySources.length}
        totalChars={totalChars}
        generatedNodes={result?.graph.nodes.length || 0}
        clusters={result?.graph.clusters.length || 0}
      />

      {/* ── Settings Row ─────────────────────────────────────────── */}
      <div className="ms-settings-row">
        <InferenceSettings
          ko={ko}
          trackMode={trackMode}
          onTrackChange={setTrackMode}
          providerId={providerId}
          onProviderChange={(id) => {
            setProviderId(id);
            setModel(getProvider(id).defaultModel);
          }}
          model={model}
          onModelChange={setModel}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          hasKey={hasKey}
          onSaveKey={saveProviderPrefs}
          provider={provider}
          useLlm={useLlm}
          onUseLlmChange={setUseLlm}
          llmReady={llmReady}
          managedInfo={managedInfo}
          managedCreditsSlot={
            trackMode === 'managed' && anchorWs ? (
              <ManagedCreditsPanel workspaceId={anchorWs.id} compact refreshKey={managedCreditsRefresh} />
            ) : undefined
          }
        />

        <AnchorWorkspacePanel
          ko={ko}
          workspaces={workspaces}
          anchorWorkspaceId={anchorWorkspaceId}
          onAnchorChange={setAnchorWorkspaceId}
          mode={mode}
          onModeChange={setMode}
          autoMerge={autoMerge}
          onAutoMergeChange={setAutoMerge}
          autoStatus={autoStatus}
          anchorWs={anchorWs}
          showSaveText={readySources.length > 0}
          onSaveText={saveExtractedTextToWorkspace}
          textSavingState={textSavingState}
        />
      </div>

      {/* ── Graph View ───────────────────────────────────────────── */}
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

      {/* ── 3D Neural Globe ────────────────────────────────────── */}
      {globeOpen && result && (
        <Suspense fallback={
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ecafc' }}>
            <Loader2 size={32} className="spin" />
          </div>
        }>
          <NeuralGlobe
            graph={result.graph}
            onClose={() => setGlobeOpen(false)}
            language={language}
          />
        </Suspense>
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

      {/* ── Merge Modal ──────────────────────────────────────────── */}
      {mergeModalOpen && (
        <div className="modal-overlay" onClick={() => !mergeExecuting && setMergeModalOpen(false)}>
          <div className="modal-content merge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><GitMerge size={18} /> {ko ? '워크스페이스에 저장' : 'Save to workspace'}</h3>
              <button className="icon-button" onClick={() => setMergeModalOpen(false)} disabled={mergeExecuting} aria-label="close">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {mergeDone ? (
                <div className="merge-success">
                  <Check size={28} weight="bold" />
                  <h4>{ko ? '저장 완료' : 'Saved'}</h4>
                  <p>
                    {ko
                      ? `워크스페이스에 +${mergeDone.stats.newClusters} 클러스터 / +${mergeDone.stats.newNodes} 노드 / +${mergeDone.stats.newEdges} 엣지가 추가되었습니다.`
                      : `Added +${mergeDone.stats.newClusters} clusters / +${mergeDone.stats.newNodes} nodes / +${mergeDone.stats.newEdges} edges to the workspace.`}
                  </p>
                  <ul className="merge-success-checks">
                    <li>{mergeDone.pushed.neuralJson ? '✓' : '✗'} {ko ? '지식 데이터 저장' : 'Knowledge data saved'}</li>
                    <li>{mergeDone.pushed.neuralIndex ? '✓' : '✗'} {ko ? '인덱스 갱신' : 'Index updated'}</li>
                    <li>{mergeDone.pushed.supabaseSync ? '✓' : '✗'} {ko ? '검색 인덱스 동기화' : 'Search index synced'}</li>
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
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  {!mergePreview && (
                    <button
                      className="btn btn-secondary merge-preview-btn"
                      onClick={runMergePreview}
                      disabled={!mergeTargetId || mergePreviewing}
                    >
                      {mergePreviewing ? <><Loader2 size={14} className="spin" /> {ko ? '미리보기 계산 중...' : 'Computing preview...'}</> : (ko ? '미리보기' : 'Preview')}
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
                          <span>{ko ? '기존 병합' : 'clusters merged'}</span>
                        </div>
                        <div className="merge-stat">
                          <strong>{mergePreview.stats.mergedNodes}</strong>
                          <span>{ko ? '노드 병합' : 'nodes merged'}</span>
                        </div>
                        <div className="merge-stat">
                          <strong>{mergePreview.stats.mergedEdges}</strong>
                          <span>{ko ? '엣지 병합' : 'edges merged'}</span>
                        </div>
                      </div>
                      {mergePreview.stats.droppedEdges > 0 && (
                        <p className="merge-preview-warn">
                          <Warning size={12} /> {ko ? `${mergePreview.stats.droppedEdges}개 연결이 제거되었습니다.` : `${mergePreview.stats.droppedEdges} edges dropped.`}
                        </p>
                      )}
                      <p className="merge-preview-note">
                        {ko
                          ? '기존 데이터는 보존되며, 새로운 내용만 추가됩니다.'
                          : 'Existing data is preserved — only new content is added.'}
                      </p>
                      <div className="merge-actions">
                        <button className="btn btn-ghost" onClick={() => setMergePreview(null)} disabled={mergeExecuting}>
                          {ko ? '뒤로' : 'Back'}
                        </button>
                        <button className="btn btn-primary" onClick={runMergeExecute} disabled={mergeExecuting}>
                          {mergeExecuting ? <><Loader2 size={14} className="spin" /> {ko ? '저장 중...' : 'Saving...'}</> : (ko ? '저장 실행' : 'Save now')}
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
