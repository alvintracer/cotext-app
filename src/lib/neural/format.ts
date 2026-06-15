// ============================================================
// Neural Link — 블록 인라인 노드 주석 (정본: cotext.md)
//
// 포맷: <!-- node: id=n_a1b2 label="가격 정책 v2" clusters=[pricing, gtm] -->
//  - 블록 헤더(## ts) + <!-- source: x --> 바로 다음 줄에 위치
//  - parseBlocks 와 동일한 비파괴 주석 방식 (markdown 그대로 grep 가능)
// ============================================================

import type { InlineNodeMeta, NeuralNode } from './types';
import { newNodeId } from './id';

const NODE_RE = /^<!--\s*node:\s*(.*?)\s*-->\s*$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** InlineNodeMeta → 주석 한 줄 직렬화. */
export function serializeNodeComment(meta: InlineNodeMeta): string {
  const label = meta.label.replace(/"/g, "'"); // 따옴표 충돌 방지
  const clusters = meta.clusters.length ? ` clusters=[${meta.clusters.join(', ')}]` : '';
  return `<!-- node: id=${meta.id} label="${label}"${clusters} -->`;
}

/** 주석 한 줄 → InlineNodeMeta (아니면 null). */
export function parseNodeComment(line: string): InlineNodeMeta | null {
  const m = line.match(NODE_RE);
  if (!m) return null;
  const body = m[1];

  const idM = body.match(/\bid=(\S+)/);
  if (!idM) return null;

  const labelM = body.match(/\blabel="([^"]*)"/);
  const clustersM = body.match(/\bclusters=\[([^\]]*)\]/);
  const clusters = clustersM
    ? clustersM[1].split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return { id: idM[1], label: labelM ? labelM[1] : '', clusters };
}

/** content 내부의 블록 [start, end) 줄 범위를 찾는다. 못 찾으면 null. */
function findBlockRange(lines: string[], blockTs: string): { start: number; end: number } | null {
  const headerRe = new RegExp('^##\\s+' + escapeRegex(blockTs) + '(?:\\s|$)');
  const anyHeaderRe = /^##\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyHeaderRe.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

/**
 * 블록을 노드화한다(단일 쓰기 경로의 핵심 — UI/MCP 공용).
 * - 이미 노드면 label/clusters 를 병합 갱신, 없으면 새 id 부여.
 * - 주석은 <!-- source --> 다음(없으면 헤더 다음) 줄에 삽입.
 * 반환: 새 content + 확정된 노드 메타. 블록을 못 찾으면 content 그대로 + null.
 */
export function nodifyBlock(
  content: string,
  blockTs: string,
  opts: { label?: string; clusters?: string[]; id?: string },
): { content: string; node: InlineNodeMeta | null } {
  const lines = content.split('\n');
  const range = findBlockRange(lines, blockTs);
  if (!range) return { content, node: null };

  // 기존 노드 주석 탐색
  let nodeLineIdx = -1;
  let sourceLineIdx = -1;
  let existing: InlineNodeMeta | null = null;
  for (let i = range.start + 1; i < range.end; i++) {
    if (sourceLineIdx === -1 && /^<!--\s*source:/.test(lines[i])) sourceLineIdx = i;
    const parsed = parseNodeComment(lines[i]);
    if (parsed) { nodeLineIdx = i; existing = parsed; break; }
  }

  const node: InlineNodeMeta = {
    id: existing?.id ?? opts.id ?? newNodeId(),
    label: opts.label ?? existing?.label ?? '',
    clusters: opts.clusters ?? existing?.clusters ?? [],
  };
  const comment = serializeNodeComment(node);

  if (nodeLineIdx !== -1) {
    lines[nodeLineIdx] = comment;
  } else {
    const insertAt = (sourceLineIdx !== -1 ? sourceLineIdx : range.start) + 1;
    lines.splice(insertAt, 0, comment);
  }
  return { content: lines.join('\n'), node };
}

/** 블록의 클러스터 소속을 통째로 교체(노드가 없으면 생성). */
export function setBlockClusters(content: string, blockTs: string, clusters: string[]): string {
  return nodifyBlock(content, blockTs, { clusters }).content;
}

/** 블록에서 노드 주석 제거(노드화 취소). */
export function removeNodeFromBlock(content: string, blockTs: string): string {
  const lines = content.split('\n');
  const range = findBlockRange(lines, blockTs);
  if (!range) return content;
  for (let i = range.start + 1; i < range.end; i++) {
    if (parseNodeComment(lines[i])) {
      lines.splice(i, 1);
      break;
    }
  }
  return lines.join('\n');
}

/**
 * 문서 내 문자 오프셋에서 위로 가장 가까운 `## ts` 블록 헤더의 timestamp 를 찾는다.
 * 에디터뷰 selection 위치에서 "어느 블록에 속하는가" 를 알아낼 때 사용.
 */
export function findEnclosingBlockTs(content: string, charOffset: number): string | null {
  const head = content.slice(0, Math.max(0, charOffset));
  const re = /^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/gm;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) last = m[1];
  return last;
}

/**
 * 블록 본문 텍스트만 뽑아낸다(헤더·source·node 주석 제외).
 * 그래프 뷰의 노드 디테일 패널에서 본문 미리보기에 사용.
 */
export function extractBlockText(content: string, blockTs: string): string {
  const lines = content.split('\n');
  const range = findBlockRange(lines, blockTs);
  if (!range) return '';
  return lines
    .slice(range.start + 1, range.end)
    .filter((l) => !/^<!--\s*(source|node):/.test(l))
    .join('\n')
    .trim();
}

/** content 전체에서 인라인 노드를 모두 읽어 NeuralNode[] 로(룸 컨텍스트 주입). */
export function readInlineNodes(content: string, room: string): NeuralNode[] {
  const lines = content.split('\n');
  const nodes: NeuralNode[] = [];
  let curTs: string | null = null;
  let curSource: string | undefined;
  for (const line of lines) {
    const tsM = line.match(/^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (tsM) { curTs = tsM[1]; curSource = undefined; continue; }
    const srcM = line.match(/^<!--\s*source:\s*(\w+)\s*-->/);
    if (srcM) { curSource = srcM[1]; continue; }
    const meta = parseNodeComment(line);
    if (meta && curTs) {
      nodes.push({
        id: meta.id,
        room,
        blockTs: curTs,
        label: meta.label,
        clusters: meta.clusters,
        source: curSource,
      });
    }
  }
  return nodes;
}
