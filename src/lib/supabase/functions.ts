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

  async pullRoom(roomId: string) {
    return invokeFunction('room-pull', { roomId });
  },

  async pushRoom(roomId: string, content: string, baseSha: string | null, message: string, assets?: any[]) {
    return invokeFunction('room-push', { roomId, content, baseSha, message, assets });
  },

  async uploadAsset(roomId: string, fileName: string, base64Content: string, mimeType: string) {
    return invokeFunction('room-asset-upload', { roomId, fileName, base64Content, mimeType });
  },
};
