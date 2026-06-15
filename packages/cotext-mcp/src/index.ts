#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// --- Mode detection ---

const API_KEY = process.env.COTEXT_API_KEY;
const API_URL = process.env.COTEXT_API_URL;
const REMOTE_MODE = !!(API_KEY && API_URL);

// --- Helpers ---

async function apiFetch(endpoint: string, options: { method?: string; body?: string } = {}): Promise<any> {
  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: options.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.cotext'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

interface RoomInfo {
  path: string;
  cotextFile: string;
  lastModified: string;
  sizeBytes: number;
}

interface Block {
  timestamp: string;
  source?: string;
  content: string;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let current: Block | null = null;

  for (const line of lines) {
    const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    const srcMatch = line.match(/^<!-- source: (\w+) -->/);
    if (tsMatch) {
      if (current) blocks.push(current);
      current = { timestamp: tsMatch[1], content: '' };
    } else if (srcMatch && current && !current.source) {
      current.source = srcMatch[1];
    } else if (current) {
      current.content += line + '\n';
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// --- Neural Link (P5.1, option A) ---
// We deliberately keep these parsers self-contained — the MCP package is a
// standalone publish, so it can't depend on the app's src/lib/neural. The
// schema is stable (decision D-009) and tiny enough to inline.

interface NeuralNode { id: string; room: string; blockTs: string; label: string; clusters: string[]; source?: string }
interface NeuralCluster { id: string; name: string; color?: string; desc?: string }
interface NeuralEdge { from: string; to: string; type?: string; viaCluster?: string }
interface NeuralGraph { version?: 1; updatedAt?: string; clusters: NeuralCluster[]; nodes: NeuralNode[]; edges: NeuralEdge[] }

function parseInlineNode(line: string): { id: string; label: string; clusters: string[] } | null {
  const m = line.match(/^<!--\s*node:\s*(.*?)\s*-->\s*$/);
  if (!m) return null;
  const body = m[1];
  const idM = body.match(/\bid=(\S+)/);
  if (!idM) return null;
  const labelM = body.match(/\blabel="([^"]*)"/);
  const clustersM = body.match(/\bclusters=\[([^\]]*)\]/);
  return {
    id: idM[1],
    label: labelM ? labelM[1] : '',
    clusters: clustersM ? clustersM[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

function readInlineNodes(content: string, room: string): NeuralNode[] {
  const lines = content.split('\n');
  const nodes: NeuralNode[] = [];
  let curTs: string | null = null;
  let curSource: string | undefined;
  for (const line of lines) {
    const tsM = line.match(/^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (tsM) { curTs = tsM[1]; curSource = undefined; continue; }
    const srcM = line.match(/^<!--\s*source:\s*(\w+)\s*-->/);
    if (srcM) { curSource = srcM[1]; continue; }
    const meta = parseInlineNode(line);
    if (meta && curTs) {
      nodes.push({ id: meta.id, room, blockTs: curTs, label: meta.label, clusters: meta.clusters, source: curSource });
    }
  }
  return nodes;
}

function extractBlockText(content: string, blockTs: string): string {
  const lines = content.split('\n');
  const headerRe = new RegExp('^##\\s+' + blockTs.replace(/[-:.\s]/g, '\\$&'));
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end)
    .filter((l) => !/^<!--\s*(source|node):/.test(l))
    .join('\n')
    .trim();
}

/** Load the full graph from disk: clusters/edges from .cotext/neural.json (registry),
 *  nodes re-derived from every room's cotext.md (truth). Edges referencing missing
 *  nodes are dropped so the snapshot is always consistent. */
async function loadGraph(): Promise<NeuralGraph> {
  const neuralPath = path.join(repoRoot, '.cotext', 'neural.json');
  let base: NeuralGraph = { clusters: [], nodes: [], edges: [] };
  if (fs.existsSync(neuralPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(neuralPath, 'utf-8')) as Partial<NeuralGraph>;
      base = {
        clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
        nodes: [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch { /* ignore — fall through to empty */ }
  }
  const pattern = path.join(repoRoot, '**/.cotext/cotext.md').replace(/\\/g, '/');
  const files = await glob(pattern, { ignore: '**/node_modules/**' });
  const nodes: NeuralNode[] = [];
  for (const f of files) {
    const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
    const roomPath = rel.replace(/\/.cotext\/cotext\.md$/, '') || 'root';
    const content = fs.readFileSync(f, 'utf-8');
    nodes.push(...readInlineNodes(content, roomPath));
  }
  const validIds = new Set(nodes.map((n) => n.id));
  const edges = base.edges.filter((e) => validIds.has(e.from) && validIds.has(e.to));
  return { clusters: base.clusters, nodes, edges };
}

function formatBlockForAppend(content: string, source: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `\n## ${y}-${mo}-${d} ${h}:${mi}\n<!-- source: ${source} -->\n\n${content}\n`;
}

// --- Server ---

let repoRoot: string;
if (REMOTE_MODE) {
  repoRoot = 'remote';
  console.error(`Cotext MCP (remote mode) — API: ${API_URL}`);
} else {
  const found = findRepoRoot(process.cwd());
  if (!found) {
    console.error('Error: Not inside a git repo or Cotext workspace.');
    process.exit(1);
  }
  repoRoot = found;
}

const server = new McpServer({
  name: 'cotext-mcp',
  version: '0.1.0',
});

// --- Tool: list_rooms ---
server.tool(
  'list_rooms',
  'List all Cotext rooms in this repository',
  {},
  async () => {
    if (REMOTE_MODE) {
      const result = await apiFetch('rooms');
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    }

    const pattern = path.join(repoRoot, '**/.cotext/cotext.md').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: '**/node_modules/**' });

    const rooms: RoomInfo[] = files.map(f => {
      const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
      const roomPath = rel.replace(/\/.cotext\/cotext\.md$/, '') || 'root';
      const stat = fs.statSync(f);
      return {
        path: roomPath,
        cotextFile: rel,
        lastModified: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      };
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(rooms, null, 2) }],
    };
  }
);

// --- Tool: get_room ---
server.tool(
  'get_room',
  'Get the full content of a specific Cotext room',
  { room_path: z.string().describe('Room path (e.g., "src/features" or "root")') },
  async ({ room_path }) => {
    if (REMOTE_MODE) {
      const result = await apiFetch(`rooms/${encodeURIComponent(room_path)}`);
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    }

    const cotextPath = room_path === 'root'
      ? path.join(repoRoot, '.cotext', 'cotext.md')
      : path.join(repoRoot, room_path, '.cotext', 'cotext.md');

    if (!fs.existsSync(cotextPath)) {
      return { content: [{ type: 'text' as const, text: `Error: Room not found at ${room_path}` }] };
    }

    const content = fs.readFileSync(cotextPath, 'utf-8');
    const blocks = parseBlocks(content);

    return {
      content: [{
        type: 'text' as const,
        text: `# Room: ${room_path}\n\nBlocks: ${blocks.length} (${blocks.filter(b => b.source === 'me' || !b.source).length} human, ${blocks.filter(b => b.source && b.source !== 'me').length} agent)\n\n---\n\n${content}`,
      }],
    };
  }
);

// --- Tool: search_context ---
server.tool(
  'search_context',
  'Search across all rooms for content matching a query',
  {
    query: z.string().describe('Search query (case-insensitive substring match)'),
    source_filter: z.string().optional().describe('Filter by source tag: "me", "agent", "chatgpt", etc.'),
  },
  async ({ query, source_filter }) => {
    if (REMOTE_MODE) {
      const result = await apiFetch(`search?q=${encodeURIComponent(query)}${source_filter ? `&source=${source_filter}` : ''}`);
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    }

    const pattern = path.join(repoRoot, '**/.cotext/cotext.md').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: '**/node_modules/**' });
    const results: Array<{ room: string; timestamp: string; source?: string; snippet: string }> = [];
    const q = query.toLowerCase();

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
      const roomPath = rel.replace(/\/.cotext\/cotext\.md$/, '') || 'root';
      const blocks = parseBlocks(content);

      for (const block of blocks) {
        if (source_filter && block.source !== source_filter) continue;
        if (block.content.toLowerCase().includes(q)) {
          results.push({
            room: roomPath,
            timestamp: block.timestamp,
            source: block.source,
            snippet: block.content.trim().substring(0, 200),
          });
        }
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: results.length > 0
          ? JSON.stringify(results, null, 2)
          : `No results found for "${query}"${source_filter ? ` with source=${source_filter}` : ''}`,
      }],
    };
  }
);

