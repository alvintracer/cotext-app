// Cotext — BYOK key & preference storage (this browser only).
// NOTE: BYOK LLM API keys are stored in localStorage on the user's own device.
// This is the user's own key (not the shared GitHub token, which stays server-side per D-002).

import type { ProviderId } from './models';

const KEY_STORE = 'cotext-llm-keys';
const PREF_STORE = 'cotext-llm-pref';

export interface AgentPref {
  provider: ProviderId;
  model: string;
  baseURL?: string; // only for custom / overridden
  trackMode?: 'byok' | 'managed';
}

type KeyMap = Partial<Record<ProviderId, string>>;

export function getKeys(): KeyMap {
  try {
    return JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
  } catch {
    return {};
  }
}

export function getKey(provider: ProviderId): string {
  return getKeys()[provider] || '';
}

export function setKey(provider: ProviderId, key: string): void {
  const keys = getKeys();
  if (key) keys[provider] = key;
  else delete keys[provider];
  localStorage.setItem(KEY_STORE, JSON.stringify(keys));
}

export function getPref(): AgentPref | null {
  try {
    const raw = localStorage.getItem(PREF_STORE);
    return raw ? (JSON.parse(raw) as AgentPref) : null;
  } catch {
    return null;
  }
}

export function setPref(pref: AgentPref): void {
  localStorage.setItem(PREF_STORE, JSON.stringify(pref));
}
