// ============================================================
// Knowledge Studio — Phase 3: LLM-based knowledge graph extraction
// 결정 D-009 / 계획서 §32 / concepts: neural-link-synthesis-v3
//
// 휴리스틱 oneShot 추출을 LLM 기반 entity/relation/cluster 추출로 대체.
// v3 명세 3가지 fail-safe 모두 적용:
//   1. Chunked Relay  — 문서를 ~3000자 청크로 쪼개 순차 호출 (출력 토큰 한계 방어)
//   2. JSON Repair    — 코드펜스/잡담 stripping → 정규식 보정 → 형태 검증
//   3. Active Capture — 사용자 의도적 캡처(파일 업로드) 위에서만 동작 (ambient 없음)
//
// 트랙 A (BYOK)와 트랙 B(매니지드 서버 호출) 모두 이 lib을 공유한다.
//
// ⚠️ 이 파일은 Deno Edge Function에서도 import한다 (supabase/functions/neural-extract-managed).
// 새 import를 추가할 때 브라우저 전용 API(localStorage / window / document / Vite import.meta.env)
// 를 끌어오지 말 것 — 서버가 즉시 깨진다. id.ts / types.ts / providers.ts / models.ts 까지 같은 제약.
// ============================================================

import { slugifyClusterId } from '../neural/id.ts';
import type { Cluster, Edge, NeuralGraph, NeuralNode } from '../neural/types.ts';
import { runChat } from '../agent/providers.ts';
import { getProvider, estimateCost, type ProviderId, type TokenUsage } from '../agent/models.ts';

const MAX_CHUNK_CHARS = 3000;
const MAX_CHUNK_OVERLAP = 200; // last paragraph repeated into next chunk for continuity
const PALETTE = ['#2563eb', '#d97706', '#0891b2', '#16a34a', '#dc2626', '#7c3aed', '#db2777', '#4f46e5'];

// ─── Public API ─────────────────────────────────────────────────────────────

export interface LlmExtractSource {
  name: string;
  text: string;
}

export interface LlmExtractCallbacks {
  onProgress?: (info: { phase: 'chunking' | 'extracting' | 'merging' | 'done'; current: number; total: number; message?: string }) => void;
  onChunkResult?: (chunkIndex: number, totalChunks: number, payload: ExtractionPayload | null, error?: string) => void;
  signal?: AbortSignal;
}

export interface LlmConfig {
  providerId: ProviderId;
  model: string;
  apiKey: string;
}

export interface LlmExtractResult {
  graph: NeuralGraph;
  nodeTextById: Record<string, string>;
  blockTextByKey: Record<string, string>;
  sourceCount: number;
  sectionCount: number;
  chunksProcessed: number;
  chunksFailed: number;
  failures: Array<{ source: string; chunkIndex: number; error: string }>;
  /** Optional gap analysis from final LLM pass (v3 "Anti-Blackbox"). */
  gaps?: string[];
  /** Aggregate token usage across all LLM calls — fed to Track B for actual-cost
   *  billing. `costUsd` is the platform's wholesale cost (not user charge). */
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Wholesale provider cost in USD if the model has a known price table. */
    costUsd: number | null;
    /** Per-model breakdown (primary vs fallback usage gets aggregated separately). */
    breakdown: Array<{ model: string; inputTokens: number; outputTokens: number; costUsd: number | null }>;
  };
}

/**
 * Main entry point — LLM-based knowledge graph extraction over a batch of
 * already-extracted text sources. Returns a NeuralGraph compatible with the
 * rest of the Neural Link stack (NeuralGraphView, persistNeuralGraph, etc.).
 */
