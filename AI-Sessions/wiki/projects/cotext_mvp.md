# Project: Cotext MVP

## 개요
이 프로젝트는 GitHub 리포지토리를 워크스페이스로 활용하여 문맥(context)을 수집하고, 멀티 LLM/Agent 환경에서 일관된 컨텍스트를 제공하기 위해 개발된 "Cotext"의 MVP(Minimum Viable Product) 버전입니다.

## 아키텍처
- **클라이언트**: Vite + React + TypeScript로 개발된 SPA. 모바일 환경을 위해 반응형으로 설계되었으며, 향후 Capacitor 적용이 고려되어 있습니다.
- **백엔드/인증**: Supabase (PostgreSQL, Row Level Security, Auth 연동).
- **GitHub 동기화**: 보안 강화를 위해 클라이언트가 아닌 Supabase Edge Functions 서버를 거쳐 GitHub API를 호출합니다.

## 개발 완료 사항
- GitHub OAuth 기반 로그인 및 워크스페이스(레포지토리) 연결.
- 마크다운 에디터와 채팅형 UI를 결합한 Morphing Composer 도입.
- i18n 시스템 적용을 통해 사용자 UI에서 'Room' 대신 'Chat'이라는 직관적인 단어 사용.
- GitHub과의 푸시/풀 동기화, 오프라인 임시 저장소(Draft), 클라이언트 단에서의 500KB 이하 이미지 자동 압축 구현.
- (2026-06-14) 공개 랜딩 페이지 구축: 라우트 `/`, Launch 버튼 → `/login`, 헤더 한/A 언어 토글, obsidian.md 레퍼런스 기반 디자인(키컬러·로고는 Cotext), 메인 문구 "Sync your idea with your team and agents". 데모 콘텐츠는 가상 'cotext-team'으로 채움. (`src/pages/LandingPage.tsx`, `src/styles/landing.css`)
- (2026-06-14) 팀 협업: 워크스페이스 초대 링크(invite code), 팀원 리스트(sidebar), InvitePage. (`workspace_invites` 테이블, `get_repo_teammates` RPC)
- (2026-06-14) **§28.8 1차 동기화 인프라 완료**:
  - **Context Pack 복사**: 룸 헤더에 "Copy for LLM" 버튼 → 메타 헤더 포함 LLM-ready 마크다운 클립보드 복사
  - **Provenance**: 모든 블록에 `<!-- source: me -->` 자동 태그. `parseBlocks`도 source 추출
  - **붙여넣기 충실도**: Turndown HTML→마크다운 변환 fallback (ChatGPT/Gemini 아티팩트 대비)
  - **자동 가이드 생성**: Push 시 `.cotext/COTEXT_GUIDE.md` + `.cotext/INDEX.md` 자동 생성·갱신
  - **AGENTS.md 포인터**: `<!-- cotext:start -->` 마커로 비파괴 갱신
- (2026-06-14) **§28.8 2차 로컬 MCP 서버 완료**:
  - `packages/cotext-mcp/` 독립 패키지. `npx cotext-mcp`로 실행
  - 5개 도구: `list_rooms`, `get_room`, `search_context`, `get_pack`, `append_note`
  - 1개 리소스: `cotext://guide` (COTEXT_GUIDE.md 제공)
  - me-only 필터 기본 적용, provenance 추적, stdio 전송
- (2026-06-14) **§28.8 3차 토큰게이트 공유 URL 완료**:
  - `shared_links` 테이블 + `validate_shared_link` RPC
  - `context-share` Edge Function (공개, 토큰 검증)
  - Share 버튼 + 모달 (만료: 1h/24h/7d/30d/never)
  - `/share/:token` 페이지 (비로그인 접근 가능)
- (2026-06-14) **§28.8 4차 원격 MCP API 완료**:
  - `api_keys` 테이블 + `validate_api_key` RPC
  - `context-api` Edge Function (REST API, 7개 엔드포인트)
  - `ApiKeyManager` 컴포넌트 (워크스페이스 사이드바)
  - Bearer `ctx_xxx` 토큰 인증, read/write scope

## 다음 단계
MVP 단계가 성공적으로 마무리되었으며, 다음 단계로는 Context Pack 뷰어, 태그 및 구조화 기능 강화, 그리고 LLM 통합을 준비하는 과정이 포함될 수 있습니다.

동기화(Sync) 로드맵 (계획서 §28, 결정 D-004~007):
1. ~~Context Pack 복사 + 붙여넣기 마크다운 충실도 + provenance(source 태그) + AGENTS.md/INDEX 자동 유지~~ ✅ 완료
2. ~~**Cotext 로컬 MCP** (clone된 repo 대상)~~ ✅ 완료 (`packages/cotext-mcp`)
3. ~~토큰게이트 공유 URL 엔드포인트 (private repo 지원)~~ ✅ 완료 (`context-share`, `/share/:token`)
4. ~~원격 MCP(호스티드)~~ ✅ 완료 (`context-api`, `api_keys`)

**§28 Sync 로드맵 전체 완료! 🎉**

## 관련 문서
- [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] — 스택·토큰·이미지 압축 등 핵심 결정
- [[AI-Sessions/wiki/design/cotext-brand-and-landing]] — 브랜드·디자인 시스템·랜딩
- [[AI-Sessions/wiki/sources/01_cotext-development-plan_summary]] — 개발 계획서 요약
