---
type: decision
date: 2026-06-22
status: active
tags: [architecture, mindsync, onboarding, cli, edge-function]
---

# Workspace Wiki Bootstrap — 3가지 진입경로 통합

## Summary

지식그래프를 만드는 진입경로를 **3가지로 명시적 분리**하고, "로컬 클론 없는
사용자"도 한 클릭으로 wiki 구조 + 자동 컴파일 워크플로를 셋업할 수 있게 한다.

| # | 경로 | 사용 시기 | 결과물 |
|---|------|---------|--------|
| **A** | `npx cotext init` | 레포가 로컬에 있을 때 (IDE 에이전트 워크플로) | 시드 + workflow yml + 첫 컴파일까지 한 번에 |
| **B** | Cotext 워크스페이스 "wiki 셋업" 버튼 | 로컬 클론 없음 (Cotext에서 바로 연결한 레포) | GitHub 한 커밋으로 시드 + workflow yml |
| **C** | MindSync Studio 파일 업로드 | wiki 구조 없이 즉시 그래프만 필요 | LLM 추출 → 워크스페이스 그래프 머지 |

세 경로 모두 최종 산출물은 **같은 `.cotext/neural.json`** (4경로 수렴 원칙 유지 —
경로 ①~④ 중 ③ wiki 컴파일과 ② LLM 추출이 여기 해당).
[[mindsync-knowledge-sync-architecture]] 의 멱등 재컴파일·LLM 엣지 보존이 그대로 적용된다.

## Context

[[mindsync-knowledge-sync-architecture]] 의 PoC 시점엔 `npx cotext init`
(경로 A)만 있었다. 한계:

- **로컬 클론 필수**: Cotext UI로 워크스페이스 연결한 사용자는 셋업 방법이 없었다.
- **`.github/workflows/neural-compile.yml` 분리**: init이 만드는 파일 묶음에
  포함되지 않아 사용자가 별도로 만들어야 push-time 자동 컴파일이 작동했다.
- **온보딩 가시성 0**: MindSync 랜딩에서 "이 셋업이 어떻게 가능한지" 안내가 없었다.

## Details

### 경로 A — `npx cotext init` 강화
- `packages/cotext-cli/src/init.ts` 의 `FILES` 에 `.github/workflows/neural-compile.yml` 추가
- init 한 번으로 다음이 모두 완성:
  - 디렉터리 10개 (`.gitkeep` 포함)
  - 시드 파일 11개 (`CLAUDE.md`, `AGENTS.md`, `START_HERE.md`, `index.md`, `log.md`, `TEMPLATE_MANIFEST.md`, `prompts/*` 5개)
  - **신규**: `.github/workflows/neural-compile.yml`
  - 첫 컴파일 (`runNeuralCompile`)
- 검증: 임시 디렉터리에서 init → 22 created → workflow yml 정상 생성 확인

### 경로 B — Cotext 1-click (신규)
- **Edge Function**: `supabase/functions/workspace-init-wiki/index.ts`
  - GitHub Tree API + Commit API + Ref API 조합으로 **모든 시드를 한 커밋에**
    push (`cotext: initialize MindSync wiki structure`)
  - **Non-destructive**: 기존 파일은 skip (force=true로만 덮어씀)
  - 빈 레포 지원: ref 자동 생성 (parent commit 없음)
- **시드 소스**: `supabase/functions/_shared/wiki-seed.ts` 에 vendor —
  `packages/cotext-cli/src/init.ts` 와 **lockstep sync 필요** (헤더에 명시)
- **클라이언트 API**: `wikiInitApi.init(owner, repo, branch, force)` in
  `src/lib/supabase/functions.ts`
- **UI**: `WorkspaceDetailPage` 사이드바
  - 마운트 시 `CLAUDE.md` probe → 없으면 `wikiPresent === false`
  - accent 색 배너 노출: "MindSync wiki 초기화" + "wiki 셋업" 버튼
  - 클릭 → 성공 시 created/skipped 카운트 표시 + 다음 push로 그래프 자동 생성 안내

### 경로 C — MindSync Studio (기존, 라벨링만)
- 변경 없음. 랜딩 가이드에서 동등한 옵션으로 노출.

### 랜딩 가이드 섹션 (신규)
- `MindSyncLandingPage` 에 "내 지식그래프 만드는 3가지 길" 섹션 추가
- 3개 카드 (색 구분: 파랑/보라/시안), 명령어 복사 버튼
- **구조 트리** 시각화: 셋업하면 만들어지는 파일/폴더를 ASCII로
- **npm 명령어 치트시트**: init/compile/check/enrich 4개 한 줄씩

## Sync 유지 규약

`packages/cotext-cli/src/init.ts` 의 `FILES` 객체와
`supabase/functions/_shared/wiki-seed.ts` 의 `SEED_FILES` 객체는 **동일 내용**을
유지해야 한다. CLI/Edge Function 어느 한쪽으로 들어와도 같은 결과를 보장.

변경 시 양쪽을 동시에 수정. 두 파일 모두 헤더에 "SYNC SOURCE" 주석으로 명시.

## 향후

- **자동 sync 메커니즘**: 단일 JSON 시드 소스 → 빌드 시 CLI + Edge Function이 동일 import
- **워크스페이스 wiki 상태 진단 패널**: 어떤 시드가 있는지 / Action 동작 중인지 /
  마지막 컴파일 언제인지 / 누락 파일 1-click 보충
- **`npm publish cotext`**: 외부 사용자도 `npx cotext init` 직접 사용 가능
- **워크스페이스 생성 흐름에 통합**: "Initialize as MindSync wiki" 체크박스를 신규
  워크스페이스 생성 모달에 추가 (현재는 사후 셋업만)

## Links

- [[mindsync-knowledge-sync-architecture]] — 4경로 수렴 원칙 (이 결정이 경로 A/B를 강화)
- [[cotext-architecture-overview]] — 전체 아키텍처 구조도
- [[mindsync-ws-integration]] — workspace 내 통합 작업
- [[neural-link-mcp-grounding]] — NEURAL_INDEX.md grounding 패턴
