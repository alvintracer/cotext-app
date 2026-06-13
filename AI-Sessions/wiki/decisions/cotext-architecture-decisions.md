# Decisions: Cotext 아키텍처 핵심 결정

Cotext MVP의 되돌리기 어려운 핵심 기술 결정을 ADR 형식으로 기록한다.
관련: [[AI-Sessions/wiki/projects/cotext_mvp]], [[AI-Sessions/wiki/design/cotext-brand-and-landing]]

---

## D-001. 프레임워크: Vite + React + Supabase (Next.js 아님)

- 결정일: 2026-06-14
- 상태: active
- 결정자: 프로젝트 오너(사용자)
- 결정: 클라이언트는 **Vite + React + TypeScript SPA**. 서버 레이어는 **Supabase Edge Functions**.
- 근거:
  - 가벼운 SPA(빠른 dev·번들). 로그인 뒤의 앱이라 SSR 이점이 작음.
  - 정적 빌드 결과물이라 향후 **Capacitor 네이티브 래핑**이 쉬움.
- 트레이드오프: SPA엔 자체 서버가 없어 GitHub 프록시·OAuth 콜백을 Edge Functions로 직접 구현해야 함(Next.js API routes를 공짜로 얻지 못함).

## D-002. GitHub 토큰은 서버에서만 사용

- 상태: active
- 결정: GitHub 토큰을 다루는 모든 작업(repo 조회/생성, tree, content, pull, push, asset upload)은 **Supabase Edge Functions에서만** 수행. 브라우저는 토큰을 절대 보지 않음. 토큰이 필요 없는 메타데이터 CRUD는 supabase-js로 직접 호출(RLS로 보호).
- 근거: 토큰 노출 방지(보안). GitHub repo가 정본이므로 서버 프록시 경유가 안전.

## D-003. 이미지 자동 압축 ≤500KB

- 상태: active
- 결정: 어떤 이미지든 업로드 직전 **브라우저에서 ≤500KB로 압축**(WebP 우선, EXIF/GPS 제거, 긴 변 2048px 캡, `browser-image-compression`).
- 근거: GitHub Contents API 직접 업로드를 안전화하고 repo를 경량화 → 이미지에 LFS/외부 스토리지가 불필요.
- 주의: 애니메이션 GIF는 압축 제외(첫 프레임 손실·용량 폭증 위험). 초과 시 차단 또는 외부 링크 처리.
