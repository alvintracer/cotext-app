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

- (2026-06-14) **§29 임베드 멀티모델 에이전트(우측 패널) 완료** (결정 D-008):
  - `AgentPanel` 우측 확장 패널 — 앱 내에서 직접 멀티모델 채팅. 캡처 컴포저와 분리(provenance 청결)
  - **repo as default context**: 현재 챗 `.cotext/cotext.md`를 자동 로드해 system 주입
  - **BYOK** provider 키(localStorage `cotext-llm-keys`) — §28.9 `ApiKeyManager`(Cotext API 키, Supabase)와 별개
  - 어댑터 3종(openai-compatible/anthropic/gemini). 무료: Gemini/GitHub Models/Groq, BYOK: GPT/Claude/Grok, Custom
  - 파일: `src/lib/agent/{models,keys,providers}.ts`, `src/components/AgentPanel.tsx`, `src/styles/agent.css`
  - write-back: 답변별 "챗에 저장"(source 태그 append+push, RoomView 자동 새로고침)
  - **스트리밍**: 직접 provider는 SSE 스트리밍, GitHub Models는 프록시라 non-stream
  - **GitHub Models**: OAuth 로그인 토큰은 models 권한 없음 → fine-grained PAT(models:read) BYOK + Edge Function `github-models` 프록시(§29.7)
  - 아이콘 codepen-logo
  - 후속: 멀티모델 팬아웃, 무키 체험(하이브리드)
- (2026-06-14) **§29.8 도구콜 자동편집(Agent Mode) 완료**:
  - `tools.ts`: 3개 도구(3형식: OpenAI/Gemini/Anthropic) — `list_rooms`(읽기), `get_room`(읽기), `append_note`(쓰기/승인필요)
  - `providers.ts`의 `runToolLoop`: 3종 shape별 tool loop (`toolLoopOpenAI`, `toolLoopAnthropic`, `toolLoopGemini`)
  - **모든 provider에서 Agent Mode 사용 가능** (Gemini, Claude, OpenAI, Groq, xAI, OpenRouter, Custom)
  - 모델 fallback: 지정 모델이 404/not found 시 `fallbackModel`로 자동 재시도
  - 읽기 도구는 자동 실행, `append_note`는 미리보기→승인/거절 카드 UI
- (2026-06-14) **§29.9 GitHub Models 제거 & 모델 목록 정비**:
  - GitHub Models provider 삭제 (전부 BYOK로 통일)
  - 각 provider별 실제 호출 가능한 모델 목록 확충 (OpenAI: gpt-4.1 시리즈, Gemini: 2.0/2.5, Groq: gemma2/mixtral 등)
  - `proxy` 속성 제거, `chatGithubModels` 함수 사용처 정리
- (2026-06-14) **§30 멀티 파일 텍스트 추출 완료**:
  - `src/lib/extract/index.ts`: DOCX(mammoth→Turndown, 구조 보존), PDF(pdf.js), hwpx(JSZip), txt/md/csv/json — heavy lib 동적 import
  - MorphingComposer: 문서 프리뷰에 "텍스트 추출" 버튼 → `## 파일명` 헤더로 본문 삽입, 추출 성공 시 파일 자동 제거(텍스트만)
  - 라이브러리 추가: pdfjs-dist, mammoth, jszip + `vite-env.d.ts`. (이미지 OCR은 기존 tesseract)
- (2026-06-14) **§31 Draft → Fix with Agent 완료**:
  - draft 3-dot → "Fix with Agent" → 우측 패널 자동 재구조화(레포 grounding, source 태그)
  - 결과를 **GitHub push가 아니라 RoomView 로컬 콘텐츠에 적용**(draft 충돌 회피): "추가" / "원본 대체(원본 블록 삭제+새 블록)"
  - 배선: RoomView `onFixWithAgent`/`apply` ↔ WorkspaceDetailPage(seed·fixOriginTs·agentApply) ↔ AgentPanel(seed 자동전송·onApply·canReplace)
  - source→me 전환, +추가는 기존 기능 재사용
