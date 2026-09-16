-- MCP infrastructure: client sessions, permissions, external servers, and auditable events.

alter table public.mcp_access_log alter column tool_name drop not null;
alter table public.mcp_access_log add column if not exists operation text not null default 'tool_call';
alter table public.mcp_access_log add column if not exists client_name text;
alter table public.mcp_access_log add column if not exists resource_uri text;
alter table public.mcp_access_log add column if not exists prompt_name text;
alter table public.mcp_access_log add column if not exists error_code text;
alter table public.mcp_access_log add column if not exists error_message text;
alter table public.mcp_access_log add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists mcp_access_log_connection_requested_idx on public.mcp_access_log(connection_id, requested_at desc);

create table if not exists public.mcp_clients (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null default 'Unknown MCP client',
  client_version text,
  status text not null default 'connected' check (status in ('connected','disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_activity_at timestamptz not null default now(),
  request_count bigint not null default 0,
  unique (connection_id, client_name)
);
create index if not exists mcp_clients_user_status_idx on public.mcp_clients(user_id, status);

create table if not exists public.mcp_permissions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_name text not null,
  access_level text not null check (access_level in ('READ','WRITE','SENSITIVE')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (connection_id, capability_name)
);
create index if not exists mcp_permissions_connection_idx on public.mcp_permissions(connection_id, enabled);

create table if not exists public.mcp_external_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  auth_type text not null default 'none' check (auth_type in ('none','bearer','oauth2')),
  auth_secret_ciphertext text,
  auth_secret_iv text,
  enabled boolean not null default true,
  status text not null default 'disconnected' check (status in ('connected','connecting','disconnected','authentication_required','error','disabled')),
  last_checked_at timestamptz,
  last_error text,
  discovered_tools jsonb not null default '[]'::jsonb,
  discovered_resources jsonb not null default '[]'::jsonb,
  discovered_prompts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mcp_external_connections_user_idx on public.mcp_external_connections(user_id, updated_at desc);

alter table public.mcp_clients enable row level security;
alter table public.mcp_permissions enable row level security;
alter table public.mcp_external_connections enable row level security;

drop policy if exists "Users can view their MCP clients" on public.mcp_clients;
create policy "Users can view their MCP clients" on public.mcp_clients for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their MCP permissions" on public.mcp_permissions;
create policy "Users can view their MCP permissions" on public.mcp_permissions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can manage their MCP permissions" on public.mcp_permissions;
create policy "Users can manage their MCP permissions" on public.mcp_permissions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- External credentials are only read and written by the server-side mcp-admin function.
revoke all on table public.mcp_clients, public.mcp_permissions, public.mcp_external_connections from anon;
revoke all on table public.mcp_clients, public.mcp_external_connections from authenticated;
grant select on table public.mcp_clients, public.mcp_permissions to authenticated;
grant insert, update, delete on table public.mcp_permissions to authenticated;

comment on table public.mcp_external_connections is 'Encrypted external MCP credentials. Ciphertext is never selected by the browser.';
