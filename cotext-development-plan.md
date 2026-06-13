# Cotext 개발 계획서 / 설계서

## 0. 한 줄 정의

**Cotext는 GitHub repository를 기반으로 하는 초간단 context capture web app이다.**

사용자는 어느 디바이스에서든 웹에 접속해 채팅하듯 텍스트, 이미지, 파일을 남기고, Cotext는 이를 지정된 GitHub repository의 디렉토리 안에 Markdown 및 asset 파일로 저장·동기화한다.

Cotext는 일반 노트앱이 아니라, **LLM·웹 에이전트·로컬 에이전트가 함께 읽을 수 있는 GitHub-native context pool**이다.

MVP에서는 LLM 자동분류를 붙이지 않는다.  
먼저 “어디서든 접속 가능한 GitHub 연동 채팅+Markdown 에디터”를 완성한다.

### 0.1 North Star — 왜 만드는가

Cotext의 최종 목적은 "메모 저장"이 아니다.  
**나로부터 출발한 생각·정보·결정**을 GitHub라는 중립적이고 버전관리되는 토대 위에 구조화해 두고, 그것을 여러 LLM과 에이전트가 **같은 컨텍스트로 읽고 협업(harnessing)** 할 수 있게 만드는 것이다.

즉 Cotext는 두 개의 층으로 이루어진다.

```text
Layer 1 — Capture (MVP의 목표)
  어디서든 채팅하듯 입력 → GitHub repo에 Markdown으로 정착

Layer 2 — Context Engineering (제품의 본질)
  쌓인 메모를 구조·태그·관계로 다듬어
  멀티 LLM / 에이전트가 바로 쓸 수 있는 "context pack"으로 발행하고
  repo를 사람과 AI가 공유하는 단일 컨텍스트 풀로 운영
```

핵심 설계 원칙:

```text
Layer 2를 MVP에서 전부 만들지는 않는다.
그러나 Layer 1의 데이터 구조 · UI · 플랫폼 추상화는
처음부터 Layer 2를 향하도록 설계한다.

→ 나중에 AI를 "붙이는" 것이 아니라,
  처음부터 AI가 읽을 수 있는 형태로 적는 것이다.
```

---

## 1. 문제 정의

기획, 개발, 제안서 작성, 리서치, 아이디에이션을 동시에 하는 problem solver들은 여러 디바이스에서 메모를 남긴다.

현재 흔한 방식:

```text
Telegram Saved Messages
카카오톡 나에게 보내기
Apple Notes
Notion
Obsidian
Google Docs
임시 txt/md 파일
```

문제:

```text
- 메모가 여러 앱에 흩어진다.
- 나중에 정리하기 귀찮다.
- LLM이나 로컬 에이전트가 읽기 어렵다.
- GitHub 기반 개발/문서 workflow와 연결이 약하다.
- 프로젝트별 context로 승격하기 어렵다.
- 모바일에서 빠르게 쓰고, PC에서 이어받는 흐름이 불편하다.
```

Cotext의 목표:

```text
언제든 접속
→ 채팅하듯 입력
→ GitHub repo의 적절한 위치에 Markdown으로 기록
→ 어느 디바이스에서든 pull/push 가능
→ LLM/agent가 바로 읽을 수 있는 context pool이 됨
```

---

## 2. 제품 컨셉

### 2.1 핵심 사용자

```text
- 기획과 개발을 동시에 하는 사람
- 제안서/문서/코드 작업을 병행하는 사람
- 여러 프로젝트 context를 관리해야 하는 사람
- ChatGPT, Codex, Antigravity, Claude Code, Cursor 같은 에이전트를 같이 쓰는 사람
- Obsidian/Markdown/GitHub 기반 workflow를 선호하는 사람
```

### 2.2 핵심 가치

```text
메모앱처럼 쉽고,
GitHub처럼 버전관리되고,
Obsidian처럼 Markdown으로 남고,
에이전트가 읽을 수 있게 구조화된다.
```

### 2.3 Cotext가 아닌 것

MVP 단계에서 Cotext는 아래를 목표로 하지 않는다.

```text
- Notion 대체
- 완전한 Obsidian 대체
- Slack/Telegram 대체
- 복잡한 AI 자동분류 시스템
- 완전한 Git client
- 실시간 다중 사용자 협업툴
- 대형 파일 저장소
```

MVP는 단순하게 간다.

```text
GitHub repo 연결
→ directory 선택
→ .cotext 폴더 생성
→ Markdown context file 열기
→ 채팅+에디터로 메모
→ push
→ pull
```

---

## 3. 핵심 사용 시나리오

### 3.1 신규 워크스페이스 생성

```text
1. 사용자가 Cotext에 로그인한다.
2. GitHub 계정을 연결한다.
3. 새 workspace를 만든다.
4. Cotext가 GitHub repository를 새로 생성한다.
5. repository 안에 기본 구조를 만든다.
6. 사용자는 workspace로 들어가 메모를 시작한다.
```

예상 GitHub repo 구조:

```text
my-context-repo/
  README.md
  index.md
  log.md
  cotext.config.json
  inbox/
  projects/
  .cotext/
```

### 3.2 기존 GitHub repo 연결

```text
1. 사용자가 GitHub repository 목록을 불러온다.
2. 기존 repo를 선택한다.
3. Cotext가 repo root를 탐색한다.
4. 사용자가 특정 directory를 선택한다.
5. Cotext가 해당 directory에 .cotext 폴더를 만든다.
6. cotext.md 파일을 생성하거나 기존 파일을 연다.
```

예:

```text
master-context/
  projects/
    transight-tr/
      .cotext/
        cotext.md
        assets/
        metadata.json
```

### 3.3 디렉토리를 채팅방처럼 열기

Cotext에서 “채팅방”은 GitHub repo의 특정 directory다.

예:

```text
Workspace: master-context
Room: projects/transight-tr
Path: projects/transight-tr/.cotext/cotext.md
```

화면에서는 `projects/transight-tr`가 하나의 대화방처럼 보인다.

실제 저장은:

```text
projects/transight-tr/.cotext/
  cotext.md
  assets/
    2026-06-13-image-001.png
    2026-06-13-file-001.pdf
  metadata.json
```

