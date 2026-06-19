---
title: MindSync Studio v1.0.35–36 — 통합 리팩터링
date: 2026-06-20
tags: [mindsync, graph-editor, neural-globe, workspace, refactoring]
---

# MindSync Studio 통합 리팩터링

## 배경

MindSync Studio가 워크스페이스의 그래프 뷰 역할도 겸하도록 통합.
기존에는 워크스페이스 내에서 `NeuralGraphView` 모달을 열어 그래프를 보았으나,
이제 MindSync Studio가 지식 그래프의 **단일 허브**로 동작한다.

- 슬로건: "데이터를 두뇌로, 두뇌를 워크스페이스로."

## 주요 변경

### 1. 워크스페이스 → MindSync 이전
- **RoomView**: "그래프" 버튼/모달 완전 제거
- **RoomView**: "뉴럴 검색" → "뉴런 검색" 이름 변경
- **RoomView**: 블록 3-dot 메뉴에 "마인드싱크로" 추가 → `/mindsync/studio?ws=&node=&view=editor`

### 2. MindSync 그래프 에디터
- "2D 그래프" → "그래프 에디터" 이름 변경
- 스테이지 툴바에 **워크스페이스 드롭다운** (글로브/에디터 공통)
- 워크스페이스 선택 시 `neural.json` 로드 → 3D 글로브 + 그래프 에디터에서 사용
- **에디터 콜백**: 노드 삭제, 엣지 연결/해제 → `githubApi.pushRoom()`으로 GitHub에 저장
- `+ 새 워크스페이스` 드롭다운 옵션 → `/workspaces`로 이동

### 3. 지식망 생성 플로우
- **WS 미선택 + 생성 클릭** → "워크스페이스를 선택하세요" 안내
- **WS 선택됨 + 생성 클릭** → 버튼 라벨이 "`{WS이름}`에 증강"으로 변경 → 추출 → 자동 머지

### 4. 업로드 영역 통합
- `MindSyncDropzone`에 `SourceFileList` 통합 (1 컴포넌트)
- 파일 없으면 드롭존, 파일 있으면 파일 리스트 + "+추가" 버튼
- `SourceFileList.tsx` 삭제

### 5. 3D 글로브 개선
- **클러스터 범례**: 항상 보이던 태그 → 접기 가능한 드롭다운 버튼
- **노드/클러스터 토글**: stats 영역에서 "48 노드" / "12 클러스터" 클릭으로 전환
  - 클러스터 모드: 각 클러스터가 하나의 큰 노드, 클러스터 간 엣지만 표시
- **그래프 에디터 진입 시** 좌측 패널 자동 최소화

### 6. 모바일 뷰 (≤860px)
- 스테이지 툴바: 아이콘만 표시 (텍스트 숨김)
- WS 드롭다운: 작은 폰트 + 폭 제한 (140px)

### 7. 버그 수정
- **`preventDefault inside passive event listener`**: NeuralGraphView의 wheel/touch 핸들러를 네이티브 `addEventListener({ passive: false })`로 전환
- **`panRef.current.vx` null**: 이미 가드 존재 확인 (line 320)

## 영향받는 파일

| 파일 | 변경 |
|------|------|
| `src/pages/KnowledgeStudioPage.tsx` | 그래프 에디터 + WS 드롭다운 + 생성 플로우 |
| `src/components/NeuralGlobe.tsx` | 클러스터 토글 + 접기 범례 |
| `src/components/NeuralGraphView.tsx` | passive event 수정 + viewRef |
| `src/components/RoomView.tsx` | 그래프 제거 + 마인드싱크로 메뉴 |
| `src/components/mindsync/MindSyncDropzone.tsx` | 파일리스트 통합 |
| `src/styles/mindsync-studio.css` | WS 셀렉트 + 모바일 CSS |
| `src/styles/neural-globe.css` | 접기 범례 + stat 버튼 CSS |
| `src/components/mindsync/SourceFileList.tsx` | **삭제됨** |

## 아키텍처 결정

1. **워크스페이스 그래프 편집은 MindSync에서만** — RoomView에서 그래프 모달 제거
2. **WS 드롭다운은 글로브/에디터 공통** — `viewMode`에 관계없이 항상 표시
3. **그래프 저장은 `githubApi.pushRoom()`** — 기존 `merge.ts`와 동일한 패턴
4. **클러스터 뷰는 가짜 그래프 변환** — `buildClusterGraph()`로 기존 컴포넌트 재활용

## 통합 후 발견·수정한 이슈 (2026-06-20 리뷰)

통합 코드를 위키와 대조 검토하면서 발견한 정합성/기능 버그 5건 수정.

