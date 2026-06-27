/**
 * Mermaid ↔ React Flow conversion for the light diagram editor.
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
 * Round-trip is still lossy on purpose:
 *   - mermaid → react-flow → mermaid keeps the structure but lets Dagre
 *     (mermaid's built-in layouter) decide positions. So exact pixel placement
 *     from the visual editor is discarded once you re-open the diagram.
 */

import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';

export type NodeShape = 'rectangle' | 'rounded' | 'diamond' | 'circle' | 'group';
export type Direction = 'TD' | 'LR' | 'RL' | 'BT';
export type EdgeArrow = 'forward' | 'backward' | 'both' | 'none';
export type EdgeStyle = 'solid' | 'dashed';

/** Which mermaid family this code belongs to. Drives canvas-vs-code-only mode. */
export type MermaidDiagramType =
  | 'flowchart' | 'sequence' | 'class' | 'state'
  | 'er' | 'gantt' | 'journey' | 'mindmap' | 'pie' | 'unknown';

export function detectMermaidType(code: string): MermaidDiagramType {
  if (!code) return 'unknown';
  // First non-empty, non-comment, non-frontmatter line.
  let inFrontmatter = false;
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter || line.startsWith('%%')) continue;
    if (/^(?:flowchart|graph)\b/i.test(line)) return 'flowchart';
    if (/^sequenceDiagram\b/i.test(line)) return 'sequence';
    if (/^classDiagram(?:-v2)?\b/i.test(line)) return 'class';
    if (/^stateDiagram(?:-v2)?\b/i.test(line)) return 'state';
    if (/^erDiagram\b/i.test(line)) return 'er';
    if (/^gantt\b/i.test(line)) return 'gantt';
    if (/^journey\b/i.test(line)) return 'journey';
    if (/^mindmap\b/i.test(line)) return 'mindmap';
    if (/^pie\b/i.test(line)) return 'pie';
    return 'unknown';
  }
  return 'unknown';
}

export const DIAGRAM_TYPE_LABELS_KO: Record<MermaidDiagramType, string> = {
  flowchart: '플로우차트',
  sequence: '시퀀스',
  class: '클래스',
  state: '상태도',
  er: 'ER',
  gantt: '간트',
  journey: '여정',
  mindmap: '마인드맵',
  pie: '파이',
  unknown: '기타',
};

export const DIAGRAM_TYPE_LABELS_EN: Record<MermaidDiagramType, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence',
  class: 'Class',
  state: 'State',
  er: 'ER',
  gantt: 'Gantt',
  journey: 'Journey',
  mindmap: 'Mindmap',
  pie: 'Pie',
  unknown: 'Other',
};

/** Starter code per type — user picks a type from the header, this is inserted. */
export const DIAGRAM_TEMPLATES: Record<MermaidDiagramType, string> = {
  flowchart: 'flowchart TD\n  A[시작] --> B{조건}\n  B -->|예| C[완료]\n  B -->|아니오| A',
  sequence: 'sequenceDiagram\n    actor U as 사용자\n    participant S as 서버\n    U->>S: 요청\n    activate S\n    S-->>U: 응답\n    deactivate S\n    Note over U,S: 흐름 완료',
  class: 'classDiagram\n  class User {\n    +id: string\n    +name: string\n    +login()\n  }\n  class Session {\n    +token: string\n  }\n  User "1" --> "*" Session',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Active : start\n  Active --> Done : finish\n  Done --> [*]',
  er: 'erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains\n  ITEM }o--|| PRODUCT : refers',
  gantt: 'gantt\n  title 일정\n  dateFormat YYYY-MM-DD\n  section Phase 1\n  설계 :a1, 2026-01-01, 7d\n  구현 :after a1, 14d',
  journey: 'journey\n  title 사용자 여정\n  section 가입\n    방문: 5: User\n    가입: 3: User\n  section 사용\n    로그인: 4: User',
  mindmap: 'mindmap\n  root((주제))\n    분야A\n      세부1\n      세부2\n    분야B',
  pie: 'pie title 비율\n  "A" : 40\n  "B" : 30\n  "C" : 30',
  unknown: '',
};

export interface DiagramNodeData {
  label: string;
  shape: NodeShape;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface DiagramEdgeData {
  label?: string;
  arrow?: EdgeArrow;     // default forward
  style?: EdgeStyle;     // default solid
  [key: string]: unknown;
}

export type DiagramNode = FlowNode<DiagramNodeData, 'shape'>;
export type DiagramEdge = FlowEdge<DiagramEdgeData>;

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
    case 'group':   return `${id}[${safe}]`; // group itself only shows as a subgraph wrapper
    case 'rectangle':
    default: return `${id}[${safe}]`;
  }
}

/** Mermaid edge syntax matrix:
 *   forward solid  → `A --> B`         (default)
 *   backward solid → `A <-- B`         (rendered as B → A; we keep source/target)
 *   both solid     → `A <--> B`        (mermaid 10+)
 *   none solid     → `A --- B`
 *   forward dashed → `A -.-> B`
 *   backward dashed→ `A <-.- B`
 *   both dashed    → `A <-.-> B`
 *   none dashed    → `A -.- B`
 *   label          → wrap with `|...|` between the arrow tokens
 */
