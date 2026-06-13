---
type: project
date: 2026-06-13
status: active
source: AGENTS.md, CLAUDE.md, START_HERE.md, prompts/
---

# ChatGPT Share Pack 03 - Rules And Prompts

## Summary

이 문서는 에이전트 운영 규칙, 저장 필터, 문서 형식, 프롬프트 라이브러리의 실제 의미를 한 번에 전달한다.

## Context

이 템플릿을 단순 폴더 묶음이 아니라 "작동하는 업무 프로세스"로 만드는 핵심은 규칙과 프롬프트다.

## Details

### 에이전트 역할 정의

- 에이전트는 단순 질의응답 챗봇이 아니라 업무 운영자다.
- 작업 전 `index.md`, `log.md`, 관련 `AI-Sessions/wiki/` 문서를 읽는다.
- 필요 시 raw를 읽되 수정하지 않는다.
- 중요한 산출물은 wiki나 conversations에 저장한다.

### 저장 전 5가지 필터

저장 전 아래 중 하나라도 만족해야 한다.

1. 반복해서 재사용될 정보인가?
2. 인수인계에 필요한 정보인가?
3. 근거와 결정권자 추적이 필요한가?
4. 다시 반복하면 안 되는 실패나 리스크인가?
5. 팀이 공유해야 하는 규칙이나 가이드인가?

어느 것도 해당하지 않으면 저장하지 않고 이유만 짧게 설명한다.

### 한글/영문 혼합 원칙

- 사람이 읽는 규칙과 설명은 한국어
- 명령 키워드와 파일 시스템 조작 개념은 영어
- 고정 명령 키워드: `save`, `ingest`, `query`, `lint`

### raw / wiki 분리 원칙

- `AI-Sessions/raw/`는 불변 원본 저장소
- 에이전트는 raw를 직접 수정하지 않음
- 원본을 읽고 요약, 개념화, 결정 정리는 `AI-Sessions/wiki/` 아래 별도 문서로 저장

### 권장 문서 포맷

```markdown
---
type: decision | source | concept | error | project | design | dev-task | handoff
date: YYYY-MM-DD
status: draft | active | superseded
source: optional
---

# 제목

## Summary

## Context

## Details

## Links
```

### 완료 보고 규칙

작업이 끝나면 최소한 아래를 보고한다.

- 읽은 주요 파일
- 수정하거나 생성한 파일
- 저장하지 않은 정보가 있다면 그 이유
- 다음 작업자가 먼저 확인해야 할 문서

### 첫 실행 프롬프트의 목적

`START_HERE.md`와 `prompts/first-setup.md`는 에이전트에게 다음을 요구한다.

- 현재 템플릿 구조와 규칙 파악
- Karpathy LLM Wiki gist를 참고해 설계 원칙 학습
- 템플릿을 실제 사용자 업무에 맞게 보강
- 한국어 가이드와 영어 명령 키워드 유지
- 5가지 저장 필터를 규칙에 포함

### 보조 프롬프트 의미

- `save`: 저장 가치 판단 후 적절한 카테고리에 문서화하고 `index.md`, `log.md` 갱신
- `query`: 기존 wiki와 log를 읽어 현재 작업을 이어갈 수 있게 맥락 복원
- `ingest`: raw 자료를 읽고 `wiki/sources/`에 요약, 필요 시 concepts/decisions로 연결
- `lint`: 구조, 기록 누락, 저장 규칙 위반, 민감정보 저장 여부 점검

### ChatGPT에 전달할 때의 해석 포인트

- 이 템플릿의 핵심 산출물은 "문서 내용"보다 "업무 운영 방식"이다.
- ChatGPT가 이해해야 하는 것은 파일별 정보뿐 아니라 저장 판단 기준과 정보 흐름이다.
- 따라서 공유 시에는 개요, 구조, 규칙/프롬프트를 함께 줘야 전체 맥락이 보존된다.

## Links

- [[AGENTS]]
- [[CLAUDE]]
- [[START_HERE]]
- [[prompts/first-setup]]
- [[prompts/save]]
- [[prompts/query]]
- [[prompts/ingest]]
- [[prompts/lint]]
- [[AI-Sessions/wiki/projects/chatgpt-share-01-overview]]
- [[AI-Sessions/wiki/projects/chatgpt-share-02-structure]]
