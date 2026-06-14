import { supabase } from './client';

export async function invokeFunction<T = any>(name: string, body?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body || {},
  });
  if (error) throw error;
  return data as T;
}

// GitHub API wrappers via Edge Functions
export const githubApi = {
  async listRepos() {
    return invokeFunction<{ repos: any[] }>('github-repos');
  },

  async createRepo(name: string, isPrivate: boolean = true, description?: string) {
    return invokeFunction('github-repos', { action: 'create', name, private: isPrivate, description });
  },

  async getTree(owner: string, repo: string, branch: string, path?: string) {
    return invokeFunction('github-tree', { owner, repo, branch, path });
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