### 3.4 메모 입력

사용자는 채팅창에 텍스트를 입력한다.

```text
TR-OBM 설명에서 HMAC DI 생성 과정을 더 짧게 설명해야 함.
```

Cotext는 이를 Markdown에 append한다.

```markdown
## 2026-06-13 14:32

TR-OBM 설명에서 HMAC DI 생성 과정을 더 짧게 설명해야 함.
```

### 3.5 이미지/파일 첨부

사용자가 이미지나 파일을 붙인다. (붙여넣기 / 드래그앤드롭 / 파일선택 / 모바일 카메라)

이미지는 **업로드 전 브라우저에서 자동 압축**된다 — 어떤 이미지든 **500KB 이하**로 줄여 repo에 올린다. (정책 상세는 §8.5)

저장:

```text
.cotext/assets/2026-06-13-1432-image-001.webp   ← 압축 후 WebP
.cotext/assets/2026-06-13-1432-reference.pdf
```

Markdown에는 링크 삽입:

```markdown
## 2026-06-13 14:32

이미지 참고:

![image](./assets/2026-06-13-1432-image-001.png)

첨부 파일:

[reference.pdf](./assets/2026-06-13-1432-reference.pdf)
```

### 3.6 pull / push

사용자는 버튼으로 동기화한다.

```text
Pull
= GitHub 최신 파일을 불러온다.

Push
= 현재 local draft를 GitHub에 commit한다.
```

MVP에서는 완전한 Git clone이 아니라 GitHub API 기반 file read/write로 구현한다.

---

## 4. 핵심 UX

### 4.1 기본 화면

```text
┌─────────────────────────────────────────────┐
│ Cotext                                      │
├───────────────┬─────────────────────────────┤
│ Workspace     │ Room / Directory             │
│               │                             │
│ master-context│ projects/transight-tr         │
│ deck-maker    │ projects/hana-proposal        │
│ transight-tr  │ inbox/windows                 │
├───────────────┼─────────────────────────────┤
│ Rooms         │ Chat + Markdown Editor        │
│               │                             │
│ /inbox        │ [Pushed content: gray]        │
│ /projects/... │ [Draft content: vivid]        │
│               │                             │
│               │ ┌─────────────────────────┐ │
│               │ │ message input            │ │
│               │ └─────────────────────────┘ │
├───────────────┴─────────────────────────────┤
│ Pull | Push | Commit message | Status        │
└─────────────────────────────────────────────┘
```

### 4.2 채팅창 + 에디터 = "모핑 컴포저(Morphing Composer)"

Cotext의 핵심이자 차별점은 입력창이다. Telegram/ChatGPT처럼 평소엔 한 줄짜리 **채팅 입력창**으로 보이지만, 내용이 길어지거나 사용자가 펼치면 부드럽게 **풀 Markdown 에디터**로 늘어난다. 별도 화면을 갈아끼우는 "모드 버튼"이 아니라, **하나의 컴포넌트가 상황에 따라 자라고 줄어든다.** (상세는 §22)

```text
Collapsed (chat)         Expanding              Composer (editor)
┌──────────────┐         ┌──────────────┐       ┌──────────────────┐
│ 메모 입력…  ▷ │   →    │ 한 줄        │   →   │ # 제목            │
└──────────────┘         │ 두 줄…       │       │ - 불릿            │
                         └──────────────┘       │ ```코드```        │
                                                │         [Send] [⤢]│
                                                └──────────────────┘
```

네 가지 보기 모드는 유지하되, 모드 전환이 별도 화면이 아니라 **같은 컴포저의 연속된 상태**로 느껴지게 한다.

```text
- Chat:    메시지가 타임라인에 append (기본, collapsed 컴포저)
- Compose: 컴포저가 에디터로 확장된 상태로 길게 작성
- Split:   타임라인 + 우측 전체 cotext.md 에디터 (데스크톱)
- Preview: Markdown 렌더링 미리보기
```

사용자 설정:

```text
- 컴포저 기본 높이 / 펼침 동작
- light / dark / system 테마
- pushed / draft 색상 강도
- 폰트 / 밀도(density) — 모바일에서 자동 조정
```

### 4.3 pushed vs draft 표시

```text
Pushed content
= GitHub에 이미 commit된 내용
= 회색/낮은 contrast

Draft content
= 아직 push되지 않은 새 입력 또는 수정
= vivid한 검정/흰색
```

이를 위해 내부적으로는 다음 상태를 관리한다.

```text
remoteContent
localContent
diff
dirty
lastCommitSha
```

---

## 5. GitHub 저장 구조

### 5.1 directory별 Cotext 폴더

어떤 directory가 Cotext room으로 열리면 해당 directory 아래에 `.cotext/`를 만든다.

```text
target-directory/
  .cotext/
    cotext.md
    assets/
    metadata.json
```

사용자가 말한 `./cotext`도 가능하지만, repo 내 숨김/메타 성격을 고려하면 `.cotext`가 더 자연스럽다.  
다만 일반 폴더를 원하면 `cotext/`로 설정 가능하게 한다.

추천 설정:

```json
{
  "cotextFolderName": ".cotext"
}
```

### 5.2 cotext.md

해당 room의 본문 Markdown.

예:

```markdown
# Cotext: projects/transight-tr

## 2026-06-13 14:32

TR-OBM 설명에서 HMAC DI 생성 과정을 더 짧게 설명해야 함.

## 2026-06-13 14:35

이미지 참고:

![diagram](./assets/2026-06-13-1435-diagram.png)
```

### 5.3 metadata.json

```json
{
  "roomPath": "projects/transight-tr",
  "cotextPath": "projects/transight-tr/.cotext/cotext.md",
  "createdAt": "2026-06-13T14:32:00+09:00",
  "updatedAt": "2026-06-13T14:35:00+09:00",
  "lastKnownSha": "github-file-sha",
  "mode": "chat-editor",
  "assetFolder": "assets"
}
```

### 5.4 cotext.config.json

repo root에 선택적으로 둔다.

