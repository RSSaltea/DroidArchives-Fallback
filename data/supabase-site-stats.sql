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
alter table public.droid_site_visitors enable row level security;
alter table public.droid_site_account_activity enable row level security;
revoke all on public.droid_site_visitors, public.droid_site_account_activity from public, anon, authenticated;

create or replace function public.droid_site_heartbeat(visitor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if visitor is null then raise exception 'Visitor identifier required'; end if;
  insert into public.droid_site_visitors(visitor_id,user_id,last_seen)
  values(visitor,auth.uid(),now())
  on conflict(visitor_id) do update set user_id=excluded.user_id,last_seen=excluded.last_seen
  where droid_site_visitors.last_seen < now()-interval '30 seconds'
     or droid_site_visitors.user_id is distinct from excluded.user_id;
  if auth.uid() is not null then
    insert into public.droid_site_account_activity(user_id,last_seen) values(auth.uid(),now())
    on conflict(user_id) do update set last_seen=excluded.last_seen
    where droid_site_account_activity.last_seen < now()-interval '30 seconds';
  end if;
end;
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
    'accounts_24h', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '24 hours'),
    'accounts_7d', (select count(*) from public.droid_site_account_activity where last_seen >= now()-interval '7 days'),
    'browsers_now', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '5 minutes'),
    'browsers_24h', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '24 hours'),
    'browsers_7d', (select count(*) from public.droid_site_visitors where last_seen >= now()-interval '7 days'),
    'updated_at', now()
  ) into result;
  return result;
end;
$$;
revoke all on function public.droid_site_stats() from public, anon, authenticated;
grant execute on function public.droid_site_stats() to authenticated;
commit;
