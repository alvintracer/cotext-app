---
type: concept
date: 2026-06-15
status: active
---

# Neural Link — Cotext의 그래프 컨텍스트 레이어

> GitHub-native context capture(Cotext) 위에 얹은 **노드·클러스터·엣지 그래프**.
> 사람·에이전트가 같은 "생각의 묶음·연결"을 보고 협업하기 위한 레이어.

관련: [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] (D-009) · [[AI-Sessions/wiki/concepts/neural-link-mcp-grounding]] · 계획서 §32

---

## 1. 한 줄 요약

Cotext의 markdown 블록에 **인라인 메타데이터**를 박아 노드화하고, **클러스터(타입드 그룹)** 와 **엣지(관련/대체/근거)** 로 묶어, **사람용 그래프 뷰**·**에이전트용 MCP 도구**·**시스템 프롬프트 grounding**을 동시에 제공하는 레이어.

---

## 2. 왜 필요했나

Cotext는 GitHub repo를 컨텍스트 풀로 쓰지만, repo 안 파일들이 평면적이었다. "이 결정이 어떤 다른 결정과 관련되는지", "이 메모는 어떤 주제 묶음에 속하는지" 가 사람·에이전트 모두에게 안 보임. Obsidian의 `[[wikilink]]`·tag·그래프 뷰가 이 문제를 풀어주지만:

- Obsidian의 그래프는 **사람용 시각화** — 에이전트가 직접 활용할 수 없음
- 단일 vault(폴더) 한정, **크로스 레포** 불가
- 자유 링크가 쌓이면 **헤어볼**이 됨

→ 우리는 **에이전트 1급·크로스 레포·클러스터 우선**으로 다시 설계.

---

## 3. 구조 (Architecture)

### 3.1 데이터 모델

| 단위 | 정의 | 정체성 |
|---|---|---|
| **Node** | 1개 markdown 블록(`## YYYY-MM-DD HH:mm`) | `id` (예: `n_a1b2c3d4`) + 블록 timestamp |
| **Cluster** | 타입드 노드 묶음 (태그를 1급으로 승격) | `id` (slug, 예: `pricing`) + name |
| **Edge** | 노드↔노드 명시적 관계 | `from` + `to` + `type` (`relates` / `supersedes` / `supports`) |

핵심 결정: **노드는 파일이 아니라 블록**. 기존 블록의 `timestamp + <!-- source: -->` 기반을 재사용하므로 노드 id는 거의 공짜.

### 3.2 저장 레이어 — 4곳, 모두 한 그래프

```
정본 (in-repo, GitHub-native, 락인 없음)
├─ cotext.md 블록 인라인 주석          ── 노드 정체성·소속
│   <!-- node: id=n_a1b2 label="가격 정책 v2" clusters=[pricing, gtm] -->
└─ .cotext/neural.json                 ── 클러스터 레지스트리 + 명시적 엣지
    { clusters: [...], edges: [...] }

파생 (서버, 빠른 쿼리·크로스 레포, 정본에서 재생성 가능)
├─ Supabase neural_clusters/nodes/edges 테이블 (RLS + GIN 인덱스)
└─ .cotext/NEURAL_INDEX.md            ── 사람·에이전트 둘 다 읽는 markdown 표
    push 시 자동 생성, COTEXT_GUIDE.md 패턴
```

→ 정본이 markdown에 있으니 **Obsidian과 같은 grep-able 성질** 유지. 동시에 Supabase 인덱스로 **크로스 레포·실시간 쿼리** 가능.

### 3.3 단일 쓰기 경로 (사람·에이전트 대칭)

`src/lib/neural`의 순수 함수들이 단일 쓰기 진입점:

```ts
nodifyBlock(content, blockTs, { label, clusters })  // 인라인 주석 작성
upsertCluster(graph, { id, name })                   // 클러스터 등록
linkEdge(graph, from, to, type)                      // 엣지 생성/타입 갱신
unlinkEdge(graph, from, to)                          // 엣지 제거
removeNodeFromBlock(content, blockTs)                // 노드화 취소
syncNodesFromContent(graph, room, content)           // 노드 인덱스 재동기화
```

