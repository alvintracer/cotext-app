/**
 * wiki-init — LLM-wiki 온보딩 스캐폴드 (PoC)
 * ==========================================
 * 워크스페이스(깃레포)에 LLM-wiki 구조가 없을 때 폴더 + 시드 파일을 한 번에 만든다.
 * 비파괴적: 이미 있는 파일은 건너뛴다(--force 로만 덮어씀). 끝에 그래프를 컴파일한다.
 *
 * 사용:
 *   npx tsx scripts/wiki-init.ts                  # 현재 폴더에 스캐폴드 + 컴파일
 *   npx tsx scripts/wiki-init.ts --root <dir>     # 다른 폴더에
 *   npx tsx scripts/wiki-init.ts --force          # 기존 시드 파일 덮어쓰기
 *   npx tsx scripts/wiki-init.ts --no-compile     # 그래프 컴파일 생략
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNeuralCompile } from './neural-compile';

interface Args { root: string; force: boolean; compile: boolean }

function parseArgs(argv: string[]): Args {
  const ri = argv.indexOf('--root');
  return {
    root: path.resolve(ri >= 0 && ri + 1 < argv.length ? argv[ri + 1] : process.cwd()),
    force: argv.includes('--force'),
    compile: !argv.includes('--no-compile'),
  };
}

// Empty dirs git won't track without a placeholder.
const DIRS = [
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

const TODAY = new Date().toISOString().slice(0, 10);

const FILES: Record<string, string> = {
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
- \`lint\`: 구조·규칙 위반 점검 (\`npm run neural:check\` 포함)

## Raw / Wiki Separation
\`AI-Sessions/raw/\` 는 불변 자료 저장소(기사 원문·녹취·외부 자료)다. 에이전트는 raw를
수정하지 않고, 그것을 근거로 한 요약·판단·기획은 \`AI-Sessions/wiki/\` 에 새 문서로 만든다.

## Wiki Categories
sources / concepts / decisions / errors / projects / design / dev-tasks

## Save Filter (저장 전 5조건 중 하나 이상 충족)
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
그래프는 파생물이므로 손으로 편집하지 않는다 — 마크다운을 고치고 \`npm run neural:compile\`.

## Completion Rule
작업 후 보고: 읽은 주요 파일 / 수정·생성 파일 / 저장 필터 결과 / 다음에 볼 문서.
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
- \`log.md\` — 작업 로그(무슨 일이 있었나)
- \`AI-Sessions/raw/\` — 불변 원본 자료
- \`AI-Sessions/wiki/\` — 가공된 지식(sources/concepts/decisions/errors/projects/design/dev-tasks)
- \`.cotext/neural.json\` · \`NEURAL_INDEX.md\` — 자동 생성 지식그래프(손대지 않음)

## 자주 쓰는 명령
- \`npm run neural:compile\` — 마크다운 → 지식그래프 재생성
- \`npm run neural:check\` — 그래프가 최신인지 검사(lint)
- \`npm run neural:enrich\` — (BYOK) LLM이 의미 엣지를 추론해 덧붙임
`,

  'index.md': `# Wiki Index

이 문서는 저장소 전체의 지도입니다. 중요한 wiki 문서를 만들거나 갱신한 뒤 여기에 링크를 추가합니다.

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

형식:
\`\`\`text
YYYY-MM-DD | command | summary | linked files
\`\`\`

## Log
${TODAY} | save | LLM-wiki 구조 온보딩(wiki-init 스캐폴드) | [[START_HERE]], [[CLAUDE]]
`,

  'TEMPLATE_MANIFEST.md': `# Template Manifest

스캐폴드로 생성된 시드 파일/폴더 목록입니다.

- \`CLAUDE.md\`, \`AGENTS.md\`, \`START_HERE.md\` — 규약 / 오리엔테이션
- \`index.md\`, \`log.md\` — 지도 / 로그
- \`AI-Sessions/raw|conversations|wiki/*\` — 자료 / 인수인계 / 지식
- \`prompts/*\` — save / ingest / query / lint / first-setup 명령 프롬프트
- \`.cotext/neural.json\`, \`.cotext/NEURAL_INDEX.md\` — 자동 생성 지식그래프
`,

  'prompts/first-setup.md': `# first-setup

워크스페이스를 처음 연결했을 때 1회 실행하는 온보딩.

1. \`npm run wiki:init\` 로 LLM-wiki 구조 생성(이미 됨).
2. 첫 자료를 \`AI-Sessions/raw/\` 에 넣는다.
3. \`ingest\` 로 raw를 \`wiki/sources/\` 요약으로 가공한다.
4. \`npm run neural:compile\` 로 지식그래프를 만든다.
5. \`index.md\` / \`log.md\` 를 갱신하고 커밋·push 한다.
`,

  'prompts/save.md': `# save

현재 작업 맥락을 wiki에 저장한다.

1. Save Filter 5조건 중 하나 이상 충족하는지 확인.
2. 올바른 카테고리(\`AI-Sessions/wiki/<category>/\`)에 Document Format으로 작성.
3. 관련 문서를 \`[[name]]\` 로 연결.
4. \`index.md\` 에 링크 추가, \`log.md\` 에 한 줄 기록.
5. \`npm run neural:compile\` 로 그래프 갱신.
`,

  'prompts/ingest.md': `# ingest

\`AI-Sessions/raw/\` 의 원본을 \`AI-Sessions/wiki/sources/\` 요약 문서로 가공한다.
raw는 절대 수정하지 않는다. 출처 맥락(source)을 frontmatter에 남긴다.
`,

  'prompts/query.md': `# query

질문에 답하기 전에 \`index.md\`, \`log.md\`, 관련 \`AI-Sessions/wiki/\` 와
\`.cotext/NEURAL_INDEX.md\` 를 먼저 참조한다. 근거 문서를 \`[[name]]\` 로 인용한다.
`,

  'prompts/lint.md': `# lint

구조·규칙 위반을 점검한다.
- 카테고리 폴더 위치가 맞는가, frontmatter가 있는가.
- raw가 수정되지 않았는가.
- \`npm run neural:check\` — 지식그래프가 최신인가(stale면 \`neural:compile\`).
`,
};

function writeFileSafe(abs: string, content: string, force: boolean): 'created' | 'skipped' {
  if (fs.existsSync(abs) && !force) return 'skipped';
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return 'created';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let created = 0; let skipped = 0;

  // 1) Directories with a .gitkeep so empty ones are committable.
  for (const dir of DIRS) {
    const keep = path.join(args.root, dir, '.gitkeep');
    const r = writeFileSafe(keep, '', args.force);
    r === 'created' ? created++ : skipped++;
  }

  // 2) Seed files (non-destructive).
  for (const [rel, content] of Object.entries(FILES)) {
    const r = writeFileSafe(path.join(args.root, rel), content, args.force);
    console.log(`  ${r === 'created' ? '+' : '·'} ${rel}${r === 'skipped' ? ' (exists, skipped)' : ''}`);
    r === 'created' ? created++ : skipped++;
  }

  console.log(`[wiki-init] ${created} created, ${skipped} skipped (use --force to overwrite).`);

  // 3) Compile the graph so .cotext/ exists immediately.
  if (args.compile) {
    console.log('[wiki-init] compiling knowledge graph...');
    runNeuralCompile(['--root', args.root]);
  }

  console.log('[wiki-init] ✓ done. Next: add material to AI-Sessions/raw/, then `ingest` → `save` → commit.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
