---
type: decision
date: 2026-06-20
status: active
source: 사용자 다이어그램([Local]↔[Github] LLM Wiki + MindSync) 리뷰
---

# MindSync 지식 동기화 아키텍처 (Wiki → Graph 컴파일 모델)

## Summary

여러 로컬/원격 LLM이 하나의 프로젝트(=워크스페이스=깃레포)를 공유하며,
각 에이전트가 LLM-wiki 규약(`save`/`lint`)으로 기록하면 그 마크다운이
MindSync 지식그래프로 **컴파일**되고, push 시 GitHub에서 자동 재컴파일되어
다른 에이전트가 `git pull` 또는 MCP로 동기화하는 구조를 확정한다.

핵심 결정 4가지:

1. **레포 = 유일한 동기화 버스.** 에이전트끼리 직접 sync하지 않는다.
2. **그래프 = 파생물, 단일 작성자(컴파일러).** `neural.json`은 손으로 쓰지 않는다.
3. **결정론적 뼈대 + LLM 살붙이기.** `[[wikilink]]`→엣지, frontmatter→클러스터.
4. **쓰기는 파일→git→컴파일러, 읽기는 MCP(질의)/git(복제) 분리.**

## Context

기존 구현 상태(리뷰 시점):
- `.cotext/neural.json`(정본 그래프) + `.cotext/NEURAL_INDEX.md`(MCP grounding) +
  Supabase 파생 인덱스(크로스레포 검색)는 이미 존재. → [[neural-link-mcp-grounding]]
- `merge.ts` 3단계 동기화(json+index+supabase), `cotext-mcp`(stdio, 8 tools) 존재.
- **빈칸 ①**: "push되면 그래프 자동 업데이트"가 없었다(클라이언트 Studio에서만 생성).
- **빈칸 ②**: `AI-Sessions/wiki/`(LLM-wiki 마크다운)와 `neural.json`이 단절 —
  그래프는 업로드 소스/룸 블록에서만 추출, 위키는 그래프에 안 들어갔다.

사용자 비전은 이 둘을 메워 "LLM Wiki = 그래프의 사람-가독 정본, neural.json = 기계 인덱스"
로 통합하는 것. → [[cotext-neural-link-second-brain-ko]]

## Details

### 계층 모델 (한 레포, 3계층)
1. **저작 계층(사람/에이전트가 직접)** — `AI-Sessions/raw/`(불변), `AI-Sessions/wiki/**`
   (frontmatter + `[[links]]`), `index.md`/`log.md`. `save`/`lint`마다 갱신.
2. **컴파일러(단일 작성자)** — 마크다운 → 그래프 머지(`mergeGraphs` 재사용).
3. **파생 계층(손대지 않음)** — `.cotext/neural.json`, `.cotext/NEURAL_INDEX.md`.

### 결정론적 뼈대
- 문서 A의 `[[B]]` → 엣지 A→B (`type: relates`).
- frontmatter `type`/`tags` → 클러스터.
- 미해결 `[[X]]` → stub 노드(나중에 쓸 것 표시). LLM 추출은 이 위에 의미 엣지를 덧붙임.

### 멱등 재컴파일 (멀티 트리거 안전)
컴파일러는 기존 그래프에서 **이전 wiki 슬라이스(`source: 'wiki'`)만 걷어내고**
새 wiki 그래프를 union 머지한다. 따라서:
- 링크가 사라지면 엣지도 사라진다(멱등).
- Studio 업로드 노드(`source: 'knowledge-studio'`)는 보존된다.
- 같은 머지 로직을 Studio/merge.ts/컴파일러가 공유 → 세 트리거가 수렴.
  로컬 pre-push 훅(빠른 피드백) + GitHub Action(권위) + Studio(업로드 추출).

### 동기화 역할 분리
- `git pull` = 전체 미러(쓰는 로컬 에이전트용).
- MCP = 클론 없이 질의만(Web LLM, 크로스레포). 쓰기는 `append_note`만.
- 그래프 직접 쓰기는 MCP 경로에서 금지.

