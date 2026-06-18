---
type: project
date: 2026-06-16
status: active
---

# Cotext Knowledge Studio — GBrain-level 진화 수행 계획

## Summary

[Knowledge Studio](cotext-knowledge-studio.md)의 현재 구현은 **격리된 staging 페이지 + 텍스트 추출 + 휴리스틱 그래프 생성**까지의 1차 scaffolding이다. 이를 [GBrain 수준](../../raw/g-brain-reference.md)의 **LLM 기반 의미 지식 그래프 + 점진적 augment + think 모드**로 끌어올리는 단계별 수행 계획. Phase 1·2는 이미 구현됨(이 문서 작성 시점).

관련: [[neural-link-overview]] · [[cotext-neural-link-second-brain-ko]] · [[cotext-knowledge-studio]]

---

## 1. 현재 한계 (왜 Phase 3가 핵심인가)

`generateKnowledgeGraph()`는 LLM이 아니라 **휴리스틱**이다:
- 키워드 빈도 + stopword 제거 + heading split + n-gram 교집합
- "스타트업 가격 정책" ≠ "B2B 과금 전략" (의미 동일·키워드 다름) → 다른 클러스터로 갈라짐
- 노드 라벨이 "Section 1" 같은 placeholder로 남는 경우 잦음
- 한국어 stopword 하드코딩 부족·과잉 양쪽 다 발생 → 노이즈

→ **현재는 "텍스트 추출 + 1차 grouping"까지만 정확. 의미 지식 그래프가 아님.** GBrain 수준이 되려면 LLM 통합 필수.

## 2. GBrain 갭 분석

| 항목 | GBrain | 현재 Studio | 갭 |
|---|---|---|---|
| 엔티티 추출(사람·회사·개념) | LLM | 키워드 빈도 | **결정적 차이** |
| 의미 기반 관계 추론 | ✅ | n-gram 교집합 | 결정적 |
| 갭 분석(모르는 것 인정) | ✅ | ❌ | 신뢰도 |
| 점진적 augment | ✅ | ❌ 1회성 | UX |
| Vector + keyword hybrid 검색 | ✅ | ❌ | 검색 품질 |
| think 모드(출처 달린 종합 답변) | ✅ | ❌ 시각화만 | 핵심 가치 |
| 팀 모드 권한 | ✅ | ✅ 워크스페이스 멤버십(D-009/팀 워크스페이스 옵션 B) | 동등 |

## 3. 수행 계획 — Phase 1~5

### Phase 1: BYOK LLM picker  ✅ 구현 완료
- AgentPanel의 BYOK localStorage(`cotext-llm-keys`, `cotext-llm-pref`)와 같은 store 재사용 — 사용자 키 한 번만 입력
- Knowledge Studio 페이지 상단에 provider/model 선택 + 키 입력 바
- 현재 Phase 3 미구현이라 picker는 **저장만, 사용 안 함** (자리 잡아두기)
- Gemini 무료 티어 표시
- 구현: `src/pages/KnowledgeStudioPage.tsx` (BYOK 섹션)

### Phase 2: 업로드 파이프라인 강화  ✅ 구현 완료
- **사이즈 가드** — 파일당 20MB / 세션 합계 80MB / 최대 30개
  - 클라이언트 측 검증, 거부 사유 명시 (`MAX_FILE_BYTES`/`MAX_TOTAL_BYTES`/`MAX_FILE_COUNT`)
- **빈 파일 자동 제외**
- **교차 문서 dedupe** — 동일 paragraph(정규화 hash)가 이전 문서에 나오면 후속 문서에서 제거. 키워드 통계 오염 방지(boilerplate·서명·반복 헤더).
- 거절 사유 UI 배너로 표시
- 구현: `KnowledgeStudioPage.tsx` (`dedupeAcrossDocs`, `handleFiles` guards)

### Phase 3: LLM 기반 지식 그래프 추출  ✅ 구현 완료 (2026-06-17, v3 spec)

