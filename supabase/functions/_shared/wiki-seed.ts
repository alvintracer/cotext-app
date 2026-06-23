// SYNC SOURCE: packages/cotext-cli/src/init.ts — keep these constants in lockstep.
// When the template changes there, paste the same content here so server-side init
// (`workspace-init-wiki` Edge Function) and the local CLI produce identical output.
//
// Placeholders: `%TODAY%` is substituted server-side with the current ISO date.

export const SEED_DIRS = [
  'AI-Sessions/raw',
  'AI-Sessions/conversations',
  'AI-Sessions/wiki/sources',
  'AI-Sessions/wiki/concepts',
  'AI-Sessions/wiki/decisions',
  'AI-Sessions/wiki/errors',
  'AI-Sessions/wiki/projects',
  'AI-Sessions/wiki/design',
  'AI-Sessions/wiki/dev-tasks',
  'prompts',
];

export const SEED_FILES: Record<string, string> = {
  // Directory placeholders (.gitkeep). Mirrors the CLI which creates these so
  // git tracks the empty folders before the user adds real content.
  ...Object.fromEntries(SEED_DIRS.map((d) => [`${d}/.gitkeep`, ''])),

  'CLAUDE.md': `# CLAUDE.md

이 파일은 AI 에이전트가 이 저장소에서 일할 때 따르는 업무 규약입니다.
목표는 개인 메모가 아니라, 여러 AI 에이전트와 사람이 같은 업무 맥락을 공유하는
안정적인 비즈니스 프로세스입니다.

## Core Operating Rules
1. 작업 전 \`index.md\`, \`log.md\`, 관련 \`AI-Sessions/wiki/\` 문서를 먼저 확인한다.
2. \`AI-Sessions/raw/\` 원본 자료는 수정/삭제하지 않는다.
3. 가공된 지식·결정·에러·프로젝트 문서는 \`AI-Sessions/wiki/\` 아래 저장한다.
4. 세션 인수인계는 \`AI-Sessions/conversations/\` 에 저장한다.
5. 중요한 저장 후 \`index.md\`, \`log.md\` 를 갱신한다.
6. 민감정보(토큰·비밀번호·개인정보)는 명시 요청 없이는 저장하지 않는다.

## Commands (영어 키워드 고정)
- \`save\`: 현재 작업 맥락을 wiki에 저장
- \`ingest\`: raw 자료를 wiki 자료로 가공
- \`query\`: 기존 wiki/log 참조
- \`lint\`: 구조·규칙 위반 점검 (\`npx cotext check\` 포함)

## Raw / Wiki Separation
\`AI-Sessions/raw/\` 는 불변 자료 저장소다. 에이전트는 raw를 수정하지 않고, 그것을
근거로 한 요약·판단·기획은 \`AI-Sessions/wiki/\` 에 새 문서로 만든다.

## Wiki Categories
sources / concepts / decisions / errors / projects / design / dev-tasks

## Save Filter (5조건 중 하나 이상 충족)
1. 향후 실무에 반복 재사용될 데이터인가
2. 다른 에이전트/동료가 이어받으려면 반드시 읽어야 하는가
3. 의사결정 근거·결정권자를 추적할 필요가 있는가
4. 다시 시도하면 안 되는 실패/리스크 정보인가
5. 팀 공통 규칙·디자인 가이드인가

## Document Format
\`\`\`markdown
---
type: decision | source | concept | error | project | design | dev-task | handoff
date: YYYY-MM-DD
status: draft | active | superseded
tags: [a, b]
---

# 제목

## Summary
## Context
## Details
## Links
\`\`\`

## Wikilinks → Knowledge Graph
문서 간 연결은 \`[[name]]\` 로 적는다. 컴파일러가 \`[[link]]\`→엣지, frontmatter
\`type\`/\`tags\`→클러스터로 지식그래프(\`.cotext/neural.json\`)를 생성한다.
그래프는 파생물이므로 손으로 편집하지 않는다 — 마크다운을 고치고 \`npx cotext compile\`.
`,

  'AGENTS.md': `# AGENTS.md

이 저장소의 모든 AI 에이전트(Claude Code, Codex, ChatGPT 등)는 \`CLAUDE.md\` 의
업무 규약을 동일하게 따른다. 시작 전 \`index.md\` 와 \`log.md\` 를 먼저 읽는다.

지식그래프는 \`.cotext/NEURAL_INDEX.md\` 한 파일로 사람·기계 모두 파악 가능하다.
`,

  'START_HERE.md': `# START HERE

이 저장소는 사람과 여러 AI 에이전트가 **같은 업무 맥락**을 공유하는 LLM-wiki 입니다.

## 1분 오리엔테이션
- \`CLAUDE.md\` — 업무 규약(가장 먼저 읽기)
- \`index.md\` — 전체 문서 지도
- \`log.md\` — 작업 로그
- \`AI-Sessions/raw/\` — 불변 원본 자료
- \`AI-Sessions/wiki/\` — 가공된 지식
- \`.cotext/neural.json\` · \`NEURAL_INDEX.md\` — 자동 생성 지식그래프

## 자주 쓰는 명령
- \`npx cotext compile\` — 마크다운 → 지식그래프 재생성
- \`npx cotext check\` — 그래프가 최신인지 검사(lint)
`,

  'index.md': `# Wiki Index

## Start Here
- [[START_HERE]]
- [[CLAUDE]]
- [[AGENTS]]
- [[log]]

## Projects
## Decisions
## Concepts
## Sources
## Design
## Dev Tasks
## Errors / Lessons
## Conversations
`,

  'log.md': `# Agent Work Log

중요한 save / ingest / lint 작업을 한 날 한 줄씩 추가합니다.

형식: \`YYYY-MM-DD | command | summary | linked files\`

## Log
%TODAY% | save | LLM-wiki 구조 온보딩 (Cotext workspace init) | [[START_HERE]], [[CLAUDE]]
`,

  'TEMPLATE_MANIFEST.md': `# Template Manifest

스캐폴드로 생성된 시드 파일/폴더 목록.

- \`CLAUDE.md\`, \`AGENTS.md\`, \`START_HERE.md\` — 규약 / 오리엔테이션
- \`index.md\`, \`log.md\` — 지도 / 로그
- \`AI-Sessions/raw|conversations|wiki/*\` — 자료 / 인수인계 / 지식
- \`prompts/*\` — save / ingest / query / lint / first-setup 명령 프롬프트
- \`.cotext/neural.json\`, \`.cotext/NEURAL_INDEX.md\` — 자동 생성 지식그래프
- \`.github/workflows/neural-compile.yml\` — push 시 자동 컴파일
`,

  'prompts/first-setup.md': `# first-setup

워크스페이스를 처음 연결했을 때 1회 실행.

1. \`npx cotext init\` 로 LLM-wiki 구조 생성(이미 됨).
2. 첫 자료를 \`AI-Sessions/raw/\` 에 넣는다.
3. \`ingest\` 로 raw를 \`wiki/sources/\` 요약으로 가공한다.
4. \`npx cotext compile\` 로 지식그래프를 만든다.
5. \`index.md\` / \`log.md\` 를 갱신하고 커밋·push 한다.
`,

  'prompts/save.md': `# save

현재 작업 맥락을 wiki에 저장한다.

1. Save Filter 5조건 중 하나 이상 충족하는지 확인.
2. 올바른 카테고리(\`AI-Sessions/wiki/<category>/\`)에 Document Format으로 작성.
3. 관련 문서를 \`[[name]]\` 로 연결.
4. \`index.md\` 에 링크 추가, \`log.md\` 에 한 줄 기록.
5. \`npx cotext compile\` 로 그래프 갱신.
`,

  'prompts/ingest.md': `# ingest

\`AI-Sessions/raw/\` 원본을 \`AI-Sessions/wiki/sources/\` 요약 문서로 가공.
raw는 절대 수정하지 않는다. 출처 맥락(source)을 frontmatter에 남긴다.
`,

  'prompts/query.md': `# query

질문에 답하기 전에 \`index.md\`, \`log.md\`, 관련 \`AI-Sessions/wiki/\` 와
\`.cotext/NEURAL_INDEX.md\` 를 먼저 참조한다. 근거 문서를 \`[[name]]\` 로 인용한다.
`,

  'prompts/lint.md': `# lint

구조·규칙 위반 점검.
- 카테고리 폴더 위치/frontmatter.
- raw 수정 여부.
- \`npx cotext check\` — 지식그래프 최신 여부.
`,

  '.github/workflows/neural-compile.yml': `name: Neural Compile

# 위키(마크다운) push 시 지식그래프(.cotext/neural.json + NEURAL_INDEX.md)를
# 자동으로 재컴파일·커밋한다. 그래프 = 파생물, 이 워크플로가 단일 작성자.
# 트리거 경로에 .cotext/** 없음 → 봇 커밋이 자기 자신을 재트리거하지 않음.
#
# Self-contained: cotext 컴파일러를 cotext-app 레포에서 받아 빌드해 사용한다.
# (cotext npm 패키지가 publish되면 'npx -y cotext compile' 한 줄로 단순화 가능)

on:
  push:
    branches: [main]
    paths:
      - 'AI-Sessions/**'
      - 'prompts/**'
      - '*.md'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: neural-compile-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  compile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Fetch + build cotext compiler
        run: |
          set -e
          git clone --depth 1 https://github.com/alvin358/cotext-app.git /tmp/cotext-src
          cd /tmp/cotext-src/packages/cotext-cli
          npm install --no-audit --no-fund --silent
          npm run build --silent

      - name: Compile wiki → neural graph
        run: node /tmp/cotext-src/packages/cotext-cli/dist/index.js compile --repo "\${{ github.repository }}"

      - name: Commit graph if changed
        run: |
          git config user.name  "cotext-neural-bot"
          git config user.email "neural-bot@users.noreply.github.com"
          if [ -n "$(git status --porcelain .cotext)" ]; then
            git add .cotext/neural.json .cotext/NEURAL_INDEX.md
            git commit -m "chore(neural): recompile knowledge graph [skip ci]"
            git push
          else
            echo "Graph already up to date — nothing to commit."
          fi
`,
};
