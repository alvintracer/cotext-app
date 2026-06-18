import { relatedNodes, type NeuralNode } from '../neural';
import type { KnowledgeSnapshot } from './session';

export interface ThinkHit {
  ref: string;
  nodeId: string;
  label: string;
  room: string;
  blockTs: string;
  text: string;
  clusters: string[];
  score: number;
  reasons: string[];
  related: Array<{ id: string; label: string }>;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) || []).filter((token) => token.length > 1);
}

function countMatches(haystack: string, needles: string[]): number {
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const needle of needles) {
    if (lower.includes(needle)) score += 1;
  }
  return score;
}

function clusterNames(snapshot: KnowledgeSnapshot, ids: string[]): string[] {
  const map = new Map(snapshot.graph.clusters.map((cluster) => [cluster.id, cluster.name]));
  return ids.map((id) => map.get(id) || id);
}

function rankNode(snapshot: KnowledgeSnapshot, node: NeuralNode, query: string, tokens: string[]): ThinkHit | null {
  const text = snapshot.nodeTextById[node.id] || snapshot.blockTextByKey[`${node.room}::${node.blockTs}`] || '';
  const names = clusterNames(snapshot, node.clusters);
  const labelMatches = countMatches(node.label, tokens);
  const clusterMatches = countMatches(names.join(' '), tokens);
  const textMatches = countMatches(text.slice(0, 3000), tokens);
  const phraseMatch = query.trim() && (node.label.toLowerCase().includes(query.toLowerCase()) || text.toLowerCase().includes(query.toLowerCase())) ? 1 : 0;
  const score = labelMatches * 8 + clusterMatches * 5 + textMatches * 2 + phraseMatch * 10;
  if (score <= 0) return null;

  const rel = relatedNodes(snapshot.graph, node.id);
  const related = [...rel.linked, ...rel.sameCluster]
    .slice(0, 5)
    .map((item) => ({ id: item.id, label: item.label }));
  const reasons: string[] = [];
  if (phraseMatch) reasons.push('phrase');
  if (labelMatches) reasons.push('label');
  if (clusterMatches) reasons.push('cluster');
  if (textMatches) reasons.push('text');

  return {
    ref: '',
    nodeId: node.id,
    label: node.label,
    room: node.room,
    blockTs: node.blockTs,
    text,
    clusters: names,
    score,
    reasons,
    related,
  };
}

export function searchKnowledgeSnapshot(snapshot: KnowledgeSnapshot, query: string, limit = 8): ThinkHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = tokenize(trimmed);
  return snapshot.graph.nodes
    .map((node) => rankNode(snapshot, node, trimmed, tokens))
    .filter((hit): hit is ThinkHit => !!hit)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((hit, index) => ({ ...hit, ref: `S${index + 1}` }));
}

export function buildThinkSystem(ko: boolean, hits: ThinkHit[], query: string): string {
  const context = hits.map((hit) => [
    `[${hit.ref}] ${hit.label}`,
    `room=${hit.room}`,
    `block=${hit.blockTs}`,
    `clusters=${hit.clusters.join(', ') || '-'}`,
    `related=${hit.related.map((item) => item.label).join(', ') || '-'}`,
    hit.text ? `text:\n${hit.text.slice(0, 2200)}` : 'text:\n(no body available)',
  ].join('\n')).join('\n\n---\n\n');

  return ko
    ? `너는 Cotext Knowledge Think 모드다.
사용자 질문에 대해 오직 제공된 근거만 사용해서 답하라.
규칙:
- 과장하지 말고, 근거 없는 추론은 "추정"이라고 표시하라.
- 정보가 부족하면 반드시 "현재 근거로는 알 수 없음"을 명시하라.
- 답변 끝에 "Sources:" 줄을 만들고 사용한 source ref만 나열하라. 예: Sources: [S1], [S3]
- source ref는 제공된 컨텍스트의 [S#]만 사용하라.

질문:
${query}

근거:
${context}`
    : `You are Cotext Knowledge Think mode.
Answer using only the provided evidence.
Rules:
- Do not overclaim; label any weak inference as "inference".
- If the evidence is insufficient, explicitly say "I can't tell from the current evidence."
- End with a "Sources:" line listing only the refs you used, e.g. Sources: [S1], [S3]
- Only use the [S#] refs from the context.

Question:
${query}

Evidence:
${context}`;
}