**UI 버튼(채팅뷰 3-dot, 에디터뷰 선택 popup, 그래프뷰 RingMenu)과 MCP 도구가 모두 이 동일 lib를 호출** — 결과물이 동형이고, 사람 키 없이 동작하고, 에이전트는 같은 경로에 얹는 선택적 자동화.

---

## 4. 특징

1. **노드 = 블록** — 새 ID 발명 없이 기존 블록 정체성 재사용. timestamp 단위라 markdown 변경에도 안정.
2. **클러스터 우선** — freelink 헤어볼 회피. 엣지는 (a) 클러스터 경유 암묵 + (b) 명시적 typed edge 둘 다.
3. **인라인 메타** — 모든 정보가 markdown 안. grep만 해도 추출됨. (Obsidian과 같은 성질 + 그래프 구조까지 인라인)
4. **하이브리드 저장** — 정본=repo, 파생=Supabase. 인덱스 날아가도 repo에서 재생성. 락인 없음.
5. **단일 쓰기 경로** — `nodify/linkEdge/...` 가 사람·에이전트 공용. 결과물 동형.
6. **그래프 = 에디터** — 그래프 뷰에서 노드 삭제·엣지 생성(드래그)·타입 변경 등 모든 편집 가능. 채팅뷰·에디터뷰에서 한 것과 정본 일치.
7. **Provenance** — 블록의 `source` 태그가 노드에도 따라옴. 에이전트가 "사람 생각 vs AI 생성" 구분 가능.
8. **크로스 레포** — Supabase 인덱스로 여러 레포 가로지름(NodeEditor의 elastic 클러스터 검색, NeuralSearchModal).
9. **그래프 뷰 (KYT 스타일)** — d3-force 물리, 클러스터별 색 링, 도넛 4분할 RingMenu(삭제+3 엣지타입 drag-to-link), 엣지 클릭 EdgeMenu(삭제/타입 변경), 묶음 토글(super-node 집계), 우측 디테일 패널, 크로스-룸 점프.
10. **에이전트 grounding 옵션 4종** — A 정본 직접 파싱 / B Supabase API / C `.cotext/NEURAL_INDEX.md` / D MCP 도구 함수. 모두 동작 중.

---

## 5. 효과

| 시나리오 | Before | After (Neural Link) |
|---|---|---|
| "이 결정 관련된 게 뭐 있지?" | 모든 챗 grep | 같은 클러스터·엣지 자동 표시 (블록 아래 "관련" 스트립) |
| 여러 레포 가로질러 같은 주제 | 불가 | 클러스터 검색으로 즉시 |
| 에이전트가 한 주제 깊이 답변 | 첫 N블록 컨텍스트만 | `get_node_context` 도구로 본문 + 인접 노드 라벨까지 |
| Tool-call 없는 에이전트(공유 URL 등) | grounding 없음 | `NEURAL_INDEX.md` 한 파일 로드로 그래프 파악 |
| AgentPanel 답변 품질 | 룸 본문만 grounding | 룸 본문 + 클러스터 인덱스 + 이 챗 노드 + 엣지 자동 주입 |
| 의사결정 추적 | 시간순 | 클러스터·`supersedes` 엣지로 "이 결정이 저 결정 대체" 가시화 |

---

## 6. Obsidian·Roam·Logseq와 비교

| 항목 | Obsidian | Roam | Logseq | **Cotext Neural Link** |
|---|---|---|---|---|
| 정본 | markdown (vault) | proprietary DB | markdown (graph) | **markdown (GitHub repo)** |
| 링크 1차 단위 | `[[wikilink]]` | block ref | block ref | **클러스터(타입드 그룹)** |
| 시각화 | 그래프 뷰 (사람용) | 그래프 + 사이드패널 | 그래프 + 사이드패널 | **그래프 + 디테일 패널 + 그래프=에디터** |
| 에이전트 활용 | grep만(외부 도구) | API 있음 | API 있음 | **MCP 표준 도구 4종 + grounding 옵션 4가지** |
| 멀티 vault/repo | 단일 vault | 단일 graph | 단일 graph | **크로스 레포 (Supabase 인덱스)** |
| Provenance | 없음 (수동 메타) | 없음 | 없음 | **`source` 태그 1급** (사람/Claude/ChatGPT 구분) |
| 백업·이식 | vault 폴더 | export | markdown 폴더 | **GitHub repo (정본)** |
| 락인 | 없음 | 강함 | 없음 | **없음** (Supabase 날아가도 repo에서 재생성) |