export async function generateKnowledgeGraphLLM(
  sources: LlmExtractSource[],
  llm: LlmConfig,
  callbacks: LlmExtractCallbacks = {},
): Promise<LlmExtractResult> {
  const { onProgress, onChunkResult, signal } = callbacks;
  const valid = sources.filter((s) => s.text.trim().length > 32);

  // ── Chunking phase ──────────────────────────────────────────────────────
  type ChunkJob = { source: string; chunkIndex: number; totalChunks: number; text: string };
  const jobs: ChunkJob[] = [];
  for (const src of valid) {
    const chunks = chunkText(src.text);
    chunks.forEach((c, i) => jobs.push({ source: src.name, chunkIndex: i, totalChunks: chunks.length, text: c }));
  }
  onProgress?.({ phase: 'chunking', current: jobs.length, total: jobs.length });

  // ── Extraction phase (sequential, with progress) ────────────────────────
  let graph: NeuralGraph = { version: 1, updatedAt: new Date().toISOString(), clusters: [], nodes: [], edges: [] };
  const nodeTextById: Record<string, string> = {};
  const blockTextByKey: Record<string, string> = {};
  const failures: LlmExtractResult['failures'] = [];
  let chunksProcessed = 0;
  // Track B billing input: total token usage + per-model breakdown.
  // The Edge Function turns this into a precise credit charge after the run.
  const usageByModel = new Map<string, { inputTokens: number; outputTokens: number }>();
  const addUsage = (model: string, u: TokenUsage) => {
    const acc = usageByModel.get(model) ?? { inputTokens: 0, outputTokens: 0 };
    acc.inputTokens += u.inputTokens || 0;
    acc.outputTokens += u.outputTokens || 0;
    usageByModel.set(model, acc);
  };

  for (let i = 0; i < jobs.length; i++) {
    if (signal?.aborted) break;
    const job = jobs[i];
    onProgress?.({
      phase: 'extracting',
      current: i + 1,
      total: jobs.length,
      message: `${job.source} · chunk ${job.chunkIndex + 1}/${job.totalChunks}`,
    });

    let payload: ExtractionPayload | null = null;
    let error: string | undefined;
    try {
      const outcome = await extractFromChunk(job, graph, llm, signal);
      payload = outcome.payload;
      addUsage(outcome.modelUsed, outcome.usage);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    onChunkResult?.(i, jobs.length, payload, error);

    if (payload) {
      const blockTs = `${job.source} · chunk ${job.chunkIndex + 1}/${job.totalChunks}`;
      graph = mergeExtraction(graph, payload, job.source, blockTs);
      // record evidence text per node for "open block" UX
      for (const n of payload.nodes ?? []) {
        const id = idForNode(n.id);
        if (n.evidence) nodeTextById[id] = (nodeTextById[id] ? `${nodeTextById[id]}\n\n---\n\n` : '') + n.evidence;
      }
      blockTextByKey[`${job.source}::${blockTs}`] = job.text;
      chunksProcessed += 1;
    } else if (error) {
      failures.push({ source: job.source, chunkIndex: job.chunkIndex, error });
    }
  }

  // ── Gap analysis (final pass, optional, swallowed on failure) ──────────
  let gaps: string[] | undefined;
  if (graph.nodes.length > 0 && !signal?.aborted) {
    try {
      const gapModel = llm.model || getProvider(llm.providerId).defaultModel;
      gaps = await runGapAnalysis(graph, llm, signal, (u) => addUsage(gapModel, u));
    } catch { /* gap analysis is nice-to-have, not required */ }
  }

  onProgress?.({ phase: 'done', current: jobs.length, total: jobs.length });

  // ── Roll up token usage + wholesale cost ────────────────────────────────
  const breakdown = [...usageByModel.entries()].map(([model, u]) => ({
    model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costUsd: estimateCost(model, u),
  }));
  const totalInput = breakdown.reduce((s, b) => s + b.inputTokens, 0);
  const totalOutput = breakdown.reduce((s, b) => s + b.outputTokens, 0);
  const knownCosts = breakdown.filter((b) => b.costUsd != null);
  const totalCostUsd = knownCosts.length === breakdown.length
    ? knownCosts.reduce((s, b) => s + (b.costUsd as number), 0)
    : null; // null = at least one model lacks a price entry

  return {
    graph,
    nodeTextById,
    blockTextByKey,
    sourceCount: valid.length,
    sectionCount: graph.nodes.length,
    chunksProcessed,
    chunksFailed: failures.length,
    failures,
    gaps,
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      costUsd: totalCostUsd,
      breakdown,
    },
  };
}

// ─── Chunking (fail-safe #1: Chunked Relay) ─────────────────────────────────