1. **그래프 에디터 저장이 인덱스를 desync** (정합성, 가장 중요)
   - `saveGraphToWs`가 `neural.json`만 푸시 → `NEURAL_INDEX.md`(MCP grounding)와
     Supabase 검색 인덱스가 그래프와 어긋남. 정본 경로(`executeWorkspaceMerge`)는
     3단계(json+index+supabase)를 모두 수행하는데 직접 편집 경로는 1단계만 했음.
   - **수정**: `merge.ts`에 `saveWorkspaceGraph()` 공유 함수 추가 (3단계 동기화 +
     푸시 후 새 sha 반환). 에디터 콜백(노드삭제/엣지연결/해제)이 이를 사용.
2. **생성+자동머지 후 글로브가 옛 그래프 표시**
   - `editorGraph`는 `wsGraph` 우선인데 머지 후 `wsGraph`를 갱신 안 함 → 방금 만든
     지식망이 스테이지에 안 보임.
   - **수정**: `autoMergeIntoAnchor`에서 `setWsGraph(preview.mergedGraph)` +
     `wsGraphReload` 토큰으로 새 sha 재조회.
3. **워크스페이스 에디터에서 노드 삭제 불가**
   - `NeuralGraphView`는 `selected.room === currentRoom`으로 삭제를 제한하는데
     MindSync는 `currentRoom=""`을 넘김 → 워크스페이스 노드는 room이 비어있지 않아
     삭제 버튼/핸들러가 항상 막힘. (룸 스코프 그래프의 cross-room 삭제 가드였음)
   - **수정**: `currentRoom`이 비어있으면(=워크스페이스 전역 에디터) 가드 미적용.
     `neural.json` 직접 편집이라 room 콘텐츠가 필요 없음.
4. **`?node=` deep-link가 무시됨**
   - RoomView "마인드싱크로"가 넘긴 node 파라미터를 `_selectedNodeId`로 읽기만 하고
     에디터에 전달 안 함 → 에디터만 열리고 해당 노드 선택 안 됨.
   - **수정**: `NeuralGraphView`에 `focusNodeId` prop 추가 (그래프 로드 후 1회 자동
     선택). 페이지에서 `focusNodeId` 전달.
5. **RoomView "마인드싱크로"가 전체 페이지 리로드**
   - `window.location.href` 사용 → SPA 상태 손실 + Capacitor 네이티브에서 라우팅
     리스크. `TimelineView`는 별도 컴포넌트라 `navigate`가 스코프에 없었음.
   - **수정**: `onToMindSync` 콜백을 부모(RoomView, `navigate` 보유)에서 주입.

6. **Managed 추출 SSE 파서가 큰 그래프에서 간헐 실패**
   - `functions.ts`의 `managedKnowledgeApi.extract` SSE 파서에서 `currentEvent`가
     `processLines()` 지역변수 → `pump()` 읽기마다 리셋. `done` 이벤트는
     `event: done`줄 + 거대한 `data:`(전체 그래프 JSON)이라 TCP 경계로 쪼개지면
     currentEvent 유실 → "Stream ended without result". 청크 많은 문서에서 재현.
   - **수정**: `currentEvent`를 Promise 클로저로 hoist + 빈 줄에서 리셋.

검증: `tsc --noEmit` clean, `npm run build` 성공. lint 신규 에러 0 (기존 errors는
변동 없음). 런타임 경로는 GitHub 로그인+워크스페이스 필요라 빌드 레벨까지 검증.

### Managed 추출(Cotext Model) 운영 메모
- 타임아웃 방어 = SSE 스트리밍(청크별 progress 이벤트). **단 Edge Function 벽시계/CPU
  상한(Pro 400s)은 못 늘림** — 초대형 업로드는 순차 처리라 여전히 killed 가능.
- 프로바이더/모델 전환은 **전부 env 기반, 코드 수정 불필요**:
  - 같은 xAI 다른 모델 → `MANAGED_LLM_MODEL`만 변경.
  - 다른 프로바이더(openai/anthropic/gemini) → `MANAGED_LLM_PROVIDER` +
    `MANAGED_LLM_API_KEY` (+선택 `MANAGED_LLM_MODEL`). `runChat`이 shape별 분기.
  - 목록에 없는 신규 프로바이더만 `models.ts` `PROVIDERS`에 추가 필요.
  - 과금은 글자수 기반(`ceil(requestChars/12000)`)이라 `PRICING` 등록은 선택사항.
  - 변경 후 반드시 `supabase functions deploy neural-extract-managed` 재배포.

### 정본 원칙 (재확인)
워크스페이스 `neural.json`을 쓰는 **모든** 경로는 반드시 3단계 동기화를 거친다:
`neural.json` 푸시 → `NEURAL_INDEX.md` 재생성 → `neuralApi.sync()` (Supabase).
직접편집은 `saveWorkspaceGraph()`, 머지는 `executeWorkspaceMerge()` 사용.

## 버전

- `v1.0.35`: 초기 통합 커밋
- `v1.0.36` (예정): 클러스터 토글 + 모바일 + 버그 수정 포함
- `v1.0.37` (예정): 통합 후 정합성/기능 버그 5건 수정 (위 섹션)