핵심 차별: **"인간이 그리는 그래프" 가 아니라 "에이전트가 읽는 그래프"** + **크로스 레포** + **provenance 1급**.

---

## 7. 사용 가이드 (User Guide)

### 7.1 노드 만들기 (3가지 방법)

**A. 블록 3-dot 메뉴**
- 채팅 타임라인에서 메시지 우측 ⋮ → **"노드로 만들기"** → 라벨 입력 + 클러스터 선택/생성 → 저장
- 이미 노드면 "노드 편집" / "노드 해제" 표시

**B. 텍스트 드래그**
- 채팅뷰·에디터뷰 본문 어디서든 텍스트를 드래그
- 위에 **"노드로 만들기"** 떠 있는 버튼 → 클릭 → 선택 텍스트가 라벨로 시드됨
- 노드는 **선택을 감싸는 블록** 단위로 생김 (모델 일관성)

**C. 에이전트 (P5에서 자동화 가능)**
- AgentPanel에서 "이 메모를 'pricing' 클러스터에 묶어줘" 라고 요청 → P5에서 도구콜로 자동 처리

### 7.2 클러스터 검색·생성·재사용

NodeEditor 클러스터 검색은 **elastic** (300ms 디바운스로 Supabase 인덱스 자동 조회):
- 로컬 그래프에 있으면 → 바로 선택
- 다른 챗에서 만든 거면 → "인덱스" 라벨로 노출
- 다른 레포에서 만든 거면 → "다른 레포" 라벨로 노출
- 아예 없으면 → "**'xxx' 새 클러스터**" 버튼으로 즉시 생성

→ slug 기반 결정론적 id라 같은 이름은 cross-repo로 자동 머지.

### 7.3 엣지 (관련·대체·근거)

**채팅뷰**: 노드 블록 ⋮ → "노드 연결" → 다른 노드 검색·선택 + 관계 유형 → 자동 저장(1.5초 디바운스)

**그래프 뷰**: 노드 클릭 → 도넛 4분할 **RingMenu** → 엣지 타입 segment를 **다른 노드로 드래그** → 그 타입의 엣지 생성

엣지 수정/삭제: 그래프뷰에서 엣지 클릭 → **EdgeMenu** → 타입 클릭(변경) 또는 휴지통(삭제)

### 7.4 그래프 뷰

**열기**: 룸 헤더 → "그래프" 버튼

**조작**
- **노드 클릭** → 우측 디테일 패널 (라벨/클러스터/본문/연결 노드)
- **노드 드래그** → 자동 핀 (그 자리 고정)
- 휠 = 줌(커서 기준), 배경 드래그 = 팬
- 배경 클릭 = 선택 해제

**툴바**
- **묶음 ON/OFF** — 같은 클러스터 노드를 super-node 하나로 합치기
- **물리 ON/OFF** — OFF 시 모든 노드 현재 위치에 자동 핀
- **핀 해제** — 모든 노드 자유 운동 재개
- **뷰 리셋** — 줌·팬 리셋

**사이드바**
- 클러스터 색 스와치(클릭→필터)
- 노드·클러스터·엣지 카운트
- 도움말

### 7.5 우측 디테일 패널

노드 선택 시:
- 라벨·룸·source 배지·클러스터 칩
- **블록 본문** (현재 룸 = 로컬, 타 룸 = GitHub fetch + 캐시)
- **연결 노드 목록** — 관계 라벨 배지, 클릭으로 그 노드 선택
- **"이 블록으로 이동"** 버튼 → 그래프 모달 자동 close + 점프

클러스터 super-node 선택 시:
- 색·멤버 수·설명
- 소속 노드 리스트 (클릭으로 노드 디테일 전환)

### 7.6 push로 정본·인덱스 자동 동기화