**구현 위치**: `src/lib/knowledge/llmExtract.ts` (lib) + `src/pages/KnowledgeStudioPage.tsx` (UI 통합)

**v3 fail-safe 3가지 모두 적용**:
1. **Chunked Relay** — `chunkText()` 가 heading→paragraph 경계 우선 ~3000자 분할, 청크 간 200자 tail overlap으로 연속성 유지
2. **JSON Repair Engine** — `repairAndParseJson()` 가 codefence strip → `{...}` 슬라이스 → trailing comma 제거 → single→double quote 보정 → shape 검증(`validateShape`) 4단계 점진 복구
3. **Active Capture 위에서만** — 사용자 명시 업로드만 처리, ambient 없음

**구조**:
- `generateKnowledgeGraphLLM(sources, llmConfig, callbacks)` — 메인 진입점
- 청크별 순차 호출(release 1.0은 sequential, 비용 예측 + abort 친화적)
- `mergeExtraction()` — 점진적 머지 (같은 slug id 재사용, 클러스터 dedupe, dangling edge 자동 폐기)
- **갭 분석(`runGapAnalysis`)** — v3 Anti-Blackbox 시그니처. 최종 그래프 + 5개 누락 영역 LLM 호출 → JSON array 응답 (실패해도 graph는 정상 반환)
- 부분 실패 격리 — chunk 단위 실패가 전체 흐름 차단 안 함, `failures[]` 로 별도 보고
- AbortController 지원 (사용자 취소 즉시 반영)

**프롬프트**:
- system: JSON-only, slug-style stable ids, evidence verbatim quote, kind=concept|person|org|product|event
- user: existing graph 요약(클러스터 30개·노드 50개 limit) 동봉 → 재사용 강제
- 한/영 동시 처리(라벨 언어 그대로)

**UI 통합**:
- BYOK toggle "LLM 추출 사용" (키 없으면 비활성, 자동 휴리스틱 폴백)
- 실시간 진행 strip (청크 N/M + source·chunk 메시지 + progress bar)
- 청크 실패 batch 리스트 (warning banner, 부분 graph는 사용 가능)
- 갭 분석 결과 별도 panel (Brain icon)
- 생성 도중 "취소" 버튼 (AbortController)
- 에러 banner (네트워크/키)

**검증**:
- 청킹: 헤딩 기반 분할 + 오버플로 hard slice 정상
- JSON 복구: 4가지 깨진 입력(codefence, trailing comma, single quotes, prose prefix) 모두 통과, 비 JSON 정상 NULL
- tsc/빌드/lint 0
- CSS 13개 신규 규칙 라이브 번들 반영 확인

**트랙 B(매니지드) 후속**:
- 같은 lib를 서버에서 호출하는 형태로 확장 예정
- 마진율 100% 종량제 (v3 §3 가격 매트릭스)
- 깨진 JSON에 대한 LLM 1회 재시도 추가 (v3 §5 마지막 fail-safe)
- 별도 phase로 작업

#### 3-A. 청킹 전략 (옛 계획, 위로 통합됨)

이게 진짜 작업. 휴리스틱 → LLM 교체.

#### 3-A. 청킹 전략
- LLM context limit 고려(8K~128K window)
- 문서를 ~3000자 청크로 분할 (heading 우선, 경계 보존)
- 청크별 metadata: `{file_name, chunk_index, total_chunks}`

#### 3-B. 프롬프트 엔지니어링 — JSON schema 강제
입력: 청크 텍스트 + (옵션) 이전 청크들의 기존 노드/클러스터 요약
출력:
```json
{
  "entities": [{ "id": "...", "label": "...", "kind": "person|org|product|concept", "attrs": {} }],
  "relations": [{ "from": "...", "to": "...", "type": "works_at|invests_in|supersedes|relates|supports", "evidence": "..." }],
  "clusters": [{ "id": "slug", "name": "...", "members": ["entity_id", ...] }]
}
```
- system 프롬프트에 우리 `<!-- node: -->`/`neural.json` 스키마 명시 → 변환 비용 0
- 한국어 문서 품질 위해 한국어 few-shot 예제 필수

