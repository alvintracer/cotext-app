---
type: decision
date: 2026-06-23
status: active
graph: false
tags: [architecture, mindsync, synthesis, llm, agent, managed-credits]
--- 

# Wiki Synthesis Agent — 채팅 → 정제 wiki → 그래프

## Summary

Cotext 채팅 (cotext.md raw 캡처)을 **사람이 의식적으로 격상시킬 때** LLM이
정제된 wiki 문서를 자동으로 작성하고, 사용자가 검토·편집·선택한 것만 GitHub에
한 커밋으로 푸시되어 wiki-compile workflow를 통해 그래프에 합류한다.

**핵심 결정:** 채팅 1블록 = 그래프 1노드(직접 변환) 대신,
**채팅 N블록 → 합성 → wiki 문서 → 자동 컴파일 → 그래프** 흐름을 택한다.

이유: [[mindsync-knowledge-sync-architecture]] 의 "Wiki = source of truth,
그래프 = 파생물" 정체성을 유지하려면, LLM 추출 결과를 wiki 마크다운으로 보존해
사람이 PR·diff·롤백할 수 있어야 한다. 직접 그래프 변환은 블랙박스화된다.

## Context

이전 상태:
- 채팅 → 노드: 3-dot "노드로" (1 블록 = 1 노드, 인라인 메타) — 이미 있음
- 파일 → 그래프: MindSync Studio LLM 추출 — 이미 있음
- 채팅 → wiki: **없었음** (사용자가 cotext UI 안에서 wiki 문서를 만들/정제할 길이 전무)

빈칸: 로컬 클론 없이 Cotext만 쓰는 사용자는 "이 채팅들을 정리해서 wiki에 넣고
싶다"는 자연스러운 요구를 충족할 수 없었음. → 본 결정으로 메움.

## Details

### UX 흐름

```
[채팅에서 메모 작성]                       (기존 흐름, 변경 없음)
        ↓
[원하면] 머지 모드 진입 (3-dot → 머지)     ← 선택적
        ↓ 체크박스로 N개 선택
        ↓
[Wiki로 정리]  (전체 룸 or 선택 블록)
        ↓
[모달] Provider 선택 (BYOK 또는 Cotext Model)
        ↓
[분석 시작] → LLM이 wiki 문서 N개 제안
        ↓
[Preview] 카드별 검토 + 편집 + 체크 (안전망)
        ↓
[N개 wiki에 푸시] → wiki-push-batch (1 commit, Tree API)
        ↓
GitHub Action neural-compile 자동 트리거
        ↓
~30~60초 후 .cotext/neural.json 자동 갱신
        ↓
MindSync 글로브에 새 노드 + [[link]] 엣지 등장
```

### LLM 합성 — `src/lib/knowledge/wikiSynthesize.ts`

- 입력: 룸 cotext.md + (선택) `.cotext/NEURAL_INDEX.md`
- 출력: `WikiProposal[]` — category/slug/title/tags/body/rationale
- **프롬프트 규약:**
  - Save Filter 5조건 강제 (재사용성·핸드오프·결정 근거·리스크·팀 규칙 중 하나)
  - `[[slug]]` 자동 활용 (기존 wiki와 연결)
  - STRICT JSON 출력
  - 카테고리: decisions / concepts / errors / projects / design / dev-tasks
- **Sanitize:** 카테고리 enum 체크, slug regex(`/^[a-z0-9][a-z0-9-]{0,80}$/`),
  태그 8개 cap, 비어있거나 잘못된 제안은 drop
- `composeWikiDoc(prop)`: frontmatter 자동 생성 (`type/date/status=draft/tags`)
- BYOK 모드: 사용자 키로 클라이언트에서 직접 LLM 호출

### 사용자 검토 UI — `WikiSynthesisModal`

- Phase machine: `idle → analyzing → review → pushing → done` (error 분기)
- 카드별: 카테고리 색 코드, 체크박스, inline 제목 편집, "편집" 토글로 tags + body
- preview/edit/select 후 선택분만 push — **환각 안전망**
- 모델 picker: BYOK 키 있는 provider만 + Cotext Model (managed)
- BYOK provider 선택 시 model 드롭다운도 같이

### 1-commit Batch Push — `supabase/functions/wiki-push-batch/`

- GitHub Tree API + Commit API + Refs API 조합
- N개 파일을 **단일 커밋**으로 푸시 → repo 히스토리 깔끔 + Action 트리거 정확히 1회
- 비파괴적: 기존 path skip (force 옵션 따로)
- Path validation: `..` / 절대경로 / 256자 초과 차단 (LLM 환각 방어)

### Managed Mode — `supabase/functions/wiki-synthesize-managed/`

- 사용자가 자기 API 키 없이 Cotext Model 사용 가능
- 패턴: [[managed-credits-billing-plan]] 의 `neural-extract-managed`와 동일
- env `MANAGED_LLM_PROVIDER/MODEL/API_KEY` (extract와 공유)
- 크레딧 계산: `Math.ceil(roomContent.length / 12000)`, 최소 1
- `apply_managed_credit_usage` RPC, `kind: 'wiki_synthesize'`
- 잔액 부족 시 402 + 잔액 정보 반환

### 선택 블록 합성 (Phase 2)

