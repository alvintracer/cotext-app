import type { KnowledgeGraphResult } from './oneShot';

export interface KnowledgeSnapshot extends KnowledgeGraphResult {
  savedAt: string;
}

const SNAPSHOT_KEY = 'cotext-knowledge-snapshot';

export function saveKnowledgeSnapshot(result: KnowledgeGraphResult): void {
  const payload: KnowledgeSnapshot = {
    ...result,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
}

export function loadKnowledgeSnapshot(): KnowledgeSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as KnowledgeSnapshot) : null;
  } catch {
    return null;
  }
}
