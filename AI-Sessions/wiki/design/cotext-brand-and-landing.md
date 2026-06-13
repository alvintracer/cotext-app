# Design: Cotext 브랜드 · 디자인 시스템 · 랜딩

관련: [[AI-Sessions/wiki/projects/cotext_mvp]], [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]]

---

## 브랜드

- 로고: 텍스트 마크 `:>` (Quicksand, 액센트색) + 워드마크 "Cotext".
- 키컬러(액센트): 다크 `#3b9eff` / 라이트 `#0078d4` (블루).
- 폰트: 영문 **Inter**, 한글 **Pretendard**, 코드 JetBrains Mono, 로고 Quicksand.
- 테마: **다크 우선**, light/dark/system. 토큰 기반(`src/index.css`의 CSS 변수). `index.html` inline script로 FOUC 방지. localStorage 키 `cotext-theme`.
- i18n: 한/영. localStorage 키 `cotext-lang`. 헤더에 `한/A` 토글을 **테마 토글 왼쪽**에 배치(전 페이지 공통 패턴).

## 시그니처 UI — Morphing Composer

한 입력 컴포넌트가 collapsed(chat) → expanded → composer(editor)로 부드럽게 변형. 별도 모드 버튼이 아니라 같은 박스가 자람. 슬래시 커맨드(`/decision` 등)로 입력 시점에 구조화. (계획서 §22)

## 랜딩 페이지 (2026-06-14 신규)

- 파일: `src/pages/LandingPage.tsx`, `src/styles/landing.css`. 라우트 `/`(공개), **Launch 버튼 → `/login`**.
- 레퍼런스: obsidian.md의 레이아웃/감성, 단 키컬러·로고·폰트는 Cotext 자체.
- 메인 문구: **"Sync your idea with your team and agents"**.
- 전체 한/영 i18n(컴포넌트 내 컨텐츠 딕셔너리). 데모/스크린샷은 실제 프로젝트 내용을 제거하고 가상 'cotext-team'(Cotext 제작팀) 콘텐츠로 채움 — 외부 공개 자산이므로 실데이터 금지.

## 아이콘 정책 (필수)

- 아이콘 라이브러리는 **`@phosphor-icons/react`만 사용**. **`lucide-react`는 전면 금지** (2026-06-14 결정, ESLint `no-restricted-imports`로 강제 — import 시 빌드/lint 실패).
- **`Sparkle`, `MagicWand` 류(반짝이·요술봉) 아이콘 사용 금지** — ESLint로 차단. AI 클리셰 회피.
- GitHub 관련 버튼/배지는 Phosphor `GithubLogo` 사용(과거 lucide엔 GitHub 마크가 없어 GitBranch로 대체했던 이슈 해소됨).
- 기존 코드는 Phosphor 아이콘을 과거 이름으로 alias하여 마이그레이션함(예: `Warning as AlertTriangle`, `MagnifyingGlass as Search`) — JSX 사용처는 그대로 유지.

## 주의

- `designlang`(design-extract) CLI로 obsidian 토큰을 추출하려 했으나 외부 패키지 실행이라 자동 차단됨 — 필요 시 사용자가 직접 `npm i -g designlang && designlang https://obsidian.md` 실행.
