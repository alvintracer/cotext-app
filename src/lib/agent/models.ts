// Cotext — Embedded multi-model agent: provider & model registry
// BYOK (bring your own key). Keys stay in this browser (localStorage), never sent to Cotext servers.

export type ApiShape = 'openai' | 'anthropic' | 'gemini';
export type ProviderId =
  | 'gemini' | 'openai' | 'anthropic' | 'xai' | 'groq' | 'openrouter' | 'github' | 'custom';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  shape: ApiShape;
  /** For openai-shape providers. Anthropic/Gemini use fixed endpoints. Empty = user supplies (custom). */
  baseURL: string;
  /** Genuinely free API tier (no card) — for UI badge. */
  free: boolean;
  defaultModel: string;
  /** Suggested model ids (editable in UI — ids change over time). */
  models: string[];
  keyLabel: string;
  keyUrl?: string;
  /** Whether the baseURL is user-editable (custom / self-hosted). */
  editableBaseURL?: boolean;
  /** Route through a Cotext Edge Function instead of calling the provider directly (CORS/headers). */
  proxy?: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini', label: 'Gemini', shape: 'gemini', baseURL: '', free: true,
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    keyLabel: 'Google AI Studio API key', keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'github', label: 'GitHub Models', shape: 'openai', proxy: true,
    baseURL: 'https://models.github.ai/inference', free: true,
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'meta/Llama-3.3-70B-Instruct'],
    keyLabel: 'Fine-grained PAT with Models (models:read) permission',
    keyUrl: 'https://github.com/settings/personal-access-tokens/new',
  },
  {
    id: 'groq', label: 'Groq', shape: 'openai',
    baseURL: 'https://api.groq.com/openai/v1', free: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    keyLabel: 'Groq API key', keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'anthropic', label: 'Claude (Anthropic)', shape: 'anthropic', baseURL: '', free: false,
    defaultModel: 'claude-sonnet-4-6',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
    keyLabel: 'Anthropic API key', keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai', label: 'OpenAI (GPT)', shape: 'openai',
    baseURL: 'https://api.openai.com/v1', free: false,
    defaultModel: 'gpt-4o',
    models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
    keyLabel: 'OpenAI API key', keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'xai', label: 'Grok (xAI)', shape: 'openai',
    baseURL: 'https://api.x.ai/v1', free: false,
    defaultModel: 'grok-3',
    models: ['grok-3', 'grok-3-mini'],
    keyLabel: 'xAI API key', keyUrl: 'https://console.x.ai',
  },
  {
    id: 'openrouter', label: 'OpenRouter', shape: 'openai',
    baseURL: 'https://openrouter.ai/api/v1', free: true,
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free'],
    keyLabel: 'OpenRouter API key', keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'custom', label: 'Custom (OpenAI-compatible)', shape: 'openai',
    baseURL: '', free: false, editableBaseURL: true,
    defaultModel: '',
    models: [],
    keyLabel: 'API key (or any value for local servers like Ollama)',
  },
];

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}