- (2026-06-15) **§32 Neural Link 그래프 (계획 승격, P0 착수)** (결정 D-009):
  - repo 블록을 **노드·클러스터·엣지**로 연결. 포지셔닝 = "에이전트가 읽는 컨텍스트 그래프"
  - 노드=블록(timestamp+source 재사용), 클러스터>freelink, 하이브리드 저장(repo 정본 + Supabase 파생 인덱스)
  - **단일 쓰기 경로**(`src/lib/neural`): UI 버튼·MCP 도구 공용 → 사람 키 없이 동작, 에이전트는 같은 경로 재사용(선택)
  - 무료=단일 레포(GitHub-native), 유료=크로스 레포+그래프 뷰+에이전트 그래프 API(Supabase)
  - 단계 P0(스키마+lib)→P1 수동 캡처→P2 백링크→P3 인덱스/크로스레포(유료)→P4 그래프 뷰→P5 에이전트
  - **P0 완료**: `src/lib/neural/{types,id,format,graph,index}.ts`(순수 단일 쓰기 lib) + `supabase/migrations/20260615_neural_link.sql`(파생 인덱스 3테이블+RLS+GIN). 라운드트립 스모크 통과
  - **P1 완료**: RoomView 블록 3-dot에 "노드로 만들기/편집·해제"(모든 블록), 라벨+클러스터 검색·생성 팝업(`NodeEditor`), 타임라인 노드 배지+클러스터 칩, `.cotext/neural.json` push 경로 연동(`persistNeuralGraph`, 재페치 머지). `src/styles/neural.css`. tsc/빌드 클린, 신규 lint 0
  - **P2 완료**: 노드 블록 아래 "관련" 스트립(`RelatedStrip` — `relatedNodes`: 같은 클러스터+엣지, 같은 챗=스크롤/다른 챗=네비), 클러스터 칩 클릭→멤버 뷰어(`ClusterModal`, 레포 전체), 크로스-룸 점프(WorkspaceDetailPage `onNavigateRoom`+`focusBlockTs`, 로드 후 스크롤+하이라이트). tsc/빌드 클린, 신규 lint 0
  - **P2.5 완료**: 노드↔노드 직접 엣지 UI(`LinkEditor` — 블록 3-dot "노드 연결", 노드 검색·관계 유형 관련/대체/근거, 기존 링크 해제). 엣지는 neural.json만 거주 → 콘텐츠 push에 안 묶임 → **디바운스(1.5s) 자동 persist**(graphRef/contentRef 기반 `persistNeuralGraph` 리팩터). tsc/빌드 클린, 신규 lint 0
  - **DB 배포 완료(2026-06-15)**: `20260615_neural_link.sql`을 원격(프로젝트 `qyyqsuzqstkhnrmyqskn` = transight-big-brother, .env 링크됨)에 적용. `neural_clusters/neural_nodes/neural_edges` 3테이블 + RLS(user_id=auth.uid()) + GIN(clusters) 인덱스 생성·검증 완료. 마이그레이션 히스토리 `20260615 applied` 기록됨
    - ⚠️ **주의**: `supabase db push`는 선행 `20260614`(team_invites) 로컬↔원격 버전 불일치로 막힘. 그래서 neural만 **Management API(`/database/query`)로 직접 적용** 후 `migration repair --status applied 20260615`로 기록. `20260614` 불일치는 다른 세션 산출물이라 손대지 않음 — 향후 `db push` 전에 별도 정리 필요(blind `repair --reverted`는 team_invites 재실행→`create policy` 비멱등 충돌 위험)
  - **P3 완료 (유료 Neural Link 시작점)**: Edge Function `neural-index` 배포(프로젝트 qyyqsuzqstkhnrmyqskn). 3 액션 — `sync`(클라 in-memory 그래프→인덱스 레포단위 교체), `search`(사용자 전체 레포 가로지르는 클러스터/노드 ilike 검색), `reindex`(서버가 GitHub에서 각 레포 neural.json 직접 읽어 재구축, GitHub 토큰 서버전용 D-002 준수)
    - 클라: `neuralApi`(functions.ts) + persistNeuralGraph 후 `neuralApi.sync` 자동 호출(best-effort) + RoomView 헤더 "뉴럴 검색" 버튼→`NeuralSearchModal`(디바운스 크로스레포 검색, 같은 레포=점프/네비·타 레포=`/workspace/:id` 이동)
    - 인증: verify_jwt(기본) + getUser, RLS 사용자 스코프. 배포·auth게이트(401) 스모크 통과. tsc/빌드/신규 lint 0
    - ⚠️ e2e(sync/search/reindex)는 로그인 세션 필요 → 사용자 확인 대상
  - **선택→노드화 (P1 확장)**: 채팅뷰(브라우저 selection)·에디터뷰(CodeMirror selectionSet) 둘 다 텍스트 드래그 시 **"노드로 만들기" 떠 있는 버튼**(.selection-popup, fixed). 선택을 감싸는 `## ts` 블록을 노드 대상으로, **선택 텍스트는 라벨 시드**. 노드 모델(블록=노드) 유지. 이미 노드면 자동으로 편집 모드.
    - lib: `findEnclosingBlockTs(content, offset)` (에디터뷰에서 enclosing 블록 ts 탐색)
    - CotextEditor: `onSelectionForNode` 콜백 prop (selectionSet 후크, coordsAtPos)
    - RoomView: document mouseup 리스너(timeline/preview), CotextEditor 콜백 통합 → 단일 `selPopup` 상태 → NodeEditor 시드
  - **클러스터 피커 elastic 인덱스 검색 (P1+P3 통합)**: NodeEditor 클러스터 검색이 로컬 graph.clusters만 보던 문제 수정. 입력 후 **300ms 디바운스로 `neuralApi.search` 호출** → 다른 챗/레포에서 만든 클러스터도 자동 노출. 인덱스 결과는 "다른 레포" / "인덱스" 라벨로 구분. 픽 시 cluster_id(slug) 보존하여 cross-repo 동일 클러스터로 머지(`handleSaveNode` picks 시그니처 변경: name→{name,id?}, `upsertCluster`가 id 인자 활용). 이전 동작(없으면 새로 생성)도 그대로 유지.
  - **선택 영역 하이라이트 보강**: drag한 자리가 popup 클릭으로 deselect되어 안 보이던 문제 수정. **CSS Custom Highlight API**로 `::highlight(neural-selection)` 등록(Range 스냅샷, focus 변경에도 살아남음, popup 닫힐 때 정리). `.room-timeline/preview ::selection` 색도 32%로 진하게. 에디터뷰 `.cm-selectionBackground` 20→30%·25→35%
  - **P4 그래프 뷰 완료**: `NeuralGraphView` 모달(`d3-force` 추가) — 룸 헤더 "그래프" 버튼으로 열림
    - **물리엔진 ON/OFF 토글**: OFF 시 **모든 노드 현재 위치에 자동 핀**(`fx/fy` 고정, `sim.alpha(0).stop()`). ON 시 사용자가 핀한 것 외엔 해제하고 시뮬레이션 재시작
    - **드래그=자동 핀**(사용자가 옮긴 노드 그 자리 유지), **모든 핀 해제** 버튼
    - **KYT 스타일 시각화**: 노드를 클러스터별 색깔 링(최대 3개 stacked rings)으로 표시, 엣지 supersedes는 dashed+화살표
    - **인터랙션**: 클릭→블록 점프(타 챗은 네비), 휠 줌(커서 기준), 배경 드래그 팬, hover 툴팁(라벨/룸/클러스터/핀 상태)
    - **legend 사이드바**: 노드/클러스터/엣지 카운트, 클러스터 색 스와치(클릭→필터), 도움말. 검색 박스(라벨/클러스터 substring 매칭, 비매칭 노드는 흐리게)
    - 특화: 타 챗 노드는 좌상단 amber 도트, 핀 노드는 우상단 accent 도트. ResizeObserver로 viewport 적응. 모바일 풀스크린
    - 구현 메모: d3-force는 node array 직접 mutate(API 특성), `react-hooks/immutability`만 파일 레벨 disable(개별 disable이 React Compiler 분석 단위와 안 맞아 unused로 떨어졌음). 그 외 lint 0, tsc/빌드 클린
  - **P4 그래프 뷰 보강 (UX 사용자 피드백)**:
    - **클릭=선택, 드래그=이동 분리**(4px 모션 임계값). 클릭은 더 이상 자동 점프하지 않음 → 우측 디테일 패널이 열림
    - **우측 디테일 패널** (`NodePanel`/`ClusterPanel`): 라벨·룸·source·클러스터 칩(색)·**블록 본문**(현재 룸=local, 타 룸=GitHub fetch + 캐시)·연결 노드 목록(관계 라벨)·"이 블록으로 이동" 버튼·닫기. 패널 닫을 때까지 hover 툴팁 억제(겹침 방지)
    - **엣지 라벨** SVG 미드포인트에 표시(관련/대체/근거), 줌 0.55배 이상에서만 렌더(클러터 방지), 작은 rounded rect 배경
    - **클러스터 묶음 토글** (`collapsed`): ON 시 같은(첫) 클러스터 노드를 **하나의 super-node**로 머지(멤버 수에 비례하는 반지름·점선 halo·color fill·멤버 카운트). 엣지는 그룹간으로 집계(중복 제거, 자기참조 필터). 클러스터 super-node 클릭 → ClusterPanel(소속 노드 리스트, 클릭으로 개별 노드 선택)
    - 블록 텍스트 페치: RoomView에 `rooms` prop 추가(WorkspaceDetailPage→RoomView), 현재 룸은 local content에서 `extractBlockText`(format.ts 신규), 타 룸은 githubApi.getRoomContent + ref 캐시
    - Jump 시 그래프 모달 자동 close (RoomView에서 `setGraphOpen(false)` 래핑)
    - 신규 lint 0(reset-on-selection set-state-in-effect 3건만 disable, 의도된 패턴)
  - **P4 그래프=에디터**: 그래프 안에서 채팅/에디터에서 할 수 있는 노드·엣지 편집을 동일하게 수행, 모두 repo 정본까지 흘러감(`handleRemoveNode`/`handleLinkEdge`/`handleUnlinkEdge` 재사용)
    - **노드 도넛 4분할 링 메뉴** (`RingMenu`): 노드 선택 시 nodeRadius+8~+28 도넛 4 segments
      - top=Delete(빨강, 현재 룸 노드만 활성), right=관련/Relates(파랑), bottom=대체/Supersedes(주황), left=근거/Supports(녹색)
      - 색은 segment별 구분(빨강·파랑·주황·녹색), 비활성 시 35% opacity
    - **드래그 투 링크**: 엣지 type segment를 다른 노드로 drag → 그 type으로 엣지 생성(setPointerCapture 안 쓰고 document level pointermove/up + `elementFromPoint`로 drop target 탐지). 드래그 중 source→cursor 점선 preview 라인, hover target은 점선 accent 링으로 강조
    - **엣지 클릭→`EdgeMenu`** (작은 4분할 도넛): 같은 4 segments. type segment 클릭 시 `linkEdge(from,to,newType)`로 in-place 갱신(lib의 linkEdge가 기존 엣지면 type만 업데이트), delete segment 클릭 시 `unlinkEdge`. 현재 type은 fill opacity·font weight로 active 표시
    - 엣지 클릭 영역 확장: visible line 위에 stroke=transparent strokeWidth=14 invisible overlay
    - 배경 클릭(드래그 아닌 단순 클릭, 4px 임계 동일)으로 노드/엣지 선택 해제
    - 묶음 모드(`collapsed`)에서는 엣지 편집 비활성(super-node 간 집계 엣지는 개별 엣지가 아님 — 일관성)
    - 데이터: 노드 `<g>`에 `data-graph-node-id={n.id}` (drop target 탐지용)
    - 한/영 (delete→삭제/Del, relates→관련/Rel, supersedes→대체/Sup, supports→근거/Sps)
    - tsc/빌드 클린, 신규 lint 0
  - **P5 계획 정리 (MCP grounding)**: [[AI-Sessions/wiki/concepts/neural-link-mcp-grounding]] 신규 — 옵시디언 비교(인라인 토큰 + grep), 4가지 옵션(A 정본 직접 파싱·B Supabase 인덱스 API·C `.cotext/NEURAL_INDEX.md` 자동 생성·D MCP 도구 함수). 추천 조합: 로컬 MCP=A+D, 원격=B+D, 보조=C, 임베드 AgentPanel=직접 system 주입. 계획서 §32.4에 P5.1~P5.4 세분화
  - **P5.4 완료 (옵션 C grounding)**: `src/lib/neural/indexMd.ts` 신규 — `generateNeuralIndex(graph)` 가 사람·에이전트 둘 다 읽기 쉬운 markdown 표(Summary / Clusters 별 멤버 노드 표 / Explicit edges / Unclustered nodes / 사용법 안내) 출력. push 흐름(persistNeuralGraph)에 `.cotext/NEURAL_INDEX.md` 자동 업로드 추가(neural.json 옆에, 같은 best-effort 패턴, 기존 sha 확인 후 갱신). MCP/외부 에이전트는 이 한 파일만 읽어도 그래프 구조 파악 가능 — tool-call 없이 grounding 비용 0. 라운드트립 스모크 통과(클러스터·노드·엣지 정확 렌더). tsc/빌드 클린, 신규 lint 0
  - **P5.1 완료 (옵션 A + D, 로컬 cotext-mcp)**: `packages/cotext-mcp`에 그래프 도구 4개 + 리소스 1개 추가
    - `get_neural_graph` (format: summary/markdown/json), `find_related`, `search_clusters`, `get_node_context` (블록 본문 + 인접 노드 라벨)
    - `cotext://neural-index` 리소스 — NEURAL_INDEX.md 그대로 노출
    - 정본 직접 파싱: `loadGraph()`이 `.cotext/neural.json` + 전체 룸의 `cotext.md` 인라인 `<!-- node: -->` 주석을 합쳐서 일관된 그래프 복원(엣지 dangling 자동 정리)
    - 파서·extractBlockText 인라인 작성 (src/lib/neural에 의존 안 함 — 패키지 독립 publish 가능 유지)
    - 스모크 통과: tools/list에 9개 도구(기존 5 + 신규 4), `get_neural_graph summary` 정상 응답
  - **P5.3 완료 (AgentPanel 임베드 grounding)**: 패널 열 때 `.cotext/neural.json` 자동 로드 + 현재 룸의 인라인 노드 파싱 → 컴팩트 텍스트 요약(`buildNeuralSummary`) 생성: 레포 전체 클러스터 인덱스(최대 20) + 이 챗의 노드 라벨/클러스터/ts(최대 30) + 이들에 닿는 엣지(최대 20). 1500자 이하 강제. `buildSystem()`이 system 프롬프트에 `--- NEURAL LINK GRAPH ---` 섹션으로 자동 주입 → AgentPanel 답변이 그래프 grounding 위에서 동작 (tool-call 없이도)
  - **P5.2 완료 (옵션 B + D, 원격 context-api)**: 4 GET 엔드포인트 추가
    - `/neural/graph?format=summary|json|markdown` (markdown은 GitHub `.cotext/NEURAL_INDEX.md` 그대로 streaming, json은 Supabase 3테이블 결합)
    - `/neural/find_related?node_id=...`
    - `/neural/search_clusters?q=...` (overlaps + ilike)
    - `/neural/node?id=...` (Supabase 노드 메타 + GitHub에서 블록 본문 추출 + 인접 노드)
    - `validateKey`가 `workspace_id` 추출하도록 보강, 모든 쿼리는 workspace 스코프(api_key 자체가 워크스페이스 한정)
    - **config.toml에 `[functions.context-api]/[functions.context-share] verify_jwt = false` 명시** — 두 함수는 자체 ctx_xxx 키 인증이라 Supabase JWT 게이트웨이가 막으면 안 됨. `--no-verify-jwt` 플래그로 재배포(원래 대시보드 수동 설정에 의존하던 걸 코드로 명시화)
    - **cotext-mcp REMOTE 모드 연결**: 동일 4 도구 + 리소스가 `apiFetch('neural/...')`로 자동 포워딩 → 로컬·원격 인터페이스 동형
    - 라이브 배포 + 스모크 통과(invalid ctx_xxx → 우리 코드의 401, gateway 통과 확인)
  - **§32 P5 일단락**: Obsidian 못하는 차별점(에이전트 1급·크로스 레포·MCP 표준 도구·grounding 0 비용 옵션)이 실제로 동작
  - **그래프 뷰 너비 확대**: 모달 95vw / max 1400px → 98vw / max 1800px, 높이 90vh → 92vh
  - **P4 그래프=에디터 UX 마감**:
    - **선택 시 레이아웃 튕김 제거**: 우측 패널이 열려서 캔버스 폭이 줄면 ResizeObserver→resize effect가 `sim.alpha(0.5).restart()`를 호출해 전체 그래프가 흔들리던 것 — restart 제거(force center만 갱신)
    - **엣지 선택 지속**: 노드/엣지 클릭 시 `stopPropagation()` 해도 pointerup가 SVG로 버블링해 `onBgUp`이 즉시 setSelectedEdge(null) 하던 문제 — `panRef.current` 존재했을 때만(진짜 배경 인터랙션) 클리어
    - **엣지 라벨도 클릭 가능**: 라벨 그룹에 onPointerDown 추가, 선택 시 accent 색·굵게로 강조
    - **노드 라벨 가리는 문제**: 선택된 노드의 인라인 라벨 숨김(블루 segment가 라벨 위 덮던 문제 — 라벨은 우측 패널에 있음)
    - **링/엣지 메뉴 아이콘화** (i18n 통일·가독성): 한/영 모두 동일 Phosphor 아이콘(`Trash`/`LinkSimple`/`ArrowsClockwise`/`ArrowFatUp`) 흰색 — 영어에서 'Sup'이 supersedes/supports 둘 다 첫 3자 겹치던 문제 해결. `foreignObject`로 SVG 내부 렌더, pointerEvents:none
    - **fill opacity 0.18→0.78**: 빨강 등 segment 색이 거의 안 보이던 문제. 활성 segment(드래그 중·현재 type)는 opacity 1 + 흰 테두리
    - **드래그 투 링크 시각화**: preview 라인을 type 색깔로 + 미드포인트에 type 이름 풀 라벨(관련/대체/근거)을 색깔 pill로 띄움 → 어떤 종류 엣지 만들고 있는지 한눈에
    - tsc/빌드 클린, lint 0
  - (2026-06-16) **채팅 블록 편집 워크플로우 정리**:
    - chat 탭의 3-dot 메뉴를 pushed/draft 공통 모델로 정리. 공통 액션은 **To node / Edit / To Agent / Delete**. 노드가 이미 있으면 기존 `노드 편집/연결/해제`도 유지
    - **푸시된 블록도 chat 탭에서 직접 수정 가능**: 블록 본문을 인라인 편집하고 저장하면 원격 GitHub 정본은 건드리지 않고 로컬 `content`만 바뀜
    - 블록 상태 판정을 **timestamp 존재 여부가 아니라 블록 전체(raw block) 비교**로 수정. `timestamp + source + node comment + body`가 원격과 완전히 같을 때만 pushed, 하나라도 다르면 draft
    - 따라서 pushed 블록을 수정·삭제하거나 `To Agent` 결과로 치환하면 즉시 **draft 블록**으로 내려오고, room 전체도 draft 상태가 됨. 이후 Push해야 다시 pushed
    - 이로써 editor 뷰의 로컬 초안 모델과 chat 뷰의 블록 조작 모델이 동일해짐. chat은 "블록 단위 편집 UI", editor는 "문서 단위 편집 UI"로 역할만 다름
    - 구현 파일: `src/components/RoomView.tsx`, `src/index.css`
  - (2026-06-16) **노드 생성 진입점 단순화**:
    - 드래그 텍스트 선택 시 뜨던 떠있는 `노드로 만들기` 버튼 제거. 현재 노드 정본은 여전히 **블록 단위**(`## timestamp` 블록 기준)라서, 부분 선택 기반 UI가 실제 데이터 모델과 어긋났기 때문
    - 앞으로 노드 생성/편집 진입점은 **블록 3-dot 메뉴의 `To node`만 유지**. 사용자는 "선택한 문장만 노드화"가 아니라 "이 블록을 노드화"한다는 모델만 보게 됨
    - 에디터/채팅의 selection 하이라이트는 읽기 보조로만 남기고, selection→node 전용 훅/팝업/CSS Custom Highlight 코드는 제거
    - 구현 파일: `src/components/RoomView.tsx`, `src/components/CotextEditor.tsx`, `src/styles/neural.css`
  - (2026-06-16) **모바일 room header 재구성**:
    - 기존에는 mobile에서 `Context Pack/Share/Neural/Graph` 액션과 `chat/editor/split/preview` 탭이 같은 가로 공간을 경쟁해 버튼이 찌그러졌음
    - mobile에서는 header를 **메타 영역 + 액션 레일 + 뷰 전환 레일** 3단 구조로 재구성
    - 액션 버튼은 pill 형태의 **가로 스크롤 action rail**로 유지. `Graph`도 mobile에서 숨기지 않고 같은 레일에서 접근 가능
    - view mode는 별도의 **가로 스크롤 segmented rail**로 분리해 label을 숨기지 않고도 찌그러짐 없이 유지. active 탭은 capsule 강조
    - 데스크톱 구조는 유지하고 mobile media query에서만 rail/gradient/mask 처리
    - 구현 파일: `src/components/RoomView.tsx`, `src/index.css`

