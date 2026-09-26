-- Elio book-a-demo: run this entire file in Supabase Dashboard > SQL Editor
-- before deploying book-demo.html. This migration creates the RPC used by the
-- landing-page form; deployment is incomplete until this file has been run.
-- It creates one private table for demo requests and one safe, public RPC.
-- Same shape as 001_waitlist.sql: no public table reads, RLS on, service
-- work happens inside a security definer function.

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique check (reference_code ~ '^DEMO-[A-Z0-9]{6}$'),

  -- Step 1 — About you
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (email = lower(email)),
  phone text,

  -- Step 2 — Company
  company_name text not null check (char_length(trim(company_name)) between 1 and 160),
  company_website text,
  industry text not null check (char_length(trim(industry)) between 1 and 80),
  company_size text not null check (char_length(trim(company_size)) between 1 and 32),

  -- Step 3 — Role
  role text not null check (char_length(trim(role)) between 1 and 80),
  heard_about text,

  -- Step 4 — Current stack
  current_tools text[] not null default '{}',
  challenges text[] not null default '{}' check (coalesce(array_length(challenges, 1), 0) > 0),

  -- Step 5 — Demo focus
  demo_focus text[] not null default '{}' check (coalesce(array_length(demo_focus, 1), 0) > 0),
  notes text check (char_length(coalesce(notes, '')) <= 2000),

  -- Step 6 — Schedule
  preferred_date date not null,
  preferred_time text not null check (char_length(trim(preferred_time)) between 1 and 40),
  timezone text not null check (char_length(trim(timezone)) between 1 and 64),
  meeting_format text not null check (char_length(trim(meeting_format)) between 1 and 40),

  status text not null default 'Requested' check (status in ('Requested','Confirmed','Completed','Cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists demo_requests_created_at_idx on public.demo_requests (created_at desc);
create index if not exists demo_requests_status_idx on public.demo_requests (status);

-- Only open requests block a new booking. Completed and cancelled requests
-- remain available to internal tooling without preventing rebooking.
alter table public.demo_requests drop constraint if exists demo_requests_email_key;
create unique index if not exists demo_requests_active_email_idx
  on public.demo_requests (email)
  where status in ('Requested', 'Confirmed');

-- Private: only the service role (i.e. internal tooling) reads demo requests.
alter table public.demo_requests enable row level security;
revoke all on table public.demo_requests from public, anon, authenticated;

create or replace function public.request_demo(
  p_full_name text, p_email text, p_phone text,
  p_company_name text, p_company_website text,
  p_industry text, p_company_size text, p_role text, p_heard_about text,
  p_current_tools text[], p_challenges text[],
  p_demo_focus text[], p_notes text,
  p_preferred_date date, p_preferred_time text, p_timezone text, p_meeting_format text
)
returns table (reference_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_reference_code text;
  v_website text := nullif(trim(coalesce(p_company_website, '')), '');
begin
  -- Same validation rules as the page, enforced again server-side.
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please enter your name.' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_company_name, ''))) < 1 then
    raise exception 'Please enter your company name.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_industry, ''))) < 1
     or char_length(trim(coalesce(p_company_size, ''))) < 1
     or char_length(trim(coalesce(p_role, ''))) < 1
     or char_length(trim(coalesce(p_meeting_format, ''))) < 1 then
    raise exception 'Please complete the company and meeting details.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_challenges, 1), 0) = 0
     or coalesce(array_length(p_demo_focus, 1), 0) = 0 then
    raise exception 'Please select at least one challenge and one demo focus.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Your notes are too long.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_preferred_time, ''))) < 1
     or char_length(trim(coalesce(p_timezone, ''))) < 1 then
    raise exception 'Please choose a time slot and timezone.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from pg_timezone_names
    where name = trim(p_timezone)
  ) then
    raise exception 'Please choose a valid timezone.' using errcode = '22023';
  end if;
  if p_preferred_date is null
     or p_preferred_date < ((current_timestamp at time zone trim(p_timezone))::date + 1) then
    raise exception 'Please choose a date from tomorrow onward.' using errcode = '22023';
  end if;

  -- Human-friendly reference the team can quote in the confirmation email.
  loop
    v_reference_code := 'DEMO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.demo_requests as existing_request
      where existing_request.reference_code = v_reference_code
    );
  end loop;

  begin
    insert into public.demo_requests (
      reference_code, full_name, email, phone,
      company_name, company_website, industry, company_size,
      role, heard_about, current_tools, challenges,
      demo_focus, notes, preferred_date, preferred_time, timezone, meeting_format
    ) values (
      v_reference_code, trim(p_full_name), v_email, nullif(trim(coalesce(p_phone, '')), ''),
      trim(p_company_name), v_website, trim(p_industry), trim(p_company_size),
      trim(p_role), nullif(trim(coalesce(p_heard_about, '')), ''),
      coalesce(p_current_tools, '{}'), coalesce(p_challenges, '{}'),
      coalesce(p_demo_focus, '{}'), nullif(trim(coalesce(p_notes, '')), ''),
      p_preferred_date, trim(p_preferred_time), trim(p_timezone), trim(p_meeting_format)
    );
  exception
    when unique_violation then
      -- Do not expose whether the submitted email is already booked.
      raise exception 'We could not accept this request. Please try again later.'
        using errcode = 'P0001';
  end;

  return query select v_reference_code;
end;
$$;

revoke all on function public.request_demo(text, text, text, text, text, text, text, text, text, text[], text[], text[], text, date, text, text, text) from public;
grant execute on function public.request_demo(text, text, text, text, text, text, text, text, text, text[], text[], text[], text, date, text, text, text) to anon;

comment on function public.request_demo is 'Creates one private demo request and returns a human-friendly reference code.';
