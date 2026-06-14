export interface Room {
  id: string;
  workspace_id: string;
  user_id: string;
  path: string;
  name: string;
  cotext_folder: string;
  cotext_file_path: string;
  last_known_sha: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoomInput {
  workspace_id: string;
  path: string;
  cotext_folder?: string;
  cotext_file_path: string;
}

export interface LocalDraft {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  base_sha: string | null;
  dirty: boolean;
  updated_at: string;
}

export interface RoomContent {
  content: string;
  sha: string;
  path: string;
}

export type SyncStatus = 'synced' | 'draft' | 'conflict' | 'syncing' | 'error';
