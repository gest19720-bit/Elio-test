-- Elio product catalog and basic sales tracking.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  category text not null default '',
  cost numeric(12,2) not null default 0 check (cost >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  description text not null default '',
  sales integer not null default 0 check (sales >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_business_idx on public.products(business_id, updated_at desc);
alter table public.products enable row level security;
drop policy if exists products_business_owner on public.products;
create policy products_business_owner on public.products for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
grant select, insert, update, delete on public.products to authenticated;
