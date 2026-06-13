# CLAUDE.md

이 파일은 Claude Code가 이 Obsidian vault에서 일할 때 따라야 하는 업무 규약입니다.

목표는 개인 메모장이 아니라, 여러 AI 에이전트와 사람이 같은 업무 맥락을 공유할 수 있는 안정적인 비즈니스 프로세스를 만드는 것입니다.

## Core Operating Rules

1. 작업을 시작하기 전에 `index.md`, `log.md`, 관련 `AI-Sessions/wiki/` 문서를 먼저 확인한다.
2. `AI-Sessions/raw/` 안의 원본 자료는 수정하거나 삭제하지 않는다.
3. 가공된 지식, 결정, 에러, 프로젝트 문서는 `AI-Sessions/wiki/` 아래에 저장한다.
4. 세션 인수인계가 필요하면 `AI-Sessions/conversations/`에 저장한다.
5. 중요한 저장 작업 후에는 `index.md`와 `log.md`를 갱신한다.
6. 사용자가 명시적으로 원하지 않는 한 민감정보, 토큰, 비밀번호, 고객 개인정보를 저장하지 않는다.

## Korean / English Hybrid

사람이 읽고 검토해야 하는 가이드라인은 한국어로 작성한다.

파일 시스템 작업, 명령 키워드, 자동화 트리거는 영어로 고정한다.

사용 가능한 명령 키워드:

- `save`: 현재 작업 맥락을 저장한다.
- `ingest`: raw 자료를 wiki 자료로 가공한다.
- `query`: 기존 wiki와 log를 참조한다.
- `lint`: vault 구조와 규칙 위반을 점검한다.

## Raw / Wiki Separation

`AI-Sessions/raw/`는 불변 자료 저장소다.

여기에는 기사 원문, 회의 녹취록, 화면 캡처 설명, 외부 자료 원본처럼 나중에 근거로 다시 확인해야 하는 자료를 둔다.

에이전트는 raw 파일을 수정하지 않는다. raw 내용을 바탕으로 요약, 판단, 결정, 기획 자료를 만들 때는 반드시 `AI-Sessions/wiki/` 아래에 별도 문서를 만든다.

## Wiki Categories

- `AI-Sessions/wiki/sources/`: raw 자료를 요약하고 출처 맥락을 정리한 문서
- `AI-Sessions/wiki/concepts/`: 반복해서 쓰는 개념, 용어, 프레임워크
- `AI-Sessions/wiki/decisions/`: 의사결정, 결정 근거, 결정권자, 날짜
- `AI-Sessions/wiki/errors/`: 실패한 접근, 다시 반복하면 안 되는 실수
- `AI-Sessions/wiki/projects/`: 프로젝트별 진행 맥락과 산출물
- `AI-Sessions/wiki/design/`: 디자인 원칙, IA, 화면 설계 가이드
- `AI-Sessions/wiki/dev-tasks/`: 개발 작업 단위, 의존성, 구현 메모

## Save Filter

무분별한 저장은 맥락 오염을 만든다.

`save`를 실행하기 전에 아래 5가지 조건을 확인한다.

1. 이 정보가 향후 실무에 반복해서 재사용될 데이터인가?
2. 다른 에이전트나 동료가 프로젝트를 이어받기 위해 반드시 읽어야 하는가?
3. 의사결정의 근거와 결정권자를 나중에 추적할 필요가 있는가?
4. 실패한 방식이라 다시 시도하면 안 되는 리스크 정보인가?
5. 팀 전체가 맞추어야 하는 공통 규칙이나 디자인 가이드인가?

하나도 만족하지 않는 일회성 답변, 감상, 사소한 표현 변경은 wiki에 저장하지 않는다.

## Document Format

새 wiki 문서는 가능하면 아래 형식을 따른다.

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

## Completion Rule

작업이 끝나면 다음을 보고한다.

- 읽은 주요 파일
- 수정하거나 생성한 파일
- 저장 필터 적용 결과
- 다음 세션에서 이어갈 때 먼저 볼 문서

