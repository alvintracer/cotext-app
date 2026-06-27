/**
 * `cotext compile` / `cotext check` — Wiki → Neural graph compiler.
 *
 * Same logic as the in-repo `scripts/neural-compile.ts`, but bundled (via esbuild)
 * into the distributable CLI so end users don't need the app sources installed.
 *
 *   - `[[wikilink]]`            → 결정론적 엣지 (from-file → target)
 *   - frontmatter `type`/`tags` → 클러스터
 *   - 각 마크다운 파일          → 노드 (source: 'wiki')
 *
 * 기존 `.cotext/neural.json`의 비-wiki 노드(Studio 업로드 등)는 보존:
 * 이전 wiki 슬라이스만 걷어내고 새로 계산한 wiki 그래프를 union 머지한다.
 * LLM-enrich 엣지(`source: 'llm'`)는 재컴파일 시 보존.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseGraph, serializeGraph, emptyGraph, mergeGraphs } from '../../../src/lib/neural/graph';
import { slugifyClusterId } from '../../../src/lib/neural/id';
import { generateNeuralIndex } from '../../../src/lib/neural/indexMd';
import type { NeuralGraph, NeuralNode, Cluster, Edge } from '../../../src/lib/neural/types';

const WIKI_SOURCE = 'wiki';
const PALETTE = ['#2563eb', '#d97706', '#0891b2', '#16a34a', '#dc2626', '#7c3aed', '#db2777', '#4f46e5'];
const IGNORED_STUB_LINKS = new Set([
  'claude',
  'claude.md',
  'agents',
  'agents.md',
  'chatgpt',
  'chatgpt.md',
  'start_here',
  'start-here',
  'start here',
  'start_here.md',
  'start-here.md',
  'index',
  'index.md',
  'log',
  'log.md',
  'template_manifest',
  'template-manifest',
  'template manifest',
  'template_manifest.md',
  'template-manifest.md',
  'prompts/first-setup',
  'prompts/first-setup.md',
  'prompts/save',
  'prompts/save.md',
  'prompts/query',
  'prompts/query.md',
  'prompts/ingest',
  'prompts/ingest.md',
  'prompts/lint',
  'prompts/lint.md',
]);

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'dev-dist', 'android', 'packages', 'src', 'public',
  '.cotext', '.git', '.github', '.vscode', 'scripts', 'supabase',
]);

export interface CompileArgs { root: string; outDir: string; check: boolean; repoLabel: string }

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
  return out.filter((abs) => {
    const rel = toRel(root, abs);
    return rel.startsWith('AI-Sessions/wiki/');
  });
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/');
}

function shouldIgnoreStubLink(target: string): boolean {
  const clean = target.split('|')[0].split('#')[0].trim().replace(/\\/g, '/').replace(/\.md$/i, '');
  const lowered = clean.toLowerCase();
  return IGNORED_STUB_LINKS.has(lowered) || lowered.startsWith('prompts/');
}

interface Frontmatter { type?: string; tags?: string[]; status?: string; title?: string; date?: string; graph?: boolean }

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
    const val = m[2].trim();
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
    } else if (key === 'graph') {
      const lowered = val.replace(/^['"]|['"]$/g, '').toLowerCase();
      if (lowered === 'false') fm.graph = false;
      else if (lowered === 'true') fm.graph = true;
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

function wikiNodeId(relWithoutExt: string): string {
  return `w-${slugifyClusterId(relWithoutExt)}`;
}

function buildWikiGraph(root: string, files: string[]): NeuralGraph {
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
    if (!clusters.has(id)) clusters.set(id, { id, name, color: PALETTE[clusters.size % PALETTE.length] });
    return id;
  };

  const nodes: NeuralNode[] = [];
  const edges: Edge[] = [];
  const stubIds = new Map<string, NeuralNode>();
  const resolveLink = (target: string): string | null => {
    const clean = target.split('|')[0].split('#')[0].trim().replace(/\.md$/i, '');
    const hit = aliasToId.get(clean.toLowerCase()) ?? aliasToId.get(path.basename(clean).toLowerCase());
    if (hit) return hit;
    if (shouldIgnoreStubLink(target)) return null;
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
    if (fm.graph === false) continue;
    const nodeClusters: string[] = [];
    if (fm.type) nodeClusters.push(ensureCluster(capitalize(fm.type)));
    for (const tag of fm.tags ?? []) nodeClusters.push(ensureCluster(tag));
    nodes.push({
      id: info.id, room: info.rel, blockTs: fm.date ?? '',
      label: fm.title || firstH1(body) || info.base,
      clusters: [...new Set(nodeClusters)], source: WIKI_SOURCE,
    });
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
    version: 1, updatedAt: new Date().toISOString(),
    clusters: [...clusters.values()],
    nodes: [...nodes, ...stubIds.values()],
    edges,
  };
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

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
  const ids = new Set(merged.nodes.map((n) => n.id));
  merged.edges = merged.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return merged;
}

function signature(g: NeuralGraph): string {
  const clusters = [...g.clusters].map((c) => `${c.id}|${c.name}|${c.desc ?? ''}`).sort();
  const nodes = [...g.nodes].map((n) => `${n.id}|${n.label}|${[...n.clusters].sort().join(',')}|${n.source ?? ''}`).sort();
  const edges = [...g.edges].map((e) => `${[e.from, e.to].sort().join('::')}|${e.type ?? ''}`).sort();
  return JSON.stringify({ clusters, nodes, edges });
}

export function runNeuralCompile(args: CompileArgs): number {
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
    console.log(`[cotext check] ${summary}`);
    if (drift) {
      console.error('[cotext check] ✗ .cotext/neural.json is STALE — run `npx cotext compile` and commit.');
      return 1;
    }
    console.log('[cotext check] ✓ graph is up to date.');
    return 0;
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(jsonPath, serializeGraph(compiled) + '\n', 'utf-8');
  fs.writeFileSync(indexPath, generateNeuralIndex(compiled, args.repoLabel) + '\n', 'utf-8');
  console.log(`[cotext compile] ${summary}`);
  console.log(`[cotext compile] ✓ wrote ${path.relative(args.root, jsonPath)} + ${path.relative(args.root, indexPath)}`);
  return 0;
}
