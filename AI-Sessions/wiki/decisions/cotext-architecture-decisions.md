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

## D-004. 동기화(Sync) 모델: repo=정본, 로컬=pull / 웹=push

- 결정일: 2026-06-14
- 상태: active
- 결정: 컨텍스트 동기화는 소비자별로 방향을 고정한다.
  - **로컬/CLI 에이전트(Claude Code·Cursor 등) = PULL**: repo를 파일로 직접 읽음. Cotext는 repo를 읽기 좋게(AGENTS.md/CLAUDE.md, `.cotext/INDEX.md`, MCP)만 만든다.
  - **웹 챗(ChatGPT·Claude.ai·Gemini) = PUSH(+조건부 pull)**: Context Pack 복사로 가져다주고, AI 답변은 컴포저에 붙여넣어 repo로 회수.
- 인바운드는 항상 repo로 회수(로컬=commit→pull, 웹=paste→append→push). repo는 단일 정본.
- 상세: 개발 계획서 §28.

## D-005. 공유 URL은 토큰게이트 Cotext 엔드포인트 (private repo 지원)

- 상태: active
- 결정: 웹 에이전트용 공유 URL은 **Cotext 서버(Edge Function) 토큰게이트 엔드포인트**(`cotext.app/p/<token>`)로 제공. **public raw GitHub는 채택하지 않음.**
- 근거: private repo 지원이 필수. private raw URL은 수 분 만에 만료되는 임시 서명 토큰이라 공유 불가. 서버가 저장 토큰으로 대신 인증해 plain 마크다운으로 중계하면 private도 가능하고, 만료·회수·사용횟수·범위를 Cotext가 통제한다.

## D-006. MCP는 로컬 먼저, 원격은 동형 인터페이스로 후속

- 상태: active
- 결정: Cotext MCP는 **로컬 MCP(clone된 repo를 읽는 무인증·오프라인)** 를 먼저 구현하고, 원격 MCP(호스티드, Claude.ai 커넥터/ChatGPT Actions)는 **같은 툴 인터페이스**(`list_rooms`/`get_room`/`search_context`/`get_pack`/`append_note`)로 뒤이어 만든다.
- 추가 규칙: 인바운드 블록은 `source: me | chatgpt | claude | gemini | agent` 태그로 provenance를 기록한다(사람 생각 vs AI 생성 분리). 상세: §28.6~28.8.

## D-007. "Sync with Agents" 핸드셰이크 + 자동 가이드 파일

- 결정일: 2026-06-14
- 상태: active
- 결정:
  - **"Sync with Agents" 버튼** → 대상별(로컬 CLI / 웹 챗 / 원격 MCP) **부트스트랩 프롬프트**를 복사. 프롬프트는 짧게 유지.
  - 규칙·구조의 단일 정본은 Cotext가 repo에 **자동 생성·유지하는 `.cotext/COTEXT_GUIDE.md`**. 에이전트는 이걸 먼저 읽는다(+`.cotext/INDEX.md` 지도).
  - repo 루트 `AGENTS.md` / `CLAUDE.md`는 가이드를 가리키는 **얇은 관리 블록**(마커로 감싼 비파괴 갱신).
  - 가이드에 **"git pull → 블록 형식 작성 → git push" 의무 프로토콜**을 명시 → 어느 환경에서든 동일 연결.
  - Context Pack에 **`source=me-only` 필터**: AI가 생성했던 블록을 빼고 "내 생각"만 주입해 에코 재주입(루프) 방지.
- 근거: 사용자의 로컬 ContextHub(START_HERE/AGENTS)를 Cotext가 자동화·간소화한 직계 후손. 더 직관적이고 git 연계가 의무화됨. 상세: 계획서 §28.9~28.12 (SYNC-005·006).

## D-008. 임베드 멀티모델 에이전트 — 우측 패널 + BYOK + 어댑터

- 결정일: 2026-06-14
- 상태: active (구현 완료)
- 결정:
  - **UI는 우측 확장 패널**(AgentPanel). 캡처 컴포저(=내 생각)와 분리해 provenance를 깨끗하게 유지. 모바일은 전체화면.
  - **도구 1벌 + 모델 교체**: 모든 provider가 OpenAI 호환 function-calling이므로 어댑터 3종(openai-compatible / anthropic / gemini)으로 통일.
  - **BYOK**: 사용자가 provider API 키를 입력해 활성화. 키는 **이 브라우저 localStorage**에만 저장(`cotext-llm-keys`). 이는 §28.9의 `ApiKeyManager`(Supabase `api_keys` = Cotext 자체 API 키, 외부 에이전트용)와 **별개 저장소** — 혼동 금지.
  - **repo as default context**: 패널이 현재 챗의 `.cotext/cotext.md`를 자동 로드해 system 프롬프트에 주입. 모든 모델이 기본적으로 repo를 컨텍스트로 깐다.
  - **무료 임베드 경로** = Gemini / GitHub Models / Groq (진짜 무료 API 티어). GPT·Claude·Grok은 BYOK(유료) 또는 외부 §28.
  - AI 답변은 `source:<model>` 라벨 + 복사로 repo 회수(현재). 도구콜 자동 편집은 후속.
- 상세: 계획서 §29. 파일: `src/lib/agent/{models,keys,providers}.ts`, `src/components/AgentPanel.tsx`, `src/styles/agent.css`.
