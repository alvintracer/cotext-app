// Cotext — provider adapters. One agent loop, pluggable model.
// Browser-direct (BYOK). Three request shapes: openai-compatible, anthropic, gemini.
// Supports streaming via SSE when `onToken` is provided.
// Agent tool loop supports ALL shapes (openai, anthropic, gemini).

import type { ApiShape } from './models';
import { TOOL_DEFS, TOOL_DEFS_GEMINI, TOOL_DEFS_ANTHROPIC } from './tools';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  shape: ApiShape;
  baseURL?: string;
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMsg[];
  signal?: AbortSignal;
  /** If provided, stream tokens incrementally. Full text is still returned. */
  onToken?: (delta: string) => void;
}

const MAX_TOKENS = 4096;

async function readError(res: Response): Promise<string> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  return `${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 400)}` : ''}`;
}

// Parse an SSE stream, calling onData for each `data:` JSON payload.
async function readSSE(res: Response, onData: (json: unknown) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        onData(JSON.parse(payload));
      } catch {
        /* skip non-JSON keepalive lines */
      }
    }
  }
}

export async function runChat(p: ChatParams): Promise<string> {
  if (p.shape === 'anthropic') return runAnthropic(p);
  if (p.shape === 'gemini') return runGemini(p);
  return runOpenAICompatible(p);
}

// ════════════════════════════════════════════════
// Agent tool loop — unified interface, three backends
// ════════════════════════════════════════════════
export type AgentTurn =
  | { kind: 'text'; text: string }
  | { kind: 'proposal'; roomPath: string; content: string };

export interface ToolLoopParams {
  shape: ApiShape;
  baseURL: string;
  apiKey: string;
  model: string;
  /** Fallback model id if the primary model returns 404 or model_not_found. */
  fallbackModel?: string;
  system: string;
  messages: ChatMsg[];
  executeRead: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxIter?: number;
  signal?: AbortSignal;
}

/** Dispatch to the correct tool loop based on API shape. */
export async function runToolLoop(p: ToolLoopParams): Promise<AgentTurn> {
  try {
    return await runToolLoopInner(p);
  } catch (e) {
    // Fallback: if the error looks like "model not found" and we have a fallback
    const msg = e instanceof Error ? e.message : String(e);
    if (p.fallbackModel && p.fallbackModel !== p.model && isModelError(msg)) {
      return runToolLoopInner({ ...p, model: p.fallbackModel, fallbackModel: undefined });
    }
    throw e;
  }
}

/** Check if an error message indicates a model-not-found / invalid-model issue. */
function isModelError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('model_not_found') || lower.includes('model not found')
    || lower.includes('does not exist') || lower.includes('invalid model')
    || lower.includes('not available') || (lower.includes('404') && lower.includes('model'));
}

function runToolLoopInner(p: ToolLoopParams): Promise<AgentTurn> {
  if (p.shape === 'anthropic') return toolLoopAnthropic(p);
  if (p.shape === 'gemini') return toolLoopGemini(p);
  return toolLoopOpenAI(p);
}

// ── helpers ──
function extractProposal(name: string, args: Record<string, unknown>): AgentTurn | null {
  if (name === 'append_note') {
    return { kind: 'proposal', roomPath: String(args.room_path || ''), content: String(args.content || '') };
  }
  return null;
}

// ── OpenAI-compatible tool loop (OpenAI / xAI / Groq / OpenRouter / Custom) ──
interface OAToolCall { id: string; function: { name: string; arguments: string } }
interface OAMessage { role: string; content?: string | null; tool_calls?: OAToolCall[]; tool_call_id?: string }

async function toolLoopOpenAI(p: ToolLoopParams): Promise<AgentTurn> {
  const base = (p.baseURL || '').replace(/\/$/, '');
  if (!base) throw new Error('Base URL is required for this provider.');
  const msgs: OAMessage[] = [{ role: 'system', content: p.system }, ...p.messages];
  const maxIter = p.maxIter ?? 4;

  for (let i = 0; i < maxIter; i++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, messages: msgs, tools: TOOL_DEFS, max_tokens: MAX_TOKENS }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const m: OAMessage | undefined = data?.choices?.[0]?.message;
    const calls = m?.tool_calls;

    if (calls && calls.length) {
      msgs.push({ role: 'assistant', content: m?.content ?? '', tool_calls: calls });
      for (const tc of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        const prop = extractProposal(tc.function.name, args);
        if (prop) return prop;
        const result = await p.executeRead(tc.function.name, args);
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }
    return { kind: 'text', text: m?.content ?? '' };
  }
  return { kind: 'text', text: '(stopped: too many tool steps)' };
}

// ── Anthropic (Claude) tool loop ──
interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface AnthropicMsg {
  role: string;
  content: string | AnthropicBlock[];
}

async function toolLoopAnthropic(p: ToolLoopParams): Promise<AgentTurn> {
  const msgs: AnthropicMsg[] = [...p.messages.map((m) => ({ role: m.role, content: m.content }))];
  const maxIter = p.maxIter ?? 4;

  for (let i = 0; i < maxIter; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: p.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': p.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: MAX_TOKENS,
        system: p.system,
        messages: msgs,
        tools: TOOL_DEFS_ANTHROPIC,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const blocks: AnthropicBlock[] = data?.content ?? [];
    const stopReason: string = data?.stop_reason ?? '';

    // Collect text and tool_use blocks
    const textParts = blocks.filter((b) => b.type === 'text').map((b) => b.text || '');
    const toolUses = blocks.filter((b) => b.type === 'tool_use');

    if (toolUses.length > 0 && stopReason === 'tool_use') {
      // Push assistant message with full content blocks
      msgs.push({ role: 'assistant', content: blocks });

      const toolResults: AnthropicBlock[] = [];
      for (const tu of toolUses) {
        const args = tu.input ?? {};
        const prop = extractProposal(tu.name!, args);
        if (prop) return prop;
        const result = await p.executeRead(tu.name!, args);
        toolResults.push({ type: 'tool_result', id: tu.id!, text: result } as unknown as AnthropicBlock);
      }
      // Push tool results as user message
      msgs.push({
        role: 'user',
        content: toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: (tr as unknown as { id: string }).id,
          content: (tr as unknown as { text: string }).text,
        })) as unknown as AnthropicBlock[],
      });
      continue;
    }

    return { kind: 'text', text: textParts.join('') };
  }
  return { kind: 'text', text: '(stopped: too many tool steps)' };
}

// ── Gemini tool loop ──
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
}
interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

async function toolLoopGemini(p: ToolLoopParams): Promise<AgentTurn> {
  const contents: GeminiContent[] = p.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const maxIter = p.maxIter ?? 4;

  for (let i = 0; i < maxIter; i++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      p.model,
    )}:generateContent?key=${encodeURIComponent(p.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: p.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        contents,
        tools: TOOL_DEFS_GEMINI,
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];

    const funcCalls = parts.filter((pt) => pt.functionCall);
    if (funcCalls.length > 0) {
      // Push model response with function calls
      contents.push({ role: 'model', parts });

      // Execute each function call and collect responses
      const responseParts: GeminiPart[] = [];
      for (const fc of funcCalls) {
        const name = fc.functionCall!.name;
        const args = fc.functionCall!.args ?? {};
        const prop = extractProposal(name, args);
        if (prop) return prop;
        const result = await p.executeRead(name, args);
        responseParts.push({ functionResponse: { name, response: { content: result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }

    // No function calls — extract text
    const text = parts.map((pt) => pt.text || '').join('');
    return { kind: 'text', text };
  }
  return { kind: 'text', text: '(stopped: too many tool steps)' };
}


// ════════════════════════════════════════════════
// Regular chat (no tools) — streaming support
// ════════════════════════════════════════════════

// ── OpenAI-compatible (OpenAI / xAI / Groq / OpenRouter / Custom) ──
async function runOpenAICompatible(p: ChatParams): Promise<string> {
  const base = (p.baseURL || '').replace(/\/$/, '');
  if (!base) throw new Error('Base URL is required for this provider.');
  const messages = [{ role: 'system', content: p.system }, ...p.messages];
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: p.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, messages, max_tokens: MAX_TOKENS, stream: !!p.onToken }),
  });
  if (!res.ok) throw new Error(await readError(res));

  if (!p.onToken) {
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  }
  let full = '';
  await readSSE(res, (json) => {
    const delta = (json as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]?.delta?.content;
    if (delta) { full += delta; p.onToken!(delta); }
  });
  return full;
}

// ── Anthropic (Claude) ──
async function runAnthropic(p: ChatParams): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: p.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: MAX_TOKENS,
      system: p.system,
      messages: p.messages,
      stream: !!p.onToken,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));

  if (!p.onToken) {
    const data = await res.json();
    const blocks: Array<{ type: string; text?: string }> = data?.content ?? [];
    return blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  }
  let full = '';
  await readSSE(res, (json) => {
    const ev = json as { type?: string; delta?: { text?: string } };
    if (ev.type === 'content_block_delta' && ev.delta?.text) {
      full += ev.delta.text; p.onToken!(ev.delta.text);
    }
  });
  return full;
}

// ── Gemini ──
async function runGemini(p: ChatParams): Promise<string> {
  const method = p.onToken ? 'streamGenerateContent' : 'generateContent';
  const sse = p.onToken ? '&alt=sse' : '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    p.model,
  )}:${method}?key=${encodeURIComponent(p.apiKey)}${sse}`;
  const res = await fetch(url, {
    method: 'POST',
    signal: p.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.system }] },
      contents: p.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));

  const pickText = (json: unknown) =>
    (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';

  if (!p.onToken) {
    const data = await res.json();
    return pickText(data);
  }
  let full = '';
  await readSSE(res, (json) => {
    const delta = pickText(json);
    if (delta) { full += delta; p.onToken!(delta); }
  });
  return full;
}
