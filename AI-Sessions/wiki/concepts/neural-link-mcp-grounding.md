---
type: concept
date: 2026-06-15
status: active
---

# Neural Link — MCP grounding 옵션 (에이전트가 그래프를 이해시키는 방법)

> §32 Neural Link 데이터(노드·클러스터·엣지)가 쌓였을 때, **로컬·원격 MCP가 그 관계망을 어떻게 이해하고 활용하게 만들 것인가**. P5 본격 진입 전 옵션 정리.

관련: [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] (D-009)

## Obsidian의 방식 — 사실은 "이해" 아니라 "파싱"

Obsidian은 관계망을 **markdown 안에 인라인 토큰**으로 박아넣어, 외부 도구가 grep만 해도 추출되게 한다.

| 메커니즘 | 어디 사는가 | 외부 도구가 활용하는 법 |
|---|---|---|
| `[[wikilink]]` | 본문 인라인 | regex `\[\[([^\]]+)\]\]` |
| YAML frontmatter (`tags:`, `related:`) | 파일 상단 | YAML 파서 |
| 백링크 | 인덱스(파일 시스템 스캔) | 모든 파일에서 위 패턴 grep |

핵심: Obsidian 그래프 뷰는 **사람용 시각화**일 뿐, 외부 도구·MCP는 항상 **markdown 파일을 직접 파싱**한다. Obsidian의 "이해"는 본질적으로 정규식 매칭이고, 데이터가 markdown에 살기 때문에 가능한 것.

## Cotext가 이미 가진 것

Obsidian과 동형이지만 **그래프 구조까지 인라인**으로 박았다.

| 메커니즘 | 어디 사는가 (정본) | 형태 |
|---|---|---|
| 노드 정체성 | `cotext.md` 블록 인라인 | `<!-- node: id=n_xxxx label="..." clusters=[a,b] -->` |
| 클러스터 레지스트리 | `.cotext/neural.json` | `{ clusters: [{id,name,color,desc}, ...] }` |
| 엣지 | `.cotext/neural.json` | `{ edges: [{from,to,type,viaCluster}, ...] }` |
| 파생 인덱스(빠른 쿼리·크로스 레포) | Supabase (`neural_clusters/nodes/edges`) | 위에서 재생성 가능 |

→ 로컬 MCP는 **레포 파일 두 곳만 읽으면** 그래프 전체 복원 가능.
→ 원격 MCP는 Supabase 인덱스 API로 즉시 쿼리 가능.

## 4가지 옵션

### 옵션 A — MCP가 in-repo 정본 직접 파싱 (Obsidian-style)
- 로컬 cotext-mcp(`packages/cotext-mcp`)가 clone된 레포의 `neural.json` + `cotext.md` 인라인 주석 읽음
- **장점**: 락인 없음·오프라인·기존 패턴 그대로·인터넷 불필요·우리 기존 src/lib/neural 코드 그대로 재사용 가능(Node에서 import)
- **단점**: 단일 레포 한정·인덱스가 큰 경우 매번 파싱(캐시 필요)
- **MCP 도구로 노출하기 좋음**

### 옵션 B — Supabase 인덱스 API 호출 (cross-repo)
- 원격 MCP/`context-api` Edge Function에 그래프 액션 추가: `search_clusters`, `find_related`, `get_cluster_graph`
- 이미 만든 `neural-index` Edge Function(P3 sync/search/reindex)을 확장
- **장점**: 크로스 레포 즉시·빠른 쿼리(GIN 인덱스)·실시간(push 직후 sync됨)
- **단점**: 인터넷 필요·인덱스 최신성 의존(미 push 변경은 안 보임)
- **유료 Neural Link의 핵심 가치 지점**

### 옵션 C — `.cotext/NEURAL_INDEX.md` 자동 생성 (system 프롬프트 grounding)
- push 시 `COTEXT_GUIDE.md`와 동일 패턴으로 `.cotext/NEURAL_INDEX.md`를 비파괴 갱신
- 형태: 클러스터별로 노드 라벨·룸·엣지 카운트를 markdown 표로
- 어떤 MCP·에이전트든 그 한 파일만 읽어도 그래프의 "스카이뷰" 파악
- **장점**: tool-call 없이도 grounding(시스템 프롬프트에 통째로 들어감)·사람도 읽기 좋음·grep도 가능
- **단점**: 큰 그래프엔 부적합(토큰 비용)·최신성=push 시점

### 옵션 D — MCP 도구 함수로 노출 (가장 표준적)
- 로컬·원격 MCP에 동일 인터페이스로:
  - `get_neural_graph(format)` → 전체 그래프 (json|markdown)
  - `find_related(node_id)` → 같은 클러스터·엣지 연결된 노드
  - `search_clusters(query)` → 부분 매칭
  - `get_node_context(node_id)` → 노드의 블록 본문 + 인접 노드 라벨까지
- 에이전트가 필요할 때 호출(`function-calling`)
- **장점**: 토큰 절약(필요할 때만 fetch)·정확·표준
- **단점**: 에이전트가 적극적으로 호출해야 함(시스템 프롬프트 grounding 보다 patient)

## 추천 조합

| 레이어 | 옵션 | 이유 |
|---|---|---|
| 로컬 cotext-mcp | **A + D** | 정본 파싱 + 표준 도구. 클라이언트 없이 cli 환경에서 동작 |
| 원격 context-api | **B + D** | Supabase 인덱스로 크로스 레포 + 표준 도구. 유료 가치 지점 |
| 모든 환경 보조 | **C** | `NEURAL_INDEX.md` 자동 생성으로 grounding 비용 0 |
| AgentPanel 임베드 | (직접) | 클라이언트가 이미 graph state 보유 → system 프롬프트에 직접 직렬화(P5.3) |

## Obsidian 대비 차별점

1. **에이전트 1급**: Obsidian의 그래프 뷰는 사람용. 우리는 **MCP 도구 + system grounding**을 1급으로 설계.
2. **크로스 레포**: Obsidian vault는 단일 폴더. 우리는 Supabase 인덱스로 여러 레포 가로지름.
3. **클러스터 우선**: Obsidian의 freelink는 헤어볼이 되기 쉬움. 우리는 클러스터를 1차 단위로 — 엣지가 적어도 응집력 있는 그래프.
4. **provenance**: 블록의 `source` 태그가 노드에 그대로 따라옴 → 에이전트가 "사람 생각 vs AI 생성" 구분 가능.

## P5 작업 매핑

P5는 위 옵션들을 단계별로 구현:
- P5.1 = 옵션 A + D (로컬 cotext-mcp 도구 추가)
- P5.2 = 옵션 B + D (원격 context-api 그래프 액션)
- P5.3 = AgentPanel system 프롬프트 자동 grounding (직접)
- P5.4 = 옵션 C (`.cotext/NEURAL_INDEX.md` 자동 생성)

순서는 작업량·가치 비교 후 결정. P5.4가 가장 ROI 높을 가능성(작업 작고 모든 환경에 즉시 효과). P5.1이 그다음(로컬 MCP는 이미 5개 도구 보유 — 추가만 하면 됨). P5.2·P5.3는 그 위에 얹기.
