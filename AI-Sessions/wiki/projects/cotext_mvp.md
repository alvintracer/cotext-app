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

## 다음 단계
MVP 단계가 성공적으로 마무리되었으며, 다음 단계로는 Context Pack 뷰어, 태그 및 구조화 기능 강화, 그리고 LLM 통합을 준비하는 과정이 포함될 수 있습니다.

## 관련 문서
- [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] — 스택·토큰·이미지 압축 등 핵심 결정
- [[AI-Sessions/wiki/design/cotext-brand-and-landing]] — 브랜드·디자인 시스템·랜딩
- [[AI-Sessions/wiki/sources/01_cotext-development-plan_summary]] — 개발 계획서 요약