### 다이어그램 대비 수정
1. LLM↔Wiki 직접 화살표 제거(모두 레포 경유).
2. 컴파일러 박스 추가(pre-push 훅 + Action 두 트리거).
3. `[[wikilink]]`→엣지 / frontmatter→클러스터 뼈대.
4. neural.json "파생물·손대지 않음" 명시(편집은 Studio 에디터=sha 락만).
5. MCP(질의) vs git(복제) 역할 분리 표기.

### 엣지 provenance + LLM enrichment
`Edge.source`를 추가('wiki' 뼈대 / 'llm' 추론 / undefined 수동). 이게 두 가지를
가능하게 한다:
- **결정론적 재컴파일이 LLM 엣지를 보존** — `neural-compile`은 wiki 슬라이스만
  교체하고 `source: 'llm'` 엣지는 살린다(끝에 dangling만 prune). push마다 안 지워짐.
- **enrich는 멱등** — 실행 시 기존 'llm' 엣지를 걷어내고 새로 추론.

enrichment는 노드를 추가하지 않는다(파일=노드 유지). 명시적으로 링크되지 않았지만
의미상 연결된 노드쌍에만 엣지(relates/supersedes/supports)를 덧붙인다.

### 온보딩 스캐폴드
워크스페이스(깃레포)에 LLM-wiki 구조가 없을 때 `npm run wiki:init` 한 번으로
폴더(`AI-Sessions/wiki/*` 등) + 시드 파일(`CLAUDE.md`/`START_HERE.md`/`index.md`/
`log.md`/`AGENTS.md`/`prompts/*`) 생성 후 그래프까지 컴파일. **비파괴적**(기존 파일
스킵, `--force`로만 덮어씀). `--root <dir>`로 임의 레포에, `--no-compile`로 컴파일 생략.

### PoC 구현 (이 결정과 함께 착수)
- `scripts/wiki-init.ts` — 온보딩 스캐폴드(`npm run wiki:init`). 끝에 `runNeuralCompile` 호출.
- `scripts/neural-compile.ts` — wiki→graph 컴파일러. `npm run neural:compile` /
  `neural:check`(stale면 exit 1, `lint`/CI용). 'llm' 엣지 보존. **stub id 결정론적**
  (빈 슬러그=예시 `[[...]]` 링크는 스킵) — 안 그러면 매 실행 랜덤 id로 CI 봇 churn.
- `scripts/neural-enrich.ts` — `npm run neural:enrich`. BYOK 로컬/수동 단계
  (env `NEURAL_LLM_PROVIDER`/`MODEL`/`API_KEY`). 노드 카탈로그(라벨+클러스터+스니펫)
  + 기존 엣지를 LLM에 주고 추가 의미 엣지를 받음. `--dry`/`--max N`.
- `.github/workflows/neural-compile.yml` — push 시 재컴파일 후 `.cotext/` 커밋.
  **enrich는 CI에 넣지 않음**(키/비용/비결정성 → 봇 churn 방지). CI는 보존만.

## 향후 (이 PoC 다음)
- 로컬 pre-push 훅(`cotext` CLI) 추가로 push 전 최신화.
- 노드 provenance에 commit SHA/author 추가(어느 에이전트의 어느 액션인지 추적).
- frontmatter 없는 레거시 위키 문서에 type/tags 백필.
- 컴파일러가 코드스팬/코드펜스 안의 `[[wikilink]]` 예시도 무시(현재는 빈 슬러그만 스킵).
- NeuralGraphView/글로브에서 'llm' 엣지를 시각적으로 구분(점선 등).
- `wiki:init`을 npm 배포 가능한 `cotext init` CLI로 패키징(현재는 레포 스크립트).

## Links

- [[mindsync-ws-integration]] — 통합 리팩터링 + 정합성 버그 수정(같은 정본 원칙)
- [[neural-link-mcp-grounding]] — option C(NEURAL_INDEX.md) grounding
- [[neural-link-overview]] — Neural Link 종합
- [[cotext-architecture-decisions]] — D-009(하이브리드 정본) 연장선
- [[cotext-neural-link-second-brain-ko]] — second brain 방향성