#### 3-C. 점진적 머지 (incremental augmentation)
- 첫 청크: blank state → 그래프 생성
- 이후 청크: 기존 그래프 요약을 system에 넣어 "같은 entity면 reuse, 새것이면 추가"하도록 강제
- 결정론적 entity matching: name normalization(소문자·trim·동의어) → id 충돌 시 머지
- LLM이 "같은 것"이라 판단한 라벨 그룹은 LLM 응답에서 직접 mapping 받음

#### 3-D. 갭 분석 (GBrain 시그니처 기능)
- 마지막 청크 처리 후 LLM에게 "이 그래프에서 부족/모호한 부분 5개 알려줘" 호출
- UI에 "추가로 필요한 정보" 패널로 표시
- "모르는 것을 모른다고 인정"하는 신뢰도 신호

#### 3-E. 비용 가드
- 모델별 토큰 카운트 미리 보여주기
- "이 파일은 ~$0.12 정도 듭니다" preview
- 청크 처리 진행률 + abort 버튼

**추정**: 2~3일 (프롬프트 튜닝 + 머지 로직이 큼)

### Phase 4: Studio → Workspace 머지  ✅ 구현 완료 (2026-06-17)

**구현 위치**:
- `src/lib/neural/graph.ts` — `mergeGraphs(base, incoming): { graph, stats }` 순수 헬퍼
- `src/lib/knowledge/merge.ts` — `previewWorkspaceMerge` + `executeWorkspaceMerge` 오케스트레이터
- `src/pages/KnowledgeStudioPage.tsx` — 머지 모달(워크스페이스 선택 → 미리보기 → 실행)

**머지 정책 (정본 우선)**:
- 클러스터 id 충돌 → **기존 name/color/desc 보존**, blank만 incoming으로 채움
- 노드 id 충돌 → **기존 label/room/blockTs 보존**, clusters 배열 union
- 엣지 (from,to) 충돌 → linkEdge dedupe + type 갱신
- **Dangling 엣지(양 끝 노드 누락) → 폐기** (`stats.droppedEdges` 카운트)
- `updatedAt` 갱신

**3단계 실행 (각각 best-effort)**:
1. `.cotext/neural.json` push (sha 체크포인트, 충돌 방지)
2. `.cotext/NEURAL_INDEX.md` 재생성 + push (option C grounding)
3. Supabase `neuralApi.sync` (크로스 레포 검색용)
- 각 단계 결과를 `MergeResult.pushed.*` 에 boolean으로 보고 → 부분 실패도 사용자가 인지

**UI 흐름**:
- "워크스페이스에 머지" 버튼 (그래프 생성 후 + 멤버 워크스페이스 있을 때만 활성)
- 모달: 워크스페이스 드롭다운 → "머지 미리보기" → diff 통계(+N 클러스터/노드/엣지, 머지된 수, 폐기된 엣지) → 정본 우선 원칙 안내 → "머지 실행"
- 성공 화면: 3단계 체크리스트 + "워크스페이스 열기" 버튼

**Studio 노드의 정본 거주 처리**:
- Studio 노드는 합성 `room=파일명`, `blockTs="chunk N/M"` — 워크스페이스의 어떤 cotext.md에도 inline `<!-- node: -->` 주석으로 안 박힘
- 그러나 `syncNodesFromContent`가 room 단위로만 nodes를 재생성하므로 Studio room은 영향 없음 → **neural.json만 거주하는 영구 노드**가 됨
- 결과: 그래프 뷰에 표시·MCP/검색에 잡힘. 다만 "블록으로 이동" 시 빈 본문 (의도된 한계, Studio 노드는 그래프 라벨 전용)

**검증 (smoke 5/5 통과)**:
- 기존 클러스터 이름 보존 ✓ (`Pricing` ← `Pricing (alt name)` 차단)
- 기존 노드 라벨·room 보존 ✓
- clusters 배열 union ✓
- 신규 +N 정확 카운트 ✓
- dangling 엣지 폐기 ✓
- tsc/빌드/lint 0
- CSS 16개 신규 규칙 라이브 반영

