// Cotext — provider adapters. One agent loop, pluggable model.
// Browser-direct (BYOK). Three request shapes: openai-compatible, anthropic, gemini.
// Supports streaming via SSE when `onToken` is provided.

import type { ApiShape } from './models';
import { TOOL_DEFS } from './tools';

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

// ── Agent tool loop (OpenAI-compatible only) ──
// Read tools auto-execute; the first append_note call returns a proposal for user approval.
export type AgentTurn =
  | { kind: 'text'; text: string }
  | { kind: 'proposal'; roomPath: string; content: string };

export interface ToolLoopParams {
  baseURL: string;
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMsg[];
  executeRead: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxIter?: number;
  signal?: AbortSignal;
}

interface OAToolCall { id: string; function: { name: string; arguments: string } }
interface OAMessage { role: string; content?: string | null; tool_calls?: OAToolCall[]; tool_call_id?: string }

export async function runToolLoop(p: ToolLoopParams): Promise<AgentTurn> {
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
        if (tc.function.name === 'append_note') {
          return { kind: 'proposal', roomPath: String(args.room_path || ''), content: String(args.content || '') };
        }
        const result = await p.executeRead(tc.function.name, args);
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }
    return { kind: 'text', text: m?.content ?? '' };
  }
  return { kind: 'text', text: '(stopped: too many tool steps)' };
}

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
