---
type: decision
date: 2026-06-24
status: active
tags: [architecture, mindsync, sidebar, code-comments, file-reference]
---

# Repo Folder View + Code Line Comments (4-Phase Plan)

## Summary

Cotext 사이드바를 단순 "채팅 리스트"에서 "VS Code 스타일 레포 탐색기 + 코드 라인
주석 시스템"으로 확장한다. 코드 파일을 cotext 안에서 읽고, 특정 라인 범위에
대해 채팅 형태로 코멘트를 남기면, 그 코멘트가 그 디렉토리의 `.cotext/cotext.md`
블록으로 기록되며 파일 read-only 뷰에서 inline 주석 마커로 다시 보인다.

핵심 결정 3가지:
1. **Read-only가 default** — Cotext에서 코드 직접 수정 X (md만 편집 가능)
2. **코멘트는 채팅의 한 종류** — 별도 데이터 모델 X, 기존 `cotext.md` 블록 재사용
3. **로컬 클론 없이도 코드 review 가능** — GitHub 레포에 클론 안 하고도
   브라우저에서 코드 보고 코멘트 달기

## Context

이전 상태:
- 사이드바 = 채팅 리스트만. 레포 폴더 구조 보려면 GitHub 가야 함.
- 코드 파일에 대한 사람 ↔ AI 토론을 cotext 안에 묶을 방법 없음.
- 신규 채팅 만들 때만 "+ 새 채팅" 모달에서 잠깐 디렉토리 탐색 가능.

### Phase A (구현 완료, 2026-06-24)

사이드바에 **채팅/폴더 탭** 추가. 폴더 탭 = `RepoTreeView` (lazy expand,
.cotext 포함 폴더 + 조상 폴더는 파란 글로우, 폴더 hover → "+ 새 채팅" 버튼).
새 채팅 생성 흐름은 기존 `showAddRoom` modal에 `selectedPath` 자동 채움 →
채팅 탭에 자동 반영.

신규 컴포넌트: `src/components/RepoTreeView.tsx`
신규 CSS: `.sidebar-tabs`, `.repo-tree-*`

## Details — Phase B/C/D (착수 예정)

### Phase B — non-md 파일 read-only 뷰

**트리거:** `RepoTreeView`에서 non-md 파일 클릭 → `viewMode='editor'` 자동 전환 +
read-only 모드로 GitHub fetch (private 레포면 `githubApi.getRoomContent`).

**구현 요점:**
- CodeMirror v6 readOnly + `lang-{ext}` 자동 감지 (TypeScript/JS/Python/JSON/...)
- 라인 번호 항상 표시 (line gutter)
- 텍스트 selection 가능 (드래그)
- 상단 헤더: 파일 경로 + branch + 사이즈
- 우측 액션: "GitHub에서 열기" 링크

**스코프 제한:** 50KB 초과 파일은 "Open in GitHub" 권유, fetch 거부 (모바일/네트워크 보호).

### Phase C — 선택 라인 → 채팅 reply chip

**트리거:** read-only 뷰에서 라인 N~M 선택 → 플로팅 액션 "💬 채팅에 추가" 등장 →
클릭 → 채팅 입력에 reply chip 자동 첨부.

**데이터 모델:** 코멘트 = 그 디렉토리의 `.cotext/cotext.md` 블록의 한 종류.
별도 테이블/파일 X. 블록 형식 예시:

```markdown
## 2026-06-24 17:30
<!-- source: me; author: alvin358 -->
<!-- ref: src/lib/foo.ts:42-58; commit: abc1234 -->

이 selection이 어색해 보이는데, useEffect 안에서 setState를 호출하면 무한 루프
가능성 있지 않나요? 차라리 useMemo로 빼는 게.
```

`<!-- ref: path:start-end; commit: sha -->` 메타라인이 핵심. cotext.md 파서가
이걸 인식하면 블록을 "코드 코멘트"로 분류.

**채팅 위치 결정:** 선택한 코드 파일의 디렉토리에서 가장 가까운 `.cotext/cotext.md`
(부모로 거슬러 올라가며 탐색). 없으면 생성 + 이름 입력 모달 (디폴트:
파일 디렉토리 basename).

**Reply chip UI:** ChatGPT/Slack의 reply 인용 형태. 클릭 시 read-only 뷰로 점프.

### Phase D — read-only 뷰의 inline 주석 마커

**렌더링:** read-only 뷰에서 각 코멘트 ref가 가리키는 라인 범위 옆 gutter에
유저 아바타(작은 원) 표시. 한 라인에 여러 코멘트 있으면 스택.

**데이터 로딩:** 파일 read-only 뷰 마운트 시 그 디렉토리의 `.cotext/cotext.md`를
파싱해서 `<!-- ref: <이 파일 경로>:start-end -->` 블록을 모두 추출. 인접 디렉토리
(부모/형제)도 옵션으로 fetch (cross-folder references 지원).

**클릭 이벤트:** 마커 클릭 → 그 코멘트가 속한 채팅을 사이드바에서 선택 + 채팅 뷰로
스크롤. URL hash로 deep-link 가능 (`/workspace/<id>/chat/<room-id>#block-<ts>`).

**성능 제약:** 100개 이상 코멘트 시 gutter 스택 제한 (3개 + "...N more"). lazy
fetch로 초기 로드 가볍게.

## 데이터 흐름 (전체)

```
[코드 파일 클릭 — Phase B]
       ↓
[Read-only 뷰 + 라인 selection — Phase B]
       ↓
[💬 채팅에 추가 — Phase C]
       ↓
[채팅 입력에 reply chip 첨부]
       ↓
[전송 → cotext.md에 ref 메타 블록]
       ↓
[해당 .cotext/cotext.md push to GitHub]
       ↓
[다음 로드 시 read-only 뷰에 inline 마커 — Phase D]
```

## 안전 장치

| 위험 | 방어 |
|---|---|
| Cotext에서 코드 직접 편집 → 실수로 push | read-only가 default, write 시도하면 명시적 차단 |
| 대형 파일 fetch로 모바일 죽음 | 50KB 한도, 초과 시 "GitHub 열기" 폴백 |
| ref 메타라인이 파서를 break | 기존 parseBlocks 안전, ref 못 읽으면 일반 블록으로 처리 |
| commit SHA stale (코드 라인 번호 바뀜) | ref 메타에 commit 기록, 마커 표시 시 stale 경고 |
| 부모 디렉토리 .cotext fetch 폭주 | 직접 부모만 fetch, 무한 거슬러 가지 않음 |
| Phase C에서 채팅이 없는 디렉토리 | 자동 생성 모달, 디렉토리 basename 디폴트 |

## 향후 확장

- **Cross-workspace references**: 다른 레포의 코드 라인을 참조
- **AI 코멘트 자동 생성**: 코드 리뷰 모드 — AI가 PR diff에 자동 코멘트
- **GitHub PR 동기화**: cotext 코드 코멘트를 GitHub PR review 코멘트로 미러
- **음성 코멘트**: 코드 라인 선택 후 voice memo 첨부

## Links

- [[mindsync-knowledge-sync-architecture]] — 핵심 정체성 (git 마크다운 = 진실)
- [[workspace-wiki-bootstrap]] — wiki 구조 셋업
- [[wiki-synthesis-agent]] — 채팅 → wiki 흐름 (이 결정과 별도 트랙)
- [[mindsync-ws-integration]] — workspace UI 통합 패턴
