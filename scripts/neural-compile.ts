/**
 * neural-compile — Wiki → Neural graph compiler (PoC)
 * =====================================================
 * Turns the human/agent-authored markdown wiki into the machine knowledge graph.
 *
 * 결정: 그래프는 "파생물"이고 단일 작성자(이 컴파일러)만 쓴다.
 *  - `[[wikilink]]`            → 결정론적 엣지 (from-file → target)
 *  - frontmatter `type`/`tags` → 클러스터
 *  - 각 마크다운 파일          → 노드 (source: 'wiki')
 *
 * 기존 `.cotext/neural.json`의 비-wiki 노드(Studio 업로드 등)는 보존한다:
 * 이전 wiki 슬라이스만 걷어내고 새로 계산한 wiki 그래프를 union 머지한다
 * (= 위키에서 링크가 사라지면 엣지도 사라지는 멱등 재컴파일).
 *
 * 같은 머지 로직(mergeGraphs)을 Studio/머지/이 컴파일러가 공유한다.
 *
 * 사용:
 *   npx tsx scripts/neural-compile.ts            # 컴파일 후 .cotext/ 기록
 *   npx tsx scripts/neural-compile.ts --check    # 변경 여부만 검사(쓰지 않음, stale면 exit 1)
 *   npx tsx scripts/neural-compile.ts --root <dir> --out <dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGraph, serializeGraph, emptyGraph, mergeGraphs } from '../src/lib/neural/graph';
import { slugifyClusterId } from '../src/lib/neural/id';
import { generateNeuralIndex } from '../src/lib/neural/indexMd';
import type { NeuralGraph, NeuralNode, Cluster, Edge } from '../src/lib/neural/types';

const WIKI_SOURCE = 'wiki';
const PALETTE = ['#2563eb', '#d97706', '#0891b2', '#16a34a', '#dc2626', '#7c3aed', '#db2777', '#4f46e5'];

// Directories we never scan for wiki content.
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'dev-dist', 'android', 'packages', 'src', 'public',
  '.cotext', '.git', '.github', '.vscode', 'scripts', 'supabase',
]);

interface Args { root: string; outDir: string; check: boolean; repoLabel: string }

function parseArgs(argv: string[]): Args {
  const root = path.resolve(getFlag(argv, '--root') ?? process.cwd());
  const outDir = path.resolve(root, getFlag(argv, '--out') ?? '.cotext');
  const check = argv.includes('--check');
  const repoLabel = getFlag(argv, '--repo') ?? 'cotext-wiki';
  return { root, outDir, check, repoLabel };
}
function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** Recursively collect markdown files we treat as knowledge. */
function collectMarkdown(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(abs);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push(abs);
      }
    }
  };
  walk(root);
  // Keep only: top-level *.md, AI-Sessions/**, prompts/**
  return out.filter((abs) => {
    const rel = toRel(root, abs);
    if (!rel.includes('/')) return true; // top-level doc (CLAUDE.md, log.md, ...)
    return rel.startsWith('AI-Sessions/') || rel.startsWith('prompts/');
  });
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/');
}

interface Frontmatter { type?: string; tags?: string[]; status?: string; title?: string; date?: string }

