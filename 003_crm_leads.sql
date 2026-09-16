-- CRM enhancements: allow lead records and preserve a lead source.
alter table public.customers add column if not exists lead_source text;
alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers add constraint customers_status_check check (status in ('Lead','Active','Waiting','Needs Follow-Up','Inactive'));