```json
{
  "version": "0.1.0",
  "cotextFolderName": ".cotext",
  "defaultBranch": "main",
  "defaultRoom": "inbox",
  "largeFileMode": "lfs-later",
  "allowedAssetExtensions": [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".pdf",
    ".md",
    ".txt",
    ".docx",
    ".pptx"
  ]
}
```

---

## 6. Supabase 중심 아키텍처

Supabase를 사용할 수 있다면 Cotext는 아래 구조가 가장 안전하다.

```text
Browser / Mobile Web / Capacitor
  ↓
Vite + React SPA  (정적 자산, 토큰 없음)
  ↓
Supabase Auth + Supabase DB
  ↓
Supabase Edge Functions  (서버 레이어: GitHub 프록시, OAuth 콜백)
  ↓
GitHub API
```

> 스택 결정: 가벼움 + 향후 Capacitor 래핑을 위해 **Vite + React SPA**를 채택한다.
> SPA에는 서버가 없으므로, 토큰을 다루는 모든 서버 작업은 **Supabase Edge Functions**가 맡는다.
> (Next.js의 API routes 역할을 Edge Functions가 대체한다.)

핵심 원칙:

```text
GitHub access token은 브라우저에 오래 보관하지 않는다.
GitHub 쓰기 작업은 서버 레이어에서 수행한다.
Supabase는 사용자, 워크스페이스, 룸, 드래프트, 토큰 메타데이터를 관리한다.
GitHub repository가 최종 정본이다.
```

### 6.1 Supabase가 맡는 역할

```text
- 사용자 로그인 세션
- GitHub OAuth 연결 정보 관리
- workspace 목록 저장
- room 목록 저장
- local draft 저장
- 마지막 remote sha 저장
- 업로드 asset 메타데이터 저장
- 나중에 AI plug-in / ingest 작업 큐 저장
```

### 6.2 Supabase Storage 사용 여부

MVP에서는 asset을 GitHub repo에 저장한다.

다만 큰 파일은 GitHub Contents API에 직접 올리는 것이 부담되므로, Beta에서는 Supabase Storage를 external asset store로 사용할 수 있다.

```text
MVP:
small asset → GitHub repo .cotext/assets/

Beta:
large asset → Supabase Storage
Markdown에는 signed/public link 또는 GitHub pointer link
```

---

## 7. GitHub 연동 설계

### 7.1 MVP 권장 방식

MVP에서는 GitHub API를 사용한다.

주요 기능:

```text
- GitHub OAuth login
- repository 목록 조회
- repository 생성
- directory tree 조회
- file read
- file create/update
- file delete는 MVP 후순위
- commit message 입력
```

MVP에서는 full git clone을 하지 않는다.

이유:

```text
- 브라우저에서 git clone/push는 복잡함
- 모바일 브라우저에서 local git은 현실적이지 않음
- GitHub Contents API로 Markdown 저장은 충분히 가능
```

### 7.2 GitHub App vs OAuth App

MVP 추천:

```text
Supabase Auth GitHub provider 또는 GitHub OAuth App
```

나중에 권한과 설치형 repository access를 더 세밀하게 가져가려면:

```text
GitHub App
```

권장 진화:

```text
MVP: Supabase Auth + GitHub provider
Beta: GitHub App 검토
```

### 7.3 토큰 보관

브라우저 localStorage에 GitHub access token을 장기 저장하는 것은 비추천.

권장:

```text
Supabase Auth
+ server-side Edge Functions
+ encrypted token storage
```

현실적인 MVP 옵션:

```text
Option A:
Supabase Auth GitHub provider의 provider_token을 세션에서 받아 서버 측에서 사용

Option B:
GitHub OAuth App을 별도 구현하고 access token을 Supabase DB에 암호화 저장

Option C:
초기 개인용 MVP는 사용자가 PAT를 등록하고 Supabase Vault 또는 서버 env에 암호화 저장
```

개인용 MVP라면 Option C도 빠르지만, 서비스화하려면 Option A/B로 가는 것이 좋다.

### 7.4 최소 권한

필요 권한:

```text
repo read/write
user email
repository create
```

private repo까지 지원하려면 repo 권한이 필요하다.

---

## 8. 파일 업로드와 Git LFS

### 8.1 중요한 현실 제약

GitHub API로 작은 파일을 repo에 쓰는 것은 쉽다.  
하지만 Git LFS는 단순히 파일을 업로드하는 것보다 복잡하다.

Git LFS는 실제 대용량 파일을 LFS storage에 올리고, repo에는 pointer file을 commit하는 방식이다.  
브라우저에서 이 과정을 직접 구현하는 것은 MVP 범위에서는 과하다.

### 8.2 MVP 파일 정책

MVP에서는 다음처럼 간다.

```text
Text / Markdown
= GitHub Contents API로 저장

Images
= 클라이언트에서 ≤500KB로 자동 압축 후 GitHub Contents API로 assets에 저장 (§8.5)

Small PDFs / small files
= GitHub Contents API로 assets에 저장

Large files (이미지 외)
= 업로드 차단 또는 Supabase Storage에 저장 후 링크
```

초기 제한 예:

```text
Images: 원본 크기 무관 → 자동 압축으로 항상 ≤500KB (GitHub 직접 업로드)
Other direct upload: 파일당 5MB~10MB 이하
Supabase Storage fallback: 10MB 이상
```

### 8.3 Beta 파일 정책

Beta에서 서버 측 worker를 둔다.

```text
Browser upload
→ Cotext server / Supabase Edge Function
→ Git LFS upload
→ pointer file commit
```

또는 더 간단히:

```text
Large file
→ Supabase Storage
→ Markdown에는 link만 저장
```

### 8.4 LFS 전략

장기적으로는 3가지 모드 제공.

```text
1. normal-git
   작은 파일만 repo에 직접 저장

2. git-lfs
   서버가 LFS batch API 처리

3. external-assets
   Supabase Storage/S3/R2에 저장하고 Markdown에는 링크 저장
```

### 8.5 이미지 자동 압축 (MVP, ≤500KB 보장)

**원칙: 어떤 이미지를 첨부하든 업로드 직전 브라우저에서 압축해 500KB 이하로 만든다.** 이미지가 항상 작아지므로 GitHub Contents API 직접 업로드가 안전해지고, 이미지에 대해서는 LFS·외부 스토리지가 필요 없어진다 (§8.1의 LFS 부담 회피).

