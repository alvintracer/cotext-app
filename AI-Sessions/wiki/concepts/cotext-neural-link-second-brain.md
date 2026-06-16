# Cotext, Neural Link, and the Second-Brain Direction

## Purpose

This document explains:

- how Cotext is structured
- how Neural Link is structured
- how the two differ from Obsidian-style knowledge management
- how this can evolve into an agent-extended second brain and artificial knowledge network

## 1. Cotext Structure

Cotext treats a GitHub repository as a shared context workspace.

Core layers:

- **Repository layer**
  - The real source of truth is the repo.
  - Chats, context files, neural graph files, and agent guidance all live inside the repository.
- **Workspace layer**
  - A workspace maps one GitHub repo to one collaborative context space.
  - Team members join through workspace membership and operate on the same repo context.
- **Room layer**
  - A room is a contextual chat/document stream tied to a path or topic.
  - Each room stores markdown blocks over time.
- **Draft/push layer**
  - Local edits can remain draft.
  - Push turns the current local draft into the shared Git-backed state.
- **Agent layer**
  - Agents read from the same repo context and can write back into blocks with provenance.

In practice, Cotext is not a note app first. It is a repo-native context operating system for humans and agents.

## 2. Block Model

The atomic unit in Cotext is the markdown block.

Block shape:

```md
## 2026-06-16 18:30
<!-- source: chatgpt; author: alvintracer -->

Block content here.
```

Important properties:

- `timestamp` anchors chronology
- `source` records the generator or provenance
- `author` records the actual human GitHub writer identity
- the block is the unit for edit, push, node conversion, and later graph expansion

This is important because Cotext is not modeling arbitrary text spans as first-class durable objects. It models blocks as durable collaboration units.

## 3. Neural Link Structure

Neural Link is the semantic layer on top of chat blocks.

Main components:

- **Inline node mark**
  - A block can be promoted into a node through an inline metadata comment.
- **Node**
  - A node is a labeled thought-unit anchored to one specific block.
- **Cluster**
  - A cluster groups related nodes.
  - It behaves like a stronger, more structured tag system.
- **Edge**
  - Edges express explicit relationships between nodes.
  - Current relation types include general relation, support, and supersession.
- **Graph files / derived indexes**
  - `.cotext/neural.json` stores graph state.
  - `NEURAL_INDEX.md` exposes an agent-readable summary.
  - Supabase-derived indexes support search and retrieval.

Conceptually:

`chat block -> node -> cluster/edge -> graph -> retrieval/grounding`

## 4. Operating Principle

Cotext and Neural Link work together in this order:

1. Humans and agents produce blocks.
2. Important blocks are promoted to nodes.
3. Nodes are grouped into clusters and connected with edges.
4. The graph is indexed for retrieval and grounding.
5. Agents use both the raw room history and the graph summary to reason and write back.

This means the system keeps both:

- chronological memory
- semantic memory

Chronological memory explains *when and how* something emerged.
Semantic memory explains *what it means and what it connects to*.

## 5. Difference from Obsidian

Obsidian is fundamentally a note-centric knowledge tool.
Cotext is fundamentally a repo-centric collaborative context tool.

Key differences:

- **Primary container**
  - Obsidian: note/file
  - Cotext: repo -> workspace -> room -> block
- **Collaboration model**
  - Obsidian: human-first note management
  - Cotext: human + agent shared operating context
- **Write-back model**
  - Obsidian: mostly manual note editing
  - Cotext: agents can write back into the same context stream with provenance
- **Identity**
  - Obsidian: authorship is usually implicit
  - Cotext: authorship and source are explicit at block level
- **Graph meaning**
  - Obsidian graph: mostly link graph between notes
  - Neural Link: semantic graph between thought-units anchored to actual discussion blocks
- **Source of truth**
  - Obsidian: local vault
  - Cotext: Git-backed, shareable, push/pull-aware repo state

So Cotext is closer to a collaborative memory substrate for work than to a personal markdown notebook.

## 6. Why This Matters

Most chat tools lose structure.
Most note tools lose execution context.
Most code repos lose reasoning history.

Cotext is trying to unify:

- discussion
- decision history
- authorship
- provenance
- semantic linking
- Git-based durability
- agent participation

That is the foundation of a reusable operational memory.

## 7. Direction Toward a Second Brain

The current system can evolve from a context store into a second brain if three things deepen together:

- **memory capture**
  - more of the meaningful work becomes block-native and preserved
- **semantic organization**
  - more key blocks become nodes with better cluster/edge quality
- **agent participation**
  - agents do not just answer, but continuously organize, connect, summarize, and expand knowledge

In that future, Cotext can become:

- a project memory
- a team memory
- a reasoning memory
- a decision network

The second-brain value does not come from storing everything.
It comes from turning ongoing work into structured, navigable, evolving memory.

## 8. Direction Toward an Artificial Knowledge Network

Neural Link becomes more powerful when the graph is not static.

The next step is agent-assisted graph expansion:

- detect candidate nodes automatically from new blocks
- suggest cluster membership
- suggest edge creation and edge type changes
- identify superseded knowledge
- merge duplicate concepts across rooms
- surface missing links between related ideas
- generate periodic graph summaries and tension reports

Once this loop is reliable, the graph stops being a manual map and starts becoming a living artificial knowledge network.

That network can support:

- retrieval grounding for agents
- long-horizon planning
- cross-room synthesis
- contradiction detection
- decision impact tracing
- context handoff between people and agents

## 9. Long-Term Vision

The long-term vision is not "Obsidian for teams."

It is:

- a Git-native memory system
- where work conversations become structured knowledge
- where knowledge becomes a semantic graph
- where agents help maintain and expand that graph
- and where the graph increasingly behaves like an externalized cognitive system

In other words:

Cotext can become a practical bridge from chat history to second brain, and from second brain to artificial knowledge network.

## 10. Design Constraints to Preserve

If this direction is pursued, these constraints matter:

- block-level identity should remain stable
- provenance and authorship should remain explicit
- graph structure should stay inspectable in markdown/repo form
- agent actions should stay reviewable, not hidden
- Git durability should remain a first-class property
- semantic automation should assist human judgment, not silently replace it

If those constraints hold, the system can scale in intelligence without losing trust.