## 관련 문서
- [[AI-Sessions/wiki/decisions/cotext-architecture-decisions]] — 스택·토큰·이미지 압축 등 핵심 결정
- [[AI-Sessions/wiki/design/cotext-brand-and-landing]] — 브랜드·디자인 시스템·랜딩
- [[AI-Sessions/wiki/sources/01_cotext-development-plan_summary]] — 개발 계획서 요약
## 2026-06-16 Addendum

- 공유 워크스페이스 repo 접근 수정
  - 초대 멤버가 room list는 보이지만 chat 내용이 비고 `Pull` 이후에도 비어 있던 원인은, server function이 항상 현재 사용자 GitHub token으로 private repo를 읽으려 했기 때문
  - `supabase/functions/_shared/github.ts`에 `getWorkspaceGitHubToken(...)`을 추가해, workspace 멤버가 owner/repo 기준으로 매칭되면 owner의 GitHub token으로 동일 repo를 읽고 쓰게 변경
  - 적용 함수: `supabase/functions/room-content/index.ts`, `supabase/functions/github-tree/index.ts`, `supabase/functions/room-push/index.ts`
  - 의미: 초대받은 팀원도 owner와 같은 저장소 내용을 보고 수정하는 실제 협업 워크스페이스로 동작
- 블록 `author` 메타데이터 도입
  - 블록 메타데이터를 `<!-- source: me|chatgpt|claude...; author: github-username -->` 형식으로 통일
  - `source`는 생성 주체, `author`는 실제 GitHub 작성자. AI가 저장해도 `author`는 당시 사용자 GitHub username 기준으로 기록
  - 기존 블록에 `author`가 없으면 UI/API 모두 repo owner를 기본 작성자로 간주
  - chat timeline에 작은 GitHub avatar + username pill을 추가해 블록 단위 작성자를 바로 식별 가능하게 함
  - 정렬 범위: `src/lib/markdown`, `RoomView`, `AgentPanel`, `context-api`, `context-share`, Neural parser/guide
  - 검증: `npm run build` 통과

