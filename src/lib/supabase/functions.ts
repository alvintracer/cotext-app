import { supabase } from './client';

export async function invokeFunction<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body || {},
  });
  if (error) throw error;
  return data as T;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description?: string | null;
  default_branch?: string;
  owner?: {
    login: string;
  };
}

export interface GithubTreeItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: GithubTreeItem[];
}

// GitHub API wrappers via Edge Functions
export const githubApi = {
  async listRepos() {
    return invokeFunction<{ repos: GithubRepo[] }>('github-repos');
  },

  async createRepo(name: string, isPrivate: boolean = true, description?: string) {
    return invokeFunction('github-repos', { action: 'create', name, private: isPrivate, description });
  },

  async getTree(owner: string, repo: string, branch: string, path?: string) {
    return invokeFunction<{ tree: GithubTreeItem[] }>('github-tree', { owner, repo, branch, path });
  },

  async getRoomContent(owner: string, repo: string, branch: string, path: string) {
    return invokeFunction<{ content: string; sha: string }>('room-content', { owner, repo, branch, path });
  },

  async pullRoom(owner: string, repo: string, branch: string, path: string) {
    return invokeFunction<{ content: string; sha: string }>('room-content', { owner, repo, branch, path });
  },

  async pushRoom(owner: string, repo: string, branch: string, path: string, content: string, sha: string | null, message: string) {
    return invokeFunction<{ sha: string; commit: string; message: string }>('room-push', { owner, repo, branch, path, content, message, sha });
  },

  async uploadAsset(owner: string, repo: string, branch: string, path: string, base64Content: string, message: string) {
    return invokeFunction('room-push', { owner, repo, branch, path, content: base64Content, message, isBase64: true });
  },

  // Fetch raw base64 content (for binary files like images)
  async fetchAssetBase64(owner: string, repo: string, branch: string, path: string) {
    return invokeFunction<{ base64: string; sha: string | null }>('room-content', { owner, repo, branch, path, raw: true });
  },
};

// Neural Link derived-index API (P3) — ingest + cross-repo search via Edge Function.
export interface NeuralSearchHit {
  workspace_id: string;
  workspaces?: { github_owner: string; github_repo: string } | null;
}
export interface NeuralClusterHit extends NeuralSearchHit { cluster_id: string; name: string; color?: string | null }
export interface NeuralNodeHit extends NeuralSearchHit {
  node_id: string; label: string; room: string; block_ts: string; clusters: string[]; source?: string | null;
}

export const neuralApi = {
  /** Push one workspace's in-memory graph into the derived index (repo-unit replace). */
  sync(workspaceId: string, graph: unknown) {
    return invokeFunction<{ ok: boolean; clusters: number; nodes: number; edges: number }>(
      'neural-index', { action: 'sync', workspace_id: workspaceId, graph },
    );
  },
  /** Cross-repo search across all the user's indexed clusters + nodes. */
  search(query: string, limit = 50) {
    return invokeFunction<{ clusters: NeuralClusterHit[]; nodes: NeuralNodeHit[] }>(
      'neural-index', { action: 'search', query, limit },
    );
  },
  /** Server-side rebuild: read each repo's neural.json from GitHub into the index. */
  reindex() {
    return invokeFunction<{ ok: boolean; results: Array<Record<string, unknown>> }>(
      'neural-index', { action: 'reindex' },
    );
  },
};

// Server-side wiki synthesis (Cotext Model — managed LLM, debits credits).
// Same prompt + sanitize logic as client-side synthesizeWikiDocs() so output
// shapes match; modal can swap providers (BYOK vs managed) transparently.
export interface ManagedSynthesizeResponse {
  ok: boolean;
  proposals: Array<{
    category: string;
    slug: string;
    title: string;
    tags: string[];
    body: string;
    rationale: string;
  }>;
  managed: {
    providerId: string;
    model: string;
    billingMode: string;
    requestChars: number;
    chargedCredits: number;
    chargeSkipped?: boolean;
    chargeError?: string | null;
    balance?: {
      balanceCredits: number;
      reservedCredits: number;
      lifetimeUsedCredits: number;
      monthlyGrantCredits: number;
      billingState: string;
      updatedAt: string;
      transactionId?: string | null;
    } | null;
  };
}
export const wikiSynthesizeApi = {
  managed(opts: {
    workspace_id: string;
    room_content: string;
    existing_index?: string;
    repo_label: string;
    room_label: string;
  }) {
    return invokeFunction<ManagedSynthesizeResponse>('wiki-synthesize-managed', opts);
  },
};