/** Minimal frontmatter parser (scalar keys + inline/block `tags`). */
function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  if (!raw.startsWith('---')) return { fm: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: raw };
  const block = raw.slice(raw.indexOf('\n') + 1, end);
  const body = raw.slice(raw.indexOf('\n', end + 1) + 1);
  const fm: Frontmatter = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let val = m[2].trim();
    if (key === 'tags') {
      if (val.startsWith('[')) {
        fm.tags = val.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        const tags: string[] = [];
        while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
          tags.push(lines[++i].replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
        }
        if (tags.length) fm.tags = tags;
      }
    } else if (key === 'type' || key === 'status' || key === 'title' || key === 'date') {
      (fm as Record<string, string>)[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return { fm, body };
}

function firstH1(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Stable node id namespaced to the wiki layer so it never collides with Studio slugs. */
function wikiNodeId(relWithoutExt: string): string {
  return `w-${slugifyClusterId(relWithoutExt)}`;
}

/** Build the wiki-derived graph from the markdown files. */
function buildWikiGraph(root: string, files: string[]): NeuralGraph {
  // 1) Resolution map: link text → node id (full relpath + basename aliases).
  const aliasToId = new Map<string, string>();
  const fileInfo = files.map((abs) => {
    const rel = toRel(root, abs);
    const relNoExt = rel.replace(/\.md$/i, '');
    const base = path.basename(relNoExt);
    const id = wikiNodeId(relNoExt);
    aliasToId.set(relNoExt.toLowerCase(), id);
    if (!aliasToId.has(base.toLowerCase())) aliasToId.set(base.toLowerCase(), id);
    return { abs, rel, relNoExt, base, id };
  });

  const clusters = new Map<string, Cluster>();
  const ensureCluster = (name: string): string => {
    const id = slugifyClusterId(name);
    if (!clusters.has(id)) {
      clusters.set(id, { id, name, color: PALETTE[clusters.size % PALETTE.length] });
    }
    return id;
  };

  const nodes: NeuralNode[] = [];
  const edges: Edge[] = [];
  const stubIds = new Map<string, NeuralNode>();
  const resolveLink = (target: string): string | null => {
    const clean = target.split('|')[0].split('#')[0].trim().replace(/\.md$/i, '');
    const hit = aliasToId.get(clean.toLowerCase()) ?? aliasToId.get(path.basename(clean).toLowerCase());
    if (hit) return hit;
    // Deterministic stub slug (NOT slugifyClusterId — it randomizes on empty).
    // Degenerate links like the literal example `[[...]]` slugify to '' → skip.
    const slug = clean.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    if (!slug) return null;
    const stubId = `w-stub-${slug}`;
    if (!stubIds.has(stubId)) {
      stubIds.set(stubId, { id: stubId, room: '(unresolved)', blockTs: '', label: clean, clusters: [], source: WIKI_SOURCE });
    }
    return stubId;
  };

  for (const info of fileInfo) {
    let raw: string;
    try { raw = fs.readFileSync(info.abs, 'utf-8').replace(/\r\n/g, '\n'); } catch { continue; }
    const { fm, body } = parseFrontmatter(raw);

    const nodeClusters: string[] = [];
    if (fm.type) nodeClusters.push(ensureCluster(capitalize(fm.type)));
    for (const tag of fm.tags ?? []) nodeClusters.push(ensureCluster(tag));

    nodes.push({
      id: info.id,
      room: info.rel,
      blockTs: fm.date ?? '',
      label: fm.title || firstH1(body) || info.base,
      clusters: [...new Set(nodeClusters)],
      source: WIKI_SOURCE,
    });

    // [[wikilink]] → edge. Dedup per (from,to).
    const seen = new Set<string>();
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const to = resolveLink(m[1]);
      if (!to || to === info.id || seen.has(to)) continue;
      seen.add(to);
      edges.push({ from: info.id, to, type: 'relates', source: WIKI_SOURCE });
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    clusters: [...clusters.values()],
    nodes: [...nodes, ...stubIds.values()],
    edges,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Replace the wiki slice of `existing` with the freshly computed wiki graph.
 * LLM-enriched edges (`source: 'llm'`) are PRESERVED — they're inferred on top
 * of the backbone by `neural-enrich.ts`, not derived from links, so a routine
 * recompile must not wipe them. Dangling preserved edges (endpoint deleted) are
 * pruned in the final pass.
 */
function recompile(existing: NeuralGraph, wiki: NeuralGraph): NeuralGraph {
  const prevWikiIds = new Set(existing.nodes.filter((n) => n.source === WIKI_SOURCE).map((n) => n.id));
  const base: NeuralGraph = {
    ...existing,
    nodes: existing.nodes.filter((n) => n.source !== WIKI_SOURCE),
    edges: existing.edges.filter(
      (e) => e.source === 'llm' || (!prevWikiIds.has(e.from) && !prevWikiIds.has(e.to)),
    ),
  };
  const merged = mergeGraphs(base, wiki).graph;
  // Final integrity pass: drop any edge whose endpoint no longer exists
  // (e.g. a preserved llm edge to a wiki node whose file was deleted).
  const ids = new Set(merged.nodes.map((n) => n.id));
  merged.edges = merged.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return merged;
}

/** Order-independent signature (ignores updatedAt) so --check detects real drift only. */
function signature(g: NeuralGraph): string {
  const clusters = [...g.clusters].map((c) => `${c.id}|${c.name}|${c.desc ?? ''}`).sort();
  const nodes = [...g.nodes].map((n) => `${n.id}|${n.label}|${[...n.clusters].sort().join(',')}|${n.source ?? ''}`).sort();
  const edges = [...g.edges].map((e) => `${[e.from, e.to].sort().join('::')}|${e.type ?? ''}`).sort();
  return JSON.stringify({ clusters, nodes, edges });
}

/** Programmatic entry — reused by wiki-init. Returns an exit code (0 ok, 1 drift). */
export function runNeuralCompile(argv: string[]): number {
  const args = parseArgs(argv);
  const files = collectMarkdown(args.root);
  const wiki = buildWikiGraph(args.root, files);

  const jsonPath = path.join(args.outDir, 'neural.json');
  const indexPath = path.join(args.outDir, 'NEURAL_INDEX.md');
  const existing = fs.existsSync(jsonPath) ? parseGraph(fs.readFileSync(jsonPath, 'utf-8')) : emptyGraph();
  const compiled = recompile(existing, wiki);

  const wikiNodeCount = wiki.nodes.filter((n) => n.source === WIKI_SOURCE && !n.id.startsWith('w-stub-')).length;
  const stubCount = wiki.nodes.filter((n) => n.id.startsWith('w-stub-')).length;
  const summary = `scanned ${files.length} files → ${wikiNodeCount} wiki nodes, ${stubCount} stubs, ${wiki.clusters.length} clusters, ${wiki.edges.length} links`;

  if (args.check) {
    const drift = signature(existing) !== signature(compiled);
    console.log(`[neural-compile] ${summary}`);
    if (drift) {
      console.error('[neural-compile] ✗ .cotext/neural.json is STALE — run `npm run neural:compile` and commit.');
      return 1;
    }
    console.log('[neural-compile] ✓ graph is up to date.');
    return 0;
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(jsonPath, serializeGraph(compiled) + '\n', 'utf-8');
  fs.writeFileSync(indexPath, generateNeuralIndex(compiled, args.repoLabel) + '\n', 'utf-8');
  console.log(`[neural-compile] ${summary}`);
  console.log(`[neural-compile] ✓ wrote ${toRel(args.root, jsonPath)} + ${toRel(args.root, indexPath)}`);
  return 0;
}

// Run only when invoked directly.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(runNeuralCompile(process.argv.slice(2)));