## 2026-06-17 Addendum

- Knowledge Studio 분리 페이지 추가
  - 대용량 개인 문서(DOCX/HWPX/PPTX/PDF 등)를 업로드해 텍스트만 추출하고, 그 결과로 1회성 개인 지식망(노드/관계/클러스터)을 생성하는 별도 페이지 추가
  - 기존 workspace/room 기반 Neural Link와 섞지 않도록 `/knowledge-studio` 라우트와 헤더 진입점을 분리
  - shared graph 오염 방지를 위해 workspace `.cotext/neural.json`에는 쓰지 않고, 전용 워크벤치에서 in-memory 그래프만 생성
  - 추출기 확장: `pptx` 지원 추가
  - 상세 설계/구현/검증/후속 포인트는 [[AI-Sessions/wiki/projects/cotext-knowledge-studio]] 참고

## 2026-06-18 Addendum

- MindSync Track B beta started
  - `trackMode=managed` is now a real extraction path, not just a UI placeholder
  - New Edge Function: `neural-extract-managed`
  - Flow: browser sends extracted text chunks -> server-held LLM key runs Phase 3 extraction -> graph result returns to the browser -> existing auto-merge / Think flow stays unchanged
  - Initial billing state shipped as metadata first, then upgraded the same day to real workspace credit deduction
  - BYOK path remains unchanged and still uses browser-local provider keys
