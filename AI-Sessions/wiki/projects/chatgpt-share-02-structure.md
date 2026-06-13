---
type: project
date: 2026-06-13
status: active
source: index.md, README.md, TEMPLATE_MANIFEST.md
---

# ChatGPT Share Pack 02 - Structure

## Summary

이 문서는 템플릿의 폴더 구조와 각 파일 및 디렉터리의 역할을 정리한 구조 설명서다.

## Context

ChatGPT가 프로젝트를 빠르게 이해하려면 개별 파일 내용보다 먼저 "어느 폴더에 무엇을 저장하는 시스템인지"를 알아야 한다.

## Details

### 루트 파일 역할

- `README.md`: 템플릿 소개, 사용 순서, 포함 범위, 운영 원칙
- `START_HERE.md`: 에이전트 첫 실행용 전체 지시 프롬프트
- `CLAUDE.md`: Claude Code용 운영 규칙
- `AGENTS.md`: Codex 및 기타 에이전트용 운영 규칙
- `index.md`: vault 전체 지도와 중요 문서 링크 허브
- `log.md`: 중요한 작업 기록
- `TEMPLATE_MANIFEST.md`: 템플릿 이름, 버전, 필수 파일/폴더, 배포 규칙
- `VERSION`: 현재 버전 문자열
- `LICENSE.md`: 라이선스

### 디렉터리 구조

```text
AI-Agent-Wiki-Template/
├── AI-Sessions/
│   ├── raw/
│   ├── conversations/
│   └── wiki/
│       ├── sources/
│       ├── concepts/
│       ├── decisions/
│       ├── errors/
│       ├── projects/
│       ├── design/
│       └── dev-tasks/
├── prompts/
└── scripts/
```

### `AI-Sessions/` 하위 의미

- `raw/`: 수정하지 않는 1차 원본 자료 저장소
- `conversations/`: 세션 인수인계, 핸드오프 기록
- `wiki/sources/`: raw 자료 요약과 출처 문맥
- `wiki/concepts/`: 반복 사용 개념, 용어, 프레임워크
- `wiki/decisions/`: 의사결정, 근거, 결정권자, 날짜
- `wiki/errors/`: 실패 사례, 반복 금지 리스크
- `wiki/projects/`: 프로젝트별 진행 맥락과 산출물
- `wiki/design/`: 디자인 원칙, IA, 화면 설계
- `wiki/dev-tasks/`: 구현 작업 단위, 의존성, 개발 메모

### `prompts/` 내용

- `first-setup.md`: 템플릿을 실제 업무용 vault로 바꾸는 첫 지시
- `save.md`: 이번 작업을 저장할지 판단하고 반영하는 지시
- `query.md`: 기존 맥락 복원 지시
- `ingest.md`: raw 자료를 읽고 wiki 문서화하는 지시
- `lint.md`: 구조와 저장 규칙 위반을 점검하는 지시

### `index.md`의 역할

- Start Here 문서 링크
- Vault Structure 설명
- 등록된 Projects, Decisions, Sources, Errors 허브
- Prompt Library 링크

### `log.md`의 역할

- 저장, ingest, query, lint 같은 중요 작업에 대한 시간순 1줄 기록
- 형식: `YYYY-MM-DD HH:mm | command | summary | linked files`

### 필수 파일과 폴더

`TEMPLATE_MANIFEST.md` 기준으로 루트 문서, `AI-Sessions/` 구조, `prompts/`, `scripts/`는 모두 배포 템플릿의 필수 구성요소다.

## Links

- [[index]]
- [[README]]
- [[TEMPLATE_MANIFEST]]
- [[AI-Sessions/wiki/projects/chatgpt-share-01-overview]]
- [[AI-Sessions/wiki/projects/chatgpt-share-03-rules-and-prompts]]
