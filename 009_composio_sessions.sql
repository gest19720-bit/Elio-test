create table if not exists public.composio_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.composio_sessions enable row level security;
