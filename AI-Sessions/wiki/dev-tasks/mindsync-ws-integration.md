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

## 버전

- `v1.0.35`: 초기 통합 커밋
- `v1.0.36` (예정): 클러스터 토글 + 모바일 + 버그 수정 포함
