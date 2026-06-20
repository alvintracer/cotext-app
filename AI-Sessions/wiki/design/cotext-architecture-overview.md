---
type: design
date: 2026-06-20
status: active
tags: [architecture, wiki, mindsync, neural-link, mcp]
---

# Cotext 전체 아키텍처 — Wiki → Graph → Sync 흐름

## Summary

지식그래프는 **4가지 경로**로 만들어지고 수정된다:

| # | 경로 | 누가 | 방식 |
|---|------|------|------|
| ① | **Studio 에디터** | 유저 직접 | MindSync에서 노드 삭제, 엣지 연결/해제 → 3단계 동기화 |
| ② | **LLM 추출** | Cotext Model / BYOK | 텍스트 업로드 → LLM이 노드·엣지·클러스터 자동 추출 → 머지 |
| ③ | **Wiki 컴파일** | 컴파일러 자동 | `[[link]]`→엣지, frontmatter→클러스터 → push 시 자동 재컴파일 |
| ④ | **LLM Enrich** | LLM 수동 | 기존 뼈대 위 숨겨진 의미 엣지 추론 → 덧붙임 |

4가지가 모두 **같은 `mergeGraphs()` 로직**과 **같은 3단계 동기화**(neural.json → INDEX.md → Supabase)를 거치므로 결과가 수렴한다.

핵심 원칙 3가지:
1. **레포 = 유일한 동기화 버스** — 에이전트끼리 직접 sync하지 않는다.
2. **4경로 수렴** — 수동 편집이든 자동 컴파일이든, 최종 정본은 `.cotext/neural.json` 하나.
3. **결정론적 뼈대 + 사람 편집 + LLM 살붙이기** — 자동·수동·AI가 공존.

---

## 3계층 구조

### 1계층: 저작 (사람/에이전트가 직접 쓰는 곳)

```
프로젝트 레포/
├── CLAUDE.md              ← 업무 규약 (AI가 먼저 읽음)
├── AGENTS.md              ← 멀티 에이전트 공유 규약
├── START_HERE.md           ← 오리엔테이션
├── index.md               ← 전체 문서 지도
├── log.md                 ← 작업 로그
│
├── AI-Sessions/
│   ├── raw/               ← 불변 원본 (절대 수정 금지)
│   ├── conversations/     ← 세션 인수인계
│   └── wiki/              ← 가공된 지식
│       ├── sources/       ← raw 요약
│       ├── concepts/      ← 용어/프레임워크
│       ├── decisions/     ← 의사결정 + 근거
│       ├── errors/        ← 실패 기록
│       ├── projects/      ← 프로젝트 진행
│       ├── design/        ← 설계 가이드
│       └── dev-tasks/     ← 개발 작업
│
└── prompts/               ← save/ingest/query/lint 명령 프롬프트
```

**작성 규칙:**
- 문서 간 연결은 `[[name]]`으로 적는다 → 컴파일러가 엣지로 변환
- frontmatter에 `type`/`tags`를 넣는다 → 컴파일러가 클러스터로 변환
- `save` 전에 5조건 필터를 확인 (일회성 답변은 저장하지 않음)

### 2계층: 그래프 생성/변환 — 4가지 쓰기 경로

#### 경로 ① Studio 에디터 (유저 수동)
MindSync 그래프 에디터에서 유저가 **직접** 노드 삭제, 엣지 연결/해제:
```
유저가 에디터에서 노드 클릭 → 엣지 연결/해제/삭제
  ↓
saveWorkspaceGraph() → 3단계 동기화
```

#### 경로 ② LLM 추출 (텍스트 → 그래프)
파일 업로드 → LLM이 텍스트에서 **노드·엣지·클러스터를 자동 추출**:
```
PDF/이미지/텍스트 업로드 → Edge Function(Cotext Model) 또는 BYOK
  ↓  LLM이 텍스트 분석 → 노드·관계·클러스터 추출
  ↓
추출된 그래프 → mergeGraphs() → 3단계 동기화
```

#### 경로 ③ Wiki 컴파일 (마크다운 → 그래프, 자동)
마크다운의 `[[link]]`와 frontmatter를 기계적으로 변환:
```
마크다운 파일
  ↓  [[wikilink]] → 엣지 (source: 'wiki')
  ↓  frontmatter type/tags → 클러스터
  ↓  각 파일 → 노드
  ↓  미해결 [[X]] → stub 노드
  ↓
neural.json (멱등 재컴파일)
```
세 가지 트리거: GitHub Action(push 시) / `npm run neural:compile`(수동) / Studio 머지.
**멱등성:** 이전 wiki 슬라이스만 교체, Studio 노드·LLM 엣지 보존, dangling 정리.

#### 경로 ④ LLM Enrich (의미 엣지 추론, 수동)
- 컴파일된 뼈대 위에 LLM이 "명시적으로 연결 안 됐지만 의미상 관련된" 엣지를 추론 (`source: 'llm'`)
- 노드 추가 없음, 엣지만 추가 (relates / supersedes / supports)
- BYOK 방식 · CI에 넣지 않음 (비용/비결정성 → 봇 churn 방지)

> **핵심:** 4가지 경로 모두 최종적으로 같은 **3단계 동기화**를 거친다.

### 3계층: 정본 + 파생 인덱스

