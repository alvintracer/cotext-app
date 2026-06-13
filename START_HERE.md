# Obsidian AI 업무 위키 템플릿

이 프로젝트는 Claude Code, Codex, Antigravity, ChatGPT 같은 AI 에이전트가 같은 업무 맥락을 공유하고, 작업 결과를 저장·참조·점검할 수 있도록 만든 Obsidian 기반 ContextHub입니다.

이 저장소는 단순 개인 메모장이 아니라, 회사 실무와 프로젝트 운영에서 여러 AI 에이전트가 같은 기준으로 작업하기 위한 업무용 위키입니다.

---

## 1. 기본 개념

이 프로젝트는 아래 3개 영역으로 운영됩니다.

```text
AI-Sessions/raw/
= 원본 자료 저장소. 회의록, 문서, 이메일, 스크린샷, 외부 자료 등 불변 자료를 저장한다.
= 에이전트는 raw를 직접 수정하지 않는다.

AI-Sessions/wiki/
= raw를 바탕으로 정리된 실행 지식 저장소.
= 프로젝트 맥락, 의사결정, 개념, 실패 사례, 디자인/개발 기준 등을 저장한다.

AI-Sessions/conversations/
= 세션 인수인계, 에이전트 작업 기록, handoff 문서를 저장한다.
```

---

## 2. 시작 방법

처음 이 프로젝트에 AI 에이전트를 연결할 때는 다음 순서로 진행합니다.

1. Obsidian에서 이 폴더를 vault로 엽니다.
2. Claude Code, Codex, Antigravity 중 하나를 이 폴더에서 실행합니다.
3. 에이전트에게 아래 첫 실행 프롬프트를 붙여넣습니다.
4. 세팅이 끝난 뒤부터는 `reference`, `save`, `ingest`, `query`, `lint`, `handoff` 명령으로 운영합니다.

---

## 3. First Setup Prompt

처음 세팅할 때 한 번만 사용합니다.

```text
현재 폴더는 Obsidian AI 업무 위키 / ContextHub 템플릿이야.

먼저 이 템플릿의 폴더 구조와 아래 파일을 읽고 현재 규칙을 파악해줘.

- START_HERE.md
- AGENTS.md
- CLAUDE.md
- CHATGPT.md
- index.md
- log.md
- prompts/
- AI-Sessions/raw/
- AI-Sessions/conversations/
- AI-Sessions/wiki/

그 다음 아래 Karpathy LLM Wiki gist를 읽고 핵심 설계를 학습해줘.
https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

템플릿 구조와 Karpathy 원칙을 비교해서, 현재 폴더를 내 업무에 맞는 Obsidian 기반 AI 에이전트 업무 위키로 세팅해줘.

목표는 개인 메모장이 아니라 회사 실무에서 여러 AI 에이전트가 같은 업무 맥락을 공유하는 안정적인 비즈니스 프로세스야.

raw, wiki, conversations, index.md, log.md, Claude Code용 CLAUDE.md, Codex/Antigravity용 AGENTS.md, ChatGPT용 CHATGPT.md가 올바르게 구성되어 있는지 점검하고 보강해줘.

사람이 읽는 가이드라인은 한국어로 작성하고, 에이전트가 실행하는 명령 키워드는 save, ingest, query, reference, lint, handoff처럼 영어로 고정해줘.

또한 에이전트가 정보를 저장하기 전에 아래 5가지 필터를 반드시 적용하도록 규칙에 포함해줘.

1. 향후 실무에 반복해서 재사용될 데이터인가?
2. 다른 에이전트나 동료가 프로젝트를 이어받기 위해 반드시 읽어야 하는가?
3. 의사결정의 근거와 결정권자를 나중에 추적할 필요가 있는가?
4. 실패한 방식이라 다시 시도하면 안 되는 리스크 정보인가?
5. 팀 전체가 맞추어야 하는 공통 규칙이나 디자인 가이드인가?

이 조건 중 하나도 만족하지 않는 일회성 답변, 사소한 중간 생각, 검증되지 않은 추측은 wiki에 저장하지 않도록 해줘.

민감정보 정책도 추가해줘.
API key, 비밀번호, 토큰, 고객 개인정보, 수사 관련 원문, 비공개 계약 원문, 민감한 지갑주소/트랜잭션 사건 자료는 wiki에 승격하지 않도록 해줘.

작업이 끝나면 아래 형식으로 보고해줘.

- 읽은 주요 파일
- 생성한 파일
- 수정한 파일
- raw로 유지할 자료
- wiki로 승격한 정보
- 저장하지 않은 정보와 이유
- 다음 에이전트가 먼저 읽어야 할 문서
```

