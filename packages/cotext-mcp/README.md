# cotext-mcp

[Cotext](https://cotext.app) MCP Server — expose your Cotext context pool **and Neural Link graph** to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

Works locally (reads your cloned repo) or remotely (calls the Cotext API). Same tool surface either way.

## Quick start

```bash
# Local mode — from inside a cloned Cotext repo
npx cotext-mcp

# Remote mode — set env vars, repo not required locally
COTEXT_API_KEY=ctx_xxxxx COTEXT_API_URL=https://...supabase.co/functions/v1/context-api npx cotext-mcp
```

## What it does

Cotext stores your notes, decisions, and chat history as markdown in a GitHub repo. The **Neural Link** layer adds a node/cluster/edge graph on top (think "Obsidian links" but cross-repo and agent-first).

This MCP server exposes both to any MCP-compatible AI agent (Claude Code, Claude Desktop, Cursor, Cline, etc.).

## Tools

### Context pool

| Tool | Description |
|---|---|
| `list_rooms` | List all Cotext rooms (chats) in the repo |
| `get_room` | Get full content of a specific room |
| `search_context` | Substring search across all rooms (filter by `source`) |
| `get_pack` | LLM-ready Context Pack from a room (me-only filter by default) |
| `append_note` | Append a new block with provenance tracking |

### Neural Link graph (v0.2+)

| Tool | Description |
|---|---|
| `get_neural_graph` | Graph snapshot — `format: summary \| markdown \| json` |
| `find_related` | A node's same-cluster members + edge-linked nodes |
| `search_clusters` | Substring search on cluster names/ids, returns members |
| `get_node_context` | Node metadata + block text + adjacent node labels (best for grounding) |

## Resources

| Resource | URI | Description |
|---|---|---|
| guide | `cotext://guide` | `COTEXT_GUIDE.md` (human/agent rules) |
| neural-index | `cotext://neural-index` | `NEURAL_INDEX.md` — agent-readable graph snapshot (auto-generated on push) |

## Two modes

| | Local | Remote |
|---|---|---|
| Reads from | `.cotext/` files in cloned repo | Cotext API (`context-api` Edge Function) |
| Auth | none (local files) | `COTEXT_API_KEY` (`ctx_xxx`, issued from Cotext app sidebar) |
| Internet required | no | yes |
| Cross-repo | single repo | per workspace (one key per workspace) |
| Best for | dev environments with repo cloned | dashboards, web AIs, CI |

Tool surface is identical — the server picks the backend based on whether `COTEXT_API_KEY`+`COTEXT_API_URL` are set.

## Configuration

### Claude Desktop / Claude Code

`claude_desktop_config.json` (or `.claude/settings.json`):

```jsonc
{
  "mcpServers": {
    "cotext": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"],
      "cwd": "/path/to/your/cotext-repo"
    }
  }
}
```

Remote mode:
```jsonc
{
  "mcpServers": {
    "cotext-remote": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"],
      "env": {
        "COTEXT_API_KEY": "ctx_xxxxxxxx",
        "COTEXT_API_URL": "https://YOUR_PROJECT.supabase.co/functions/v1/context-api"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:
```jsonc
{ "mcpServers": { "cotext": { "command": "npx", "args": ["-y", "cotext-mcp"] } } }
```

## Common patterns

**Ground an answer in the graph**:
```
1. get_neural_graph(format: 'summary')   → what clusters exist
2. search_clusters('pricing')            → find candidate nodes
3. get_node_context(node_id)             → block text + adjacent labels
```

**Trace a decision's history**:
```
1. search_clusters('billing')            → all nodes in that cluster
2. find_related(latest_node)             → check supersedes edges
```

**Zero-tool grounding** (for clients that won't call tools):
- Read `cotext://neural-index` (or just include `NEURAL_INDEX.md` in your system prompt). One file → whole graph parsed.

## Provenance

Every block carries a `<!-- source: ... -->` tag:
- `me` — human-authored (Cotext UI)
- `agent` / `claude` / `chatgpt` / `gemini` — AI source
- Nodes inherit the block's source.

`get_pack` defaults to `me-only`. Always pass the right `source` when calling `append_note`.

## Protocol

```
1. git pull        # always start fresh
2. read via MCP    # tools/resources
3. append_note     # with correct source tag
4. git commit && git push
```

For the full Neural Link concept (data model, storage layers, comparison with Obsidian), see [Neural Link Overview](https://github.com/your-org/cotext/blob/main/AI-Sessions/wiki/concepts/neural-link-overview.md).

## Changelog

- **0.2.0** — Neural Link graph tools (`get_neural_graph`, `find_related`, `search_clusters`, `get_node_context`) + `cotext://neural-index` resource. Remote-mode forwarding for all new tools.
- **0.1.x** — Initial context pool tools.

## License

MIT