왜 클라이언트 압축인가:

```text
- 업로드 대역폭 절약 (모바일 환경에 중요)
- repo 비대화 방지 → pull/clone이 가벼움
- 서버/Edge 비용 0, GitHub Contents API 한도 안에서 처리
- 토큰은 서버에만 두는 원칙 유지 (압축은 순수 클라이언트 처리)
```

압축 파이프라인:

```text
1. 입력 정규화
   - HEIC/HEIF(아이폰) → 디코드 후 처리 (heic2any 등)
   - EXIF orientation 반영해 회전 보정
   - EXIF 메타데이터(GPS 등 민감정보)는 제거 → 프라이버시 + 용량 절감

2. 리사이즈
   - 최대 변(긴 쪽) 캡: 2048px (설정값 maxEdgePx)
   - 비율 유지, 원본이 더 작으면 확대하지 않음

3. 인코딩 & 목표 용량 수렴
   - 포맷: WebP 우선 (미지원 환경은 JPEG fallback)
   - quality를 0.82에서 시작해 ≤500KB가 될 때까지 단계적으로 낮춤
     (예: 0.82 → 0.7 → 0.6 → 0.5 …)
   - 최저 quality에서도 초과하면 maxEdgePx를 한 단계 더 줄여 재시도
   - 투명도(PNG 등) 보존 필요 시 WebP 유지 (JPEG fallback은 흰 배경 합성)

4. 결과
   - 항상 ≤500KB 보장. 실패 시 업로드 차단 + 사용자 안내
```

구현 권장:

```text
- 라이브러리: browser-image-compression (maxSizeMB: 0.5, maxWidthOrHeight: 2048,
  fileType: 'image/webp', useWebWorker: true) — Web Worker로 UI 블로킹 방지
- 보조: heic2any (HEIC 디코드)
- 미리보기: 압축 전후 용량/해상도 표시 (예: 4.2MB → 320KB)
- §24.2 PlatformServices.takePhoto()로 들어온 이미지도 동일 파이프라인 통과
```

설정값(cotext.config.json 확장):

```json
{
  "imageCompression": {
    "enabled": true,
    "maxSizeKB": 500,
    "maxEdgePx": 2048,
    "format": "webp",
    "stripExif": true
  }
}
```

GIF/애니메이션 주의:

```text
- 애니메이션 GIF는 단순 재인코딩 시 첫 프레임만 남거나 용량 폭증 가능
- MVP: 애니메이션 GIF는 압축 대상에서 제외하고
  500KB 초과면 차단 또는 Supabase Storage fallback 링크로 처리
```

MVP 추천:

```text
normal-git + optional Supabase Storage fallback
```

---

## 9. 기술 스택 제안

### 9.1 Web MVP

추천:

```text
Vite + React
TypeScript
React Router (라우팅)
TanStack Query (서버 상태/캐시)
Tailwind CSS
shadcn/ui
CodeMirror 6
Supabase Auth
Supabase Postgres
Supabase Edge Functions (서버 레이어)
GitHub REST API
```

간단하게 가려면:

```text
Vite + React + Supabase(Auth/DB/Edge Functions) + GitHub REST API + CodeMirror
```

왜 Vite + React 인가:

```text
- 가벼운 SPA: dev 서버·번들이 가볍고 설정이 단순
- Capacitor 친화: 정적 빌드 결과물을 그대로 네이티브 래핑 (§24)
- 서버는 분리: 토큰/GitHub 쓰기 등 서버 작업은 Supabase Edge Functions가 전담
- SEO 불필요: 로그인 뒤의 앱이라 SSR 이점이 작음
```

### 9.2 Markdown editor

추천:

```text
CodeMirror 6
```

이유:

```text
- 가볍고 웹에 적합
- Markdown 편집 가능
- 모바일 대응 가능
- diff view 구현 가능
```

대안:

```text
Monaco Editor
```

Monaco는 강력하지만 모바일/가벼운 메모앱에는 무거울 수 있다.

### 9.3 모바일 앱 확장

사용자가 말한 “capitator”는 아마 **Capacitor**를 의미한다.  
웹 앱을 잘 만들면 나중에 Capacitor로 Android/iOS 앱으로 감쌀 수 있다.

권장:

```text
MVP: responsive web / PWA
Later: Capacitor wrapper
```

모바일 앱에서 추가할 것:

```text
- share sheet 지원
- push notification
- camera/photo upload
- offline draft
```

---

## 10. Supabase 데이터 모델

### 10.1 users

Supabase Auth의 `auth.users`를 사용한다.  
추가 profile 테이블을 둔다.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  github_username text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 10.2 github_connections

```sql
create table github_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  github_username text,
  access_token_encrypted text,
  token_scope text,
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

초기에는 Supabase Auth provider token을 사용해도 된다.  
상용화 전에는 token 저장/갱신 정책을 다시 설계한다.

### 10.3 workspaces

```sql
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  github_owner text not null,
  github_repo text not null,
  default_branch text default 'main',
  cotext_folder_name text default '.cotext',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 10.4 rooms

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  path text not null,
  cotext_folder text default '.cotext',
  cotext_file_path text not null,
  last_known_sha text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, path)
);
```

### 10.5 local_drafts

```sql
create table local_drafts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  base_sha text,
  dirty boolean default true,
  updated_at timestamptz default now(),
  unique(room_id, user_id)
);
```

### 10.6 assets

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  path text not null,
  size_bytes bigint,             -- 최종(압축 후) 용량
  original_size_bytes bigint,    -- 압축 전 원본 용량
  width int,                     -- 이미지 가로(px)
  height int,                    -- 이미지 세로(px)
  compressed boolean default false,
  mime_type text,
  storage_mode text default 'github',
  created_at timestamptz default now()
);
```

### 10.7 Row Level Security

RLS는 반드시 켠다.

기본 원칙:

```text
사용자는 자기 user_id에 해당하는 profile/workspace/room/draft/asset만 읽고 쓸 수 있다.
```

---

## 11. 주요 API 설계

SPA에는 자체 서버가 없으므로 호출을 두 갈래로 나눈다.