룸 push 시 자동:
1. `cotext.md` push (블록 + 인라인 노드 주석)
2. `.cotext/neural.json` push (재페치 머지 → 다른 룸 안 깨짐)
3. `.cotext/NEURAL_INDEX.md` push (사람·에이전트용 markdown 표)
4. Supabase 인덱스 sync (`neuralApi.sync` — 크로스 레포 검색용)

엣지 편집은 별도로 1.5초 디바운스 자동 persist (`neural.json` 만 → 콘텐츠 push 무관).

---

## 8. MCP 연결 가이드

### 8.1 두 가지 모드

| | 로컬 모드 | 원격 모드 |
|---|---|---|
| 데이터 원천 | clone된 repo의 `.cotext/` 파일 | `context-api` Edge Function → Supabase 인덱스 + GitHub |
| 인증 | 없음 (로컬 파일) | `COTEXT_API_KEY` (워크스페이스 사이드바에서 발급) |
| 인터넷 | 불필요(오프라인 가능) | 필요 |
| 크로스 레포 | ❌ 한 레포 | ⚠️ key는 워크스페이스 한정(여러 키로 가능) |
| 추천 | 노트북에 repo clone되어 있는 경우 | clone 못/안 하는 환경 |

### 8.2 설치

```bash
# 단발 실행
npx cotext-mcp

# 글로벌 설치
npm i -g cotext-mcp
```

### 8.3 Claude Code / Claude Desktop

`claude_desktop_config.json` (또는 Claude Code 설정):

```jsonc
{
  "mcpServers": {
    "cotext": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"],
      "cwd": "/path/to/your/cotext-repo"   // 로컬 모드
    }
  }
}
```

원격 모드:
```jsonc
{
  "mcpServers": {
    "cotext-remote": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"],
      "env": {
        "COTEXT_API_KEY": "ctx_xxxxxxxx...",
        "COTEXT_API_URL": "https://qyyqsuzqstkhnrmyqskn.supabase.co/functions/v1/context-api"
      }
    }
  }
}
```

### 8.4 Cursor

`.cursor/mcp.json`:
```jsonc
{ "mcpServers": { "cotext": { "command": "npx", "args": ["-y", "cotext-mcp"] } } }
```

### 8.5 도구 일람 (Neural Link 부분)

| 도구 | 용도 |
|---|---|
| `get_neural_graph` | 그래프 스냅샷 (`format: summary \| markdown \| json`) |
| `find_related` | 한 노드의 같은 클러스터 + 엣지 연결 노드 |
| `search_clusters` | 클러스터 이름·id substring 검색 |
| `get_node_context` | 노드 메타 + 블록 본문 + 인접 노드 라벨 (grounding에 이상적) |

리소스: `cotext://neural-index` (= `NEURAL_INDEX.md`)

### 8.6 활용 패턴

**A. 그라운딩 (어떤 주제 답변 전에)**
```
1. get_neural_graph(format: 'summary')  → 어떤 클러스터들이 있는지 파악
2. search_clusters('pricing')           → 관련 노드 후보 발견
3. get_node_context(node_id)            → 본문 + 인접 노드 라벨까지 묶어 답변
```

**B. 한 주제의 모든 결정 추적**
```
1. search_clusters('billing')           → 그 클러스터의 모든 노드
2. find_related(latest_node)            → supersedes 엣지로 "최신 결정"인지 확인
```

**C. tool-call 없는 환경** (공유 URL 등)
- `NEURAL_INDEX.md` 를 시스템 프롬프트에 통째로 → grounding 비용 0

### 8.7 임베드 AgentPanel (Cotext 앱 안)

Cotext 앱의 우측 AgentPanel은 별도 설정 없이 **자동 grounding**:
- 패널 열 때 `neural.json` 로드
- 시스템 프롬프트에 클러스터 인덱스 + 현재 챗 노드 + 닿는 엣지 자동 주입 (1.5KB 캡)

---

## 9. 개발자 레퍼런스

### 9.1 데이터 포맷

**블록 인라인 노드 주석**
```markdown
## 2026-06-15 10:30
<!-- source: me -->
<!-- node: id=n_a1b2c3d4 label="가격 정책 v2" clusters=[pricing, gtm] -->

본문...
```

