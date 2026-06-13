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