---

## 4. Agent Read Order

모든 에이전트는 작업 전 다음 순서로 문서를 확인합니다.

```text
1. START_HERE.md
2. AGENTS.md
3. CHATGPT.md 또는 CLAUDE.md
4. index.md
5. log.md
6. 관련 AI-Sessions/wiki/ 문서
7. 필요한 경우 AI-Sessions/raw/ 원본
```

원칙:

```text
- raw는 불변 원본이다. 직접 수정하지 않는다.
- wiki는 검증된 업무 지식만 저장한다.
- conversations는 세션 인수인계와 handoff 기록을 저장한다.
- index.md는 전체 지도 역할을 한다.
- log.md는 중요한 작업 이력 역할을 한다.
```

---

## 5. Core Commands

이 프로젝트에서 사용하는 기본 명령어는 아래와 같습니다.

```text
reference
= 프로젝트 맥락 복원

ingest
= raw 자료를 읽고 wiki 자료로 정리

save
= 현재 작업 중 장기 재사용 가치가 있는 내용만 저장

query
= 특정 주제나 문서를 찾아 현재 작업에 반영

lint
= wiki 구조, 중복, 오래된 정보, 민감정보 저장 여부 점검

handoff
= 다음 에이전트나 다음 세션이 이어받을 수 있게 정리
```

---

## 6. Reference Command

새 에이전트를 프로젝트에 연결했거나, 이전 맥락을 복원해야 할 때 사용합니다.

```text
reference 해줘.

먼저 이 프로젝트의 START_HERE.md, AGENTS.md, CHATGPT.md, CLAUDE.md, index.md, log.md를 읽어.
그다음 AI-Sessions/wiki/ 아래 관련 문서를 확인해서 현재 프로젝트 맥락을 복원해줘.

아래 형식으로 보고해줘.

- Project Overview
- Current Status
- Key Decisions
- Important Source Documents
- Open Questions
- Next Actions
- Files I should read first
```

짧은 버전:

```text
옵시디언 참조해줘. 이 프로젝트의 현재 상태, 핵심 결정사항, 미해결 이슈, 다음 액션을 복원해줘.
```

---

## 7. Ingest Command

`AI-Sessions/raw/`에 새 자료, 회의록, 문서, 이메일, 스크린샷, 외부 리서치 등을 넣은 뒤 사용합니다.

```text
ingest 해줘.

AI-Sessions/raw/에 새로 추가된 자료를 읽고, raw 원본은 절대 수정하지 마.
필요한 경우 AI-Sessions/wiki/sources/, concepts/, decisions/, projects/에 요약과 연결 문서를 만들어줘.

반드시 아래를 구분해줘.

- 원본 자료 요약
- 반복 재사용 가능한 개념
- 의사결정으로 승격할 내용
- 프로젝트 맥락에 반영할 내용
- 검증되지 않아 wiki에 승격하지 않을 내용

작업 후 index.md와 log.md를 업데이트해줘.
```

짧은 버전:

```text
ingest 해줘. raw에 있는 새 자료를 읽고 wiki에 정리해줘. raw는 수정하지 마.
```

---

## 8. Save Command

이번 세션에서 나온 결정사항, 기획, 구조, 규칙, 산출물 방향을 wiki에 저장해야 할 때 사용합니다.

