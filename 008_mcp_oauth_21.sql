-- OAuth 2.1 state for standards-compliant MCP clients. All writes are service-role only.
create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(), client_id text not null unique, client_name text not null,
  redirect_uris text[] not null, grant_types text[] not null default array['authorization_code','refresh_token'],
  response_types text[] not null default array['code'], token_endpoint_auth_method text not null default 'none',
  metadata jsonb not null default '{}'::jsonb, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.mcp_oauth_authorization_requests (
  id text primary key, client_id text not null, client_name text not null, redirect_uri text not null, state text,
  scopes text[] not null, code_challenge text not null, code_challenge_method text not null check (code_challenge_method = 'S256'),
  user_id uuid references auth.users(id) on delete cascade, used_at timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.mcp_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(), code_hash text not null unique, client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, redirect_uri text not null, scopes text[] not null,
  code_challenge text not null, used_at timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(), client_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null, approved_at timestamptz not null default now(), revoked_at timestamptz, unique (client_id, user_id)
);
create table if not exists public.mcp_oauth_access_tokens (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique, client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, grant_id uuid references public.mcp_oauth_grants(id) on delete cascade,
  scopes text[] not null, issued_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz
);
create table if not exists public.mcp_oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique, client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, grant_id uuid references public.mcp_oauth_grants(id) on delete cascade,
  scopes text[] not null, expires_at timestamptz not null, revoked_at timestamptz, replaced_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.mcp_oauth_access_log (
  id bigint generated always as identity primary key, token_id uuid references public.mcp_oauth_access_tokens(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade, client_id text not null, operation text not null,
  capability text, success boolean not null default true, error_code text, created_at timestamptz not null default now()
);
create index if not exists mcp_oauth_access_tokens_lookup_idx on public.mcp_oauth_access_tokens(token_hash, expires_at);
create index if not exists mcp_oauth_grants_user_idx on public.mcp_oauth_grants(user_id, revoked_at);
create index if not exists mcp_oauth_requests_expiry_idx on public.mcp_oauth_authorization_requests(expires_at);
do $$ declare t text; begin foreach t in array array['mcp_oauth_clients','mcp_oauth_authorization_requests','mcp_oauth_authorization_codes','mcp_oauth_grants','mcp_oauth_access_tokens','mcp_oauth_refresh_tokens','mcp_oauth_access_log'] loop execute format('alter table public.%I enable row level security', t); execute format('revoke all on table public.%I from anon, authenticated', t); end loop; end $$;
create policy "Users can view OAuth grants" on public.mcp_oauth_grants for select to authenticated using (auth.uid() = user_id);
create policy "Users can revoke OAuth grants" on public.mcp_oauth_grants for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, update on public.mcp_oauth_grants to authenticated;
