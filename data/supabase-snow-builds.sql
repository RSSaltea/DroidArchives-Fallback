-- Run once in Supabase SQL Editor; safe to rerun. No visitor or account data.
begin;
create table if not exists public.droid_snow_builds (
 event_id uuid primary key,
 droid_name text not null,
 completed_at timestamptz not null,
 recorded_at timestamptz not null default now()
);
create index if not exists droid_snow_builds_completed on public.droid_snow_builds(completed_at);
alter table public.droid_snow_builds enable row level security;
revoke all on public.droid_snow_builds from public,anon,authenticated;
create or replace function public.droid_snow_build_complete(event uuid,droid_name text,completed_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if event is null or droid_name is null or not(droid_name=any(array['GONK','R7','BB','MOUSE','EG-58','EGL','ECG','PROTO-ROLLER','ORB-WALKER','SNOW MOUSE','TRI-TEK','CHOPPER','OPTI-POD']))
 or completed_at is null or completed_at>now()+interval '5 minutes' or completed_at<now()-interval '30 days' then
  raise exception 'Valid snow build required';
 end if;
 insert into public.droid_snow_builds(event_id,droid_name,completed_at) values(event,droid_name,completed_at) on conflict(event_id) do nothing;
end;
$$;
revoke all on function public.droid_snow_build_complete(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.droid_snow_build_complete(uuid,text,timestamptz) to anon,authenticated;
create or replace function public.droid_snow_build_stats()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('total',count(*),'today',count(*) filter(where (completed_at at time zone 'Europe/London')::date=(now() at time zone 'Europe/London')::date),
 'days',(select coalesce(jsonb_object_agg(day,total),'{}'::jsonb) from (
  select (completed_at at time zone 'Europe/London')::date as day,count(*) as total from public.droid_snow_builds
  where completed_at>=now()-interval '8 days' group by 1
 ) d),'updated_at',now()) from public.droid_snow_builds;
$$;
revoke all on function public.droid_snow_build_stats() from public,anon,authenticated;
grant execute on function public.droid_snow_build_stats() to anon,authenticated;
commit;
