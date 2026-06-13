# cotext-mcp

Cotext Local MCP Server — expose your Cotext context pool to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

```bash
# From inside a cloned repo that uses Cotext
npx cotext-mcp
```

## What it does

This MCP server reads from your local cloned repo's `.cotext/` directory and exposes your context to any MCP-compatible AI agent (Claude Code, Cursor, Cline, etc.).

**No authentication needed** — it reads local files directly.

## Tools

| Tool | Description |
|---|---|
| `list_rooms` | List all Cotext rooms in the repository |
| `get_room` | Get the full content of a specific room |
| `search_context` | Search across all rooms for matching content |
| `get_pack` | Generate a Context Pack (LLM-ready, me-only filter) |
| `append_note` | Append a block with provenance tracking |

## Resources

| Resource | URI | Description |
|---|---|---|
| `guide` | `cotext://guide` | The COTEXT_GUIDE.md file |

## Configuration

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json` or `.claude/settings.json`):

```json
{
  "mcpServers": {
    "cotext": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"],
      "cwd": "/path/to/your/repo"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cotext": {
      "command": "npx",
      "args": ["-y", "cotext-mcp"]
    }
  }
}
```

## Provenance

Every block appended via `append_note` includes a `source` tag:
- `source: me` — human-authored (via Cotext UI)
- `source: agent` — written by a connected agent
- `source: claude` / `chatgpt` / `gemini` — specific AI source

The `get_pack` tool defaults to `me-only` filter, excluding agent-generated blocks.

## Protocol

1. `git pull` — always pull latest before reading
2. Read context via MCP tools
3. Write via `append_note` (with source tag)
4. `git commit && git push` — push changes back

## License

MIT
