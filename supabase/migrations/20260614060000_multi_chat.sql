-- Add name column to rooms for multi-chat per directory
alter table public.rooms add column if not exists name text not null default 'cotext';

-- Drop old unique constraint (1 chat per directory)
alter table public.rooms drop constraint if exists rooms_workspace_id_path_key;

-- Add new unique constraint (1 chat per file path)
alter table public.rooms add constraint rooms_workspace_id_file_key unique(workspace_id, cotext_file_path);