기존 머지 모드의 selection bar를 **2개 액션**으로 확장:
- `[머지]` (가장 이른 블록 아래로 합치기, 기존)
- `[✨ Wiki로 정리]` (선택 블록만 추출 → 모달 열기, 신규)

부모(RoomView)가 선택된 timestamps를 받아 cotext.md에서 해당 블록의 raw 텍스트만
추출 → `wikiSynthSubset` state → modal이 `roomContent` 대신 subset 사용. 모달
헤더에 `(selected blocks)` 표시.

## 안전 장치

| 위험 | 방어 |
|---|---|
| LLM 환각으로 wiki 더러워짐 | 모달에서 사용자 승인 필수 — 체크 해제하면 푸시 X |
| 잘못된 path/slug 생성 | wikiSynthesize.ts에서 sanitize, Edge Function에서 추가 검증 |
| Path traversal | Edge Function이 `..`/절대경로 차단 |
| 기존 wiki 덮어쓰기 | 기본 skip (force 옵션 따로) |
| N개 commit으로 Action 폭주 | Tree API로 1 commit, Action 1회 |
| 토큰 비용 통제 | BYOK 또는 managed 크레딧 (잔액 부족 시 402) |
| `roomContent`가 너무 큼 | 16K chars로 truncate (modal에서 부분 선택 권장) |

## 신규 컴포넌트 파일

| 경로 | 역할 |
|---|---|
| `src/lib/knowledge/wikiSynthesize.ts` | LLM 합성 + 프롬프트 + sanitize + frontmatter compose |
| `src/components/WikiSynthesisModal.tsx` | 모달 UI (picker, analyze, review, push) |
| `supabase/functions/wiki-push-batch/` | Tree API 1-commit batch push |
| `supabase/functions/wiki-synthesize-managed/` | Managed LLM 호출 + 크레딧 차감 |

연관 변경:
- `RoomView.tsx` 헤더에 "✨ Wiki로 정리" 버튼
- `RoomView.tsx` selection bar에 [Wiki로 정리] 추가 (선택 블록 모드)
- `src/lib/supabase/functions.ts` 에 `wikiBatchApi`, `wikiSynthesizeApi`

## Workflow yml 동시 fix (graph 갱신 안 되던 버그)

기존 [[workspace-wiki-bootstrap]] 의 SEED_FILES 에 `npx -y cotext compile`을
쓰고 있었는데, **cotext 패키지가 npm에 publish되지 않아** Action이 매번 실패해
그래프가 갱신되지 않았다.

**Fix:** workflow yml을 self-contained 버전으로 변경 — cotext-app 레포를 매
실행마다 shallow clone + cotext-cli 빌드 후 실행. ~30초 추가, publish 없이 즉시 동작.

기존 워크스페이스 yml 복구:
- `workspace-init-wiki` Edge Function에 `force_paths` 옵션 추가 — 특정 path만
  선택 overwrite (`['.github/workflows/neural-compile.yml']`)
- WorkspaceDetailPage 사이드바에 "🔧 neural-compile 워크플로 갱신" 접힌 details
  섹션. wiki 셋업된 워크스페이스에만 노출. 클릭 한 번으로 yml 교체.

## 향후 (Phase 3)

- **AgentPanel 통합**: tool calling으로 에이전트가 자율적으로 wiki 정제 호출
- **이미 존재하는 wiki 문서 업데이트 모드** (append vs new replacement)
- **합성 결과 quality 피드백** → 프롬프트 개선
- **여러 룸 cross-synthesis**: 한 주제가 여러 룸에 흩어진 경우
- **npm `cotext` 패키지 publish**: workflow yml을 한 줄(`npx -y cotext compile`)로 단순화

### 후속 운영 보강 (2026-06-24)

- **문제 재정의:** 실제로는 "위키 합성은 성공했는데 노드가 안 생김" 이 아니라,
  대상 워크스페이스 레포에 `neural-compile` workflow 파일이 없어서 그 다음 단계가
  아예 실행되지 않는 경우가 있었다.
- **관찰 지점 명확화:** 이 workflow 는 `cotext-app` 레포의 GitHub Actions 가 아니라,
  사용자가 wiki 로 정리한 **대상 워크스페이스 레포의 Actions** 에서 돌아야 한다.
- **UX 보강:** sidebar 는 `CLAUDE.md` 와 workflow 파일을 따로 probe 하고,
  workflow 만 빠진 상태면 별도 경고 카드로 "md 생성만 되고 graph 는 안 돈다"는 점을
  명시한다.
- **산출물 노이즈 축소:** graph 컴파일러는 후속 수정으로 top-level 시스템 문서 대신
  `AI-Sessions/wiki/**` 슬라이스를 중심으로 읽고, 운영/시스템 성격 문서는
  `graph: false` 로 opt-out 할 수 있게 정리했다.

## Links

- [[mindsync-knowledge-sync-architecture]] — 4경로 수렴 원칙 (이 결정이 채팅→wiki 경로 강화)
- [[workspace-wiki-bootstrap]] — wiki 구조 1-click 셋업 (이 결정의 전제)
- [[cotext-architecture-overview]] — 전체 아키텍처
- [[managed-credits-billing-plan]] — Cotext Model 크레딧 차감 메커니즘 (managed mode 활용)
- [[mindsync-ws-integration]] — workspace UI 통합 패턴