```text
A. Supabase 직접 호출 (브라우저 → Supabase client, RLS로 보호)
   - GitHub 토큰이 필요 없는 순수 메타데이터 CRUD
   - 별도 API 코드 없이 supabase-js로 처리

B. Edge Functions 경유 (브라우저 → Supabase Edge Function → GitHub API)
   - GitHub 토큰을 사용하는 모든 작업 (토큰은 서버에만)
```

### Auth (Supabase Auth)

```text
signInWithOAuth({ provider: 'github' })   // 클라이언트
/auth/callback                            // OAuth 콜백 (Edge Function 또는 정적 콜백 라우트)
signOut()                                 // 클라이언트
```

### A. Supabase 직접 (RLS) — 토큰 불필요

```text
workspaces  : select / insert / update / delete   (supabase.from('workspaces'))
rooms       : select / insert / update            (supabase.from('rooms'))
local_drafts: upsert / select                     (supabase.from('local_drafts'))
assets      : select (메타데이터 조회)             (supabase.from('assets'))
```

### B. Edge Functions — 토큰 사용 (GitHub 접근)

```text
github-repos          GET/POST   repo 목록 조회 / 생성
github-tree           GET        repo directory tree 조회
room-content          GET        cotext.md content + sha 조회
room-pull             POST       최신 content/sha 가져오기
room-push             POST       commit (update file) — assets 메타 기록 포함
room-asset-upload     POST       압축된 이미지/파일을 assets에 commit (§8.5)
```

```text
호출 형태 예:
  supabase.functions.invoke('room-push', { body: { roomId, content, baseSha, message } })

원칙:
  - Edge Function은 요청자의 Supabase 세션을 검증한 뒤,
    해당 user의 암호화된 GitHub 토큰을 꺼내 서버에서만 사용한다.
  - 브라우저는 토큰을 절대 보지 않는다.
```

---

## 12. Push / Pull 로직

### Pull

```text
1. GitHub에서 cotext.md 최신 content와 sha 조회
2. local draft가 없으면 그대로 표시
3. local draft가 있고 dirty=false면 덮어쓰기
4. local draft가 있고 dirty=true면 conflict 가능성 확인
5. 사용자가 merge / overwrite / cancel 선택
```

### Push

```text
1. 현재 remote sha 확인
2. local baseSha와 remote sha 비교
3. 같으면 update file commit
4. 다르면 conflict 발생
5. 사용자가 pull/merge 후 push
```

### 간단 conflict UX

```text
Remote changed since last pull.

Options:
- Pull and merge
- Push anyway
- Cancel
```

MVP에서는 자동 merge를 복잡하게 만들지 않는다.

---

## 13. UI 상세

### 13.1 Workspace sidebar

```text
- workspace 목록
- repo owner/name
- branch
- sync status
```

### 13.2 Room list

```text
- directory path 기반 room 목록
- 검색
- 새 room 생성
- 최근 열어본 room
```

### 13.3 Main editor

모드:

```text
Chat
Editor
Split
Preview
```

상태 표시:

```text
Pushed
Draft
Conflict
Syncing
Error
```

### 13.4 Message input

지원:

```text
- 텍스트
- 이미지 붙여넣기 / 드래그앤드롭 / 카메라 → 자동 압축(≤500KB, §8.5)
- 압축 전후 용량·해상도 미리보기 (예: 4.2MB → 320KB)
- 파일 드래그앤드롭
- Enter to send
- Shift+Enter newline
```

### 13.5 Commit bar

```text
Commit message input
Pull button
Push button
Status indicator
```

기본 commit message:

```text
cotext: update projects/transight-tr
```

---

## 14. MVP 범위

### Must-have

```text
- Supabase Auth
- GitHub 연결
- workspace 생성
- 기존 repo 연결
- repo directory 탐색
- directory를 room으로 열기
- .cotext/cotext.md 생성
- Markdown 읽기/쓰기
- chat-style append
- editor 직접 수정
- push to GitHub
- pull from GitHub
- image upload to assets (클라이언트 자동 압축 ≤500KB, §8.5)
- small file upload to assets
- local draft를 Supabase에 저장
- light/dark mode
- pushed/draft 시각 구분
```

### Should-have

```text
- Markdown preview
- 최근 room 목록
- commit message custom
- conflict warning
- mobile responsive
- PWA install
- 블록 front-matter/태그 입력 (type/status/tags) — 컨텍스트 엔지니어링 씨앗
- 룸 markdown 정제 복사 (최소 context export)
- 플랫폼 서비스 추상화 레이어 (Capacitor 이식 대비, 아키텍처 항목)
```

### Later

```text
- Git LFS server-side support
- Supabase Storage large asset fallback
- automatic project classification
- GPT auto-structuring
- inbox ingest
- multi-user workspace
- branch selection
- PR mode
- Obsidian-compatible backlinks
- agent plugin API
- Capacitor mobile app
```

---

## 15. 보안 설계

### 15.1 중요한 원칙

```text
Cotext는 사용자의 GitHub repository에 write access를 가진다.
따라서 token 관리가 핵심 보안 이슈다.
```

### 15.2 권장

```text
- access token은 서버에서만 사용
- DB에는 encrypted token 저장
- browser에는 Supabase session cookie/token만 저장
- HTTPS 필수
- repository 권한 최소화
- Supabase RLS 필수
```

### 15.3 MVP에서 피해야 할 것

```text
- GitHub token을 localStorage에 장기 저장
- public client에 token 노출
- 모든 repo에 무제한 접근 요청
- 사용자가 모르게 자동 push
```

---

## 16. 파일명 규칙

### 16.1 Asset file naming

```text
YYYY-MM-DD-HHmm-type-seq.ext
```

예:

```text
2026-06-13-1432-image-001.png
2026-06-13-1432-reference-001.pdf
```

### 16.2 Cotext message format

```markdown
## 2026-06-13 14:32

메모 내용

Attachments:

- ![image](./assets/2026-06-13-1432-image-001.png)
- [reference.pdf](./assets/2026-06-13-1432-reference-001.pdf)
```

---

## 17. 개발 단계

### Phase 0. Repo setup