- 2026-06-18 deployment note
  - `neural-extract-managed` Edge Function deployed to project `qyyqsuzqstkhnrmyqskn`
  - managed credits tables were applied directly through Supabase Management API because `supabase db push` is still blocked by the long-standing `20260614` migration history mismatch
  - verification: `managed_credit_balances` backfilled 3 rows, `managed_credit_transactions` starts at 0 rows
- 2026-06-18 Track B crediting update
  - Added SQL RPC `apply_managed_credit_usage(workspace_id, user_id, delta, kind, note, metadata)` for atomic balance update + transaction ledger insert
  - Existing workspaces were normalized to `billing_state='beta'`, `monthly_grant_credits=100`, `balance_credits=100`
  - Managed extraction now requires a workspace anchor, estimates credits from extracted text volume, and records a `managed_extract` ledger row after successful server extraction
  - Studio and workspace agent surfaces now show the live balance panel and refresh after a managed extraction finishes

## 2026-06-21 Addendum

- NOWPayments-based managed credit top-up implemented
  - Stripe-first direction was dropped because it does not fit the current Korea-based operator constraint for this project
  - New hosted checkout flow uses NOWPayments invoice URLs instead of browser-embedded card forms
  - New Edge Function `nowpayments-create-invoice` creates fixed credit-pack invoices for the current workspace
  - New Edge Function `nowpayments-ipn` receives external payment callbacks and verifies `x-nowpayments-sig` using `NOWPAYMENTS_IPN_SECRET`
  - New SQL table `managed_credit_orders` stores provider order/invoice status separately from usage ledger
  - New SQL RPC `apply_nowpayments_credit_order(...)` applies credit top-up idempotently when payment status reaches `finished`
  - `ManagedCreditsPanel` now exposes fixed purchase packs and redirects the user to NOWPayments hosted checkout
  - Remote DB schema was applied through Supabase Management API rather than broad `supabase db push`, because the older migration-history mismatch risk still exists
  - Verification completed:
    - `npm run build` passed
    - `nowpayments-create-invoice` deployed
    - `nowpayments-ipn` deployed with `--no-verify-jwt`
    - remote verification confirmed `managed_credit_orders` table and `apply_nowpayments_credit_order(text,text,text,text,jsonb)` RPC exist
