---
type: concept
date: 2026-06-17
status: active
---

# Neural Link vs GBrain

> 두 시스템은 둘 다 knowledge graph 카테고리에 속하지만,
> 누가 그래프를 만들고 어디에 정본이 사는지에서 철학이 갈린다.

관련: [[AI-Sessions/wiki/concepts/neural-link-overview]] · [[AI-Sessions/wiki/projects/cotext-knowledge-studio]] · [[AI-Sessions/wiki/concepts/cotext-neural-link-second-brain-ko]]

---

## 0. 한 줄 철학

| 시스템 | 한 줄 정의 |
|---|---|
| **GBrain** | 메모를 던지면 AI가 알아서 정리하는 로컬 AI 두뇌. Passive collection · CLI · single-user |
| **Neural Link** | 사람과 에이전트가 같이 그리는 GitHub-native 컨텍스트 그래프. Deliberate structure · web · multi-user |

핵심 대비:

- GBrain은 **AI가 그래프를 짓는다**
- Neural Link는 **사람이 짓고 에이전트도 같은 경로로 짓는다**

---

## 1. 차원별 비교

| 차원 | GBrain | Neural Link | 평가 |
|---|---|---|---|
| 노드 단위 | 추출된 entity (사람·회사·개념) | 마크다운 블록 (`## ts`) | 다른 접근 |
| 엣지 | LLM이 추론한 관계 | 명시적 typed edge + 클러스터 암묵 관계 | GBrain 자동 / Neural Link 명시 |
| 클러스터 vs Entity | Entity 중심 | Cluster 중심 | 다른 철학 |
| 그래프 생성 | LLM auto-extraction | 사람의 nodify 액션 | GBrain 자동 우위, Studio Phase 3에서 추격 가능 |
| 정본 저장 | 로컬 SQLite/PGLite | GitHub repo markdown + `neural.json` + Supabase 파생 | Neural Link 우위: 영속성·이식성·grep 가능 |
| DB 엔진 | PGLite | Supabase Postgres + markdown 정본 | 동급 |
| 확장(augment) | 24시간 ingest, 이메일/캘린더 자동 수집 | Push 시점 sync, Studio는 Phase 3 이후 점진 머지 | GBrain 우위 |
| 검색 | keyword + think + vector hybrid | `NEURAL_INDEX.md` + MCP 도구 + Cotext 텍스트 검색 | GBrain 현재 우위 |
| 갭 분석 | "이것은 모름" 명시 | 현재 없음, Phase 3-D 예정 | GBrain 우위 |
| Provenance | 메모 원본 추적 | `source: me\|claude\|chatgpt\|...` 태그 1급 | Neural Link 우위 |
| 에이전트 연결 | Claude Code 중심, MCP 연결 간단 | `cotext-mcp` local/remote + grounding 옵션 A/B/C/D | 동급 |
| 협업 | 팀 모드 | 워크스페이스 멤버십 + RLS | 동급 |
| 권한 모델 | 사용자별 데이터 접근 권한 | Supabase RLS member scope | 동급 |
| 사용 환경 | CLI 우선 | Web app + 모바일(Capacitor) | 다른 카테고리, 접근성은 Neural Link 우위 |
| 로컬 vs 클라우드 | 기본 로컬, think 시점만 LLM API | Web 클라우드 + GitHub + 로컬 MCP | 프라이버시는 GBrain / sync는 Neural Link |
| 락인 | 없음 | 없음 | 둘 다 양호 |
| 언어 | 영어 중심 | 한/영 i18n 1급 | Neural Link 우위 |
| 포지셔닝 | 1인 power-user | 팀 협업 컨텍스트 풀 | 다른 시장 |
| 현재 성숙도 | 더 검증됨 | 자체 사용 단계 | GBrain 우위 |
| 자동 수집 | webhook, iOS 단축어 | ambient ingest 없음 | GBrain 우위 |

---

## 2. GBrain이 강한 지점

1. **Zero-friction capture**
   - `gbrain capture "..."` 한 줄, webhook ingest, 모바일 단축어
   - Neural Link는 아직 채팅창/페이지 진입이 필요해서 진입 마찰이 더 큼

2. **LLM 자동 entity 추출**
   - 사용자가 노드/클러스터를 의식하지 않아도 그래프가 자람

3. **Think 모드의 출처 grounding UX**
   - 답변에 메모 원본 링크를 자연스럽게 묶음
   - Neural Link는 MCP/정본은 있으나 UX 통합은 아직 약함

