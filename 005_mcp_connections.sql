-- User-owned, read-only credentials for external MCP integrations.
-- Store only a one-way token hash; plaintext credentials must remain with the client.

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_name text not null check (char_length(app_name) between 1 and 120),
  token_hash text not null unique,
  scopes text[] not null default array['financial.read.summary']::text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  request_count bigint not null default 0
);

create index if not exists mcp_connections_user_id_idx on public.mcp_connections(user_id);
create index if not exists mcp_connections_token_hash_idx on public.mcp_connections(token_hash);

create table if not exists public.mcp_access_log (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  requested_at timestamptz not null default now(),
  latency_ms integer,
  success boolean not null default true
);

alter table public.mcp_connections enable row level security;
alter table public.mcp_access_log enable row level security;

drop policy if exists "Users can view their MCP connections" on public.mcp_connections;
create policy "Users can view their MCP connections"
  on public.mcp_connections for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their MCP connections" on public.mcp_connections;
create policy "Users can create their MCP connections"
  on public.mcp_connections for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can revoke their MCP connections" on public.mcp_connections;
create policy "Users can revoke their MCP connections"
  on public.mcp_connections for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their MCP access log" on public.mcp_access_log;
create policy "Users can view their MCP access log"
  on public.mcp_access_log for select to authenticated using (auth.uid() = user_id);

-- These tables are exposed through public, but anonymous clients must have no access.
-- The access log is written by the trusted MCP server, not by the browser client.
revoke all on table public.mcp_connections, public.mcp_access_log from anon;
revoke all on table public.mcp_connections, public.mcp_access_log from authenticated;
grant select, insert, update on table public.mcp_connections to authenticated;
grant select on table public.mcp_access_log to authenticated;

comment on table public.mcp_connections is 'Hashed, user-consented, read-only credentials for MCP clients.';
