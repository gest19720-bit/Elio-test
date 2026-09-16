-- Elio MVP schema. Run after 001_waitlist.sql in Supabase SQL Editor.
-- All product records are scoped to a business owned by the authenticated user.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  industry text not null default '',
  size text not null default '',
  communication_style text not null default 'Friendly' check (communication_style in ('Professional','Friendly','Casual','Formal')),
  automation_level text not null default 'Assisted' check (automation_level in ('Manual','Assisted','Automated')),
  help_areas text[] not null default '{}',
  notifications jsonb not null default '{"approval":true,"task":true,"summary":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, email text not null default '', phone text, company text, lead_source text,
  status text not null default 'Active' check (status in ('Lead','Active','Waiting','Needs Follow-Up','Inactive')),
  last_contact_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, title text not null, description text default '',
  status text not null default 'Needs Attention' check (status in ('Needs Attention','In Progress','Waiting','Completed')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  source text not null default 'User' check (source in ('User','Elio','Workflow')),
  due_date date, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null, customer_id uuid references public.customers(id) on delete set null,
  action_type text not null default 'Follow-Up', title text not null, description text not null default '', content jsonb not null default '{}'::jsonb,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Completed')),
  created_by text not null default 'Elio', approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  actor text not null check (actor in ('Elio','User','System')), action text not null, entity_type text not null,
  entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, description text not null default '', trigger_type text not null, action_type text not null,
  approval_required boolean not null default true, is_active boolean not null default false, settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, name)
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade, subject text not null, message text not null,
  suggested_action text not null default '', status text not null default 'Draft' check (status in ('Draft','Pending Approval','Approved','Sent')),
  generated_by text not null default 'Elio', approved_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null, account_identifier text, status text not null default 'Coming Soon', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, provider)
);

alter table public.approvals add column if not exists follow_up_id uuid references public.follow_ups(id) on delete set null;
create index if not exists approvals_follow_up_idx on public.approvals(follow_up_id);

create table if not exists public.ai_request_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

create index if not exists customers_business_idx on public.customers(business_id, created_at desc);
create index if not exists tasks_business_idx on public.tasks(business_id, status, due_date);
create index if not exists activities_business_idx on public.activities(business_id, created_at desc);

create or replace function public.is_business_member(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.businesses where id = target_business_id and owner_id = auth.uid()); $$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.customers enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.activities enable row level security;
alter table public.workflows enable row level security;
alter table public.follow_ups enable row level security;
alter table public.connections enable row level security;
alter table public.ai_request_usage enable row level security;

drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists businesses_owner on public.businesses;
create policy businesses_owner on public.businesses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['customers','tasks','approvals','activities','workflows','follow_ups','connections'] loop
    execute format('drop policy if exists %I on public.%I', t || '_business_owner', t);
    execute format('create policy %I on public.%I for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id))', t || '_business_owner', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;

create or replace function public.seed_elio_workflows(target_business_id uuid)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  if not public.is_business_member(target_business_id) then raise exception 'Not authorized'; end if;
  insert into public.workflows (business_id,name,description,trigger_type,action_type,approval_required)
  values
    (target_business_id,'Customer Follow-Up','Prepare a gentle follow-up when a customer has gone quiet.','No contact in 7 days','Prepare follow-up',true),
    (target_business_id,'Payment Reminder','Prepare a reminder for an outstanding payment.','Payment due','Prepare reminder',true),
    (target_business_id,'Appointment Reminder','Keep upcoming appointments visible.','Appointment approaching','Create task',false),
    (target_business_id,'Daily Business Summary','Summarize activity each morning.','Every morning','Prepare summary',false)
  on conflict (business_id,name) do nothing;
end;
$$;
grant execute on function public.seed_elio_workflows(uuid) to authenticated;

create or replace function public.consume_ai_followup_quota(p_limit integer default 20)
returns boolean language plpgsql security definer set search_path = public
as $$
declare accepted boolean;
begin
  if auth.uid() is null or p_limit < 1 then return false; end if;
  insert into public.ai_request_usage (user_id, usage_date, request_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_request_usage.request_count + 1
    where public.ai_request_usage.request_count < p_limit
  returning true into accepted;
  return coalesce(accepted, false);
end;
$$;
revoke all on function public.consume_ai_followup_quota(integer) from public;
grant execute on function public.consume_ai_followup_quota(integer) to authenticated;

create or replace function public.create_follow_up_workflow(
  p_business_id uuid,
  p_customer_id uuid,
  p_subject text,
  p_message text,
  p_suggested_action text,
  p_generated_by text default 'Elio'
)
returns table (follow_up_id uuid, approval_id uuid)
language plpgsql security invoker set search_path = public
as $$
declare
  v_follow_up_id uuid;
  v_approval_id uuid;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'Customer was not found in this workspace.' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_subject, ''))) = 0 or char_length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'The follow-up content is incomplete.' using errcode = '22023';
  end if;

  insert into public.follow_ups (business_id, customer_id, subject, message, suggested_action, status, generated_by)
  values (p_business_id, p_customer_id, trim(p_subject), trim(p_message), trim(coalesce(p_suggested_action, '')), 'Pending Approval', trim(coalesce(p_generated_by, 'Elio')))
  returning id into v_follow_up_id;

  insert into public.approvals (business_id, customer_id, follow_up_id, action_type, title, description, content, status, created_by)
  values (p_business_id, p_customer_id, v_follow_up_id, 'Follow-Up', 'Review customer follow-up', 'Elio prepared this message for your review.', jsonb_build_object('subject', trim(p_subject), 'message', trim(p_message), 'suggested_action', trim(coalesce(p_suggested_action, ''))), 'Pending', 'Elio')
  returning id into v_approval_id;

  insert into public.activities (business_id, actor, action, entity_type, entity_id, metadata)
  values (p_business_id, 'Elio', 'Prepared a customer follow-up for approval', 'follow_up', v_follow_up_id, jsonb_build_object('approval_id', v_approval_id, 'generated_by', trim(coalesce(p_generated_by, 'Elio'))));

  return query select v_follow_up_id, v_approval_id;
end;
$$;
revoke all on function public.create_follow_up_workflow(uuid, uuid, text, text, text, text) from public;
grant execute on function public.create_follow_up_workflow(uuid, uuid, text, text, text, text) to authenticated;
