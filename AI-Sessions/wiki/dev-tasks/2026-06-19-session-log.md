---
type: dev-task
date: 2026-06-19
status: done
versions: v1.0.26 ~ v1.0.33
---

# 2026-06-19 세션 작업 로그

v1.0.26 ~ v1.0.33 동안 수행한 모든 작업의 인수인계 문서.

관련: [[cotext_mvp]], [[mindsync-future-polish]], [[cotext-architecture-decisions]]

---

## 1. 화이트 스크린 픽스 (v1.0.26)

### 원인
vite-plugin-pwa의 Service Worker가 Capacitor WebView(`https://localhost`)에서 등록·영속. APK 업데이트 후 이전 SW가 살아남아 새 빌드의 해시드 chunk 요청을 가로챔 → 없는 파일 반환 → 화이트 스크린.

### 해결
- `vite.config.ts`: `injectRegister: false` → SW 자동 주입 제거
- `src/main.tsx`: Capacitor native 시작 즉시 모든 기존 SW `unregister()` + 모든 cache 삭제. 웹은 window.load 이벤트에서 정상 등록

### 교훈
Router race fix(v1.0.25)와 SW race는 **별개 벡터**. 하나 막았다고 끝이 아님.

---

## 2. 랜딩/로그인 카피 수정 (v1.0.27~28)

### 변경 핵심
- **메인 랜딩**: "채팅하듯 메모하세요. 언제 어디서든 당신의 지식이 동기화됩니다."
- **도구 리스트**: Github, MindSync, Claude, Cursor, ChatGPT, GrokAI, Gemini
- **핵심 메시지**: "Cotext는 또 하나의 노트앱이 아닙니다. 모든 노트앱을 연결하는, 언제나 동기화되는 GitHub 네이티브 공유 지식망입니다."
- **로그인**: "Sync your context anywhere" / "당신과, 팀과, 에이전트를 위한 단 하나의 공유 지식풀"

### 파일
- `src/pages/LandingPage.tsx`
- `src/pages/LoginPage.tsx`

---

## 3. 모바일 UX 수정 (v1.0.28~30)

### 키보드 패널 offset 과다
- **원인**: `adjustResize` + edge-to-edge navigation bar 패딩이 키보드 위에서도 적용됨
- **해결**: `MainActivity.java`에서 `WindowInsetsCompat.Type.ime()` 감지, 키보드 visible일 때 nav bar 패딩을 0으로

### 커밋 바 레이아웃
- `index.css`: 입력칸 + Pull/Push를 **단일 행**으로 (모바일에서 2행 → 1행)
- 툴바 숨기기: 키보드 올라올 때 상단 메뉴 숨김 (채팅 영역 최대화)

---

## 4. OAuth 토큰 저장 버그 (v1.0.31)

### 문제
앱에서 GitHub Push 시 `401 Bad credentials`.

### 근본 원인
네이티브 OAuth 딥링크 콜백에서 `access_token`/`refresh_token`만 추출하고 **`provider_token`(GitHub access token)을 무시**. 웹은 `SIGNED_IN` 이벤트에 자동 포함되지만 앱은 `setSession()`으로 수동 세트하므로 누락.

### 해결
`AuthContext.tsx`: 딥링크 hash fragment에서 `provider_token`도 추출 + `storeGitHubToken()` 명시적 호출.

### 주의
이미 로그인된 유저는 **로그아웃→재로그인** 해야 새 토큰 저장됨.

---

## 5. 3D Neural Globe (v1.0.32~33)

### 구현 (v1.0.32)
- `src/components/NeuralGlobe.tsx` 신규
- `src/styles/neural-globe.css` 신규
- 기술: `three.js` + `@react-three/fiber` + `@react-three/drei`
- `React.lazy()` 코드 스플릿 → 메인 번들 영향 없음 (별도 ~1MB chunk)
- 피보나치 분포로 구형 표면 노드 배치, 클러스터 색상, 호(arc) 엣지, 자동 회전

