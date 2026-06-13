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
};
