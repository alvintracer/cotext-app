/**
 * neural-enrich — LLM semantic-edge enrichment on top of the backbone (PoC)
 * ========================================================================
 * 결정론적 뼈대(`[[wikilink]]`→엣지)는 그대로 두고, LLM이 "명시적으로 링크되지
 * 않았지만 의미상 연결된" 노드쌍에 엣지를 추론해 덧붙인다.
 *
 *  - 노드는 추가/변경하지 않는다 (파일=노드 유지). 엣지만 추가.
 *  - 추론 엣지는 `source: 'llm'`로 태깅 → 재컴파일(neural-compile)이 보존.
 *  - 멱등: 실행 시 기존 'llm' 엣지를 걷어내고 새로 추론(뼈대/기존과 중복 제거).
 *
 * BYOK 로컬/수동 단계 (CI 봇 커밋 churn·비용 방지). API 키는 env로:
 *   NEURAL_LLM_PROVIDER  (gemini | openai | anthropic | xai, 기본 gemini)
 *   NEURAL_LLM_MODEL     (생략 시 provider.defaultModel)
 *   NEURAL_LLM_API_KEY   (필수)
 *
 * 사용:
 *   NEURAL_LLM_API_KEY=... npx tsx scripts/neural-enrich.ts
 *   npx tsx scripts/neural-enrich.ts --dry --max 40
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseGraph, serializeGraph } from '../src/lib/neural/graph';
import { generateNeuralIndex } from '../src/lib/neural/indexMd';
import { runChat } from '../src/lib/agent/providers';
import { getProvider, type ProviderId } from '../src/lib/agent/models';
import type { NeuralGraph, NeuralNode, Edge } from '../src/lib/neural/types';

const LLM_SOURCE = 'llm';
const EDGE_TYPES = new Set(['relates', 'supersedes', 'supports']);

interface Args { root: string; outDir: string; dry: boolean; max: number; repoLabel: string }

function parseArgs(argv: string[]): Args {
  const root = path.resolve(getFlag(argv, '--root') ?? process.cwd());
  return {
    root,
    outDir: path.resolve(root, getFlag(argv, '--out') ?? '.cotext'),
    dry: argv.includes('--dry'),
    max: Number(getFlag(argv, '--max') ?? 40),
    repoLabel: getFlag(argv, '--repo') ?? 'cotext-wiki',
  };
}
function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function readLlmEnv(): { providerId: ProviderId; model: string; apiKey: string } {
  const raw = (process.env.NEURAL_LLM_PROVIDER || 'gemini').trim();
  const providerId: ProviderId =
    raw === 'openai' || raw === 'anthropic' || raw === 'xai' || raw === 'gemini' ? raw : 'gemini';
  const provider = getProvider(providerId);
  return {
    providerId,
    model: (process.env.NEURAL_LLM_MODEL || provider.defaultModel).trim(),
    apiKey: (process.env.NEURAL_LLM_API_KEY || '').trim(),
  };
}

/** First non-empty paragraph of the note body (frontmatter + headings stripped). */
function snippet(root: string, room: string, max = 240): string {
  try {
    const raw = fs.readFileSync(path.join(root, room), 'utf-8').replace(/\r\n/g, '\n');
    let body = raw;
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3);
      if (end !== -1) body = raw.slice(raw.indexOf('\n', end + 1) + 1);
    }
    const text = body.replace(/^#.*$/gm, '').replace(/\[\[[^\]]+\]\]/g, '').replace(/\s+/g, ' ').trim();
    return text.slice(0, max);
  } catch {
    return '';
  }
}

const undirectedKey = (a: string, b: string) => [a, b].sort().join('::');

function buildPrompt(catalog: Array<{ id: string; label: string; clusters: string; snippet: string }>, existing: string[], max: number): string {
  const notes = catalog.map((c) => `- ${c.id} :: ${c.label}${c.clusters ? ` [${c.clusters}]` : ''}${c.snippet ? ` — ${c.snippet}` : ''}`).join('\n');
  return `KNOWLEDGE NOTES (id :: label [clusters] — snippet):
${notes}

ALREADY-LINKED PAIRS (do NOT repeat these):
${existing.length ? existing.join('\n') : '(none)'}

TASK: Propose up to ${max} ADDITIONAL semantic edges between the note ids above that are conceptually related but NOT already linked.
Rules:
- Use ONLY ids from the list. Never invent ids or nodes.
- type ∈ "relates" (general), "supersedes" (from replaces to), "supports" (from backs up to).
- Prefer high-signal, non-obvious connections. Skip weak/duplicate links.
- Output ONLY a JSON array, no prose: [{"from":"id","to":"id","type":"relates","why":"short reason"}]`;
}

