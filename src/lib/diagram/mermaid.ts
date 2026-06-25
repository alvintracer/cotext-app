/**
 * Mermaid ↔ React Flow conversion (single-direction Phase B, both Phase C-ready).
 *
 * Scope: flowchart TD/LR only — covers ~80% of planning/design diagrams the
 * user will draw. Sequence / class / ER live as raw mermaid code (no visual
 * editor in v1).
 *
 * Node shapes encoded into mermaid syntax:
 *   rectangle  → A[label]
 *   rounded    → A(label)
 *   diamond    → A{label}
 *   circle     → A((label))
 *
 * Edges: A --> B  (or A -->|label| B). Always solid arrow in v1.
 *
 * Round-trip is lossy on purpose (Q1 decision):
 *   - mermaid → react-flow → mermaid keeps the structure but lets Dagre
 *     (mermaid's built-in layouter) decide positions. So exact pixel placement
 *     from the visual editor is discarded once you re-open the diagram.
 */

import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';

export type NodeShape = 'rectangle' | 'rounded' | 'diamond' | 'circle';
export type Direction = 'TD' | 'LR' | 'RL' | 'BT';

export interface DiagramNodeData {
  label: string;
  shape: NodeShape;
  [key: string]: unknown;
}

export type DiagramNode = FlowNode<DiagramNodeData, 'shape'>;
export type DiagramEdge = FlowEdge<{ label?: string }>;

/** Make a fresh node id that's safe inside mermaid (alphanumeric + underscores). */
let _nodeCounter = 0;
export function newNodeId(): string {
  _nodeCounter += 1;
  return `n${Date.now().toString(36).slice(-4)}${_nodeCounter}`;
}

/** Escape a label for mermaid — wrap in quotes if it has special characters. */
function escapeLabel(label: string): string {
  // Mermaid's safe characters inside [...]. Anything with brackets, quotes, or
  // newlines must be quoted with double quotes (mermaid auto-strips them).
  const trimmed = label.trim() || ' ';
  const needsQuotes = /[[\](){}|"\\\n]/.test(trimmed);
  if (needsQuotes) {
    return `"${trimmed.replace(/"/g, '#quot;').replace(/\n/g, '<br>')}"`;
  }
  return trimmed;
}

function wrapShape(id: string, label: string, shape: NodeShape): string {
  const safe = escapeLabel(label);
  switch (shape) {
    case 'rounded': return `${id}(${safe})`;
    case 'diamond': return `${id}{${safe}}`;
    case 'circle': return `${id}((${safe}))`;
    case 'rectangle':
    default: return `${id}[${safe}]`;
  }
}

/** Build a mermaid flowchart string from the editor's nodes + edges. */
export function flowToMermaid(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: Direction = 'TD',
): string {
  if (nodes.length === 0) return `flowchart ${direction}\n`;
  const lines: string[] = [`flowchart ${direction}`];
  // Declare each node so isolated nodes still appear in the diagram.
  for (const n of nodes) {
    lines.push(`  ${wrapShape(n.id, n.data.label, n.data.shape)}`);
  }
  // Edges. Mermaid is happy with `from --> to` even when nodes are declared above.
  for (const e of edges) {
    const label = e.data?.label ? `|${escapeLabel(String(e.data.label))}|` : '';
    lines.push(`  ${e.source} -->${label} ${e.target}`);
  }
  return lines.join('\n') + '\n';
}

/** Parse a mermaid flowchart string back into editor nodes/edges.
 *  Tolerant by design — anything we can't parse becomes a comment we round-trip
 *  back unchanged. v1 handles 90% of what the visual editor emits. */
const SHAPE_PATTERNS: Array<{ shape: NodeShape; re: RegExp }> = [
  { shape: 'circle',    re: /^([A-Za-z_][\w]*)\(\((.+?)\)\)$/ },
  { shape: 'diamond',   re: /^([A-Za-z_][\w]*)\{(.+?)\}$/ },
  { shape: 'rounded',   re: /^([A-Za-z_][\w]*)\((.+?)\)$/ },
  { shape: 'rectangle', re: /^([A-Za-z_][\w]*)\[(.+?)\]$/ },
];
const EDGE_RE = /^([A-Za-z_][\w]*)\s*-->\s*(?:\|(.+?)\|)?\s*([A-Za-z_][\w]*)$/;
const HEADER_RE = /^flowchart\s+(TD|LR|RL|BT|TB)\s*$/i;

function unescapeLabel(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/#quot;/g, '"').replace(/<br\s*\/?>/gi, '\n');
  }
  return s;
}

export interface ParsedDiagram {
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export function mermaidToFlow(code: string): ParsedDiagram {
  const direction: Direction = (() => {
    for (const raw of code.split('\n')) {
      const m = raw.trim().match(HEADER_RE);
      if (m) return (m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase()) as Direction;
    }
    return 'TD';
  })();

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  // Simple grid layout — Dagre would be nicer but adds bundle cost; React Flow
  // will get the positions and the user can rearrange. (Mermaid SVG handles
  // the final auto-layout when the diagram is rendered.)
  let col = 0;
  let row = 0;
  const ensureNode = (id: string, label: string, shape: NodeShape) => {
    if (nodes.has(id)) return;
    nodes.set(id, {
      id,
      type: 'shape',
      position: { x: 60 + col * 200, y: 40 + row * 120 },
      data: { label, shape },
    });
    col += 1;
    if (col >= 4) { col = 0; row += 1; }
  };

  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || HEADER_RE.test(line)) continue;

    // Try edge first since edges always contain `-->`.
    const em = line.match(EDGE_RE);
    if (em) {
      const [, from, label, to] = em;
      ensureNode(from, from, 'rectangle');
      ensureNode(to, to, 'rectangle');
      edges.push({
        id: `e_${from}_${to}_${edges.length}`,
        source: from,
        target: to,
        data: label ? { label: unescapeLabel(label) } : undefined,
        label: label ? unescapeLabel(label) : undefined,
      });
      continue;
    }

    // Node declaration (shape + label).
    for (const { shape, re } of SHAPE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        const [, id, label] = m;
        const existing = nodes.get(id);
        if (existing) {
          existing.data = { ...existing.data, label: unescapeLabel(label), shape };
        } else {
          ensureNode(id, unescapeLabel(label), shape);
        }
        break;
      }
    }
  }

  return { direction, nodes: [...nodes.values()], edges };
}