```text
save 해줘.

이번 작업 내용 중 장기적으로 재사용할 가치가 있는 정보만 저장해줘.
저장 전 반드시 아래 5가지 필터를 적용해.

1. 반복해서 재사용될 정보인가?
2. 인수인계에 필요한 정보인가?
3. 근거와 결정권자 추적이 필요한가?
4. 다시 반복하면 안 되는 실패나 리스크인가?
5. 팀이 공유해야 하는 규칙이나 가이드인가?

위 조건 중 하나라도 만족하는 정보만 AI-Sessions/wiki/에 저장해.
조건을 만족하지 않는 일회성 답변, 사소한 중간 생각, 검증되지 않은 추측은 wiki에 저장하지 마.
필요하면 AI-Sessions/conversations/에 handoff 기록으로만 남겨.

작업 후 index.md와 log.md를 업데이트해줘.
```

짧은 버전:

```text
이번 작업 내용 옵시디언에 저장해줘. save 필터를 통과한 내용만 wiki에 반영해줘.
```

---

## 9. Query Command

특정 주제, 고객사, 제품, 법무 이슈, 가격정책, 기술 구조 등을 찾아서 현재 작업에 반영해야 할 때 사용합니다.

```text
query 해줘: [찾고 싶은 주제]

index.md와 log.md를 먼저 확인하고, AI-Sessions/wiki/ 아래에서 관련 문서를 찾아줘.
필요하면 AI-Sessions/raw/ 원본도 근거 확인용으로만 참조해줘.

아래 형식으로 정리해줘.

- 관련 문서
- 현재 유효한 정보
- 오래되었거나 superseded 된 정보
- 충돌하는 내용
- 이번 작업에 적용해야 할 기준
```

예시:

```text
query 해줘: TR-OBM 계정주 확인 구조
```

```text
query 해줘: Bybit IAAN 법무 질의와 72시간 courtesy freeze
```

```text
query 해줘: TranSight 가격정책
```

---

## 10. Lint Command

wiki에 오래된 정보, 중복 정보, 출처 없는 결정, 민감정보, 검증되지 않은 추측이 섞였는지 점검할 때 사용합니다.

```text
lint 해줘.

이 프로젝트의 index.md, log.md, AI-Sessions/wiki/를 점검해줘.
아래 항목을 확인해줘.

- 중복 정보
- 출처 없는 결정
- 오래된 규칙
- superseded 되었는데 active로 남은 문서
- 검증되지 않은 추측
- raw에만 있어야 할 민감정보가 wiki에 올라간 경우
- API key, 비밀번호, 토큰, 개인정보, 수사자료, 비공개 계약 원문 노출 여부
- index.md에 링크되지 않은 중요 문서
- log.md에 기록되지 않은 중요 변경

문제별로 아래 형식으로 보고해줘.

- Issue
- Risk
- Affected Files
- Recommended Fix
- Whether you fixed it or need user confirmation
```

짧은 버전:

```text
lint 해줘. wiki의 중복, 오래된 정보, 출처 없는 결정, 민감정보 저장 여부를 점검해줘.
```

---

## 11. Handoff Command

다른 에이전트나 다음 세션으로 작업을 넘겨야 할 때 사용합니다.

```text
handoff 작성해줘.

현재 작업 상태를 다음 에이전트가 바로 이어받을 수 있게 정리해줘.
AI-Sessions/conversations/ 아래에 handoff 문서를 만들고, 필요하면 index.md와 log.md를 업데이트해줘.

반드시 포함해줘.

- 작업 목표
- 지금까지 완료한 것
- 아직 남은 것
- 중요한 결정사항
- 주의해야 할 맥락
- 다음 에이전트가 먼저 읽어야 할 파일
- 절대 건드리면 안 되는 파일 또는 정보
```

짧은 버전:

```text
다음 에이전트가 이어받을 수 있게 handoff 정리해줘.
```

---

## 12. Setup Check Command

새 프로젝트에 ContextHub 템플릿을 붙인 직후 또는 다른 에이전트를 처음 연결했을 때 사용합니다.

