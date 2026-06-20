// ============================================================
// Neural Link — core types (P0)
// 결정 D-009 / 계획서 §32
//
// 두 가지 정본(source of truth)을 구분한다:
//  - 노드 정체성 + 클러스터 소속  → cotext.md 블록 인라인 주석 (<!-- node: -->)
//  - 클러스터 레지스트리 + 엣지    → .cotext/neural.json (그래프 집계 파일)
// Supabase 테이블은 위 둘에서 재생성 가능한 "파생 인덱스"일 뿐이다(D-001/D-004 유지).
// ============================================================

/** 클러스터 = 태그형 노드 묶음 (개별 freelink 대신 1차 단위). */
export interface Cluster {
  /** slug id, 예: "pricing" */
  id: string;
  name: string;
  color?: string;
  desc?: string;
}

/** 노드 = 블록(파일 아님). 기존 블록의 timestamp + source 를 재사용. */
export interface NeuralNode {
  /** 안정 id, 예: "n_a1b2c3d4" */
  id: string;
  /** 룸 경로 (예: "general"). 크로스 레포에서는 repo 식별자와 함께 쓰임. */
  room: string;
  /** 블록 헤더 timestamp, 예: "2026-06-15 10:30" — 블록 위치 추적용 */
  blockTs: string;
  label: string;
  /** 소속 클러스터 id 목록 */
  clusters: string[];
  /** provenance — 누가 만들었나 (me | agent | claude | ...) */
  source?: string;
}

/** 노드↔노드 엣지. 클러스터 경유(암묵)는 viaCluster, 직접 연결은 type. */
export interface Edge {
  /** 출발 노드 id */
  from: string;
  /** 도착 노드 id */
  to: string;
  /** 관계 타입 (예: "relates" | "supersedes" | "supports"). 없으면 단순 연관. */
  type?: string;
  /** 클러스터에서 암묵적으로 파생된 엣지면 그 클러스터 id */
  viaCluster?: string;
  /**
   * provenance — 'wiki': [[wikilink]] 결정론적 뼈대, 'llm': 추론된 의미 엣지,
   * undefined: 레거시/수동(Studio 에디터). 재컴파일이 'llm' 엣지를 보존하는 근거.
   */
  source?: string;
}

/** .cotext/neural.json 의 형태 — repo 단위 그래프 집계(정본). */
export interface NeuralGraph {
  version: 1;
  updatedAt: string;
  /** 클러스터 레지스트리(정본) */
  clusters: Cluster[];
  /** 노드 인덱스(비정규화 — 인라인 주석에서 재생성 가능) */
  nodes: NeuralNode[];
  /** 명시적 노드↔노드 엣지(정본) */
  edges: Edge[];
}

/** 블록 인라인 주석에서 읽어들인 노드 메타(룸 컨텍스트 주입 전). */
export interface InlineNodeMeta {
  id: string;
  label: string;
  clusters: string[];
}
