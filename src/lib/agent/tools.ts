// Cotext — agent tools (function-calling). OpenAI tool format.
// Read tools (list_rooms, get_room) auto-execute. The write tool (append_note)
// is gated: it produces a proposal that the user must approve before saving.

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_rooms',
      description: 'List all chat rooms (directory paths) in the current Cotext workspace.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_room',
      description: "Read a room's full cotext.md content by its path. Use to gather context before answering or writing.",
      parameters: {
        type: 'object',
        properties: {
          room_path: { type: 'string', description: 'Room path, e.g. "projects/roadmap"' },
        },
        required: ['room_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_note',
      description:
        'Propose appending a Markdown block to a room. This does NOT save immediately — it asks the user to approve first. Call this when the user asks you to save, record, add, or write something into the repo.',
      parameters: {
        type: 'object',
        properties: {
          room_path: { type: 'string', description: 'Target room path' },
          content: { type: 'string', description: 'Markdown content to append (no timestamp header — added automatically)' },
        },
        required: ['room_path', 'content'],
      },
    },
  },
];
