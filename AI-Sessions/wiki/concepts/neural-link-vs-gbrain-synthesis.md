---
type: concept
date: 2026-06-16
status: active
---

# Neural Link × GBrain — 합쳐진 최고 모델 (The Synthesis)

## 한 줄 요약

> **GBrain의 "AI가 알아서 짓는 두뇌"** + **Neural Link의 "GitHub-native·팀·멀티에이전트 정본"** = 둘 다 못 가진 second brain.

GBrain은 1인 power-user용 AI 두뇌, Neural Link는 협업형 컨텍스트 그래프 — 카테고리는 같지만 접근이 정반대다. 두 시스템의 강점만 모으면 **단일 에이전트도 단일 노트앱도 못 따라오는 카테고리**가 만들어진다. 이 문서는 그 합성 모델의 **설계 원리, 아키텍처, 작동 흐름, 로드맵**을 정리한다.

관련: [[neural-link-overview]] · [[cotext-neural-link-second-brain-ko]] · [[../projects/cotext-knowledge-studio-plan]] · [raw/g-brain-reference.md](../../raw/g-brain-reference.md)

---

## 1. 왜 합쳐야 하는가 — 각자의 결정적 결함

| 시스템 | 결정적 강점 | 결정적 약점 |
|---|---|---|
| **GBrain** | LLM 자동 entity 추출 · ambient capture · think 모드 + 갭 분석 · 검증된 스케일(140k 페이지) | 정본=로컬 SQLite (이식·grep·git 어려움) · 단일 사용자 중심 · CLI 진입 · 영어 중심 · 다중 vendor 에이전트 통합 약함 |
| **Neural Link** | GitHub-native markdown 정본 · provenance 1급(사람/AI 구분) · 팀 워크스페이스 · 멀티 vendor BYOK · 웹/모바일 · 한국어 | 사람의 nodify 액션 의존(휴리스틱) · ambient capture 없음 · think 모드 미구현 · 갭 분석 없음 |

→ **결함이 정확히 상보적.** 어느 한 쪽이 다른 쪽을 흡수하는 게 아니라, 양쪽이 못 가진 *제3의 카테고리*가 만들어진다.

---

## 2. 합성 모델의 설계 원리 (5가지)

### 원리 1 — **정본은 markdown in GitHub**
GBrain의 PGLite는 락인이라기엔 작지만 git/grep/Obsidian/Notion 등 어디서도 못 열림. 우리는 markdown 정본 유지.

### 원리 2 — **그래프 생성은 LLM, 단 정본에 안 닿음 (staging)**
LLM이 텍스트 청크 → entity/relation/cluster 추출. **결과는 Studio staging에 먼저** → 사용자 검토 후 워크스페이스 정본에 머지. 정본 오염 차단.

### 원리 3 — **Provenance가 모든 노드에 박힌다**
사람 캡처: `source: me`. AI 추출: `source: <model>`. Webhook 자동: `source: ambient`.  
→ "내 생각 vs AI 추출 vs 자동 수집"이 영구 구분됨. 멀티에이전트 시대에 trust 신호.

### 원리 4 — **Capture는 ambient, Curation은 deliberate**
GBrain의 `gbrain capture`·webhook·iOS 단축어가 inbox로 떨어짐.  
→ inbox 노드는 *후보 노드* (저강도 staging). 사용자/에이전트가 검토해 정본으로 승급. 마찰을 노동에서 *승인*으로 바꿈.

### 원리 5 — **모든 활용은 같은 lib·MCP·정본 통과**
LLM 자동 추출, 사람 수동 nodify, ambient ingest, 에이전트 호출 — 모두 `nodifyBlock/upsertCluster/linkEdge` 같은 단일 lib 경로. UI/MCP/Webhook 진입점만 다름.

---

## 3. 합성 아키텍처

