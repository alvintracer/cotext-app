export interface Asset {
  id: string;
  room_id: string;
  user_id: string;
  file_name: string;
  path: string;
  size_bytes: number;
  original_size_bytes: number | null;
  width: number | null;
  height: number | null;
  compressed: boolean;
  mime_type: string;
  storage_mode: 'github' | 'supabase';
  created_at: string;
}

export interface AssetUploadResult {
  fileName: string;
  path: string;
  markdownLink: string;
  sizeBytes: number;
  originalSizeBytes: number;
}