### WebGL Context Lost 수정 (v1.0.33)
- **원인**: 노드별 개별 `<mesh>` → 수백 draw calls → GPU 메모리 초과
- **해결**: 
  - **InstancedMesh**: 모든 노드 1개 draw call
  - **LineSegments 배치**: 모든 엣지 1개 draw call
  - **MAX_EDGES = 200** cap
  - DPR `[1, 1.5]`, geometry segment 수 감소
  - `webglcontextlost` 이벤트 핸들링 + 복구 UI

---

## 6. MindSync Studio UX (v1.0.32~33)

### 스크롤 불가 수정
- **원인**: `.app-content { overflow: hidden }` — 모든 페이지 스크롤 차단
- **해결**: `overflow-y: auto`로 변경. `.room-view`는 자체 `overflow: hidden`이 있어 영향 없음

### 프로그레스 바 추가
- **원인**: `_llmProgress`(밑줄 prefix) — 상태 저장만 하고 UI 미표시
- **해결**: `llmProgress`로 rename + 프로그레스 바 UI 추가 (shimmer 애니메이션)

### Build Graph 버튼 펄스
- 파일 준비 완료 + 결과 없으면 `btn-pulse` 클래스 → 테두리 accent 색 펄싱

---

## 7. Edge Function SSE 스트리밍 (v1.0.33)

### 문제
`neural-extract-managed`가 전체 LLM 추출 완료까지 기다린 후 한 번에 JSON 응답 → Supabase Edge Function 시간 제한(150초 free / 400초 pro) 초과 → `connection closed before message completed`.

### 해결: SSE 스트리밍
- **서버** (`supabase/functions/neural-extract-managed/index.ts`):
  - `text/event-stream` 응답으로 전환
  - `progress`, `chunk`, `done`, `error` 이벤트 전송
  - `generateKnowledgeGraphLLM`의 `onProgress`/`onChunkResult` 콜백 활용
  - 진행 중 계속 데이터 전송 → 연결 유지 (타임아웃 방지)

- **클라이언트** (`src/lib/supabase/functions.ts`):
  - `managedKnowledgeApi.extract()`: `fetch()` + `ReadableStream` SSE 파서
  - `onProgress` 콜백으로 실시간 진행률 UI 업데이트
  - 비-SSE 응답(에러 케이스)도 JSON 폴백 처리

- **KnowledgeStudioPage**: managed extraction에도 `onProgress`와 abort signal 전달

### 배포
`npx supabase functions deploy neural-extract-managed --no-verify-jwt` 완료.

---

## 버전 히스토리

| 버전 | 핵심 변경 |
|------|----------|
| v1.0.26 | SW 화이트 스크린 픽스 |
| v1.0.27 | 랜딩/로그인 카피 수정 |
| v1.0.28 | 모바일 키보드 offset + 커밋 바 레이아웃 |
| v1.0.29 | 커밋 바 인라인 + 키보드 네비 패딩 |
| v1.0.30 | 키보드 IME 패딩 + OAuth 토큰 저장 |
| v1.0.31 | OAuth provider_token 수정 |
| v1.0.32 | 3D Neural Globe + 스크롤/프로그레스/펄스 |
| v1.0.33 | WebGL InstancedMesh + SSE 스트리밍 |

---

## 다음 작업자 확인 사항

1. **Neural Globe 성능**: 노드 500+ 환경에서 모바일 WebGL 성능 테스트 필요
2. **SSE Edge Function**: Supabase free tier에서 실제 대용량 문서 추출 타임아웃 검증
3. **Track B 한계**: 크레딧 top-up 미구현, 토큰 단가 보정 미적용, cross-module Deno import 리스크 여전
4. **OAuth**: 기존 앱 유저는 재로그인 필요 (push 시 401 발생 가능)