```
┌───────────────────────────────────────────────────────────┐
│                    CAPTURE (입력 채널)                    │
├───────────────────────────────────────────────────────────┤
│ Web 채팅   모바일   Studio 일괄    Webhook    iOS 단축어  │
│ (의식적)   (의식적)  업로드        (자동)      (ambient)  │
└──────┬─────────────┬──────────┬──────────┬───────────────┘
       │             │          │          │
       ▼             ▼          ▼          ▼
┌─────────────────────────────────────────────────────────┐
│            EXTRACTION (의미 처리 계층)                  │
├─────────────────────────────────────────────────────────┤
│  GBrain-style LLM extractor:                            │
│    - 청크 분할 → entity·relation·cluster 추출           │
│    - 점진적 머지 (기존 그래프 reuse)                    │
│    - 갭 분석 ("이건 모름")                              │
│  BYOK provider (사용자 키, 로컬 저장)                   │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│          STAGING (Supabase 임시, 30일 expires)          │
│   knowledge_studio_sessions / inbox_nodes               │
│   사용자/에이전트 검토 + 머지 승인                      │
└──────┬──────────────────────────────────────────────────┘
       │ 승인 시
       ▼
┌─────────────────────────────────────────────────────────┐
│        정본 (GitHub repo, markdown)                     │
│   - cotext.md (블록 + provenance + 인라인 node 주석)    │
│   - .cotext/neural.json (클러스터/엣지)                 │
│   - .cotext/NEURAL_INDEX.md (사람·에이전트 grounding)   │
└──────┬──────────────────────────────────────────────────┘
       │ push 시 자동 sync
       ▼
┌─────────────────────────────────────────────────────────┐
│       파생 인덱스 (Supabase, 멤버 스코프 RLS)           │
│   neural_clusters / neural_nodes / neural_edges (GIN)   │
│   크로스 레포 검색 · 벡터 검색(Phase 5)                 │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│         활용 (사람 + 에이전트 동일 경로)                │
├─────────────────────────────────────────────────────────┤
│ Web UI: 그래프 뷰 · NodeEditor · 백링크 패널 · think    │
│ MCP 도구: get_neural_graph · find_related · think       │
│   - 로컬 cotext-mcp (정본 파싱)                         │
│   - 원격 context-api (Supabase + GitHub)                │
│ AgentPanel: 시스템 프롬프트 자동 grounding              │
│ Webhook out: Slack/email/Discord으로 think 결과 알림   │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 무엇을 가져오고, 무엇을 가져오지 않는가

### GBrain에서 가져옴
- ✅ **LLM 자동 entity·relation 추출** (Studio Phase 3)
- ✅ **점진적 augment** (재료 추가 시 기존 그래프 reuse·확장, Phase 3-C)
- ✅ **갭 분석** ("이건 모름", Phase 3-D)
- ✅ **Think 모드** (출처 달린 종합 답변, Phase 5)
- ✅ **Vector + keyword hybrid 검색** (Phase 5)
- ✅ **Ambient capture 채널** (Phase 6 — webhook·iOS 단축어·이메일)
- ✅ **inbox/staging 개념** (자동 수집은 후보 노드, 사용자 승급)
- ✅ **자율 출처 정정** ("24시간 기억 관리" 패턴, Phase 7)

### GBrain에서 가져오지 않음
- ❌ **PGLite 단일 DB** — 우리 정본은 markdown 유지
- ❌ **CLI-first** — 우리는 web/mobile 우선
- ❌ **Entity-only 모델** — 우리는 cluster + entity 둘 다 (cluster가 헤어볼 회피)
- ❌ **단일 사용자 가정** — 팀 워크스페이스 1급 유지

### Neural Link에서 유지
- ✅ **GitHub repo = 정본** (D-001/D-004 불변식)
- ✅ **markdown 인라인 메타** (`<!-- node: -->`)
- ✅ **Provenance 1급** (source 태그가 정본에 박힘)
- ✅ **클러스터 우선** (entity overload 회피)
- ✅ **워크스페이스 멤버십 + RLS** (방금 구현)
- ✅ **MCP 표준 1급** (4가지 grounding 옵션 A/B/C/D)
- ✅ **멀티 vendor BYOK** (한 풀에 모든 에이전트 연결)
- ✅ **한/영 i18n**
- ✅ **그래프 = 에디터** (그래프에서 모든 편집 가능)

### Neural Link에서 바꿈
- 🔄 **휴리스틱 추출 → LLM 추출** (Phase 3)
- 🔄 **수동 nodify → 자동 추출 + 사용자 승급** (마찰 노동→승인)
- 🔄 **검색만 → think 모드 추가** (Phase 5)

---

## 5. 합성 모델만 가능한 새 능력

이 둘이 진짜 합쳐졌을 때 양쪽 어디서도 못 하던 것들:

### 5-1. **"이 결정 누가 어디서 했지?"**
멀티 벤더 트레이스 + git 히스토리. ChatGPT가 제안한 가격 정책을 Claude가 검토하고 사람이 확정한 흐름이 provenance + git commit으로 영구 추적. GBrain은 출처 메모만 추적, Notion은 추적 없음.

### 5-2. **"팀이 같이 자라는 두뇌"**
초대된 멤버 5명이 각자 ambient ingest → 모두 같은 정본 그래프에 머지. 권한은 RLS로 깔끔. GBrain의 팀 모드는 1대 다 권한, 우리는 진짜 협업.

### 5-3. **"오프라인 → 온라인 자유 전환"**
로컬 MCP는 clone된 repo에서 동작 (인터넷 없이), 원격 MCP는 크로스 레포 인덱스 활용. 같은 4개 도구 인터페이스. GBrain은 로컬 only, Notion AI는 클라우드 only.

### 5-4. **"에이전트가 자기 작업을 정본에 자동 기록"**
Claude Code가 작업하면서 결정·문맥을 `source: claude`로 자동 nodify. 다음 세션의 Claude Code가 그걸 읽어 이어감. 단일 벤더 메모리(ChatGPT memory)는 같은 벤더 안에서만, 우리는 벤더 무관.

### 5-5. **"검토할 만한 것만 정본에"**
Ambient ingest는 staging만. 노이즈가 정본을 더럽히지 않음. GBrain은 다 정본으로 들어감 → 시간 지나면 cleanup 부담.

### 5-6. **"두뇌의 두뇌 (meta-graph)"**
정본이 markdown이라 git diff로 그래프 진화 자체가 추적됨. "지난주 대비 어떤 클러스터가 자랐나"가 git log로 추적 가능. PGLite는 SQL diff 어려움.

---

## 6. 합성 모델 로드맵

이미 [Knowledge Studio 계획](../projects/cotext-knowledge-studio-plan.md)에 P1~P5가 있고, 합성 완성을 위해 **P6~P7**을 추가.

| Phase | 무엇 | 합성에서의 역할 | 상태 |
|---|---|---|---|
| **P1** BYOK picker | LLM provider 사용자 키 | Phase 3의 prerequisite | ✅ 완료 |
| **P2** 업로드 가드 + dedupe | 파이프라인 위생 | Phase 3 입력 품질 | ✅ 완료 |
| **P3** LLM 추출 + 점진 머지 + 갭 분석 | GBrain의 핵심 흡수 | **결정적** | ⏳ |
| **P4** Studio → 워크스페이스 머지 | staging → 정본 분리 | 우리 강점 + GBrain auto의 안전 결합 | ⏳ |
| **P5** Think 모드 (hybrid search + grounded answer) | GBrain think 동등 | 답변 가치 | ⏳ |
| **P6** Ambient capture 채널 | Webhook (이메일/캘린더) + iOS 단축어 + 텔레그램 등 | GBrain의 zero-friction capture 흡수 | 🆕 |
| **P7** Self-maintaining brain | 24시간 자율 출처 정정 + 갭 자동 채움 + 클러스터 재구성 제안 | GBrain "기억 관리" 흡수 | 🆕 |

P3+P4+P5만 끝나도 (4~5일 작업) GBrain 동등 + 우리 강점 유지. P6+P7로 진짜 새 카테고리.

---

## 7. 다른 도구와의 한 줄 비교 (합성 후 기준)

| 도구 | Cotext 합성 모델 대비 |
|---|---|
| **GBrain** | 우리 추출 자동성 흡수 + 우리만의 GitHub 정본·팀·멀티벤더·웹 |
| **Obsidian** | 우리: 에이전트 1급 + 크로스 레포 + 자동 추출 + 팀 협업 |
| **Notion AI** | 우리: 멀티 벤더 + 정본 markdown + 락인 없음 + 그래프 1급 |
| **ChatGPT Memory** | 우리: 통제 가능 + 영속 + 멀티벤더 + 팀 공유 |
| **Roam / Logseq** | 우리: 에이전트·MCP·크로스 레포·자동 추출 |
| **Mem.ai / Reflect** | 우리: GitHub 정본 + 멀티벤더 BYOK + 팀 |

→ 합성 후 Cotext는 *지식그래프 + LLM 자동 추출 + 정본 분리 + 멀티에이전트* 4개 축을 모두 가진 유일한 카테고리.

---

## 8. 핵심 결정 (이 문서가 결정으로 승급 가능한 항목)

이 합성 방향이 정식 결정이 되면 [decisions/cotext-architecture-decisions.md](../decisions/cotext-architecture-decisions.md)에 **D-010 추가** 후보:

> **D-010. Second Brain 합성 방향 — GBrain auto-extract + Neural Link 정본 분리**
> Cotext의 second brain 방향성은 GBrain의 자동성 + Neural Link의 정본·협업·provenance를 합친 모델이다. LLM 자동 추출은 staging에 한정하고, 정본 승급은 사용자 검토를 통한다. Ambient capture는 inbox 패턴으로 마찰을 *노동→승인*으로 바꾼다. Phase 3~7 로드맵으로 단계적 실현.

승급 여부는 사용자 확인 후.

---

## 9. 한 줄 명제

> **"AI가 자라게 두고, 사람이 형태를 정한다. 두 손가락이 같은 정본을 만진다."**

이게 합성 모델의 본질이고, 어느 한쪽으로 치우치면 결함이 다시 살아납니다.