- Public pricing + policy surface added for managed credits
  - New public routes:
    - `/pricing`
    - `/terms`
    - `/privacy`
    - `/refund-policy`
  - The pricing page now explains workspace-scoped managed credits in plain language, including:
    - fixed credit packs from the live billing implementation
    - current beta metering heuristic (`~1 credit / 12,000 input chars`, minimum 1 credit)
    - example workloads for MindSync extraction, managed agent chat, and shared team usage
  - Landing page footer now links to Terms of Service, Privacy Policy, and Refund Policy, and top navigation includes Pricing.
  - Shared marketing-page shell introduced in `src/components/site/MarketingShell.tsx`.
- Android Play bundle signing fixed locally
  - Root causes:
    - launcher icons in `android/app/src/main/res/mipmap-*` were invalid `.png` resources with JPEG/JFIF headers
    - release signing config was missing, so Play Console rejected the bundle as unsigned
  - Fixes:
    - regenerated valid PNG launcher assets from `public/icon-512x512.png`
    - added `keystore.properties`-based release signing support in `android/app/build.gradle`
    - added `.gitignore` rules for Android signing secrets and a `keystore.properties.example` template
    - created a local upload keystore and verified signed bundling with `./gradlew clean` + `./gradlew bundleRelease`
  - Output:
    - signed bundle generated at `android/app/build/outputs/bundle/release/app-release.aab`