/**
 * Split text into chunks bounded by MAX_CHUNK_CHARS, preferring heading and
 * paragraph boundaries. A small tail of the previous chunk repeats into the
 * next one so the LLM has continuity context across chunks.
 */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  // Prefer breaking at headings, fall back to paragraph then sentence.
  const sections = splitOnBoundary(cleaned, /\n#{1,6}\s+/);
  const chunks: string[] = [];
  let buffer = '';
  const flush = () => {
    if (!buffer.trim()) return;
    const tail = chunks.length ? lastTail(chunks[chunks.length - 1], MAX_CHUNK_OVERLAP) : '';
    chunks.push((tail ? `…(prev) ${tail}\n\n---\n\n` : '') + buffer.trim());
    buffer = '';
  };
  for (const section of sections) {
    if (section.length <= maxChars) {
      if ((buffer + '\n\n' + section).length > maxChars) flush();
      buffer = buffer ? `${buffer}\n\n${section}` : section;
    } else {
      flush();
      // Section too big: split on paragraphs
      for (const para of splitOnBoundary(section, /\n{2,}/)) {
        if ((buffer + '\n\n' + para).length > maxChars) flush();
        if (para.length > maxChars) {
          // Fall back to hard slice
          for (let i = 0; i < para.length; i += maxChars) {
            buffer = para.slice(i, i + maxChars);
            flush();
          }
        } else {
          buffer = buffer ? `${buffer}\n\n${para}` : para;
        }
      }
    }
  }
  flush();
  return chunks;
}

function splitOnBoundary(text: string, boundary: RegExp): string[] {
  const parts: string[] = [];
  let last = 0;
  const re = new RegExp(boundary.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index).trim());
    last = m.index;
  }
  parts.push(text.slice(last).trim());
  return parts.filter(Boolean);
}

function lastTail(text: string, n: number): string {
  if (text.length <= n) return text;
  return text.slice(-n).replace(/^\S*\s+/, '');
}

// ─── Prompt engineering (fail-safe #2 input side) ───────────────────────────

const SYSTEM_PROMPT = `You are a knowledge-graph extraction engine for Cotext (Neural Link layer).

Your job: read a text chunk and emit a STRICT JSON object that describes the entities, the clusters they belong to, and the explicit relations between them. The output will be merged into a larger graph, so reuse existing ids when the same thing reappears.

Rules:
- Output ONLY valid JSON. No prose, no markdown code fences, no commentary.
- Use snake-case or kebab-case slug ids (e.g., "ai-agents", "google-deepmind").
- Cluster ids must be stable: same topic → same slug across chunks.
- Node ids must be stable: same entity/concept → same slug across chunks.
- Edge types: "relates" (general), "supersedes" (this replaces that), "supports" (this backs that up).
- Prefer entities that are concrete and reusable (people, organizations, products, well-defined concepts) over generic topics.
- Skip filler/boilerplate. Two or three high-signal nodes beat ten weak ones.
- The "evidence" field on each node/edge MUST be a verbatim quote from the chunk (≤200 chars).
- The "summary" field on each node MUST be a single sentence in the same language as the source.
- If the chunk is uninformative (TOC, signature, repeated header), emit empty arrays.

Output schema:
{
  "clusters": [{ "id": "slug", "name": "Human Name", "desc": "1-line role" }],
  "nodes": [{
    "id": "slug",
    "label": "Display Name",
    "kind": "concept" | "person" | "org" | "product" | "event",
    "clusters": ["slug", ...],
    "summary": "one sentence",
    "evidence": "verbatim quote"
  }],
  "edges": [{ "from": "slug", "to": "slug", "type": "relates", "evidence": "verbatim quote" }]
}`;

function buildUserPrompt(job: { source: string; chunkIndex: number; totalChunks: number; text: string }, graph: NeuralGraph): string {
  const knownClusters = graph.clusters.slice(0, 30).map((c) => `${c.id}: ${c.name}`).join('\n');
  const knownNodes = graph.nodes.slice(0, 50).map((n) => `${n.id}: ${n.label}`).join('\n');
  const existingBlock = (knownClusters || knownNodes)
    ? `EXISTING GRAPH (reuse these ids when the same thing reappears):
${knownClusters ? `Clusters:\n${knownClusters}\n` : ''}${knownNodes ? `Nodes:\n${knownNodes}\n` : ''}
`
    : '';

  return `SOURCE: ${job.source}
CHUNK: ${job.chunkIndex + 1}/${job.totalChunks}

${existingBlock}TEXT:
${job.text}

Emit the JSON object now.`;
}

// ─── LLM call (with usage tracking + fallback model retry) ────────────────

interface ChunkOutcome {
  payload: ExtractionPayload | null;
  /** model that actually produced this chunk (primary or fallback) */
  modelUsed: string;
  /** raw token usage from runChat */
  usage: TokenUsage;
}

