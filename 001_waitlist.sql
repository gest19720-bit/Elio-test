-- Elio waitlist: run this entire file in Supabase Dashboard > SQL Editor.
-- It creates a private table and one safe, public sign-up RPC.

create table if not exists public.waitlist_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null unique check (email = lower(email)),
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  business_type text not null check (char_length(trim(business_type)) between 1 and 80),
  business_size text not null check (char_length(trim(business_size)) between 1 and 32),
  biggest_challenges text[] not null default '{}',
  current_tools text[] not null default '{}',
  primary_problem text,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{6}$'),
  referred_by text,
  referral_count integer not null default 0 check (referral_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists waitlist_users_created_at_idx on public.waitlist_users (created_at desc);
create index if not exists waitlist_users_referred_by_idx on public.waitlist_users (referred_by) where referred_by is not null;

alter table public.waitlist_users enable row level security;
revoke all on table public.waitlist_users from anon, authenticated;

create or replace function public.join_waitlist(
  p_full_name text, p_email text, p_business_name text, p_business_type text, p_business_size text,
  p_biggest_challenges text[] default '{}', p_current_tools text[] default '{}',
  p_primary_problem text default null, p_referred_by text default null
)
returns table (referral_code text, referral_count integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_referral_code text;
  v_referrer_id uuid;
begin
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please enter your name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_business_name, ''))) < 1 then
    raise exception 'Please enter your business name.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_business_type, ''))) < 1
     or char_length(trim(coalesce(p_business_size, ''))) < 1 then
    raise exception 'Please complete the business details.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_biggest_challenges, 1), 0) = 0 then
    raise exception 'Please select at least one challenge.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_primary_problem, '')) > 2000 then
    raise exception 'Your answer is too long.' using errcode = '22023';
  end if;
  if exists (select 1 from public.waitlist_users where email = v_email) then
    raise exception 'This email is already on the waitlist.' using errcode = '23505';
  end if;

  loop
    v_referral_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.waitlist_users as existing_user
      where existing_user.referral_code = v_referral_code
    );
  end loop;

  select id into v_referrer_id
    from public.waitlist_users as referrer
   where referrer.referral_code = upper(trim(coalesce(p_referred_by, '')))
   limit 1;

  insert into public.waitlist_users (
    full_name, email, business_name, business_type, business_size, biggest_challenges,
    current_tools, primary_problem, referral_code, referred_by
  ) values (
    trim(p_full_name), v_email, trim(p_business_name), trim(p_business_type), trim(p_business_size),
    coalesce(p_biggest_challenges, '{}'), coalesce(p_current_tools, '{}'), nullif(trim(p_primary_problem), ''),
    v_referral_code, case when v_referrer_id is null then null else upper(trim(p_referred_by)) end
  );

  if v_referrer_id is not null then
    update public.waitlist_users set referral_count = referral_count + 1 where id = v_referrer_id;
  end if;

  return query select v_referral_code, 0;
end;
$$;

revoke all on function public.join_waitlist(text, text, text, text, text, text[], text[], text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text, text[], text[], text, text) to anon;

comment on function public.join_waitlist is 'Creates one private waitlist record and atomically credits a valid referrer.';