### Phase 4 (옛 계획) — 저장 전략 결정 근거

| 단계 | 저장 위치 | 이유 |
|---|---|---|
| **Studio 작업 중 (drafting)** | Supabase 임시 테이블 `knowledge_studio_sessions` (expires_at 30일) | 휘발성. 사용자 검토 중. GitHub 더럽히지 않음 |
| **사용자가 "내 Cotext에 합치기" 누르면** | 워크스페이스 `.cotext/neural.json` + Supabase 인덱스 + `NEURAL_INDEX.md` | 기존 정본 패턴 그대로. Neural Link와 통합 |

**Neo4j는 안 씀** — Cotext 원칙(repo=정본, Supabase=파생) + ~수천 노드 규모는 PostgreSQL/GIN으로 충분 + 락인 회피.
**별도 레포도 안 씀** — 사용자가 원할 때 기존 워크스페이스에 머지.

머지 시 충돌 해결:
- 같은 cluster id가 워크스페이스에 이미 있으면 → 노드만 추가
- 같은 node id 충돌 → label·source 우선순위로 자동 해결, 모호하면 사용자 확인
- 머지 결과 preview → diff 표시 → 사용자 확인 후 push

**추정**: 1.5일

### Phase 5: think 모드  ✅ 구현 완료 (2026-06-17, Codex + 후속 폴리시)