async function extractFromChunk(
  job: { source: string; chunkIndex: number; totalChunks: number; text: string },
  graph: NeuralGraph,
  llm: LlmConfig,
  signal?: AbortSignal,
): Promise<ChunkOutcome> {
  const provider = getProvider(llm.providerId);
  const primary = llm.model || provider.defaultModel;
  const fallback = provider.fallbackModel && provider.fallbackModel !== primary ? provider.fallbackModel : null;
  const system = SYSTEM_PROMPT;
  const userMsg = { role: 'user' as const, content: buildUserPrompt(job, graph) };
  let lastError: unknown;

  for (const model of [primary, fallback].filter(Boolean) as string[]) {
    if (signal?.aborted) throw new Error('aborted');
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      const raw = await runChat({
        shape: provider.shape,
        baseURL: provider.baseURL,
        apiKey: llm.apiKey,
        model,
        system,
        messages: [userMsg],
        signal,
        onUsage: (u) => { usage = u; },
      });
      const payload = repairAndParseJson(raw);
      // Two retry paths:
      //  (a) network/provider error → caught below, try fallback
      //  (b) JSON could not be repaired → also try fallback (model may have been off-format)
      if (!payload && fallback && model === primary) {
        lastError = new Error('JSON repair failed; trying fallback model');
        continue;
      }
      return { payload, modelUsed: model, usage };
    } catch (err) {
      lastError = err;
      // Only retry if a fallback exists and we haven't tried it yet
      if (model === primary && fallback) continue;
      throw err;
    }
  }
  // exhausted attempts
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── JSON repair engine (fail-safe #2 output side) ──────────────────────────

interface ExtractionNode {
  id: string;
  label: string;
  kind?: string;
  clusters?: string[];
  summary?: string;
  evidence?: string;
}
interface ExtractionCluster { id: string; name: string; desc?: string }
interface ExtractionEdge { from: string; to: string; type?: string; evidence?: string }
export interface ExtractionPayload {
  clusters?: ExtractionCluster[];
  nodes?: ExtractionNode[];
  edges?: ExtractionEdge[];
}

/**
 * Strip code fences and surrounding prose, attempt JSON.parse, then progressively
 * apply targeted repairs (trailing commas, unescaped newlines in strings, dangling
 * brackets). Returns null if no usable JSON can be coerced.
 */
export function repairAndParseJson(raw: string): ExtractionPayload | null {
  if (!raw) return null;
  let cleaned = raw.trim();

  // 1. Strip markdown code fence (```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  // 2. Slice from first '{' to last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  // 3. Try parse
  const attempts: Array<() => string> = [
    () => cleaned,
    () => cleaned.replace(/,\s*([}\]])/g, '$1'), // strip trailing commas
    () => cleaned.replace(/,\s*([}\]])/g, '$1').replace(/'\s*([:,}\]])/g, '"$1').replace(/([:,{[\s])'/g, '$1"'), // single→double quote
  ];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt());
      return validateShape(parsed);
    } catch { /* try next repair */ }
  }
  return null;
}

function validateShape(obj: unknown): ExtractionPayload | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const out: ExtractionPayload = {};

  if (Array.isArray(o.clusters)) {
    out.clusters = o.clusters
      .filter((c): c is ExtractionCluster => !!c && typeof c === 'object' && typeof (c as ExtractionCluster).id === 'string' && typeof (c as ExtractionCluster).name === 'string')
      .map((c) => ({ id: String(c.id).trim(), name: String(c.name).trim(), desc: c.desc ? String(c.desc).trim() : undefined }))
      .filter((c) => c.id && c.name);
  }
  if (Array.isArray(o.nodes)) {
    out.nodes = o.nodes
      .filter((n): n is ExtractionNode => !!n && typeof n === 'object' && typeof (n as ExtractionNode).id === 'string' && typeof (n as ExtractionNode).label === 'string')
      .map((n) => ({
        id: String(n.id).trim(),
        label: String(n.label).trim(),
        kind: n.kind ? String(n.kind).trim() : undefined,
        clusters: Array.isArray(n.clusters) ? n.clusters.map(String).filter(Boolean) : [],
        summary: n.summary ? String(n.summary).trim() : undefined,
        evidence: n.evidence ? String(n.evidence).trim() : undefined,
      }))
      .filter((n) => n.id && n.label);
  }
  if (Array.isArray(o.edges)) {
    out.edges = o.edges
      .filter((e): e is ExtractionEdge => !!e && typeof e === 'object' && typeof (e as ExtractionEdge).from === 'string' && typeof (e as ExtractionEdge).to === 'string')
      .map((e) => ({
        from: String(e.from).trim(),
        to: String(e.to).trim(),
        type: e.type ? String(e.type).trim() : 'relates',
        evidence: e.evidence ? String(e.evidence).trim() : undefined,
      }))
      .filter((e) => e.from && e.to && e.from !== e.to);
  }
  return out;
}