interface ProposedEdge { from: string; to: string; type?: string; why?: string }

function parseEdges(raw: string): ProposedEdge[] {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const open = s.indexOf('[');
  const close = s.lastIndexOf(']');
  if (open === -1 || close <= open) return [];
  s = s.slice(open, close + 1).replace(/,\s*]/g, ']');
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jsonPath = path.join(args.outDir, 'neural.json');
  const indexPath = path.join(args.outDir, 'NEURAL_INDEX.md');
  if (!fs.existsSync(jsonPath)) {
    console.error(`[neural-enrich] ${path.relative(args.root, jsonPath)} not found — run \`npm run neural:compile\` first.`);
    process.exit(1);
  }
  const graph: NeuralGraph = parseGraph(fs.readFileSync(jsonPath, 'utf-8'));

  // Catalog = real wiki nodes (skip stubs); they're the link candidates.
  const wikiNodes: NeuralNode[] = graph.nodes.filter((n) => n.source === 'wiki' && !n.id.startsWith('w-stub-'));
  if (wikiNodes.length < 2) {
    console.error('[neural-enrich] not enough wiki nodes to enrich.');
    process.exit(1);
  }
  const validIds = new Set(wikiNodes.map((n) => n.id));
  const clusterName = new Map(graph.clusters.map((c) => [c.id, c.name]));
  const catalog = wikiNodes.map((n) => ({
    id: n.id,
    label: n.label,
    clusters: n.clusters.map((c) => clusterName.get(c) ?? c).join(', '),
    snippet: snippet(args.root, n.room),
  }));

  // Existing pairs (backbone + any prior llm) so we don't re-propose them.
  const existingPairs = new Set(graph.edges.map((e) => undirectedKey(e.from, e.to)));
  const existingForPrompt = graph.edges
    .filter((e) => validIds.has(e.from) && validIds.has(e.to))
    .map((e) => undirectedKey(e.from, e.to));

  const { providerId, model, apiKey } = readLlmEnv();
  if (!apiKey) {
    console.error('[neural-enrich] NEURAL_LLM_API_KEY is required (BYOK). Set provider via NEURAL_LLM_PROVIDER.');
    process.exit(2);
  }
  const provider = getProvider(providerId);
  console.log(`[neural-enrich] ${catalog.length} nodes · provider=${providerId} model=${model} · proposing ≤${args.max} edges...`);

  const raw = await runChat({
    shape: provider.shape,
    baseURL: provider.baseURL,
    apiKey,
    model,
    system: 'You are a knowledge-graph relation extractor. Output strict JSON only.',
    messages: [{ role: 'user', content: buildPrompt(catalog, existingForPrompt, args.max) }],
  });

  // Validate + dedupe proposals.
  const accepted: Edge[] = [];
  const seen = new Set(existingPairs);
  for (const e of parseEdges(raw)) {
    if (accepted.length >= args.max) break;
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    if (e.from === e.to || !validIds.has(e.from) || !validIds.has(e.to)) continue;
    const key = undirectedKey(e.from, e.to);
    if (seen.has(key)) continue;
    seen.add(key);
    const type = e.type && EDGE_TYPES.has(e.type) ? e.type : 'relates';
    accepted.push({ from: e.from, to: e.to, type, source: LLM_SOURCE });
    if (e.why) console.log(`  + ${e.from} →(${type}) ${e.to}  — ${String(e.why).slice(0, 80)}`);
  }

  console.log(`[neural-enrich] accepted ${accepted.length} new semantic edge(s).`);
  if (args.dry) {
    console.log('[neural-enrich] --dry: not writing.');
    return;
  }

  // Replace the llm slice: drop old llm edges, add fresh ones.
  const next: NeuralGraph = {
    ...graph,
    edges: [...graph.edges.filter((e) => e.source !== LLM_SOURCE), ...accepted],
  };
  fs.writeFileSync(jsonPath, serializeGraph(next) + '\n', 'utf-8');
  fs.writeFileSync(indexPath, generateNeuralIndex(next, args.repoLabel) + '\n', 'utf-8');
  console.log(`[neural-enrich] ✓ wrote ${path.relative(args.root, jsonPath)} (+${accepted.length} llm edges)`);
}

main().catch((err) => {
  console.error('[neural-enrich] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
