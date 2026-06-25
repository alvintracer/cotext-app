# AI Agent Wiki Index

이 문서는 vault 전체의 지도입니다.

에이전트는 중요한 wiki 문서를 만들거나 갱신한 뒤 이 문서에 링크를 추가해야 합니다.

## Start Here

- [[START_HERE]]
- [[CLAUDE]]
- [[AGENTS]]
- [[README]]
- [[TEMPLATE_MANIFEST]]
- [[log]]

## Vault Structure

- `AI-Sessions/raw/`: 수정하지 않는 1차 자료
- `AI-Sessions/conversations/`: 세션 인수인계
- `AI-Sessions/wiki/sources/`: raw 자료 요약
- `AI-Sessions/wiki/concepts/`: 반복 사용 개념
- `AI-Sessions/wiki/decisions/`: 의사결정
- `AI-Sessions/wiki/errors/`: 실패와 리스크
- `AI-Sessions/wiki/projects/`: 프로젝트 맥락
- `AI-Sessions/wiki/design/`: 디자인 가이드와 IA
- `AI-Sessions/wiki/dev-tasks/`: 개발 태스크

## Projects

- [[AI-Sessions/wiki/projects/chatgpt-share-01-overview]]
- [[AI-Sessions/wiki/projects/chatgpt-share-02-structure]]
- [[AI-Sessions/wiki/projects/chatgpt-share-03-rules-and-prompts]]
- [[AI-Sessions/wiki/projects/cotext_mvp]]
- [[AI-Sessions/wiki/projects/cotext-knowledge-studio]] — Studio 현재 상태(scaffolding)
- [[AI-Sessions/wiki/projects/cotext-knowledge-studio-plan]] — Studio → GBrain 수준 진화 수행 계획 (Phase 1~5)

## Decisions

- [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]]
- [[AI-Sessions/wiki/decisions/mindsync-knowledge-sync-architecture]] — Wiki→Graph 컴파일 모델(레포=버스, 그래프=파생물, [[wikilink]]→엣지)
- [[AI-Sessions/wiki/decisions/workspace-wiki-bootstrap]] — 3가지 진입경로(npx cotext init / Cotext 1-click / Studio 업로드) + workflow yml 자동 시드
- [[AI-Sessions/wiki/decisions/wiki-synthesis-agent]] — 채팅 → 합성 → wiki → 그래프 (BYOK+Managed, 선택 블록 모드, workflow yml self-contained fix)
- [[AI-Sessions/wiki/decisions/code-reference-comments]] — 사이드바 폴더 탭 (Phase A 완료) + non-md 파일 읽기 + 코드 라인 코멘트 (Phase B/C/D 기획)

## Concepts

- [[AI-Sessions/wiki/concepts/neural-link-overview]] — Neural Link 종합 문서(구조·특징·효과·Obsidian 비교·사용 가이드·MCP 연결·개발자 레퍼런스)
- [[AI-Sessions/wiki/concepts/neural-link-mcp-grounding]] — §32 Neural Link 그래프를 MCP에 이해시키는 옵션(A 정본 파싱·B Supabase API·C NEURAL_INDEX.md·D 도구 함수), 추천 조합
- [[AI-Sessions/wiki/concepts/cotext-neural-link-second-brain]] ??Cotext 援ъ“/Neural Link 援ъ“? ?먮━, Obsidian怨쇱쓽 李⑥씠, second brain/knowledge graph ?뺤옣 諛⑸향

- [[AI-Sessions/wiki/concepts/cotext-neural-link-second-brain-ko]] ??Cotext/Neural Link 구조와 원리 한국어 정리, Obsidian 비교, second brain/인공 지식망 방향성
 - [[AI-Sessions/wiki/concepts/neural-link-vs-gbrain]]
## Design

- [[AI-Sessions/wiki/design/cotext-architecture-overview]] — 전체 아키텍처 구조도 (Wiki→Graph→Sync 3계층 흐름, npm 명령, 파일 맵)
- [[AI-Sessions/wiki/design/cotext-brand-and-landing]]
- [[AI-Sessions/wiki/design/managed-credits-billing-plan]] ??managed model ?щ젅?딆쟾 寃곗젣 紐⑤뱢 理쒖냼 援ы쁽 寃쎈줈

- [[AI-Sessions/wiki/design/public-pricing-and-policy-surface]] ??public pricing routes, policy pages, managed-credit explanation
## Sources

- [[AI-Sessions/wiki/sources/01_cotext-development-plan_summary]]

## Dev Tasks

- [[AI-Sessions/wiki/dev-tasks/mindsync-ws-integration]]

## Errors / Lessons

- [[AI-Sessions/wiki/errors/01_npm-bin-quirk-and-publish]]

## Conversations

- [[AI-Sessions/conversations/2026-06-14-mcp-api-publish-handoff]]

## Prompt Library

- [[prompts/first-setup]]
- [[prompts/save]]
- [[prompts/query]]
- [[prompts/ingest]]
- [[prompts/lint]]
- [[AI-Sessions/wiki/dev-tasks/android-release-signing-and-bundle]]
