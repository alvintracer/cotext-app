# Project Note: Cotext Knowledge Studio

## Summary

Knowledge Studio is a separate page for one-shot personal knowledge ingestion.

The user can upload large personal documents such as DOCX, HWPX, PPTX, and PDF, extract text only to avoid binary-weight overhead, and generate a temporary personal knowledge graph with nodes, relations, and clusters in one pass.

This flow is intentionally separate from the existing workspace/room Neural Link flow.

## Why It Exists

- Existing Neural Link is room/repo-oriented and collaborative.
- The requested flow is personal, bulk, and one-shot.
- Writing directly into workspace `neural.json` would mix exploratory ingestion with the shared graph too early.
- A separate page gives a safe staging area for extraction and graph generation before any later import/export decision.

## Product Shape

- Route: `/knowledge-studio`
- Entry point: app header `Studio` button
- Scope: logged-in app surface, but independent from current room selection
- Output: in-memory generated graph preview, not persisted into workspace Neural Link

## Current Behavior

### 1. Bulk document intake

- Accepts `pdf`, `docx`, `hwpx`, `pptx`, `txt`, `md`, `markdown`, `csv`, `json`, `log`
- Users can add files through picker or drag-and-drop
- Each file is extracted into text immediately after selection
- Status is shown per file: queued / extracting / done / error

### 2. Text-only handling

- The page keeps extracted text, not the original document as a long-term product artifact
- Purpose is to reduce payload/weight and operate on normalized text instead of binaries
- PPTX support was added by reading slide XML text runs from the zipped package

### 3. One-shot graph generation

- Generated from extracted text only
- Produces:
  - document-level clusters
  - keyword/theme clusters
  - section-level nodes
  - sequential/support edges inside a document
  - keyword-overlap relation edges across documents/sections
- Result is previewed with the existing `NeuralGraphView`

### 4. Isolation from shared graph

- This page does **not** write to workspace `.cotext/neural.json`
- This page does **not** mutate room content
- It is a personal workbench/staging area for later decisions such as export/import

## Implementation Files

- `src/pages/KnowledgeStudioPage.tsx`
- `src/lib/knowledge/oneShot.ts`
- `src/lib/extract/index.ts`
- `src/App.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/index.css`

## Graph Construction Heuristic

- Each source document is normalized into text
- Text is split by headings when possible, otherwise chunked by paragraph length
- Each section becomes a node
- Each source document becomes a cluster
- Repeated keywords become thematic clusters
- Adjacent sections in the same document are linked with `supports`
- Cross-section similarity is inferred from overlapping keywords and becomes `relates`

This is heuristic graph construction, not LLM-based semantic extraction.

## Validation Status

- `npm.cmd run build` passed after implementation
- Targeted eslint on changed files passed
- Full repository lint still has unrelated pre-existing failures outside this feature

## Design Intent

- Keep the UX separate from collaborative rooms
- Let users process heavy personal archives without forcing GitHub sync semantics
- Reuse the existing Neural Link visualization instead of creating a second graph renderer
- Preserve room/repo Neural Link as the shared knowledge layer and Knowledge Studio as the private ingestion layer

## Likely Next Steps

See **[[cotext-knowledge-studio-plan]]** for the full Phase 1~5 plan (GBrain-level evolution).

Quick summary:
- ✅ Phase 1 (BYOK LLM picker) — implemented 2026-06-16
- ✅ Phase 2 (upload pipeline: size guards + cross-doc dedupe) — implemented 2026-06-16
- ✅ Phase 3 (LLM-based entity/relation extraction, v3 spec) — implemented 2026-06-17
- ✅ Phase 4 (Studio→workspace merge into Neural Link) — implemented 2026-06-17
- ✅ Phase 5 (think mode: hybrid search + grounded answer with clickable sources) — implemented 2026-06-17

## Related Docs

- [[AI-Sessions/wiki/projects/cotext_mvp]]
- [[AI-Sessions/wiki/concepts/neural-link-overview]]
- [[AI-Sessions/wiki/concepts/cotext-neural-link-second-brain]]
- [[AI-Sessions/wiki/concepts/cotext-neural-link-second-brain-ko]]

## Update 2026-06-17: Phase 5

Phase 5 is implemented.

- Route: `/knowledge-think`
- Entry points:
  - app header `Think`
  - Knowledge Studio `Think mode` button after graph generation
  - landing page CTA buttons for `Knowledge Studio` and `Think Mode`
- Snapshot flow:
  - latest generated Knowledge Studio graph is saved to browser localStorage
  - Think mode reads that snapshot without mutating workspace data
- Retrieval flow:
  - local hybrid-style ranking over node label, cluster names, node/body text, and related nodes
  - top evidence hits are shown before and alongside answer generation
- Answer flow:
  - reuses the existing BYOK provider stack
  - grounded system prompt restricts the model to provided evidence
  - explicit insufficient-evidence behavior
  - source refs returned as `S1`, `S2`, ...
