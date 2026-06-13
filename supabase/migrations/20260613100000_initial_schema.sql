-- ============================================================
-- Cotext — Supabase Schema Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  github_username text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. GitHub Connections
create table if not exists public.github_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  github_username text,
  access_token_encrypted text,
  token_scope text,
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  github_owner text not null,
  github_repo text not null,
  default_branch text default 'main',
  cotext_folder_name text default '.cotext',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  path text not null,
  cotext_folder text default '.cotext',
  cotext_file_path text not null,
  last_known_sha text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, path)
);

-- 5. Local Drafts
create table if not exists public.local_drafts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  base_sha text,
  dirty boolean default true,
  updated_at timestamptz default now(),
  unique(room_id, user_id)
);

-- 6. Assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  path text not null,
  size_bytes bigint,
  original_size_bytes bigint,
  width int,
  height int,
  compressed boolean default false,
  mime_type text,
  storage_mode text default 'github',
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.github_connections enable row level security;
alter table public.workspaces enable row level security;
alter table public.rooms enable row level security;
alter table public.local_drafts enable row level security;
alter table public.assets enable row level security;

-- Profiles: users can only access their own profile
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- GitHub Connections: users can only access their own connections
drop policy if exists "Users can view own github connections" on public.github_connections;
create policy "Users can view own github connections"
  on public.github_connections for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own github connections" on public.github_connections;
create policy "Users can manage own github connections"
  on public.github_connections for all
  using (auth.uid() = user_id);

-- Workspaces: users can only access their own workspaces
drop policy if exists "Users can view own workspaces" on public.workspaces;
create policy "Users can view own workspaces"
  on public.workspaces for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create workspaces" on public.workspaces;
create policy "Users can create workspaces"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own workspaces" on public.workspaces;
create policy "Users can update own workspaces"
  on public.workspaces for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own workspaces" on public.workspaces;
create policy "Users can delete own workspaces"
  on public.workspaces for delete
  using (auth.uid() = user_id);

-- Rooms: users can only access their own rooms
drop policy if exists "Users can view own rooms" on public.rooms;
create policy "Users can view own rooms"
  on public.rooms for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create rooms" on public.rooms;
create policy "Users can create rooms"
  on public.rooms for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own rooms" on public.rooms;
create policy "Users can update own rooms"
  on public.rooms for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own rooms" on public.rooms;
create policy "Users can delete own rooms"
  on public.rooms for delete
  using (auth.uid() = user_id);

-- Local Drafts: users can only access their own drafts
drop policy if exists "Users can view own drafts" on public.local_drafts;
create policy "Users can view own drafts"
  on public.local_drafts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own drafts" on public.local_drafts;
create policy "Users can manage own drafts"
  on public.local_drafts for all
  using (auth.uid() = user_id);

-- Assets: users can only access their own assets
drop policy if exists "Users can view own assets" on public.assets;
create policy "Users can view own assets"
  on public.assets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own assets" on public.assets;
create policy "Users can manage own assets"
  on public.assets for all
  using (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, github_username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'user_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'user_name'
  );
  return new;
end;
$$;

-- Trigger to auto-create profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