**구현 위치**:
- `src/lib/knowledge/session.ts` — Studio 결과를 localStorage(`cotext-knowledge-snapshot`)에 휘발성 저장
- `src/lib/knowledge/think.ts` — `searchKnowledgeSnapshot()` 하이브리드 랭킹(라벨 8점 / 클러스터 5점 / 본문 2점 / 정확 구문 +10) + `buildThinkSystem()` 인용 강제 프롬프트
- `src/pages/KnowledgeThinkPage.tsx` — BYOK 선택, 질문 입력, 근거 카드 패널, 답변 패널 + clickable [S#] + 그래프 보기
- 라우트 `/knowledge-think` (App.tsx)

**파이프라인**:
1. Studio에서 그래프 생성 시 `saveKnowledgeSnapshot` 자동 호출
2. Think 페이지 진입 → 최근 스냅샷 로드
3. 사용자 질문 → 로컬 하이브리드 랭킹으로 top 8 근거 추출 (LLM 비용 0)
4. BYOK LLM으로 시스템 프롬프트(근거 + 인용 규칙) + "근거에서 답변" 메시지 호출
5. 답변에 `[S#]` 토큰 → UI에서 각 근거 카드로 점프(스크롤 + flash)
6. 토큰 사용량/비용 표시

**Codex 베이스 + 보강 (이번 세션)**:
- `Fragment` + `useMemo` 기반 답변 파서: `[S#]` 토큰을 클릭 가능 버튼으로 분리, 없는 ref는 disabled 표시
- 근거 카드에 ref 등록(`hitRefs`) + `scrollToHit` 점프 + 1.2초 accent 플래시
- 헤더에 "그래프 보기" 버튼 → snapshot graph를 `NeuralGraphView`로 즉시 시각화 (`blockTextByKey` 그대로 매핑)
- CSS: `knowledge-think-ref` 클릭 가능 칩, `hit-flash` 점프 강조

**Anti-Blackbox 원칙 적용**:
- 답변은 오직 추출된 근거만 사용 (system 프롬프트로 강제)
- 부족하면 "현재 근거로는 알 수 없음" 명시
- 모든 인용은 [S#]로 추적 가능 → 사용자가 출처를 직접 검증

**검증**: tsc/빌드/lint 0, preview 콘솔 0, 11개 신규 CSS 라이브 반영, 랜딩에 3개 도구 카드 (Workspaces/Studio/Think) 노출 확인

### Phase 5 (옛 계획) — GBrain think 동등 목표 근거

- "이 자료에서 X에 대해 정리해줘" 입력
- 시스템:
  1. 관련 노드 hybrid 검색 (vector + keyword)
  2. LLM에 컨텍스트 주입 (관련 노드 본문 + 인접 노드 라벨)
  3. 답변 + **출처 노드 링크** 반환
- 우리는 이미 MCP에 `get_node_context`/`find_related`/`search_clusters` 다 있음 → AgentPanel 한 줄 추가로 동등 기능
- 갭 분석도 같이: "이 질문에 대해 부족한 정보는 X·Y" 명시

**Embedding 모델 결정**:
- OpenAI(BYOK) 호출 vs 로컬 ollama 의존
- 1차는 LLM-as-search로 충분. Vector는 큰 그래프(>1000 노드)에서 의미.

**추정**: 1일

## 4. 우선순위 + 총 작업량

| 순서 | 단계 | 작업량 | 가치 |
|---|---|---|---|
| ~~완료~~ | ~~Phase 1+2~~ | ~~0.5일~~ | ★★★ (Phase 3 prerequisite) |
| **다음** | **Phase 3 (LLM 추출)** | 2~3일 | ★★★★★ — 진짜 GBrain 수준 |
| 그다음 | Phase 4 (Studio→워크스페이스 머지) | 1.5일 | ★★★★ — 실용성 완성 |
| 후순위 | Phase 5 (think 모드) | 1일 | ★★★★ — MCP 재사용으로 빠름 |

**총 4~5일** 작업으로 GBrain 수준 도달. Phase 3-B의 **프롬프트 튜닝**이 핵심 — 한국어 few-shot 필수.

## 5. 미해결 결정

1. **Embedding 모델**: Phase 5 시점에 결정 (OpenAI BYOK vs 로컬 ollama vs 무시)
2. **머지 충돌 UX**: Phase 4에서 사용자 confirm 단계 깊이 결정 (diff 자동 vs 항목별)
3. **다중 사용자 Studio 세션 공유**: 워크스페이스 멤버끼리 Studio drafting 공유 가능하게? (당장은 user-scoped)

## 6. Cotext 정합성 체크

- ✅ **repo=정본** (Phase 4 머지 후만 GitHub 닿음)
- ✅ **락인 없음** (Neo4j 회피, markdown 정본)
- ✅ **provenance** (`source: knowledge-studio` 태그 유지, LLM 응답은 `source: <model>`)
- ✅ **BYOK** (사용자 키, 우리 서버 키 안 씀)
- ✅ **MCP 호환** (Phase 4 후 자동으로 모든 MCP 도구가 Studio 결과 활용 가능)
- ✅ **팀 모드** (워크스페이스 멤버십 모델 그대로 — 추가 작업 거의 0)
## Phase 5 Implementation Update (2026-06-17)

Implemented files:
- `src/lib/knowledge/session.ts`
- `src/lib/knowledge/think.ts`
- `src/pages/KnowledgeThinkPage.tsx`
- `src/pages/KnowledgeStudioPage.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/pages/LandingPage.tsx`
- `src/App.tsx`
- `src/index.css`

What shipped:
- Knowledge Studio now saves the latest generated graph snapshot to browser localStorage.
- New `Think` page reads that snapshot and runs a local hybrid-style evidence ranking pass.
- Evidence ranking uses label match, cluster-name match, body-text match, phrase match, and related-node expansion.
- BYOK provider/model/key flow is reused from the existing agent stack.
- The final answer is generated with a grounded prompt that:
  - restricts output to provided evidence
  - forces explicit insufficient-evidence behavior
  - requires `Sources: [S#]` citations
- Access points were added in three places:
  - app header
  - Knowledge Studio action row
  - landing page CTAs

Current limitation:
- This is still local snapshot retrieval, not workspace-wide vector retrieval.
- Phase 5 closes the grounded-answer UX gap first; deeper vector indexing can remain a later optimization.