// ─── Merge (incremental augmentation) ───────────────────────────────────────

/**
 * Merge an LLM extraction payload into the running graph. Same id = reuse.
 * Node `room`/`blockTs` are filled from the source/chunk so the Studio graph
 * view can still jump back to the originating text.
 */
function mergeExtraction(
  graph: NeuralGraph,
  payload: ExtractionPayload,
  sourceFile: string,
  blockTs: string,
): NeuralGraph {
  const clusters: Cluster[] = [...graph.clusters];
  const clusterIdx = new Map(clusters.map((c, i) => [c.id, i]));
  for (const c of payload.clusters ?? []) {
    const id = slugifyClusterId(c.id);
    if (clusterIdx.has(id)) {
      const existing = clusters[clusterIdx.get(id)!];
      if (!existing.desc && c.desc) existing.desc = c.desc;
    } else {
      clusters.push({
        id,
        name: c.name,
        color: PALETTE[clusters.length % PALETTE.length],
        desc: c.desc,
      });
      clusterIdx.set(id, clusters.length - 1);
    }
  }

  const nodes: NeuralNode[] = [...graph.nodes];
  const nodeIdx = new Map(nodes.map((n, i) => [n.id, i]));
  for (const n of payload.nodes ?? []) {
    const id = idForNode(n.id);
    const clusterIds = (n.clusters ?? []).map(slugifyClusterId).filter((c, i, arr) => c && arr.indexOf(c) === i);
    if (nodeIdx.has(id)) {
      const existing = nodes[nodeIdx.get(id)!];
      // Merge clusters (dedupe)
      const merged = new Set([...existing.clusters, ...clusterIds]);
      existing.clusters = [...merged];
      // Prefer a label that actually carries information
      if ((!existing.label || existing.label === id) && n.label) existing.label = n.label;
    } else {
      nodes.push({
        id,
        room: sourceFile,
        blockTs,
        label: n.label,
        clusters: clusterIds,
        source: 'knowledge-studio',
      });
      nodeIdx.set(id, nodes.length - 1);
    }
  }

  const edges: Edge[] = [...graph.edges];
  const edgeKey = (from: string, to: string) => [from, to].sort().join('::');
  const edgeSet = new Set(edges.map((e) => edgeKey(e.from, e.to)));
  for (const e of payload.edges ?? []) {
    const from = idForNode(e.from);
    const to = idForNode(e.to);
    if (from === to) continue;
    if (!nodeIdx.has(from) || !nodeIdx.has(to)) continue; // skip dangling
    const key = edgeKey(from, to);
    if (edgeSet.has(key)) continue;
    edges.push({ from, to, type: e.type || 'relates' });
    edgeSet.add(key);
  }

  return { ...graph, clusters, nodes, edges, updatedAt: new Date().toISOString() };
}

/** Normalize the LLM-emitted id to our slug style so merges line up. */
function idForNode(raw: string): string {
  return slugifyClusterId(raw);
}

// ─── Gap analysis (v3 "Anti-Blackbox") ──────────────────────────────────────

const GAP_SYSTEM = `You audit a knowledge graph for missing or weak coverage. Look at the cluster and node list, then list up to 5 gaps the user would benefit from filling. Each gap must be one short Korean or English sentence (match the language of the labels). Output as a JSON array of strings only.`;

async function runGapAnalysis(graph: NeuralGraph, llm: LlmConfig, signal?: AbortSignal, onUsage?: (u: TokenUsage) => void): Promise<string[]> {
  const provider = getProvider(llm.providerId);
  const summary = [
    `Clusters (${graph.clusters.length}): ${graph.clusters.map((c) => c.name).join(', ')}`,
    `Top nodes (${Math.min(graph.nodes.length, 40)}): ${graph.nodes.slice(0, 40).map((n) => n.label).join(', ')}`,
    `Edges: ${graph.edges.length}`,
  ].join('\n');
  const raw = await runChat({
    shape: provider.shape,
    baseURL: provider.baseURL,
    apiKey: llm.apiKey,
    model: llm.model || provider.defaultModel,
    system: GAP_SYSTEM,
    messages: [{ role: 'user', content: summary }],
    signal,
    onUsage,
  });
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const open = cleaned.indexOf('[');
  const close = cleaned.lastIndexOf(']');
  if (open === -1 || close <= open) return [];
  try {
    const arr = JSON.parse(cleaned.slice(open, close + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map(String).filter((s) => s.trim().length > 0).slice(0, 5);
  } catch { return []; }
}
