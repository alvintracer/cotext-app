# cotext

Cotext CLI — scaffold the LLM-wiki structure and compile its knowledge graph.

```bash
npx cotext init          # scaffold + first compile
npx cotext compile       # recompile wiki → .cotext/neural.json
npx cotext check         # exit 1 if the graph is stale (CI/lint)
```

## What it does

`cotext init` drops a minimal LLM-wiki structure into a repo so multiple AI agents
(Claude Code, Codex, ChatGPT, …) and humans can share the same working context.

```
your-repo/
├── CLAUDE.md              # 업무 규약 (AI가 먼저 읽음)
├── AGENTS.md
├── START_HERE.md
├── index.md               # 전체 문서 지도
├── log.md                 # 작업 로그
├── AI-Sessions/
│   ├── raw/               # 불변 원본 자료 (수정 금지)
│   ├── conversations/     # 세션 인수인계
│   └── wiki/              # 가공된 지식
│       ├── sources/ concepts/ decisions/ errors/
│       ├── projects/ design/ dev-tasks/
├── prompts/               # save / ingest / query / lint / first-setup
└── .cotext/
    ├── neural.json        # 자동 생성 지식그래프 (편집 금지)
    └── NEURAL_INDEX.md    # 사람·기계가 읽는 인덱스
```

**Non-destructive:** existing files are skipped. Pass `--force` to overwrite seeds.

## How the graph is built

`cotext compile` walks the markdown wiki and produces a deterministic graph:

- `[[wikilink]]` between docs → **edge** (`type: relates`, `source: 'wiki'`)
- frontmatter `type` / `tags` → **cluster**
- each markdown file → **node**
- unresolved `[[X]]` → stub node (something to write later)

Idempotent: a recompile strips the old wiki slice, merges the fresh one, and
**preserves LLM-inferred edges** (`source: 'llm'`) added by enrichment tools.

## Options

| Flag | Used by | Effect |
|------|---------|--------|
| `--root <dir>` | all | Target directory (default: cwd) |
| `--out <dir>` | compile/check | Output dir for `.cotext/` (default: `<root>/.cotext`) |
| `--force` | init | Overwrite existing seed files |
| `--no-compile` | init | Skip the first graph compile |
| `--repo <label>` | compile | Repo label written into `NEURAL_INDEX.md` |

## Typical first-run

```bash
cd my-project
npx cotext init                 # scaffold + initial graph
# … add notes to AI-Sessions/wiki/**, link with [[name]]
npx cotext compile              # regenerate the graph
git add . && git commit -m "init cotext wiki"
```

In CI, run `npx cotext check` to fail the build if the committed graph drifts
from the markdown it was compiled from.

## License

MIT