// --- Tool: get_pack ---
server.tool(
  'get_pack',
  'Generate a Context Pack (LLM-ready markdown) from a room, with me-only filter',
  {
    room_path: z.string().describe('Room path'),
    source_filter: z.string().optional().default('me').describe('Source filter: "me" (default, human only), "all" (include agent blocks)'),
  },
  async ({ room_path, source_filter }) => {
    if (REMOTE_MODE) {
      const result = await apiFetch(`pack/${encodeURIComponent(room_path)}?source=${source_filter}`);
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    }

    const cotextPath = room_path === 'root'
      ? path.join(repoRoot, '.cotext', 'cotext.md')
      : path.join(repoRoot, room_path, '.cotext', 'cotext.md');

    if (!fs.existsSync(cotextPath)) {
      return { content: [{ type: 'text' as const, text: `Error: Room not found at ${room_path}` }] };
    }

    const content = fs.readFileSync(cotextPath, 'utf-8');
    const blocks = parseBlocks(content);
    const filtered = source_filter === 'all'
      ? blocks
      : blocks.filter(b => !b.source || b.source === 'me');

    const now = new Date().toISOString().split('T')[0];
    const repoName = path.basename(repoRoot);
    const blockTexts = filtered.map(b =>
      `## ${b.timestamp}\n<!-- source: ${b.source || 'me'} -->\n${b.content.trimEnd()}`
    ).join('\n\n');

    const filterNote = filtered.length < blocks.length
      ? `Filter: ${filtered.length}/${blocks.length} blocks (me-only, ${blocks.length - filtered.length} agent blocks excluded)`
      : `Blocks: ${blocks.length} total`;

    const pack = `# Context Pack — ${repoName}/${room_path}\n\n> Generated: ${now}\n> ${filterNote}\n\n---\n\n${blockTexts}\n`;

    return { content: [{ type: 'text' as const, text: pack }] };
  }
);