// Batch push multiple files in one git commit (Trees API). Used by the
// wiki-synthesize flow so a synthesis session produces ONE clean repo entry
// and the neural-compile workflow fires exactly once.
export const wikiBatchApi = {
  pushBatch(opts: {
    owner: string;
    repo: string;
    branch?: string;
    files: Array<{ path: string; content: string }>;
    message?: string;
    force?: boolean;
  }) {
    return invokeFunction<{
      ok: boolean;
      created: number;
      skipped: number;
      created_paths: string[];
      skipped_paths: string[];
      commit_sha?: string;
      message: string;
    }>('wiki-push-batch', opts);
  },
};

// Workspace wiki initialization — scaffolds the LLM-wiki structure server-side
// for users who connected the repo via Cotext without ever cloning it locally.
// Same templates as `npx cotext init`, committed in one atomic GitHub commit.
// Manually trigger the neural-compile workflow on a workspace's GitHub repo.
// Used to refresh a stale graph (e.g. one that still has nodes the new compiler
// would filter out) without waiting for the next markdown push.
export const compileTriggerApi = {
  trigger(owner: string, repo: string, branch = 'main') {
    return invokeFunction<{
      ok: boolean;
      message: string;
      actionsUrl: string;
    }>('trigger-neural-compile', { owner, repo, branch });
  },
};

export const wikiInitApi = {
  init(owner: string, repo: string, branch = 'main', force = false, force_paths: string[] = []) {
    return invokeFunction<{
      ok: boolean;
      created: number;
      skipped: number;
      created_paths: string[];
      skipped_paths: string[];
      warnings?: string[];
      commit_sha?: string;
      message: string;
    }>('workspace-init-wiki', { owner, repo, branch, force, force_paths });
  },
};

export interface ManagedKnowledgeExtractResponse {
  ok: boolean;
  managed: {
    providerId: string;
    model: string;
    billingMode: string;
    requestChars: number;
    chargedCredits: number;
    chargeSkipped?: boolean;
    chargeError?: string | null;
    balance?: {
      balanceCredits: number;
      reservedCredits: number;
      lifetimeUsedCredits: number;
      monthlyGrantCredits: number;
      billingState: string;
      updatedAt: string;
      transactionId?: string | null;
    } | null;
  };
  result: {
    graph: unknown;
    nodeTextById: Record<string, string>;
    blockTextByKey: Record<string, string>;
    sourceCount: number;
    sectionCount: number;
    chunksProcessed: number;
    chunksFailed: number;
    failures: Array<{ source: string; chunkIndex: number; error: string }>;
    gaps?: string[];
  };
}

