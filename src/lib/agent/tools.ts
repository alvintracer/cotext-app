// Cotext — agent tools (function-calling).
// Read tools (list_rooms, get_room) auto-execute. The write tool (append_note)
// is gated: it produces a proposal that the user must approve before saving.
//
// Three formats exported:
//   TOOL_DEFS          — OpenAI / xAI / Groq / OpenRouter
//   TOOL_DEFS_GEMINI   — Gemini (functionDeclarations)
//   TOOL_DEFS_ANTHROPIC — Anthropic (tools with input_schema)

// ── Canonical definitions (shape-agnostic) ──
interface ToolParam {
  type: string;
  description: string;
}
interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParam>;
  required: string[];
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_rooms',
    description: 'List all chat rooms (directory paths) in the current Cotext workspace.',
    parameters: {},
    required: [],
  },
  {
    name: 'get_room',
    description: "Read a room's full cotext.md content by its path. Use to gather context before answering or writing.",
    parameters: {
      room_path: { type: 'string', description: 'Room path, e.g. "projects/roadmap"' },
    },
    required: ['room_path'],
  },
  {
    name: 'append_note',
    description:
      'Propose appending a Markdown block to a room. This does NOT save immediately — it asks the user to approve first. Call this when the user asks you to save, record, add, or write something into the repo.',
    parameters: {
      room_path: { type: 'string', description: 'Target room path' },
      content: { type: 'string', description: 'Markdown content to append (no timestamp header — added automatically)' },
    },
    required: ['room_path', 'content'],
  },
];

// ── OpenAI format (also xAI, Groq, OpenRouter) ──
export const TOOL_DEFS = TOOLS.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }]),
      ),
      required: t.required,
    },
  },
}));

// ── Gemini format (functionDeclarations) ──
export const TOOL_DEFS_GEMINI = [{
  functionDeclarations: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }]),
      ),
      required: t.required,
    },
  })),
}];

// ── Anthropic format (tools with input_schema) ──
export const TOOL_DEFS_ANTHROPIC = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: {
    type: 'object' as const,
    properties: Object.fromEntries(
      Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }]),
    ),
    required: t.required,
  },
}));