**`.cotext/neural.json`**
```json
{
  "version": 1,
  "updatedAt": "2026-06-15T10:30:00.000Z",
  "clusters": [
    { "id": "pricing", "name": "Pricing", "color": "#3b9eff", "desc": "..." }
  ],
  "nodes": [],
  "edges": [
    { "from": "n_a1b2c3d4", "to": "n_c3d4e5f6", "type": "relates" }
  ]
}
```
(`nodes` 는 비정규화 인덱스 — push 시 cotext.md 인라인 주석에서 재생성)

**Supabase 테이블**
- `neural_clusters` (workspace_id, cluster_id, name, color, description)
- `neural_nodes` (workspace_id, node_id, room, block_ts, label, clusters[], source) — GIN(`clusters`)
- `neural_edges` (workspace_id, from_node, to_node, type, via_cluster)
- 모두 RLS = `user_id = auth.uid()`

### 9.2 lib API (`src/lib/neural`)

- 타입: `NeuralNode`·`Cluster`·`Edge`·`NeuralGraph`·`InlineNodeMeta`
- 인라인 주석: `nodifyBlock`·`removeNodeFromBlock`·`parseNodeComment`·`readInlineNodes`·`extractBlockText`·`findEnclosingBlockTs`
- 그래프: `emptyGraph`·`parseGraph`·`serializeGraph`·`upsertCluster`·`removeCluster`·`linkEdge`·`unlinkEdge`·`syncNodesFromContent`·`relatedNodes`·`clusterMembers`·`searchClusters`
- 직렬화/경로: `neuralFilePath`·`neuralIndexFilePath`·`generateNeuralIndex`
- ID: `newNodeId`·`slugifyClusterId`

### 9.3 Edge Functions

**`neural-index`** (인증된 사용자 — JWT)
- `action: 'sync'` — 클라이언트 그래프 → 인덱스 (워크스페이스 단위 교체)
- `action: 'search'` — 사용자 전체 워크스페이스 가로지르는 클러스터·노드 검색
- `action: 'reindex'` — 서버가 GitHub 직접 읽어 재구축

**`context-api`** (API 키 ctx_xxx)
- `GET /neural/graph?format=summary|json|markdown`
- `GET /neural/find_related?node_id=...`
- `GET /neural/search_clusters?q=...`
- `GET /neural/node?id=...`

### 9.4 그래프 뷰 컴포넌트 (`NeuralGraphView.tsx`)

d3-force 기반. 핵심 인터랙션:
- 노드/엣지 클릭 vs 드래그 = 4px 모션 임계
- 노드 RingMenu: top=Delete, right=Relates, bottom=Supersedes, left=Supports (흰 Phosphor 아이콘)
- 드래그 투 링크: `document` 레벨 pointermove + `elementFromPoint`로 drop target 탐지
- 묶음 모드: 같은 첫 클러스터 노드 → super-node 머지 (반지름·점선 halo)
- 우측 디테일 패널: 노드(메타+본문+연결) / 클러스터(멤버 리스트)

---

## 10. 로드맵 / 후속

§32 P0~P5 일단 완료. 후속 가능 항목:

- 그래프 뷰: 미니맵·클러스터 hull halo·물리 파라미터 슬라이더
- 에이전트 자동 클러스터링 제안(노드 만들 때)
- 엣지 자동 추론(코사인 유사도 기반 weak edge 후보)
- NEURAL_INDEX.md를 COTEXT_GUIDE.md 안에서 자동 링크
- AgentPanel grounding을 토큰 예산 동적 조정(큰 그래프 대비)
- 그래프 임포트/익스포트(다른 도구 호환)

---

## 11. 핵심 결정 한 줄

> **"인간이 그리는 그래프"가 아니라 "에이전트가 읽는 컨텍스트 그래프"** + **사람·에이전트가 같은 단일 쓰기 경로** + **repo 정본·인덱스 파생** — Obsidian 패리티 기능을 GitHub-native·멀티에이전트 축 위에 얹어 다른 물건이 됨.

전체 결정 근거: [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] D-009.
