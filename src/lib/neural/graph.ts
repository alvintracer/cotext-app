// ============================================================
// Neural Link — 그래프 집계 (정본: .cotext/neural.json)
//
// 클러스터 레지스트리 + 명시적 엣지를 보관하고, 룸별 인라인 노드를
// 비정규화 인덱스(nodes)로 재생성한다. 모든 함수는 순수(불변)다 —
// UI 버튼(P1)과 MCP 도구(P5)가 동일하게 호출하는 단일 쓰기 경로.
// ============================================================

import type { Cluster, NeuralGraph, NeuralNode } from './types';
import { readInlineNodes } from './format';
import { slugifyClusterId } from './id';

const NEURAL_PATH = 'neural.json';

/** .cotext/ 기준 파일 경로 (folder 기본 ".cotext"). */
export function neuralFilePath(cotextFolder = '.cotext'): string {
  return `${cotextFolder.replace(/\/$/, '')}/${NEURAL_PATH}`;
}

export function emptyGraph(): NeuralGraph {
  return { version: 1, updatedAt: new Date().toISOString(), clusters: [], nodes: [], edges: [] };
}

/** neural.json 문자열 → 그래프 (손상/빈 입력은 빈 그래프). */
export function parseGraph(json: string | null | undefined): NeuralGraph {
  if (!json || !json.trim()) return emptyGraph();
  try {
    const g = JSON.parse(json) as Partial<NeuralGraph>;
    return {
      version: 1,
      updatedAt: g.updatedAt ?? new Date().toISOString(),
      clusters: Array.isArray(g.clusters) ? g.clusters : [],
      nodes: Array.isArray(g.nodes) ? g.nodes : [],
      edges: Array.isArray(g.edges) ? g.edges : [],
    };
  } catch {
    return emptyGraph();
  }
}

/** 그래프 → 안정 직렬화(updatedAt 갱신). */
export function serializeGraph(g: NeuralGraph): string {
  return JSON.stringify({ ...g, version: 1, updatedAt: new Date().toISOString() }, null, 2);
}

// ---- 클러스터 ----------------------------------------------------------

/** 이름으로 클러스터를 upsert. 반환: 갱신 그래프 + 확정 클러스터. */
export function upsertCluster(
  g: NeuralGraph,
  input: { id?: string; name: string; color?: string; desc?: string },
): { graph: NeuralGraph; cluster: Cluster } {
  const id = input.id ?? slugifyClusterId(input.name);
  const existing = g.clusters.find((c) => c.id === id);
  const cluster: Cluster = {
    id,
    name: input.name,
    color: input.color ?? existing?.color,
    desc: input.desc ?? existing?.desc,
  };
  const clusters = existing
    ? g.clusters.map((c) => (c.id === id ? cluster : c))
    : [...g.clusters, cluster];
  return { graph: { ...g, clusters }, cluster };
}

/** 클러스터 삭제 + 노드 소속/암묵 엣지 정리. */
export function removeCluster(g: NeuralGraph, id: string): NeuralGraph {
  return {
    ...g,
    clusters: g.clusters.filter((c) => c.id !== id),
    nodes: g.nodes.map((n) => ({ ...n, clusters: n.clusters.filter((c) => c !== id) })),
    edges: g.edges.filter((e) => e.viaCluster !== id),
  };
}

// ---- 엣지 --------------------------------------------------------------

/** 노드↔노드 엣지 추가(무방향 중복 제거). */
export function linkEdge(g: NeuralGraph, from: string, to: string, type?: string): NeuralGraph {
  if (from === to) return g;
  const exists = g.edges.some(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
  if (exists) {
    return {
      ...g,
      edges: g.edges.map((e) =>
        (e.from === from && e.to === to) || (e.from === to && e.to === from)
          ? { ...e, type: type ?? e.type }
          : e,
      ),
    };
  }
  return { ...g, edges: [...g.edges, { from, to, type }] };
}

/** 노드↔노드 엣지 제거(무방향). */
export function unlinkEdge(g: NeuralGraph, from: string, to: string): NeuralGraph {
  return {
    ...g,
    edges: g.edges.filter(
      (e) => !((e.from === from && e.to === to) || (e.from === to && e.to === from)),
    ),
  };
}

// ---- 노드 인덱스 재생성 -------------------------------------------------

/**
 * 한 룸의 cotext.md 내용으로 그래프의 노드 인덱스를 동기화.
 * 해당 룸 소속 노드만 교체하고 다른 룸 노드는 보존. 사라진 노드를 가리키는
 * 엣지는 제거(정합성). 클러스터 레지스트리/엣지(타 노드)는 유지.
 */
export function syncNodesFromContent(g: NeuralGraph, room: string, content: string): NeuralGraph {
  const roomNodes = readInlineNodes(content, room);
  const others = g.nodes.filter((n) => n.room !== room);
  const nodes = [...others, ...roomNodes];
  const validIds = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => validIds.has(e.from) && validIds.has(e.to));
  return { ...g, nodes, edges };
}

// ---- 조회 (P2 백링크 / P5 에이전트 컨텍스트에서 사용) -------------------

export function getNode(g: NeuralGraph, id: string): NeuralNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

export function clusterMembers(g: NeuralGraph, clusterId: string): NeuralNode[] {
  return g.nodes.filter((n) => n.clusters.includes(clusterId));
}

/** 클러스터 이름/id 부분일치 검색(클러스터 피커 팝업용). */
export function searchClusters(g: NeuralGraph, query: string): Cluster[] {
  const q = query.trim().toLowerCase();
  if (!q) return g.clusters;
  return g.clusters.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  );
}

/**
 * 한 노드의 연관 노드: 같은 클러스터(sameCluster) + 명시적 엣지(linked).
 * 자기 자신은 제외. P2 백링크 패널의 코어.
 */
export function relatedNodes(
  g: NeuralGraph,
  nodeId: string,
): { sameCluster: NeuralNode[]; linked: NeuralNode[] } {
  const self = getNode(g, nodeId);
  if (!self) return { sameCluster: [], linked: [] };

  const sameIds = new Set<string>();
  for (const n of g.nodes) {
    if (n.id === nodeId) continue;
    if (n.clusters.some((c) => self.clusters.includes(c))) sameIds.add(n.id);
  }

  const linkedIds = new Set<string>();
  for (const e of g.edges) {
    if (e.from === nodeId) linkedIds.add(e.to);
    else if (e.to === nodeId) linkedIds.add(e.from);
  }

  const byId = (id: string) => getNode(g, id);
  return {
    sameCluster: [...sameIds].map(byId).filter((n): n is NeuralNode => !!n),
    linked: [...linkedIds].map(byId).filter((n): n is NeuralNode => !!n),
  };
}