// --- Tool: append_note ---
server.tool(
  'append_note',
  'Append a new block to a room with provenance tracking. Always specify your source.',
  {
    room_path: z.string().describe('Room path (e.g., "src/features" or "root")'),
    content: z.string().describe('The markdown content to append'),
    source: z.string().default('agent').describe('Source tag: "agent", "claude", "chatgpt", "gemini", etc.'),
  },
  async ({ room_path, content: blockContent, source }) => {
    if (REMOTE_MODE) {
      const result = await apiFetch(`rooms/${encodeURIComponent(room_path)}/append`, {
        method: 'POST',
        body: JSON.stringify({ content: blockContent, source }),
      });
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    }

    const cotextDir = room_path === 'root'
      ? path.join(repoRoot, '.cotext')
      : path.join(repoRoot, room_path, '.cotext');
    const cotextPath = path.join(cotextDir, 'cotext.md');

    // Create directory if needed
    if (!fs.existsSync(cotextDir)) {
      fs.mkdirSync(cotextDir, { recursive: true });
    }

    // Read existing or create initial
    let existing = '';
    if (fs.existsSync(cotextPath)) {
      existing = fs.readFileSync(cotextPath, 'utf-8');
    } else {
      existing = `# Cotext: ${room_path}\n`;
    }

    const newBlock = formatBlockForAppend(blockContent, source);
    const updated = existing.trimEnd() + '\n' + newBlock;
    fs.writeFileSync(cotextPath, updated, 'utf-8');

    return {
      content: [{
        type: 'text' as const,
        text: `✓ Appended block to ${room_path} (source: ${source}). Don't forget to git commit & push.`,
      }],
    };
  }
);