```text
setup check 해줘.

이 프로젝트의 ContextHub 구조가 올바르게 구성되어 있는지 확인해줘.

확인할 것:

- AGENTS.md 존재 여부
- CLAUDE.md 존재 여부
- CHATGPT.md 존재 여부
- START_HERE.md 존재 여부
- index.md 존재 여부
- log.md 존재 여부
- prompts/ 존재 여부
- AI-Sessions/raw/ 존재 여부
- AI-Sessions/conversations/ 존재 여부
- AI-Sessions/wiki/ 존재 여부
- save / ingest / query / reference / lint / handoff 규칙 존재 여부
- 민감정보 정책 존재 여부
- .gitignore에 raw-private, restricted, secrets 관련 규칙 존재 여부

부족한 것이 있으면 생성하거나 수정해줘.
작업 후 수정한 파일과 다음 확인사항을 보고해줘.
```

---

## 13. Deck-maker Reference Command

이 프로젝트가 deck-maker의 source project로 사용될 때 적용합니다.

```text
deck-maker reference 해줘.

이 프로젝트를 deck-maker가 참조할 수 있도록 핵심 컨텍스트를 정리해줘.
index.md, log.md, AI-Sessions/wiki/를 기준으로 아래 내용을 추출해줘.

- 프로젝트 한 줄 정의
- 현재 상태
- 덱에 반드시 들어가야 할 핵심 메시지
- 사용 가능한 approved claims
- 피해야 할 forbidden claims
- 관련 제품/기술 설명
- 고객사/청중별 주의사항
- 이미지나 구조도로 표현하면 좋은 부분
- deck-maker가 먼저 읽어야 할 파일
```

짧은 버전:

```text
deck-maker가 이 프로젝트를 참조할 수 있게 핵심 컨텍스트 정리해줘.
```

---

## 14. Context Update Commit Command

ContextHub를 수정한 뒤 GitHub에 반영할 때 사용합니다.

```text
context update commit 준비해줘.

이번 변경사항을 확인하고, ContextHub 관련 변경만 정리해줘.
민감정보가 포함되었는지 먼저 점검해줘.

문제가 없으면 적절한 git commit message를 제안해줘.

보고 형식:

- Changed Files
- Added Files
- Sensitive Info Check
- Suggested Commit Message
- Push Readiness
```

권장 commit message 예시:

```text
update project context hub
```

```text
ingest new source materials into wiki
```

```text
update decisions and project status
```

```text
lint context hub and fix stale references
```

---

## 15. Completion Report

모든 에이전트는 작업 완료 시 아래 형식으로 보고합니다.

```text
작업 완료 보고:

- 읽은 주요 파일:
- 생성한 파일:
- 수정한 파일:
- raw로 유지한 자료:
- wiki로 승격한 정보:
- 저장하지 않은 정보와 이유:
- 발견한 리스크:
- 다음 에이전트가 먼저 읽어야 할 문서:
- 권장 다음 작업:
```

---

## 16. Absolute Rules

모든 에이전트는 아래 규칙을 반드시 따릅니다.

```text
1. AI-Sessions/raw/는 불변 원본 저장소다. 직접 수정하지 않는다.
2. AI-Sessions/wiki/에는 검증된 업무 지식만 저장한다.
3. 일회성 답변, 중간 생각, 검증되지 않은 추측은 wiki에 저장하지 않는다.
4. save 전에는 반드시 5가지 필터를 적용한다.
5. index.md는 전체 지도 역할을 한다. 중요한 문서는 index.md에 링크한다.
6. log.md는 작업 이력 역할을 한다. 중요한 변경은 log.md에 1줄 기록한다.
7. 민감정보는 wiki에 승격하지 않는다.
8. API key, 토큰, 비밀번호, 개인정보, 수사자료, 비공개 계약 원문은 GitHub push 전에 반드시 점검한다.
9. 외부 제출 문서 작성 시 approved claims와 forbidden claims를 먼저 확인한다.
10. 모호하거나 충돌하는 정보가 있으면 임의로 결정하지 말고 충돌 사항을 보고한다.
```