```text
- Vite + React + TypeScript project 생성 (npm create vite@latest -- --template react-ts)
- React Router + TanStack Query 설정
- Tailwind 설정
- shadcn/ui 설정
- Supabase client(supabase-js) 설정
- Supabase CLI + Edge Functions 로컬 개발 환경 설정
- 기본 layout 구성
- 환경변수 설정 (.env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
```

### Phase 1. Supabase Auth + GitHub 연결

```text
- Supabase 프로젝트 생성
- GitHub provider 설정
- 로그인/로그아웃
- session 처리
- GitHub repo list 조회
```

### Phase 2. Workspace

```text
- workspace 생성
- 기존 repo 연결
- repo 생성 기능
- workspace list UI
- Supabase workspaces 테이블 연동
```

### Phase 3. Room

```text
- repo tree 조회
- directory 선택
- .cotext 생성
- cotext.md 생성
- room list UI
- Supabase rooms 테이블 연동
```

### Phase 4. Editor

```text
- cotext.md 읽기
- Markdown editor
- chat append input
- local draft state
- Supabase local_drafts 저장
- pushed/draft visual state
```

### Phase 5. Push/Pull

```text
- GitHub file update
- commit message
- SHA 기반 conflict detection
- pull refresh
- push 후 draft dirty=false 처리
```

### Phase 6. Assets

```text
- 이미지 붙여넣기
- 파일 업로드
- assets 폴더 저장
- Markdown link 삽입
- file size 제한
- assets 테이블 기록
```

### Phase 7. Polish

```text
- light/dark mode
- responsive mobile layout
- PWA
- error handling
- onboarding
```

---

## 18. Codex / Antigravity에게 줄 첫 지시문

```text
이 프로젝트는 Cotext라는 GitHub-native context capture web app이다.

목표:
사용자가 GitHub repo를 workspace로 연결하고, 특정 directory를 room처럼 열면 해당 directory 아래에 .cotext/cotext.md를 생성한다.
사용자는 채팅하듯 텍스트/이미지/파일을 입력하고, Cotext는 이를 Markdown과 assets로 저장한 뒤 GitHub에 push한다.

MVP 범위:
- Vite + React + TypeScript 기반 SPA (가벼움 + 향후 Capacitor 래핑)
- 토큰을 다루는 서버 작업은 Supabase Edge Functions로 처리 (SPA에 자체 서버 없음)
- Supabase Auth
- Supabase Postgres
- GitHub OAuth/provider 연결
- repository list 조회
- 기존 repository 연결
- 새 repository 생성
- directory tree 조회
- directory를 room으로 열기
- .cotext/cotext.md 생성
- Markdown editor + chat input
- pull / push
- 이미지 업로드 (클라이언트에서 ≤500KB 자동 압축 후 저장)
- small file upload
- local draft를 Supabase에 저장
- light/dark mode
- responsive web

중요 원칙:
- GitHub repository가 정본이다.
- Cotext는 자체 노트 저장소가 아니라 GitHub repo를 편집하는 인터페이스다.
- Supabase는 auth, workspace metadata, room metadata, local draft, asset metadata를 관리한다.
- 토큰을 다루는 모든 GitHub 작업은 Supabase Edge Functions(서버)에서만 수행한다. SPA는 토큰을 다루지 않는다.
- 이미지는 업로드 직전 브라우저에서 ≤500KB로 자동 압축한다(WebP, EXIF 제거).
- LFS는 MVP에서 제외한다. 우선 small file만 GitHub Contents API로 저장한다.
- 큰 파일(이미지 외)은 차단하거나 Supabase Storage fallback으로 후순위 처리한다.
- access token은 browser localStorage에 저장하지 않는다.
- 모든 write는 사용자가 push 버튼을 눌렀을 때만 수행한다.

먼저 아래 산출물을 만들어줘.
1. 프로젝트 폴더 구조 (Vite + React)
2. Supabase schema
3. 데이터 모델
4. Edge Functions 설계 (토큰 사용 작업) + Supabase 직접 호출 분리
5. GitHub API wrapper (Edge Function 내부, 서버 전용)
6. 기본 UI wireframe
7. Phase 1 구현 계획
```

---

## 19. MVP 폴더 구조 제안

```text
cotext/
  README.md
  .env.example
  index.html              # Vite 진입점 (테마 FOUC 방지 inline script 포함)
  vite.config.ts
  package.json
  capacitor.config.ts     # (Later) Capacitor 래핑용
  supabase/
    migrations/
    seed.sql
    functions/            # Edge Functions (서버 레이어, 토큰 사용)
      _shared/
        github.ts         # GitHub REST 래퍼 (서버 전용)
        auth.ts           # 세션 검증 + 토큰 복호화
      github-repos/
      github-tree/
      room-content/
      room-pull/
      room-push/
      room-asset-upload/
  src/
    main.tsx              # React 진입
    App.tsx
    routes/              # React Router
      index.tsx
      login.tsx
      workspaces.tsx
      room.tsx
    components/
      layout/
      workspace-sidebar.tsx
      room-list.tsx
      cotext-editor.tsx
      morphing-composer.tsx
      commit-bar.tsx
      asset-uploader.tsx
    lib/
      supabase/
        client.ts         # 브라우저 supabase-js (anon)
        functions.ts      # Edge Function invoke 래퍼
      image/
        compress.ts       # ≤500KB 자동 압축 (§8.5)
      platform/
        index.ts          # PlatformServices 인터페이스 (§24.2)
        web.ts            # 웹 구현
        capacitor.ts      # (Later) 네이티브 구현
      markdown/
      diff/
    hooks/                # TanStack Query 훅
    theme/                # 토큰/테마 토글 (§23)
    types/
      workspace.ts
      room.ts
      asset.ts
  docs/
    product-plan.md
    architecture.md
    github-integration.md
    supabase-schema.md
```

---

## 20. 향후 확장: AI plug-in layer

MVP 이후에는 LLM을 붙인다.

```text
- 자동 project classification
- inbox ingest
- Markdown 구조화
- decision / source / concept 분류
- master-context sync
- daily digest
- duplicate detection
```

하지만 MVP에서는 AI를 붙이지 않는다.

이유:

```text
- 먼저 capture UX와 GitHub sync가 핵심
- AI를 먼저 붙이면 scope가 커짐
- GitHub-native editor로서의 안정성이 우선
```

---

## 21. 최종 제품 방향

Cotext의 장기 방향은 다음이다.

```text
Cotext는 GitHub repo를 사람과 AI가 함께 쓰는 context pool로 바꾸는 얇은 인터페이스다.
```

Notion처럼 모든 것을 소유하지 않는다.  
Obsidian처럼 로컬 vault만 전제하지 않는다.  
GitHub를 중심에 두고, 어디서든 접속 가능한 chat/editor UX를 제공한다.

최종 positioning:

```text
GitHub-native context inbox for builders, planners, and AI-agent users.
```

한국어 positioning:

```text
기획자와 개발자를 위한 GitHub 기반 컨텍스트 메모장.
```

---

## 22. 시그니처 UI — 모핑 컴포저 상세

### 22.1 컨셉

하나의 입력 컴포넌트가 세 가지 상태(state)를 부드럽게 오간다. 별도 "모드 버튼"으로 화면을 갈아끼우는 게 아니라, 같은 박스가 자라고 줄어든다.

```text
state: collapsed → expanded → composer
       (1줄 채팅)   (3~5줄)     (전체 에디터)
```

전환 트리거:

```text
- 자동: 줄 수가 임계치 초과 / 이미지·코드블록 붙여넣기
- 수동: 우하단 ⤢ 핸들 클릭·드래그, 또는 단축키(예: Ctrl/⌘ + ↑)
- 축소: ESC, 핸들 드래그 다운, 또는 내용을 비우면 자동 collapse
```

### 22.2 모션·감성 ("세련된 느낌"의 실체)

```text
- 높이 전환은 spring 애니메이션 (framer-motion layout 또는 CSS grid-rows 1fr 트랜지션)
- 200~260ms, ease-out, 과한 overshoot 없는 차분한 곡선
- collapsed: 그림자·라운드 강조 → 떠 있는 chat bar 느낌
- composer: 표면(surface)에 흡수되어 평평한 에디터 느낌
- 포커스 링은 accent 컬러, 얇게 / prefers-reduced-motion이면 모션 생략
```

### 22.3 컴포저 안의 슬래시 커맨드 (컨텍스트 엔지니어링의 진입점)

컴포저에서 `/`를 치면 메뉴가 뜬다. 이것이 단순 메모를 "구조화된 컨텍스트"로 끌어올리는 핵심 장치다.

```text
/decision   결정 블록 (status: decided)
/idea       아이디어 블록
/source     출처/레퍼런스 블록 (링크·인용)
/question   미해결 질문 블록 (status: open)
/task       할 일 (체크박스)
/spec       사양/요구사항 블록
/ref        다른 룸·블록을 [[wikilink]]로 참조
/context    현재까지의 context pack 미리보기·삽입
/ask        (Later) 작성 중 컨텍스트를 LLM에 전송
```

선택 시 블록에 가벼운 front-matter/태그가 붙는다 — 사람이 읽어도 자연스럽고, 에이전트가 파싱 가능. (구조는 §25.1)

### 22.4 타임라인(메시지) 표현

```text
- 각 블록: 타임스탬프 + 타입 chip(색상) + 본문(rendered markdown)
- pushed = muted, draft = vivid + 좌측 accent bar
- 블록 호버: 편집 / 복사 / "context pack에 추가" / anchor 링크 복사
- 각 블록은 안정적 anchor id 보유 → [[room#block-id]]로 참조 가능
```

---

## 23. 디자인 시스템 & 테마 (Light/Dark 필수)

### 23.1 토큰 기반 색 시스템

색을 컴포넌트에 직접 박지 않고 **시맨틱 토큰**으로 추상화한다. Tailwind + CSS 변수 조합.

```css
:root {
  --bg; --surface; --surface-2;
  --text; --text-muted;
  --border; --accent; --accent-fg;
  --draft;   /* draft 강조색 */
  --pushed;  /* pushed muted색 */
  --chip-decision; --chip-idea; --chip-source; --chip-question;
}
[data-theme="dark"] { /* 동일 토큰, 다른 값 */ }
```

```text
- 전환: system 기본 + 수동 토글(light/dark/system) → localStorage
- Vite SPA: index.html <head>의 inline script가 첫 페인트 전에
  localStorage/prefers-color-scheme를 읽어 <html data-theme>를 설정 → FOUC(깜빡임) 방지
- Tailwind는 색을 var() 토큰에 매핑 → 테마 추가/브랜딩 변경이 1곳에서 끝남
```

### 23.2 타이포·밀도

```text
- chrome(사이드바/헤더): 휴머니스트 sans — Inter + Pretendard(한글 가독성)
- 에디터/코드: mono — JetBrains Mono / IBM Plex Mono
- density: comfortable(데스크톱) / compact(모바일) 자동 전환
```

### 23.3 컴포넌트·접근성

```text
- shadcn/ui를 토큰에 맞춰 커스터마이즈, 모든 색은 토큰 경유
- 대비 4.5:1 이상, 포커스 가시성 확보
- prefers-reduced-motion 존중, prefers-color-scheme 초기값 반영
```

---

## 24. 반응형 & Capacitor 전략

### 24.1 레이아웃 적응 (PC/모바일 최적화)

```text
Desktop (≥1024px): 3-pane
  [Workspace/Room list] [Timeline + Composer] [Editor/Preview(옵션)]

Tablet (768~1023): 2-pane (list + main), 우측 에디터는 토글

Mobile (<768): 1-pane stack
  - 룸 리스트 = 좌측 drawer (스와이프/햄버거)
  - 메인 = 타임라인 + 하단 고정 컴포저
  - Split은 탭 전환(Chat / Editor / Preview)으로 대체
```

모바일에서 컴포저가 composer 상태로 확장되면 **전체화면 bottom sheet**로 올라온다 → 집중 작성.

### 24.2 플랫폼 서비스 추상화 (핵심: 재작성 방지)

Capacitor 이식을 매끄럽게 하려면 플랫폼 의존 기능을 인터페이스로 감싼다.