function edgeConnector(arrow: EdgeArrow, style: EdgeStyle, label: string): string {
  const base = (() => {
    if (style === 'dashed') {
      switch (arrow) {
        case 'backward': return '<-.-';
        case 'both': return '<-.->';
        case 'none': return '-.-';
        case 'forward':
        default:
          return '-.->';
      }
    }

    switch (arrow) {
      case 'backward': return '<--';
      case 'both': return '<-->';
      case 'none': return '---';
      case 'forward':
      default:
        return '-->';
    }
  })();

  return label ? `${base}|${label}|` : base;
}

/** Build a mermaid flowchart string from the editor's nodes + edges.
 *  Groups (shape: 'group') become `subgraph ... end` blocks containing their
 *  child nodes — that's how Mermaid expresses "shape inside shape". */
export function flowToMermaid(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: Direction = 'TD',
): string {
  if (nodes.length === 0) return `flowchart ${direction}\n`;
  const lines: string[] = [`flowchart ${direction}`];

  const groups = nodes.filter((n) => n.data.shape === 'group');
  const leaves = nodes.filter((n) => n.data.shape !== 'group');
  // Children index: which leaves belong to which group via React Flow's parentId.
  const childrenByGroup = new Map<string, DiagramNode[]>();
  const orphans: DiagramNode[] = [];
  for (const leaf of leaves) {
    const parent = leaf.parentId;
    if (parent && groups.some((g) => g.id === parent)) {
      const arr = childrenByGroup.get(parent) ?? [];
      arr.push(leaf);
      childrenByGroup.set(parent, arr);
    } else {
      orphans.push(leaf);
    }
  }

  // Top-level (non-grouped) shapes first.
  for (const n of orphans) {
    lines.push(`  ${wrapShape(n.id, n.data.label, n.data.shape)}`);
  }
  // Each group as a `subgraph` block with its children inside.
  for (const g of groups) {
    lines.push(`  subgraph ${g.id} [${escapeLabel(g.data.label || g.id)}]`);
    for (const child of (childrenByGroup.get(g.id) ?? [])) {
      lines.push(`    ${wrapShape(child.id, child.data.label, child.data.shape)}`);
    }
    lines.push(`  end`);
  }
  // Edges last — connecting both inside-group and outside-group nodes by id.
  for (const e of edges) {
    const arrow = e.data?.arrow ?? 'forward';
    const style = e.data?.style ?? 'solid';
    const label = e.data?.label ? escapeLabel(String(e.data.label)) : '';
    lines.push(`  ${e.source} ${edgeConnector(arrow, style, label)} ${e.target}`);
  }
  return lines.join('\n') + '\n';
}

/** Parse a mermaid flowchart string back into editor nodes/edges.
 *  Tolerant by design — anything we can't parse becomes a comment we round-trip
 *  back unchanged. v1 handles 90% of what the visual editor emits. */
const SHAPE_PATTERNS: Array<{ shape: NodeShape; re: RegExp }> = [
  { shape: 'circle', re: /^([A-Za-z_][\w]*)\(\((.+?)\)\)$/ },
  { shape: 'diamond', re: /^([A-Za-z_][\w]*)\{(.+?)\}$/ },
  { shape: 'rounded', re: /^([A-Za-z_][\w]*)\((.+?)\)$/ },
  { shape: 'rectangle', re: /^([A-Za-z_][\w]*)\[(.+?)\]$/ },
];
const NODE_TOKEN_RE = /^[A-Za-z_][\w]*(?:\(\(.+?\)\)|\{.+?\}|\(.+?\)|\[.+?\])?$/;
const CONNECTOR_TOKENS = ['<-.->', '-.->', '<-->', '<--', '-->', '-.-', '---'] as const;
const SUBGRAPH_RE = /^subgraph\s+([A-Za-z_][\w]*)\s*(?:\[(.+?)\])?\s*$/;
const SUBGRAPH_END_RE = /^end\s*$/;

function classifyConnector(conn: string): { arrow: EdgeArrow; style: EdgeStyle } {
  const dashed = conn.includes('.');
  const left = conn.startsWith('<');
  const right = conn.endsWith('>');
  const arrow: EdgeArrow = left && right ? 'both'
    : right ? 'forward'
    : left ? 'backward'
    : 'none';
  return { arrow, style: dashed ? 'dashed' : 'solid' };
}
const HEADER_RE = /^(?:flowchart|graph)\s+(TD|LR|RL|BT|TB)\s*$/i;

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

function parseNodeToken(token: string): { id: string; label: string; shape: NodeShape; explicit: boolean } | null {
  const trimmed = token.trim();
  for (const { shape, re } of SHAPE_PATTERNS) {
    const match = trimmed.match(re);
    if (match) {
      return {
        id: match[1],
        label: unescapeLabel(match[2]),
        shape,
        explicit: true,
      };
    }
  }

  const plain = trimmed.match(/^([A-Za-z_][\w]*)$/);
  if (plain) {
    return { id: plain[1], label: plain[1], shape: 'rectangle', explicit: false };
  }
  return null;
}

