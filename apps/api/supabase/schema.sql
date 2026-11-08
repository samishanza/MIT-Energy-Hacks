-- Site records in Supabase Postgres. Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- Safe to run again.
--
-- Each observation is stored once, in log order, and each record version is stored without its observation log,
-- with the count it held (see apps/api/src/cloud-record.ts). site_record() rebuilds a full version.
-- Observations and versions are append-only, as in the local store. Row level security is on with no policies, and
-- the browser roles are revoked, so only the server's secret key can read or write.

create table if not exists public.sites (
  id text primary key,
  address text not null,
  latest_version integer not null,
  synthetic boolean not null,
  updated_at timestamptz not null default now(),
  site jsonb not null
);

create table if not exists public.observations (
  site_id text not null references public.sites (id),
  seq integer not null,
  id text not null unique,
  field text not null,
  data jsonb not null,
  primary key (site_id, seq)
);

create table if not exists public.site_versions (
  site_id text not null references public.sites (id),
  version integer not null,
  created_at timestamptz not null,
  trigger text not null,
  synthetic boolean not null,
  observation_count integer not null,
  data jsonb not null,
  primary key (site_id, version)
);

create or replace function public.reject_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are append-only', tg_table_name;
end
$$;

drop trigger if exists observations_append_only on public.observations;
create trigger observations_append_only before update or delete on public.observations
  for each row execute function public.reject_change();
drop trigger if exists site_versions_append_only on public.site_versions;
create trigger site_versions_append_only before update or delete on public.site_versions
  for each row execute function public.reject_change();

-- A full record version: the stored version with the first observation_count observations of the site's log.
-- With no version given, the latest.
create or replace function public.site_record(p_site_id text, p_version integer default null) returns jsonb
language sql stable set search_path = '' as $$
  with v as (
    select * from public.site_versions
    where site_id = p_site_id
      and version = coalesce(p_version, (select max(version) from public.site_versions where site_id = p_site_id))
  )
  select v.data || jsonb_build_object(
    'observations',
    coalesce((select jsonb_agg(o.data order by o.seq) from public.observations o where o.site_id = p_site_id and o.seq < v.observation_count), '[]'::jsonb)
  )
  from v;
$$;

alter table public.sites enable row level security;
alter table public.observations enable row level security;
alter table public.site_versions enable row level security;

revoke all on public.sites, public.observations, public.site_versions from anon, authenticated;
grant all on public.sites, public.observations, public.site_versions to service_role;
revoke execute on function public.site_record(text, integer) from public, anon, authenticated;
revoke execute on function public.reject_change() from public, anon, authenticated;
grant execute on function public.site_record(text, integer) to service_role;