```ts
interface PlatformServices {
  pickFile(): Promise<File[]>
  takePhoto(): Promise<File>
  share(payload): Promise<void>
  secureStore: { get(k): string; set(k, v): void }  // 토큰류
  notify(payload): Promise<void>
  isOnline(): boolean
}
```

```text
- Web 구현(MVP): input[type=file], Web Share API, IndexedDB
- Capacitor 구현(Later): Camera, Filesystem, Share, Push, Secure Storage 플러그인
- 화면 코드는 인터페이스에만 의존 → 래핑 시 UI 코드 변경 0
```

### 24.3 PWA → Capacitor 경로

```text
MVP : 반응형 + PWA (manifest, service worker, 설치형, 오프라인 draft = IndexedDB)
Later: Capacitor 래핑
  - Share Target: 타 앱에서 공유한 텍스트/이미지 → 바로 inbox 룸으로 캡처
  - Camera 캡처 → asset
  - Push: pull/협업 알림
  - Biometric으로 보호되는 secure token
  - Deep link: cotext://workspace/room
```

### 24.4 보안 불변식

```text
Capacitor 앱 안이라도 GitHub write를 클라이언트에서 직접 하지 않는다.
→ 항상 Cotext 서버 API 경유 (token은 서버에만 존재)
```

---

## 25. 컨텍스트 엔지니어링 레이어 (멀티 LLM · 에이전트 하네싱)

> MVP에서는 "발행/내보내기"의 최소형만 만든다. 추론(AI 호출)은 Later.  
> **단, 데이터 구조는 지금부터 이 방향으로 적는다.**

### 25.1 구조화된 블록 = 컨텍스트의 원자

모든 메모 블록은 선택적 front-matter를 가질 수 있다. 사람이 쓰기 쉽고 에이전트가 읽기 쉽다.

```markdown
<!-- @cotext id=blk_0c12 type=decision status=decided tags=[tr-obm,security] -->
## 2026-06-13 14:32 · Decision

HMAC DI 생성 과정 설명을 3줄로 축약하기로.
```

```text
type:   decision | idea | source | question | task | spec | note
status: open | decided | done
tags:   자유 태그
id:     안정적 참조용 anchor
```

이 메타데이터가 "context engineering"의 실체다. **LLM이 사후 분류하기 전에, 적는 순간 사람이 가볍게 구조를 부여한다.** 이게 "나로부터 출발하는 정보를 미리 준비해 둔다"의 구현.

### 25.2 Context Pack (발행물)

여러 룸/블록을 골라 하나의 LLM-ready 페이로드로 묶는다.

```text
선택: 룸들 + 태그 필터 + 타입 필터 (예: decision + spec 만)
출력:
  - clipboard markdown   → 어떤 LLM에든 붙여넣기
  - XML/구조화 포맷       → Claude 등 tool/agent 입력
  - repo 내 /context-packs/<name>.md 로 commit → 버전관리되는 컨텍스트
```

MVP의 최소형: **"현재 룸을 정제된 markdown으로 복사" 버튼 하나.** 그것만으로도 멀티 LLM에 일관된 컨텍스트를 주입할 수 있다.

### 25.3 에이전트 하네싱 — Repo as MCP

GitHub repo가 정본이므로, 에이전트가 repo를 직접 읽게 한다.

```text
A. 직접: Claude Code / Cursor가 이미 repo를 읽음
   → .cotext/cotext.md 가 곧 컨텍스트
B. MCP 서버(Later): "Cotext MCP"가 repo의 룸·태그·pack을
   list_rooms / get_room / search_context / get_pack 툴로 노출
   → 어떤 에이전트든 동일 컨텍스트 풀에 접속(harnessing)
C. AGENTS.md / CLAUDE.md 자동 유지:
   repo 루트에 에이전트용 가이드를 생성·갱신
```

### 25.4 멀티 LLM 팬아웃 (Later)

```text
컴포저의 /ask:
  현재 context pack + 프롬프트를
  Claude / GPT / Gemini 등 여러 모델에 동시 전송 → 응답 비교
  채택한 응답을 다시 블록으로 저장 (출처 = 모델명 표기)
→ repo는 여전히 정본, 모델은 교체 가능한 소비자(consumer)
```

### 25.5 단계적 도입

```text
MVP  : 블록 front-matter 태그 입력 + 룸 markdown 복사(최소 pack)
Beta : context pack 빌더 UI + repo로 pack commit + AGENTS.md 생성
Later: Cotext MCP 서버, /ask 멀티 LLM, 자동 분류/요약/중복탐지
```

---

## 26. 변경 요약 (이 업그레이드에서 추가/조정된 것)

```text
+ North Star(§0.1): 제품 본질을 "context engineering for multi-LLM/agent"로 명시.
  단, MVP는 capture에 집중하는 2-레이어 모델로 정리.
+ 모핑 컴포저(§4.2, §22): chat ↔ editor 한 컴포넌트 모핑 + 슬래시 커맨드(구조화 진입점)
+ 디자인 시스템(§23): 토큰 기반 light/dark, FOUC 방지, 접근성
+ 반응형·Capacitor(§24): 3→1 pane 적응, 플랫폼 서비스 추상화로 재작성 방지
+ 컨텍스트 엔지니어링(§25): 구조화 블록, Context Pack, Repo-as-MCP, 멀티 LLM 팬아웃
~ MVP 범위(§14): front-matter 태그 + 최소 context export + 플랫폼 추상화 레이어를 조기 편입
+ 이미지 자동 압축(§8.5): 어떤 이미지든 클라이언트에서 ≤500KB로 압축(WebP, EXIF 제거,
  2048px 캡) → GitHub 직접 업로드 안전화, 이미지에 LFS/외부스토리지 불필요.
  assets 테이블에 원본/압축 용량·해상도 컬럼 추가(§10.6)
~ 스택 결정: Next.js → Vite + React + Supabase 로 변경 (가벼움 + Capacitor 친화).
  토큰 사용 작업은 Supabase Edge Functions가 전담(§6, §11). 폴더구조(§19)·Phase 0(§17)·
  API 설계(§11)·테마 FOUC(§23.1) 모두 SPA 기준으로 갱신
```
