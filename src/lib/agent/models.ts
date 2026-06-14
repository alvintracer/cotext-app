// Cotext — Embedded multi-model agent: provider & model registry
// BYOK (bring your own key). Keys stay in this browser (localStorage), never sent to Cotext servers.

export type ApiShape = 'openai' | 'anthropic' | 'gemini';
export type ProviderId =
  | 'gemini' | 'openai' | 'anthropic' | 'xai' | 'groq' | 'openrouter' | 'custom';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  shape: ApiShape;
  /** For openai-shape providers. Anthropic/Gemini use fixed endpoints. Empty = user supplies (custom). */
  baseURL: string;
  /** Genuinely free API tier (no card) — for UI badge. */
  free: boolean;
  defaultModel: string;
  /** Fallback model if the chosen model is unavailable (404/not found). */
  fallbackModel?: string;
  /** Suggested model ids (editable in UI — ids change over time). */
  models: string[];
  keyLabel: string;
  keyUrl?: string;
  /** Whether the baseURL is user-editable (custom / self-hosted). */
  editableBaseURL?: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini', label: 'Gemini', shape: 'gemini', baseURL: '', free: true,
    defaultModel: 'gemini-2.5-flash',
    fallbackModel: 'gemini-2.5-flash-lite',
    models: [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    keyLabel: 'Google AI Studio API key', keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq', label: 'Groq', shape: 'openai',
    baseURL: 'https://api.groq.com/openai/v1', free: true,
    defaultModel: 'llama-3.3-70b-versatile',
    fallbackModel: 'llama-3.1-8b-instant',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ],
    keyLabel: 'Groq API key', keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'anthropic', label: 'Claude (Anthropic)', shape: 'anthropic', baseURL: '', free: false,
    defaultModel: 'claude-sonnet-4-6',
    fallbackModel: 'claude-haiku-4-5-20251001',
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
    ],
    keyLabel: 'Anthropic API key', keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai', label: 'OpenAI (GPT)', shape: 'openai',
    baseURL: 'https://api.openai.com/v1', free: false,
    defaultModel: 'gpt-4o',
    fallbackModel: 'gpt-4o-mini',
    models: [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4.1-nano',
      'gpt-4.1-mini',
      'gpt-4.1',
      'o4-mini',
      'o3',
    ],
    keyLabel: 'OpenAI API key', keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'xai', label: 'Grok (xAI)', shape: 'openai',
    baseURL: 'https://api.x.ai/v1', free: false,
    defaultModel: 'grok-3-mini',
    fallbackModel: 'grok-2',
    models: [
      'grok-2',
      'grok-3-mini',
      'grok-3',
    ],
    keyLabel: 'xAI API key', keyUrl: 'https://console.x.ai',
  },
  {
    id: 'openrouter', label: 'OpenRouter', shape: 'openai',
    baseURL: 'https://openrouter.ai/api/v1', free: true,
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    fallbackModel: 'google/gemini-2.0-flash-exp:free',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'mistralai/mistral-7b-instruct:free',
      'anthropic/claude-sonnet-4-6',
      'openai/gpt-4o',
    ],
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
