// Cotext — Embedded multi-model agent: provider & model registry
// BYOK (bring your own key). Keys stay in this browser (localStorage), never sent to Cotext servers.
// Only Gemini offers free API keys (Google AI Studio, no credit card required).

export type ApiShape = 'openai' | 'anthropic' | 'gemini';
export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'xai';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  shape: ApiShape;
  baseURL: string;
  defaultModel: string;
  fallbackModel?: string;
  models: string[];
  keyLabel: string;
  keyUrl?: string;
  editableBaseURL?: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini', label: 'Google (Gemini)', shape: 'gemini', baseURL: '', 
    defaultModel: 'gemini-2.5-flash',
    fallbackModel: 'gemini-2.5-flash-lite',
    models: [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    keyLabel: 'Google AI Studio API key',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openai', label: 'OpenAI (GPT)', shape: 'openai',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
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
    keyLabel: 'OpenAI API key',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic', label: 'Anthropic (Claude)', shape: 'anthropic', baseURL: '', 
    defaultModel: 'claude-sonnet-4-6',
    fallbackModel: 'claude-haiku-4-5-20251001',
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
    ],
    keyLabel: 'Anthropic API key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'xai', label: 'xAI (Grok)', shape: 'openai',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    fallbackModel: 'grok-2',
    models: [
      'grok-2',
      'grok-3-mini',
      'grok-3',
    ],
    keyLabel: 'xAI API key',
    keyUrl: 'https://console.x.ai',
  },
];

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

// ── Token usage & cost estimation ──
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Pricing per 1M tokens: [input $/1M, output $/1M]. 0 = free tier. */
const PRICING: Record<string, [number, number]> = {
  // Gemini (Google AI paid tier pricing per 1M tokens)
  'gemini-2.5-flash-lite': [0.04, 0.15],
  'gemini-2.5-flash': [0.15, 0.60],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.0-flash': [0.10, 0.40],
  'gemini-2.0-flash-lite': [0.04, 0.15],
  // OpenAI
  'gpt-4o-mini': [0.15, 0.60],
  'gpt-4o': [2.50, 10],
  'gpt-4.1-nano': [0.10, 0.40],
  'gpt-4.1-mini': [0.40, 1.60],
  'gpt-4.1': [2, 8],
  'o4-mini': [1.10, 4.40],
  'o3': [10, 40],
  // Anthropic
  'claude-haiku-4-5-20251001': [0.80, 4],
  'claude-sonnet-4-6': [3, 15],
  'claude-opus-4-8': [15, 75],
  // xAI
  'grok-2': [2, 10],
  'grok-3-mini': [0.30, 0.50],
  'grok-3': [3, 15],
};

/** Calculate estimated cost in USD from token usage. Returns null if no pricing info. */
export function estimateCost(modelId: string, usage: TokenUsage): number | null {
  const price = PRICING[modelId];
  if (!price) return null;
  const [inPer1M, outPer1M] = price;
  if (inPer1M === 0 && outPer1M === 0) return 0; // free
  return (usage.inputTokens * inPer1M + usage.outputTokens * outPer1M) / 1_000_000;
}

/** Format cost for display. */
export function formatCost(modelId: string, usage: TokenUsage): string {
  const cost = estimateCost(modelId, usage);
  if (cost === null) return '';
  if (cost === 0) return 'free';
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  return `~$${cost.toFixed(3)}`;
}