// --- Neural Link tools (P5.1 local + P5.2 remote) ---
const wrapText = (obj: unknown) => ({ content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

server.tool(
  'get_neural_graph',
  'Get the Neural Link graph snapshot (clusters / nodes / edges). Use format="summary" for a quick overview, "markdown" for a human/agent-readable index, or "json" for the full machine-readable graph.',
  {
    format: z.enum(['summary', 'markdown', 'json']).optional().default('summary')
      .describe('Output shape — "summary" (small), "markdown" (NEURAL_INDEX.md style), "json" (full graph)'),
  },
  async ({ format }) => {
    if (REMOTE_MODE) {
      const r = await apiFetch(`neural/graph?format=${format}`);
      return wrapText(r);
    }
    const g = await loadGraph();
    if (format === 'json') return wrapText(g);
    if (format === 'markdown') {
      const idxPath = path.join(repoRoot, '.cotext', 'NEURAL_INDEX.md');
      if (fs.existsSync(idxPath)) return wrapText(fs.readFileSync(idxPath, 'utf-8'));
      return wrapText('No NEURAL_INDEX.md yet — push from the Cotext app to generate.');
    }
    const sizes = g.clusters.map((c) => ({ cluster: c.name, id: c.id, count: g.nodes.filter((n) => n.clusters.includes(c.id)).length }))
      .sort((a, b) => b.count - a.count);
    return wrapText({ counts: { nodes: g.nodes.length, clusters: g.clusters.length, edges: g.edges.length }, clusters_by_size: sizes });
  }
);

server.tool(
  'find_related',
  'Find nodes related to a given node: same-cluster members (implicit) plus explicit edge connections.',
  { node_id: z.string().describe('Node id (e.g., "n_a1b2c3d4")') },
  async ({ node_id }) => {
    if (REMOTE_MODE) {
      const r = await apiFetch(`neural/find_related?node_id=${encodeURIComponent(node_id)}`);
      return wrapText(r);
    }
    const g = await loadGraph();
    const self = g.nodes.find((n) => n.id === node_id);
    if (!self) return wrapText(`Node ${node_id} not found`);
    const sameCluster = g.nodes.filter((n) => n.id !== node_id && n.clusters.some((c) => self.clusters.includes(c)));
    const linkedIds = new Set<string>();
    const linkTypes: Record<string, string | undefined> = {};
    for (const e of g.edges) {
      if (e.from === node_id) { linkedIds.add(e.to); linkTypes[e.to] = e.type; }
      else if (e.to === node_id) { linkedIds.add(e.from); linkTypes[e.from] = e.type; }
    }
    const linked = g.nodes.filter((n) => linkedIds.has(n.id))
      .map((n) => ({ id: n.id, label: n.label, room: n.room, blockTs: n.blockTs, type: linkTypes[n.id] }));
    return wrapText({
      self: { id: self.id, label: self.label, room: self.room, blockTs: self.blockTs, clusters: self.clusters },
      same_cluster: sameCluster.map((n) => ({ id: n.id, label: n.label, room: n.room, blockTs: n.blockTs, via: n.clusters.filter((c) => self.clusters.includes(c)) })),
      linked,
    });
  }
);

server.tool(
  'search_clusters',
  'Search clusters by substring of name or id. Returns matching clusters with their member nodes.',
  { query: z.string().describe('Substring to match (case-insensitive)') },
  async ({ query }) => {
    if (REMOTE_MODE) {
      const r = await apiFetch(`neural/search_clusters?q=${encodeURIComponent(query)}`);
      return wrapText(r);
    }
    const g = await loadGraph();
    const q = query.toLowerCase();
    const matches = g.clusters.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    return wrapText(matches.map((c) => ({
      cluster: { id: c.id, name: c.name, desc: c.desc },
      members: g.nodes.filter((n) => n.clusters.includes(c.id))
        .map((n) => ({ id: n.id, label: n.label, room: n.room, blockTs: n.blockTs, source: n.source })),
    })));
  }
);

server.tool(
  'get_node_context',
  'Get rich context for a single node: its block text, clusters, and adjacent (related) node labels — useful for grounding when answering about a topic.',
  { node_id: z.string().describe('Node id (e.g., "n_a1b2c3d4")') },
  async ({ node_id }) => {
    if (REMOTE_MODE) {
      const r = await apiFetch(`neural/node?id=${encodeURIComponent(node_id)}`);
      return wrapText(r);
    }
    const g = await loadGraph();
    const self = g.nodes.find((n) => n.id === node_id);
    if (!self) return wrapText(`Node ${node_id} not found`);
    const cotextPath = self.room === 'root'
      ? path.join(repoRoot, '.cotext', 'cotext.md')
      : path.join(repoRoot, self.room, '.cotext', 'cotext.md');
    let blockText = '';
    if (fs.existsSync(cotextPath)) blockText = extractBlockText(fs.readFileSync(cotextPath, 'utf-8'), self.blockTs);
    const adjacent: Array<{ id: string; label: string; room: string; relation: string; type?: string }> = [];
    for (const c of self.clusters) {
      for (const n of g.nodes) {
        if (n.id !== node_id && n.clusters.includes(c)) adjacent.push({ id: n.id, label: n.label, room: n.room, relation: `cluster:${c}` });
      }
    }
    for (const e of g.edges) {
      const other = e.from === node_id ? e.to : (e.to === node_id ? e.from : null);
      if (!other) continue;
      const n = g.nodes.find((x) => x.id === other);
      if (n) adjacent.push({ id: n.id, label: n.label, room: n.room, relation: 'edge', type: e.type });
    }
    return wrapText({
      id: self.id, label: self.label, room: self.room, blockTs: self.blockTs,
      clusters: self.clusters, source: self.source,
      block_text: blockText,
      adjacent,
    });
  }
);

// Neural Index resource — exposes NEURAL_INDEX.md (option C grounding)
server.resource(
  'neural-index',
  'cotext://neural-index',
  async (uri) => {
    if (REMOTE_MODE) {
      const md = await apiFetch('neural/graph?format=markdown');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: typeof md === 'string' ? md : JSON.stringify(md) }] };
    }
    const idxPath = path.join(repoRoot, '.cotext', 'NEURAL_INDEX.md');
    if (fs.existsSync(idxPath)) {
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: fs.readFileSync(idxPath, 'utf-8') }] };
    }
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: 'No NEURAL_INDEX.md yet — push from Cotext app to generate.' }] };
  }
);

// --- Resources: COTEXT_GUIDE ---
server.resource(
  'guide',
  'cotext://guide',
  async (uri) => {
    if (REMOTE_MODE) {
      const result = await apiFetch('guide');
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }],
      };
    }

    const guidePath = path.join(repoRoot, '.cotext', 'COTEXT_GUIDE.md');
    if (fs.existsSync(guidePath)) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: fs.readFileSync(guidePath, 'utf-8'),
        }],
      };
    }
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: 'No COTEXT_GUIDE.md found. Push from Cotext web app to generate it.',
      }],
    };
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Cotext MCP Server running — ${REMOTE_MODE ? `remote: ${API_URL}` : `repo: ${repoRoot}`}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
