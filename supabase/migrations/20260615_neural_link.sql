-- ============================================================
-- Neural Link — 파생 그래프 인덱스 (결정 D-009 / 계획서 §32)
--
-- 정본은 repo: 노드/소속은 cotext.md 인라인 주석, 클러스터/엣지는
-- .cotext/neural.json. 아래 테이블은 그것으로부터 재생성 가능한 "파생
-- 인덱스"로, 빠른 쿼리·크로스 레포 검색(P3, 유료)·에이전트 그래프
-- 컨텍스트(P5)를 위해서만 존재한다. 날아가도 repo에서 재구축한다.
-- ============================================================

-- 클러스터 레지스트리 (slug = cluster_id, 워크스페이스 단위 유일)
create table if not exists public.neural_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cluster_id text not null,                -- slug, 예: "pricing"
  name text not null,
  color text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, cluster_id)
);

-- 노드 인덱스 (노드 = 블록; n_xxxx 는 인라인 주석 정본에서 옴)
create table if not exists public.neural_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null,                   -- 예: "n_a1b2c3d4"
  room text not null,                      -- 룸 경로
  block_ts text not null,                  -- "2026-06-15 10:30"
  label text not null default '',
  clusters text[] not null default '{}',   -- cluster_id 목록
  source text,                             -- provenance: me | agent | ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, node_id)
);

-- 명시적 노드↔노드 엣지 (무방향 의미; from/to 는 node_id)
create table if not exists public.neural_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_node text not null,
  to_node text not null,
  type text,
  via_cluster text,                        -- 클러스터 파생 엣지면 cluster_id
  created_at timestamptz not null default now(),
  unique(workspace_id, from_node, to_node)
);

create index if not exists idx_neural_clusters_ws on public.neural_clusters(workspace_id);
create index if not exists idx_neural_nodes_ws on public.neural_nodes(workspace_id);
create index if not exists idx_neural_nodes_clusters on public.neural_nodes using gin(clusters);
create index if not exists idx_neural_edges_ws on public.neural_edges(workspace_id);

alter table public.neural_clusters enable row level security;
alter table public.neural_nodes enable row level security;
alter table public.neural_edges enable row level security;

create policy "Users manage own neural clusters"
  on public.neural_clusters for all using (user_id = auth.uid());
create policy "Users manage own neural nodes"
  on public.neural_nodes for all using (user_id = auth.uid());
create policy "Users manage own neural edges"
  on public.neural_edges for all using (user_id = auth.uid());
