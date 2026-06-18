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

## D-009. Neural Link — 하이브리드 그래프 (노드·클러스터·엣지)

- 결정일: 2026-06-15
- 상태: active (P0 착수)
- 결정자: 프로젝트 오너(사용자)
- 결정: repo 안 파일/블록을 **노드·클러스터·엣지**로 연결하는 레퍼런스 구조를 추가한다. Obsidian의 링크/백링크/속성에서 **필요한 것만** 가져오되, 핵심 포지셔닝은 "인간이 그리는 그래프"가 아니라 **"에이전트가 읽는 컨텍스트 그래프"**.
- 핵심 모델:
  - **노드 = 블록**(파일 전체 아님). 기존 블록의 `timestamp + source` 를 ID로 재사용. 라벨 보유.
  - **클러스터 > 개별 freelink**: 개별 링크 헤어볼을 피하기 위해 타입드 그룹(클러스터=태그형 노드 묶음)을 1차 단위로 삼는다. 엣지는 (a) 클러스터 경유 암묵, (b) 노드↔노드 직접(타입 옵션) 둘 다 지원.
  - **하이브리드 저장 = repo 정본 + Supabase 파생 인덱스**:
    - In-repo(무료): 한 레포 안 노드/클러스터/엣지 메타는 **markdown(HTML 주석) 또는 `.cotext/neural.json` 이 정본**. grep/로컬 MCP로 읽힘, 락인 없음. push 시 자동 갱신(COTEXT_GUIDE/INDEX와 동일 패턴).
    - Cross-repo(유료 "Neural Link"): 여러 레포를 잇는 클러스터/엣지는 단일 markdown에 못 담음 → **Supabase가 정본 역할 + 레포별 `.cotext/neural-link.json` export 스냅샷**(이식·백업으로 락인 회피). Supabase 인덱스는 날아가도 repo에서 재생성 가능 = D-001/D-004 불변식 유지.
  - **단일 쓰기 경로(사람·에이전트 대칭)**: `nodify()/attachCluster()/linkEdge()` 를 순수 lib 함수로 두고, **UI 버튼과 MCP 도구가 동일 함수를 호출**한다. → 사람은 키 없이 100% 동작(에이전트 의존 아님), 에이전트 자동화는 같은 경로에 얹는 선택적 설탕. provenance만 다르고 결과물은 동형.
- 무료/유료 경계(자연 발생):
  - 무료(GitHub-native): 노드화·라벨·클러스터, 단일 레포 백링크 패널, 레포 내 클러스터 검색, 단일 레포 그래프 뷰(전환 미끼).
  - 유료(Supabase): **크로스 레포** 클러스터 검색·그래프, 실시간 인덱스, **에이전트 그래프 컨텍스트 API(MCP)** — 차별점.
- 근거: 마찰(수동 묶기)을 에이전트 제안으로 없애되 의존하지 않게 사람 우선. 서버 연산이 진짜 필요한 크로스 레포·시각화·인덱스에만 과금 → 명분이 데이터 구조에서 자연 발생. Obsidian 패리티 기능이어도 GitHub-native·repo=정본·멀티에이전트 축 위에 얹히면 차별화됨.
- 미결 포인트: 크로스 레포 엣지 정본(Supabase 정본+export 채택), 네이밍("Neural Link"는 Neuralink 상표 혼동 위험 — Synapse/Mesh/Neural Graph 후보 보류).
- 상세: 계획서 §32. 단계: P0 스키마+단일 쓰기 lib → P1 사람 수동 캡처 → P2 백링크 패널 → P3 Supabase 인덱스+크로스레포(유료) → P4 그래프 뷰 → P5 에이전트=같은 경로 재사용.

## D-010. MindSync — 두뇌 레이어 명칭 + 워크스페이스-스코프 anchor 모델

- 결정일: 2026-06-17
- 상태: active
- 결정:
  - **이름**: 사용자 직면 표현은 **"MindSync (마인드싱크)"** 로 통일. ("Neural Link"는 Neuralink 상표 혼동 우려가 있던 D-009 미결 항목 해소.) lib·파일·DB 컬럼은 안전상 기존 `neural*` 이름 유지 — UI 문구만 변경.
  - **레이어 구분**: Cotext **Workspace** = 컨텍스트 풀 (대화·메모 캡처 공간). **MindSync** = 그 위에 얹는 두뇌 레이어(지식 그래프 생성·증강·think). 사용자는 어디서든 같은 MindSync에 접근(랜딩, 워크스페이스 헤더).
  - **MindSync는 workspace-scoped**: 모든 MindSync 결과(노드·클러스터·엣지)는 **하나의 anchor workspace**의 `.cotext/neural.json` 에 시드/증강된다. 휘발성 단독 그래프는 사용자가 anchor를 비웠을 때만(임시 검토용).
  - **GENERATE vs AUGMENT**: 첫 시드 = GENERATE, 이후 추가 = AUGMENT. lib 차원에선 같은 `mergeGraphs` 호출 — UX framing만 다름. 자동 머지 토글 기본 ON.
  - **크로스 워크스페이스 이식**: 별도 메커니즘 안 만듦. 같은 머지 엔진을 다른 anchor로 가리키면 됨 (사용자가 선택만 바꾸면 자동 처리).
- 근거:
  - "두뇌"는 한 곳에 살아야 효용이 큼. 다중 워크스페이스에 그래프가 흩어지면 회수가 어려워짐.
  - 다만 GitHub repo 별로 분리하는 게 Cotext의 정본 원칙과 맞음 → 각 워크스페이스가 자기 두뇌를 갖되, MindSync 페이지는 어디서든 anchor를 바꿔가며 다른 두뇌를 짓는다.
  - 텍스트 원본도 `mindsync-imports/<slug>` 룸으로 저장해 추적성 유지.
- 진입점 통합:
  - 헤더: Studio + Think 두 버튼 → 단일 "MindSync" 버튼.
  - 랜딩: 3개 카드 → 단일 MindSync 패널(LAUNCH 스타일).
- 안전성:
  - `NeuralGraphBoundary` (ErrorBoundary)로 3곳(RoomView·Studio·Think) 그래프뷰 감싸 흰 화면 크래시 방지.
- 미결 / 향후:
  - **3D Jarvis 비주얼**(노드 입체화, 로딩 비주얼 등): 다음 단계, P6 비주얼 폴리시로 분리.
  - **Phase 6 Ambient capture**(이메일·캘린더 webhook, iOS 단축어): GBrain 합성 모델 마지막 한 칸. 별도 phase.
  - **Track B 매니지드 모델**(서버 키 종량제): Phase 3 lib을 서버에서 호출하는 형태로 확장 — 결제·crediting·LLM 재시도 fail-safe 추가.

### D-010 Addendum ? Track B Beta Cut (2026-06-18)

- First managed milestone ships before credits/billing tables.
- `Managed` now means server-side extraction with a platform-held LLM key, not a placeholder toggle.
- Output contract stays identical to BYOK Phase 3 so merge, graph view, Think mode, and provenance handling do not fork.
- Billing is explicitly deferred: current metadata reports `beta-unmetered`; credit deduction, balance UI, and payment integration remain the next step.
- Design rule stays the same: BYOK for user-controlled cost, Managed for zero-setup onboarding.
- Operational note (2026-06-18): Track B schema was applied via Supabase Management API instead of `db push`, to avoid re-triggering the unresolved `20260614` migration conflict documented in the project log.