export interface ManagedAgentChatResponse {
  ok: boolean;
  managed: {
    providerId: string;
    model: string;
    billingMode: string;
    requestChars: number;
    chargedCredits: number;
    chargeSkipped?: boolean;
    chargeError?: string | null;
    balance?: {
      balanceCredits: number;
      reservedCredits: number;
      lifetimeUsedCredits: number;
      monthlyGrantCredits: number;
      billingState: string;
      updatedAt: string;
      transactionId?: string | null;
    } | null;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  text: string;
}

export interface ManagedCreditInvoiceResponse {
  ok: boolean;
  orderId: string;
  invoiceId: string;
  invoiceUrl: string;
  status: string;
  credits: number;
  priceAmount: number;
  priceCurrency: string;
  packId: string;
}

export const managedKnowledgeApi = {
  /**
   * Managed extraction via SSE streaming.
   * The edge function sends `progress`, `chunk`, `done`, and `error` events.
   * `onProgress` fires for each progress/chunk event so the UI can show real-time updates.
   */
  async extract(
    workspaceId: string,
    sources: Array<{ name: string; text: string }>,
    onProgress?: (info: { phase: string; current: number; total: number; message?: string }) => void,
    signal?: AbortSignal,
  ): Promise<ManagedKnowledgeExtractResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const url = `${supabaseUrl}/functions/v1/neural-extract-managed`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId, sources }),
      signal,
    });

    // Non-SSE response (error cases return JSON)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      return data as ManagedKnowledgeExtractResponse;
    }

    // SSE streaming
    return new Promise<ManagedKnowledgeExtractResponse>((resolve, reject) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Must persist across pump() reads: a single SSE event (`event: <name>`
      // then `data: <json>`) can split across TCP chunks — notably the large
      // `done` payload — so resetting it per-call would drop the event.
      let currentEvent = '';

      function processLines() {
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line === '') {
            currentEvent = ''; // blank line = end of one SSE event
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              if (currentEvent === 'progress' && onProgress) {
                onProgress(data);
              } else if (currentEvent === 'chunk' && onProgress && data.totalChunks) {
                onProgress({
                  phase: 'extracting',
                  current: data.chunkIndex + 1,
                  total: data.totalChunks,
                  message: data.error
                    ? `Chunk ${data.chunkIndex + 1}/${data.totalChunks} failed`
                    : `Chunk ${data.chunkIndex + 1}/${data.totalChunks} done`,
                });
              } else if (currentEvent === 'done') {
                resolve(data as ManagedKnowledgeExtractResponse);
                return;
              } else if (currentEvent === 'error') {
                reject(new Error(data.error || 'Server error'));
                return;
              }
            } catch { /* skip malformed JSON */ }
          }
        }
      }

      function pump(): void {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (buffer.trim()) processLines();
            // If we get here without resolve/reject, the stream ended unexpectedly
            reject(new Error('Stream ended without result'));
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          processLines();
          pump();
        }).catch(reject);
      }

      pump();
    });
  },
};

export const managedAgentApi = {
  async chat(
    workspaceId: string,
    system: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<ManagedAgentChatResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const url = `${supabaseUrl}/functions/v1/agent-chat-managed`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        system,
        messages,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as ManagedAgentChatResponse;
  },
};

export const managedBillingApi = {
  async createInvoice(
    workspaceId: string,
    packId: string,
    urls?: { successUrl?: string; cancelUrl?: string },
  ): Promise<ManagedCreditInvoiceResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const url = `${supabaseUrl}/functions/v1/nowpayments-create-invoice`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        pack_id: packId,
        success_url: urls?.successUrl,
        cancel_url: urls?.cancelUrl,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as ManagedCreditInvoiceResponse;
  },
};

// GitHub Models inference via Edge Function proxy (BYOK fine-grained PAT with models:read).
// Proxied because the browser-direct endpoint has CORS/header constraints.
export async function chatGithubModels(
  model: string,
  messages: Array<{ role: string; content: string }>,
  token: string,
): Promise<string> {
  const data = await invokeFunction<{ choices?: Array<{ message?: { content?: string } }> }>(
    'github-models',
    { model, messages, token },
  );
  return data?.choices?.[0]?.message?.content ?? '';
}

// Cache for blob URLs to avoid re-fetching
const blobUrlCache = new Map<string, string>();

/**
 * Fetch a GitHub asset (image) and return a blob URL.
 * Results are cached to avoid repeated fetches.
 */
export async function fetchAssetBlobUrl(
  owner: string, repo: string, branch: string, assetPath: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}/${branch}/${assetPath}`;

  if (blobUrlCache.has(cacheKey)) {
    return blobUrlCache.get(cacheKey)!;
  }

  try {
    const result = await githubApi.fetchAssetBase64(owner, repo, branch, assetPath);
    if (!result.base64) return null;

    // Determine mime type from extension
    const ext = assetPath.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';

    // Convert base64 to blob
    const byteChars = atob(result.base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: mime });
    const url = URL.createObjectURL(blob);

    blobUrlCache.set(cacheKey, url);
    return url;
  } catch (err) {
    console.error('[fetchAssetBlobUrl] Failed:', assetPath, err);
    return null;
  }
}

// Store a local blob URL for an uploaded file (instant preview)
export function cacheLocalAssetUrl(owner: string, repo: string, branch: string, assetPath: string, file: File) {
  const cacheKey = `${owner}/${repo}/${branch}/${assetPath}`;
  const url = URL.createObjectURL(file);
  blobUrlCache.set(cacheKey, url);
  return url;
}