4. **Gap analysis**
   - "이건 모른다"를 명시적으로 드러냄
   - 신뢰 신호이자 환각 방지 장치

5. **검증된 스케일**
   - 대규모 개인 메모/인물/회사 그래프 운영 사례가 이미 존재

---

## 3. Neural Link가 강한 지점

1. **Provenance 1급**
   - `source: me|claude|chatgpt|...`가 정본에 박힘
   - "내 생각"과 "AI 생성"이 섞이지 않는 것은 멀티에이전트 시대에 결정적

2. **GitHub-native 정본**
   - commit 이력
   - 범용 툴 호환성
   - 자동 백업
   - git 기반 협업 모델과 자연 결합

3. **Markdown 정본**
   - grep만으로 구조 추출 가능
   - PGLite/SQLite보다 사람 눈에 직접 보이는 구조

4. **다중 vendor 에이전트 통합**
   - BYOK 기반으로 ChatGPT·Claude·Gemini 등 다중 vendor 연결 가능

5. **웹 우선 + 모바일**
   - 설치/CLI 없이 링크와 로그인만으로 진입 가능

6. **팀 워크스페이스 1급**
   - 멤버십, 초대 링크, RLS가 코어로 들어감

7. **클러스터 우선 설계**
   - entity overload를 피하면서 주제 단위 컨텍스트 묶음을 만들기 쉬움

8. **한국어 및 i18n**
   - GBrain 대비 명확한 차별점

---

## 4. 공통된 뿌리

둘 다 공유하는 카테고리 자산:

- 노드/엣지 기반 그래프 모델
- 의미 검색 + 키워드 검색 지향
- MCP 표준을 통한 에이전트 노출
- 출처 grounding
- 사용자 데이터 소유권 유지

정리:

- **카테고리는 같다**
- 차이는 **누가 그래프를 짓는가**와 **정본이 어디에 사는가**다

---

## 5. Neural Link 로드맵에서 메워지는 갭

| Phase | 메우는 갭 | 결과 |
|---|---|---|
| **3** LLM 추출 + 점진 머지 | 사람이 nodify 안 해도 그래프가 자람 | GBrain 수준 자동성에 접근 |
| **3-D** Gap analysis | "이건 모름" 명시 | GBrain 시그니처 기능 일부 흡수 |
| **4** Studio → 워크스페이스 머지 | 자동 추출 결과를 정본에 안전하게 합류 | Neural Link만의 정본 분리 강점 |
| **5** Think 모드 | 출처 달린 종합 답변 | GBrain think와 유사한 활용층 확보 |

로드맵 이후에도 GBrain이 당분간 우위일 가능성이 큰 영역:

- ambient capture 채널
- 장기적 자율 ingest/정리 루프

---

## 6. 결합하면 이상적인 방향

이상적인 합성은 다음과 같다:

```text
입력 (GBrain 스타일)          정본 (Neural Link 스타일)        활용
──────────────────────────    ─────────────────────────       ──────────────
이메일/캘린더 webhook       → markdown in GitHub repo      → MCP 도구
iOS 단축어 ambient capture  → .cotext/neural.json          → 모든 에이전트
LLM auto-extraction        → Supabase 파생 인덱스          → 사람 web UI
사람 의식적 nodify          → provenance source 1급         → 팀 협업
```

방향성 요약:

- GBrain의 ambient capture
- Neural Link의 GitHub 정본
- Neural Link의 multi-agent provenance
- 팀 협업 가능한 shared context graph

이 조합이 완성되면 second brain 카테고리에서
개인 자동성 + 팀 협업 + 정본 이식성을 동시에 가진다.

---

## 7. 전략적 결론

현재 시점의 냉정한 결론:

- **개인 자동 두뇌**로는 GBrain이 앞서 있다
- **정본·협업·멀티에이전트 provenance**로는 Neural Link가 더 강한 방향을 갖고 있다

따라서 Neural Link의 최적 전략은 GBrain을 그대로 복제하는 것이 아니라:

1. Knowledge Studio로 개인 bulk ingestion을 먼저 흡수하고
2. Phase 3~5로 자동 추출, 갭 분석, think 모드를 보강하고
3. Phase 6 이후 ambient capture를 별도 채널로 붙여
4. shared graph + GitHub-native source of truth라는 차별점을 유지하는 것

이 문서는 "누가 더 낫냐"보다 **어느 축에서 무엇이 다르고, 어떤 로드맵이 필요한가**를 정리한 비교 문서다.