function parseEdgeLine(line: string): {
  from: { id: string; label: string; shape: NodeShape; explicit: boolean };
  to: { id: string; label: string; shape: NodeShape; explicit: boolean };
  arrow: EdgeArrow;
  style: EdgeStyle;
  label?: string;
} | null {
  const connector = CONNECTOR_TOKENS
    .map((token) => {
      const idx = line.indexOf(token);
      return idx >= 0 ? { token, idx } : null;
    })
    .filter((value): value is { token: typeof CONNECTOR_TOKENS[number]; idx: number } => !!value)
    .sort((a, b) => a.idx - b.idx)[0];

  if (!connector) return null;

  const fromToken = line.slice(0, connector.idx).trim();
  let rest = line.slice(connector.idx + connector.token.length).trim();
  let label: string | undefined;
  if (rest.startsWith('|')) {
    const end = rest.indexOf('|', 1);
    if (end > 0) {
      label = unescapeLabel(rest.slice(1, end));
      rest = rest.slice(end + 1).trim();
    }
  }

  if (!NODE_TOKEN_RE.test(fromToken) || !NODE_TOKEN_RE.test(rest)) return null;
  const from = parseNodeToken(fromToken);
  const to = parseNodeToken(rest);
  if (!from || !to) return null;

  const { arrow, style } = classifyConnector(connector.token);
  return { from, to, arrow, style, ...(label ? { label } : {}) };
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
  let col = 0;
  let row = 0;
  const ensureNode = (id: string, label: string, shape: NodeShape, parentId?: string) => {
    if (nodes.has(id)) {
      // Late assignment of parent if we discover it inside a subgraph after first ref.
      if (parentId) {
        const n = nodes.get(id)!;
        nodes.set(id, { ...n, parentId, extent: 'parent' } as DiagramNode);
      }
      return;
    }
    const node: DiagramNode = {
      id,
      type: 'shape',
      position: { x: 60 + col * 200, y: 40 + row * 120 },
      data: { label, shape },
    };
    if (parentId) {
      node.parentId = parentId;
      node.extent = 'parent';
    }
    nodes.set(id, node);
    col += 1;
    if (col >= 4) { col = 0; row += 1; }
  };

  let currentGroup: string | undefined;

  for (const rawLine of code.split('\n')) {
    const statements = rawLine
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const line of statements) {
      if (!line || line.startsWith('%%') || HEADER_RE.test(line)) continue;

      const sgm = line.match(SUBGRAPH_RE);
      if (sgm) {
        const [, id, label] = sgm;
        ensureNode(id, unescapeLabel(label || id), 'group');
        const g = nodes.get(id)!;
        g.data = { ...g.data, width: 280, height: 200 };
        g.style = { ...(g.style || {}), width: 280, height: 200 };
        currentGroup = id;
        continue;
      }
      if (SUBGRAPH_END_RE.test(line)) {
        currentGroup = undefined;
        continue;
      }

      const parsedEdge = parseEdgeLine(line);
      if (parsedEdge) {
        ensureNode(parsedEdge.from.id, parsedEdge.from.label, parsedEdge.from.shape, currentGroup);
        ensureNode(parsedEdge.to.id, parsedEdge.to.label, parsedEdge.to.shape, currentGroup);
        const fromExisting = nodes.get(parsedEdge.from.id);
        const toExisting = nodes.get(parsedEdge.to.id);
        if (fromExisting && parsedEdge.from.explicit) {
          fromExisting.data = { ...fromExisting.data, label: parsedEdge.from.label, shape: parsedEdge.from.shape };
        }
        if (toExisting && parsedEdge.to.explicit) {
          toExisting.data = { ...toExisting.data, label: parsedEdge.to.label, shape: parsedEdge.to.shape };
        }
        edges.push({
          id: `e_${parsedEdge.from.id}_${parsedEdge.to.id}_${edges.length}`,
          source: parsedEdge.from.id,
          target: parsedEdge.to.id,
          data: {
            ...(parsedEdge.label ? { label: parsedEdge.label } : {}),
            arrow: parsedEdge.arrow,
            style: parsedEdge.style,
          },
          label: parsedEdge.label,
        });
        continue;
      }

      const parsedNode = parseNodeToken(line);
      if (parsedNode) {
        const existing = nodes.get(parsedNode.id);
        if (existing) {
          existing.data = { ...existing.data, label: parsedNode.label, shape: parsedNode.shape };
          if (currentGroup && !existing.parentId) {
            existing.parentId = currentGroup;
            existing.extent = 'parent';
          }
        } else {
          ensureNode(parsedNode.id, parsedNode.label, parsedNode.shape, currentGroup);
        }
        continue;
      }
    }
  }

  return { direction, nodes: [...nodes.values()], edges };
}
