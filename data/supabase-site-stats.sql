-- Run once in the Droid Archives Supabase SQL Editor. Safe to rerun.
-- Counts only: no account list, emails, IP addresses or page history is returned.
begin;
create table if not exists public.droid_site_visitors (
  visitor_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  last_seen timestamptz not null default now()
);
create index if not exists droid_site_visitors_seen on public.droid_site_visitors(last_seen);
create table if not exists public.droid_site_account_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.droid_site_account_activity add column if not exists site_layout text check (site_layout in ('modern','classic','legacy'));
alter table public.droid_site_visitors enable row level security;
alter table public.droid_site_account_activity enable row level security;
revoke all on public.droid_site_visitors, public.droid_site_account_activity from public, anon, authenticated;

create or replace function public.droid_site_heartbeat(visitor uuid, site_layout text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if visitor is null then raise exception 'Visitor identifier required'; end if;
  if site_layout is not null and site_layout not in ('modern','classic','legacy') then raise exception 'Invalid site layout'; end if;
  insert into public.droid_site_visitors(visitor_id,user_id,last_seen)
  values(visitor,auth.uid(),now())
  on conflict(visitor_id) do update set user_id=excluded.user_id,last_seen=excluded.last_seen
  where droid_site_visitors.last_seen < now()-interval '30 seconds'
     or droid_site_visitors.user_id is distinct from excluded.user_id;
  if auth.uid() is not null then
    insert into public.droid_site_account_activity(user_id,last_seen,site_layout) values(auth.uid(),now(),site_layout)
    on conflict(user_id) do update set last_seen=excluded.last_seen,site_layout=excluded.site_layout
    where droid_site_account_activity.last_seen < now()-interval '30 seconds'
       or droid_site_account_activity.site_layout is distinct from excluded.site_layout;
  end if;
end;
$$;
revoke all on function public.droid_site_heartbeat(uuid,text) from public, anon, authenticated;
grant execute on function public.droid_site_heartbeat(uuid,text) to anon, authenticated;
-- Older clients still report activity, with their layout explicitly unknown.
create or replace function public.droid_site_heartbeat(visitor uuid)
returns void language sql security definer set search_path = '' as $$
  select public.droid_site_heartbeat(visitor,null::text);
$$;
revoke all on function public.droid_site_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.droid_site_heartbeat(uuid) to anon, authenticated;

create or replace function public.droid_site_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  -- Check the database identity, not editable profile metadata or a client flag.
  if not exists(select 1 from auth.users where id=auth.uid()
    and lower(email)='xraffo@gmail.com' and email_confirmed_at is not null and deleted_at is null) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  -- Activity is a rolling window, with a maximum 30-day retention at refresh.
  delete from public.droid_site_visitors where last_seen < now()-interval '30 days';
  delete from public.droid_site_account_activity where last_seen < now()-interval '30 days';
  select jsonb_build_object(
    'signed_up', (select count(*) from auth.users where deleted_at is null and not coalesce(is_anonymous,false)),
    'confirmed', (select count(*) from auth.users where deleted_at is null and not coalesce(is_anonymous,false) and email_confirmed_at is not null),
    'accounts_now', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '5 minutes'),
    'accounts_1h', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '1 hour'),
    'accounts_24h', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '24 hours'),
    'accounts_7d', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '7 days'),
    'browsers_now', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '5 minutes'),
    'browsers_1h', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '1 hour'),
    'browsers_24h', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '24 hours'),
    'browsers_7d', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '7 days'),
    'layouts', (select jsonb_agg(row_counts order by row_counts.layout) from (
      select kind.layout,
        count(a.user_id) filter(where a.last_seen >= now()-interval '5 minutes') as accounts_now,
        count(a.user_id) filter(where a.last_seen >= now()-interval '1 hour') as accounts_1h,
        count(a.user_id) filter(where a.last_seen >= now()-interval '24 hours') as accounts_24h,
        count(a.user_id) filter(where a.last_seen >= now()-interval '7 days') as accounts_7d
      from (values ('modern'),('classic'),('legacy'),('unknown')) as kind(layout)
      left join public.droid_site_account_activity a on coalesce(a.site_layout,'unknown')=kind.layout
      group by kind.layout
    ) row_counts),
    'updated_at', now()
  ) into result;
  return result;
end;
$$;
revoke all on function public.droid_site_stats() from public, anon, authenticated;
grant execute on function public.droid_site_stats() to authenticated;
-- Download starts are separate from rolling site activity and retained for totals.
create table if not exists public.droid_companion_downloads (
  event_id uuid primary key,
  visitor_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  version text not null check (length(version) between 1 and 80),
  started_at timestamptz not null default now()
);
create index if not exists droid_companion_downloads_started on public.droid_companion_downloads(started_at);
alter table public.droid_companion_downloads enable row level security;
revoke all on public.droid_companion_downloads from public, anon, authenticated;

create or replace function public.droid_companion_download_start(event uuid, visitor uuid, release_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if event is null or visitor is null or release_version is null
    or release_version !~ '^[0-9][A-Za-z0-9._-]{0,79}$' then
    raise exception 'Valid download identifiers and version required';
  end if;
  insert into public.droid_companion_downloads(event_id,visitor_id,user_id,version)
  values(event,visitor,auth.uid(),release_version)
  on conflict(event_id) do nothing;
end;
$$;
revoke all on function public.droid_companion_download_start(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.droid_companion_download_start(uuid,uuid,text) to anon, authenticated;

create or replace function public.droid_companion_download_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from auth.users where id=auth.uid()
    and lower(email)='xraffo@gmail.com' and email_confirmed_at is not null and deleted_at is null) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'total', count(*), 'unique_browsers', count(distinct visitor_id),
    'unique_accounts', count(distinct user_id),
    'last_24h', count(*) filter(where started_at >= now()-interval '24 hours'),
    'last_7d', count(*) filter(where started_at >= now()-interval '7 days'),
    'first_recorded_at', min(started_at),
    'versions', (select coalesce(jsonb_agg(v order by v.last_started_at desc),'[]'::jsonb) from
      (select version, count(*) as total, count(distinct visitor_id) as unique_browsers,
       count(distinct user_id) as unique_accounts, max(started_at) as last_started_at
       from public.droid_companion_downloads group by version) v)
  ) into result from public.droid_companion_downloads;
  return result;
end;
$$;
revoke all on function public.droid_companion_download_stats() from public, anon, authenticated;
grant execute on function public.droid_companion_download_stats() to authenticated;
commit;
