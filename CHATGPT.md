# CHATGPT.md

이 문서는 ChatGPT가 deck-maker 프로젝트를 참조할 때 따라야 하는 운영 규칙이다.

## 프로젝트 역할

deck-maker는 HTML / PPTX / DOCX / 이미지 / 템플릿 / 스타일 / 산출물 제작을 관리하는 실제 작업 repo이다.

- **내용 정본**은 `master-context`에 있다.
- **산출물 정본**은 deck-maker에 있다.
- ChatGPT는 초안 생성과 대화 기반 작업을 담당한다.
- Antigravity는 로컬 deck-maker repo의 실제 파일 수정을 담당한다.

## 읽기 순서

ChatGPT는 이 프로젝트를 참조할 때 다음 순서로 읽는다.

1. `START_HERE.md`
2. `AGENTS.md`
3. `source-projects.md`
4. `index.md`
5. `log.md`
6. 이번 요청과 관련된 `style-guides/`, `projects/[작업명]/`
7. 필요한 경우 `master-context`의 관련 wiki 문서
8. 필요한 경우 `AI-Sessions/wiki/` 문서

## 기본 원칙

- `AI-Sessions/raw/`는 불변 원본 자료로 본다.
- raw 자료는 근거 확인용으로만 사용하고, 임의로 수정하거나 정본처럼 재작성하지 않는다.
- 실제 업무 맥락은 `AI-Sessions/wiki/`를 우선한다.
- 프로젝트 내용 정본은 `master-context`에 있다. deck-maker에 내용을 중복 저장하지 않는다.
- 산출물 제작 규칙, 스타일 개선사항, asset 구조, 출력 관련 lesson만 deck-maker wiki에 저장한다.
- 최신성 판단은 `log.md`, `AI-Sessions/wiki/decisions/`, `status: active` 문서를 우선한다.
- 확정되지 않은 추측은 사실처럼 말하지 않는다.
- 저장이 필요한 정보는 save 5-filter를 통과해야 한다.
- 민감정보, API key, 비밀번호, 고객 개인정보, 수사 관련 원문, 비공개 계약 원문은 Wiki에 승격하지 않는다.
- 외부 제출 문서 작성 시에는 approved claims, forbidden claims, project decisions를 우선 확인한다.

## 명령어 해석

- "옵시디언에 저장해줘", "save 해줘"\
  → 저장 가치 판단 후 `AI-Sessions/wiki/` 또는 `AI-Sessions/conversations/`에 저장할 구조를 제안한다.

- "옵시디언 참조해줘", "reference 해줘", "query 해줘"\
  → `index.md`, `log.md`, 관련 wiki 문서를 읽고 현재 작업 맥락을 복원한다.

- "ingest 해줘"\
  → raw 자료를 읽고 source summary, concept, decision, project 문서로 정리한다.

- "lint 해줘"\
  → 구조 위반, 중복 정보, 출처 없는 결정, 오래된 규칙, 민감정보 저장 여부를 점검한다.

## ChatGPT-Antigravity 워크플로우

1. master-context에서 필요한 내용 컨텍스트를 확인한다.
2. ChatGPT에서 HTML/구성 초안을 생성한다.
3. 초안을 로컬 `deck-maker/projects/[작업명]/html/`에 저장한다.
4. Antigravity로 이미지, 레이아웃, 소스 수정을 진행한다.
5. 결과물을 commit/push한다.
6. 제작 노하우를 `AI-Sessions/wiki/output-lessons/`에 save한다.