```
.cotext/
├── neural.json        ← 정본 그래프 (4경로가 여기에 수렴)
└── NEURAL_INDEX.md    ← 사람+MCP 읽기용 인덱스

Supabase neural_*     ← 크로스 레포 검색용 파생 인덱스
```

**3단계 동기화** (어떤 경로로든 그래프가 바뀔 때마다):
1. `neural.json` → GitHub push (정본)
2. `NEURAL_INDEX.md` → GitHub push (best-effort)
3. `neuralApi.sync()` → Supabase (best-effort)

---

## 동기화 경로 (누가 어떻게 읽고 쓰나)

### 쓰기 — 4경로가 하나의 정본으로 수렴

```
경로 ①  유저 에디터에서 직접 편집 ─────────────┐
경로 ②  텍스트 업로드 → LLM 추출 ──────────────┤
경로 ③  wiki/*.md ── push ── GitHub Action ────┤ → mergeGraphs()
경로 ④  neural-enrich (LLM 의미 엣지) ─────────┘       │
                                                3단계 동기화
                                         ┌──────┼──────┐
                                         ↓      ↓      ↓
                                   neural.json INDEX  Supabase
```

### 읽기 (그래프 → 소비자)

| 소비자 | 방법 | 용도 |
|--------|------|------|
| **로컬 LLM** (Claude Code 등) | `git pull` | 전체 미러, 읽기+쓰기 |
| **원격 LLM** (Web) | `cotext-mcp` (stdio) | 클론 없이 질의만 |
| **MindSync 글로브** | GitHub API → neural.json | 3D 시각화 + 노드 편집 |
| **크로스 레포 검색** | Supabase neuralApi.search() | 여러 워크스페이스 통합 |

### MCP 서버 (`cotext-mcp`, npm 배포)

8 tools 제공 — **읽기 전용** (그래프 직접 쓰기 금지):

| Tool | 설명 |
|------|------|
| `list_rooms` | 레포 안의 Cotext 룸 목록 |
| `get_room` | 특정 룸 전체 내용 |
| `search_context` | 전체 룸 텍스트 검색 |
| `append_note` | 메모 추가 (유일한 쓰기, 마크다운만) |
| `get_neural_graph` | 지식그래프 전체 반환 |
| `find_related` | 특정 노드의 연관 노드 |
| `search_clusters` | 클러스터 검색 |
| `get_node` | 노드 상세 + 원문 |

---

## Cotext Model (Managed 추출)

Studio 앱에서 "Cotext Model"로 지식 추출 시:

```
Studio 앱 → Edge Function (neural-extract-managed) → LLM API
                     │
              SSE 스트리밍 (progress/chunk/done)
                     │
                     ↓
              추출된 그래프 → mergeGraphs → 3단계 동기화
```

- **프로바이더 추상화:** `readManagedProvider()` → env의 provider/model/key 읽기
- **`runChat()`** 이 provider `shape`(openai/anthropic/gemini)에 따라 분기
- **프로바이더 교체 시 코드 수정 불필요** — env만 바꾸면 됨
- SSE 스트리밍으로 타임아웃 방지 (progress 이벤트가 연결 유지)

---

## 온보딩

새 워크스페이스에 LLM-wiki 구조가 없을 때:

```bash
npm run wiki:init              # 현재 레포
npx tsx scripts/wiki-init.ts --root <dir>  # 다른 레포
```

생성물: 10 폴더(.gitkeep) + 11 시드 파일 + 그래프 컴파일까지 한 번에.
비파괴적 — 기존 파일은 건너뜀 (`--force`로만 덮어씀).

---

## npm 명령 요약

| 명령 | 역할 |
|------|------|
| `npm run wiki:init` | 온보딩 — 구조 생성 + 컴파일 |
| `npm run neural:compile` | 마크다운 → 그래프 재생성 |
| `npm run neural:check` | 그래프 최신 검사 (lint/CI) |
| `npm run neural:enrich` | LLM 의미 엣지 추론 (BYOK) |

---

## 파일 맵 (구현체 위치)

| 파일 | 역할 |
|------|------|
| `scripts/neural-compile.ts` | wiki→graph 컴파일러 |
| `scripts/neural-enrich.ts` | LLM 의미 엣지 enrichment |
| `scripts/wiki-init.ts` | 온보딩 스캐폴드 |
| `.github/workflows/neural-compile.yml` | push 자동 컴파일 Action |
| `src/lib/neural/graph.ts` | `mergeGraphs()`, `parseGraph()`, `serializeGraph()` |
| `src/lib/neural/types.ts` | `NeuralGraph`, `NeuralNode`, `Edge`, `Cluster` 타입 |
| `src/lib/neural/indexMd.ts` | `generateNeuralIndex()` — NEURAL_INDEX.md 생성 |
| `src/lib/knowledge/merge.ts` | Studio↔워크스페이스 3단계 동기화 오케스트레이터 |
| `src/lib/supabase/functions.ts` | `githubApi`, `neuralApi`, `managedKnowledgeApi` |
| `src/pages/KnowledgeStudioPage.tsx` | Studio 메인 페이지 |
| `src/components/NeuralGraphView.tsx` | 2D 그래프 에디터 |
| `packages/cotext-mcp/src/index.ts` | MCP stdio 서버 (npm 배포) |

## Links

- [[mindsync-knowledge-sync-architecture]] — 아키텍처 결정 문서 (상세)
- [[mindsync-ws-integration]] — 통합 리팩터링 + 버그 수정 기록
