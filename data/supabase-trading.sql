-- Private, durable outbox for the Droid Archives trade RPCs.
-- Trade mutations must insert a server-generated snapshot in the same transaction.
-- No browser may write directly or choose a Discord destination.
begin;
create table if not exists public.droid_trade_audit (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null,
 offer_id uuid,
 event_type text not null check(event_type in ('listing_opened','offer_made','offer_accepted','offer_declined','offer_withdrawn','chat_message','trade_cancelled','completion_confirmed','trade_completed','listing_closed')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=500000),
 guild_id text not null default '1458242062599323803' check(guild_id='1458242062599323803'),
 channel_id text not null default '1568574761720619089' check(channel_id='1568574761720619089'),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 discord_message_id text,
 claim_token uuid,
 claim_until timestamptz,
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 last_error text
);
create index if not exists droid_trade_audit_pending on public.droid_trade_audit(next_attempt_at,created_at) where delivered_at is null;
create index if not exists droid_trade_audit_listing on public.droid_trade_audit(listing_id,created_at);
alter table public.droid_trade_audit enable row level security;
revoke all on public.droid_trade_audit from public,anon,authenticated;
grant all on public.droid_trade_audit to service_role;
create or replace function public.claim_droid_trade_audit()
returns setof public.droid_trade_audit language sql security definer set search_path='' as $$
 update public.droid_trade_audit a set claim_token=gen_random_uuid(),claim_until=now()+interval '5 minutes',attempts=attempts+1
 where a.id=(select id from public.droid_trade_audit
  where delivered_at is null and next_attempt_at<=now() and (claim_until is null or claim_until<now())
  order by created_at,id for update skip locked limit 1)
 returning a.*;
$$;
create or replace function public.finish_droid_trade_audit(event_id uuid,lease_token uuid,message_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if message_id is null or message_id !~ '^[0-9]{17,20}$' then raise exception 'Invalid message ID'; end if;
 update public.droid_trade_audit set delivered_at=now(),discord_message_id=message_id,claim_until=null,claim_token=null,last_error=null
 where id=event_id and claim_token=lease_token and claim_until>now() and delivered_at is null;
 return found;
end;
$$;
create or replace function public.retry_droid_trade_audit(event_id uuid,lease_token uuid,error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.droid_trade_audit set claim_until=null,claim_token=null,
 next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::double precision),last_error=left(error_code,120)
 where id=event_id and claim_token=lease_token and delivered_at is null;
 return found;
end;
$$;
revoke all on function public.claim_droid_trade_audit() from public,anon,authenticated;
revoke all on function public.finish_droid_trade_audit(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.retry_droid_trade_audit(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_droid_trade_audit() to service_role;
grant execute on function public.finish_droid_trade_audit(uuid,uuid,text) to service_role;
grant execute on function public.retry_droid_trade_audit(uuid,uuid,text) to service_role;
commit;

begin;
create table if not exists public.droid_trade_catalogue(name text primary key, definition jsonb not null);
create table if not exists public.droid_trade_traits(id integer primary key, definition jsonb not null);
create table if not exists public.droid_trade_listings(
 id uuid primary key, owner_id uuid not null references auth.users(id), epic_name text not null,
 criteria jsonb not null, giving jsonb, tags text[] not null default '{}',
 status text not null default 'open' check(status in ('open','accepted','completed','closed')),
 accepted_offer uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.droid_trade_offers(
 id uuid primary key, listing_id uuid not null references public.droid_trade_listings(id),
 user_id uuid not null references auth.users(id), epic_name text not null, droid jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn','cancelled','completed')),
 owner_confirmed boolean not null default false, offerer_confirmed boolean not null default false,
 accepted_at timestamptz, created_at timestamptz not null default now()
);
alter table public.droid_trade_listings add column if not exists multiple boolean not null default false;
alter table public.droid_trade_offers add column if not exists receiving integer[] not null default '{}';
create unique index if not exists droid_trade_one_active_offer on public.droid_trade_offers(listing_id,user_id) where status in ('pending','accepted');
create table if not exists public.droid_trade_messages(
 id uuid primary key, offer_id uuid not null references public.droid_trade_offers(id),
 user_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 1000), created_at timestamptz not null default now()
);
create index if not exists droid_trade_listing_time on public.droid_trade_listings(created_at desc);
create index if not exists droid_trade_offer_listing on public.droid_trade_offers(listing_id,created_at);
create index if not exists droid_trade_message_offer on public.droid_trade_messages(offer_id,created_at);
alter table public.droid_trade_catalogue enable row level security;
alter table public.droid_trade_traits enable row level security;
alter table public.droid_trade_listings enable row level security;
alter table public.droid_trade_offers enable row level security;
alter table public.droid_trade_messages enable row level security;
revoke all on public.droid_trade_catalogue,public.droid_trade_traits,public.droid_trade_listings,public.droid_trade_offers,public.droid_trade_messages from public,anon,authenticated;
grant all on public.droid_trade_catalogue,public.droid_trade_traits,public.droid_trade_listings,public.droid_trade_offers,public.droid_trade_messages to service_role;

create or replace function public.droid_trade_actor() returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false)) then raise exception 'Sign in with a confirmed account to trade.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,138));
 return actor;
end;$$;
create or replace function public.droid_trade_validate(value jsonb, exact boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; t jsonb; k text; variants text[]:=array['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER','KYBER_ACTIVE','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE','SCOURGE'];
begin
 if value is null or jsonb_typeof(value)<>'object' then raise exception 'Choose a droid or trait.'; end if;
 for k in select jsonb_object_keys(value) loop
  if k<>all(array['name','type','rarity','variant','minimum','trait','traitTier']) then raise exception 'Unknown trade field.'; end if;
 end loop;
 if exact and (coalesce(value->>'name','')='' or coalesce(value->>'variant','')='') then raise exception 'Offer a specific droid and variant.'; end if;
 if coalesce(value->>'name','')<>'' then
  select definition into d from public.droid_trade_catalogue where name=value->>'name';
  if d is null or d->>'rarity'='ICONIC' then raise exception 'Choose a tradable droid. Iconics cannot be traded.'; end if;
  value:=value||jsonb_build_object('type',d->>'type','rarity',d->>'rarity');
 end if;
 if coalesce(value->>'type','')<>'' and (value->>'type')<>all(array['ASTROMECH','BATTLE','WORKER','PROTOCOL']) then raise exception 'Invalid class.'; end if;
 if coalesce(value->>'rarity','')<>'' and (value->>'rarity')<>all(array['COMMON','RARE','EPIC','LEGENDARY','MYTHIC']) then raise exception 'Invalid rarity.'; end if;
 if coalesce(value->>'variant','')<>'' and not(value->>'variant'=any(variants)) then raise exception 'Invalid variant.'; end if;
 if exact and not((d->'variants') ? (value->>'variant')) then raise exception 'This droid does not have that variant.'; end if;
 if value ? 'minimum' and jsonb_typeof(value->'minimum')<>'boolean' then raise exception 'Invalid variant comparison.'; end if;
 if coalesce(value->>'trait','')<>'' then
  select definition into t from public.droid_trade_traits where id::text=value->>'trait';
  if t is null then raise exception 'Invalid trait.'; end if;
  if jsonb_array_length(t->'exclusive_droids')>0 then raise exception 'Iconic-exclusive traits cannot be traded.'; end if;
  if coalesce(value->>'traitTier','')<>'' and not((t->'values') ? (value->>'traitTier')) then raise exception 'Invalid trait tier.'; end if;
  if exact and coalesce(value->>'traitTier','')='' then raise exception 'Choose the trait tier.'; end if;
 elsif coalesce(value->>'traitTier','')<>'' then raise exception 'Choose a trait first.';
 end if;
 if not exact and coalesce(value->>'name','')='' and coalesce(value->>'trait','')='' and coalesce(value->>'type','')='' then raise exception 'Choose a droid, trait or class.'; end if;
 return value;
end;$$;

create or replace function public.droid_trade_matches(wanted jsonb,offered jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; w text:=wanted->>'variant'; o text:=offered->>'variant'; ranks text[]:=array['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER','KYBER_ACTIVE','SCOURGE'];
begin
 foreach k in array array['name','type','rarity','trait','traitTier'] loop
  if coalesce(wanted->>k,'')<>'' and wanted->>k is distinct from offered->>k then return false; end if;
 end loop;
 if coalesce(w,'')='' then return true; end if;
 if w=o or (w='KYBER_ACTIVE' and o=any(array['KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE'])) then return true; end if;
 if not coalesce((wanted->>'minimum')::boolean,false) then return false; end if;
 if w=any(array['KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']) then w:='KYBER_ACTIVE'; end if;
 if o=any(array['KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']) then o:='KYBER_ACTIVE'; end if;
 return coalesce(array_position(ranks,o)>array_position(ranks,w),false);
end;$$;

create or replace function public.droid_trade_items(value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when value is null then '[]'::jsonb when jsonb_typeof(value)='array' then value else jsonb_build_array(value) end;
$$;
-- Preserve original single-droid listings and the droid agreed in their offers.
update public.droid_trade_offers o set receiving=(select coalesce(array_agg(n),'{}'::integer[]) from generate_series(0,jsonb_array_length(public.droid_trade_items(l.giving))-1) n),droid=public.droid_trade_items(o.droid)
 from public.droid_trade_listings l where l.id=o.listing_id and jsonb_typeof(o.droid)<>'array';
update public.droid_trade_listings set criteria=public.droid_trade_items(criteria),giving=public.droid_trade_items(giving) where jsonb_typeof(criteria)<>'array' or giving is null or jsonb_typeof(giving)<>'array';
create or replace function public.droid_trade_validate_items(value jsonb,exact boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'; item jsonb;
begin
 value:=public.droid_trade_items(value);
 if jsonb_array_length(value)>12 then raise exception 'Choose up to 12 droids or wants.'; end if;
 for item in select * from jsonb_array_elements(value) loop result:=result||jsonb_build_array(public.droid_trade_validate(item,exact)); end loop;
 return result;
end;$$;
create or replace function public.droid_trade_owner_badge(actor uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=actor and lower(email)='xraffo@gmail.com' and email_confirmed_at is not null and deleted_at is null);
$$;
create or replace function public.droid_trade_taken(listing uuid) returns integer[] language sql security definer set search_path='' as $$
 select coalesce(array_agg(distinct n),'{}'::integer[]) from public.droid_trade_offers o cross join lateral unnest(o.receiving) n where o.listing_id=listing and o.status in ('accepted','completed');
$$;
create or replace function public.droid_trade_audit_items(value jsonb) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(item||jsonb_build_object('traitName',(select definition->>'name' from public.droid_trade_traits where id::text=item->>'trait'))),'[]'::jsonb) from jsonb_array_elements(public.droid_trade_items(value)) item;
$$;
create or replace function public.droid_trade_log(listing uuid,offer uuid,kind text,extra jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path='' as $$
declare l public.droid_trade_listings; o public.droid_trade_offers;
begin
 select * into strict l from public.droid_trade_listings where id=listing;
 select * into o from public.droid_trade_offers where id=offer and listing_id=listing;
 insert into public.droid_trade_audit(listing_id,offer_id,event_type,payload) values(listing,offer,kind,
 jsonb_build_object('owner_id',l.owner_id,'owner_epic_name',l.epic_name,'owner_badge',public.droid_trade_owner_badge(l.owner_id),'offerer_id',o.user_id,'offerer_epic_name',o.epic_name,'offerer_badge',public.droid_trade_owner_badge(o.user_id),'requested',public.droid_trade_audit_items(l.criteria),'listing_offering',public.droid_trade_audit_items(l.giving),'owner_droid',public.droid_trade_audit_items(case when o.id is null then l.giving else (select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(public.droid_trade_items(l.giving)) with ordinality a(item,n) where (n-1)::integer=any(o.receiving)) end),'receiving_indices',o.receiving,'offered',public.droid_trade_audit_items(o.droid),'multiple',l.multiple,'tags',l.tags,'status',l.status)||extra);
end;$$;

drop function if exists public.droid_trade_create(uuid,text,jsonb,text[],boolean,jsonb);
create or replace function public.droid_trade_create(request_id uuid,epic_name text,criteria jsonb,tags text[],consent boolean,giving jsonb default null,multiple boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.droid_trade_actor(); old public.droid_trade_listings; clean jsonb;
begin
 if consent is distinct from true then raise exception 'Agree to private staff recording of names, droids and chat.'; end if;
 if request_id is null or epic_name is null or length(btrim(epic_name)) not between 3 and 32 then raise exception 'Enter your Epic display name (3â€“32 characters).'; end if;
 select * into old from public.droid_trade_listings where id=request_id;
 if found then if old.owner_id<>actor then raise exception 'Invalid listing.'; end if; return old.id; end if;
 if (select count(*) from public.droid_trade_listings where owner_id=actor and status in ('open','accepted'))>=10 then raise exception 'You can have up to 10 active listings.'; end if;
 if exists(select 1 from public.droid_trade_listings where owner_id=actor and created_at>now()-interval '10 seconds') then raise exception 'Wait a few seconds before creating another listing.'; end if;
 if tags is null or cardinality(tags)>4 or array_position(tags,null) is not null or not(tags<@array['Free','Trade','Trait Wanted','Same Class','VARIANT_DEFAULT_PLUS','VARIANT_GOLD_PLUS','VARIANT_DIAMOND_PLUS','VARIANT_RAINBOW_PLUS','VARIANT_BESKAR_PLUS','VARIANT_GALACTIC_PLUS','VARIANT_STELLAR_PLUS','VARIANT_KYBER_PLUS','VARIANT_SCOURGE','ASTROMECH_SWAP','BATTLE_SWAP','WORKER_SWAP','PROTOCOL_SWAP']) then raise exception 'Choose up to four fixed tags.'; end if;
 clean:=public.droid_trade_validate_items(criteria,false);
 giving:=public.droid_trade_validate_items(giving,true);
 if jsonb_array_length(clean)=0 and jsonb_array_length(giving)=0 then raise exception 'Add a droid you offer or something you want.'; end if;
 insert into public.droid_trade_listings(id,owner_id,epic_name,criteria,tags,giving,multiple) values(request_id,actor,btrim(epic_name),clean,tags,giving,coalesce(multiple,false));
 perform public.droid_trade_log(request_id,null,'listing_opened');
 return request_id;
end;$$;

drop function if exists public.droid_trade_offer(uuid,uuid,text,jsonb,boolean);
create or replace function public.droid_trade_offer(request_id uuid,listing uuid,epic_name text,droid jsonb,consent boolean,receiving integer[] default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.droid_trade_actor(); l public.droid_trade_listings; old public.droid_trade_offers; clean jsonb;
begin
 if consent is distinct from true then raise exception 'Agree to private staff recording of names, droids and chat.'; end if;
 if request_id is null or epic_name is null or length(btrim(epic_name)) not between 3 and 32 then raise exception 'Enter your Epic display name (3â€“32 characters).'; end if;
 select * into l from public.droid_trade_listings where id=listing for update;
 if not found or l.owner_id=actor then raise exception 'Choose another playerâ€™s listing.'; end if;
 select * into old from public.droid_trade_offers where id=request_id;
 if found then if old.user_id<>actor or old.listing_id<>listing then raise exception 'Invalid offer.'; end if; return old.id; end if;
 if l.status<>'open' then raise exception 'This listing is no longer open.'; end if;
 if (select count(*) from public.droid_trade_offers where user_id=actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Offer limit reached. Try again later.'; end if;
 if (select count(*) from public.droid_trade_offers where listing_id=listing and status='pending')>=30 then raise exception 'This listing already has 30 pending offers.'; end if;
 clean:=public.droid_trade_validate_items(droid,true);
 if jsonb_array_length(public.droid_trade_items(l.criteria))>0 then
  if jsonb_array_length(clean)=0 or exists(select 1 from jsonb_array_elements(clean) c where not exists(select 1 from jsonb_array_elements(public.droid_trade_items(l.criteria)) w where public.droid_trade_matches(w,c))) then raise exception 'Choose droids that match at least one wanted droid or trait.'; end if;
 end if;
 if receiving is null then select coalesce(array_agg(n),'{}'::integer[]) into receiving from generate_series(0,jsonb_array_length(public.droid_trade_items(l.giving))-1) n; end if;
 if cardinality(receiving)>12 or array_position(receiving,null) is not null or cardinality(receiving)<>(select count(distinct n) from unnest(receiving) n) or exists(select 1 from unnest(receiving) n where n<0 or n>=jsonb_array_length(public.droid_trade_items(l.giving))) then raise exception 'Choose valid droids from this listing.'; end if;
 if receiving && public.droid_trade_taken(listing) then raise exception 'One of those droids is already reserved or traded.'; end if;
 if jsonb_array_length(clean)=0 and cardinality(receiving)=0 then raise exception 'Select the droid you want to receive.'; end if;
 insert into public.droid_trade_offers(id,listing_id,user_id,epic_name,droid,receiving) values(request_id,listing,actor,btrim(epic_name),clean,receiving);
 perform public.droid_trade_log(listing,request_id,'offer_made');
 return request_id;
end;$$;

create or replace function public.droid_trade_action(offer uuid,action text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.droid_trade_actor(); l public.droid_trade_listings; o public.droid_trade_offers; target uuid; kind text;
begin
 select listing_id into target from public.droid_trade_offers where id=offer;
 select * into l from public.droid_trade_listings where id=target for update;
 select * into o from public.droid_trade_offers where id=offer for update;
 if o.id is null or actor not in (l.owner_id,o.user_id) then raise exception 'Offer unavailable.' using errcode='42501'; end if;
 if action='accept' then
  if actor<>l.owner_id then raise exception 'Only the listing owner can accept.'; end if;
  if o.status='accepted' then return; end if;
  if o.status<>'pending' or l.status<>'open' then raise exception 'Offer is no longer available.'; end if;
  if o.receiving && public.droid_trade_taken(target) then raise exception 'One of those droids is already reserved or traded.'; end if;
  update public.droid_trade_offers set status='accepted',accepted_at=now() where id=offer;
  update public.droid_trade_listings set status=case when multiple then 'open' else 'accepted' end,accepted_offer=case when multiple then null else offer end,updated_at=now() where id=target;
  kind:='offer_accepted';
 elsif action in ('decline','withdraw') then
  if action='decline' and actor<>l.owner_id or action='withdraw' and actor<>o.user_id then raise exception 'Action not allowed.'; end if;
  if o.status<>'pending' then raise exception 'Offer is no longer pending.'; end if;
  update public.droid_trade_offers set status=case when action='decline' then 'declined' else 'withdrawn' end where id=offer;
  kind:=case when action='decline' then 'offer_declined' else 'offer_withdrawn' end;
 elsif action='cancel' then
  if o.status='cancelled' then return; end if;
  if o.status<>'accepted' or (not l.multiple and l.accepted_offer is distinct from offer) then raise exception 'Only an accepted trade can be cancelled.'; end if;
  update public.droid_trade_offers set status='cancelled' where id=offer;
  update public.droid_trade_listings set status=case when status='closed' then 'closed' else 'open' end,accepted_offer=null,updated_at=now() where id=target;
  kind:='trade_cancelled';
 elsif action='complete' then
  if o.status='completed' then return; end if;
  if o.status<>'accepted' then raise exception 'Accept the offer first.'; end if;
  if actor=l.owner_id and o.owner_confirmed or actor=o.user_id and o.offerer_confirmed then return; end if;
  update public.droid_trade_offers set owner_confirmed=owner_confirmed or actor=l.owner_id,offerer_confirmed=offerer_confirmed or actor=o.user_id where id=offer returning * into o;
  kind:='completion_confirmed';
  if o.owner_confirmed and o.offerer_confirmed then
   update public.droid_trade_offers set status='completed' where id=offer;
   update public.droid_trade_listings set status=case when multiple then status else 'completed' end,updated_at=now() where id=target;
   kind:='trade_completed';
  end if;
 else raise exception 'Unknown trade action.'; end if;
 perform public.droid_trade_log(target,offer,kind,jsonb_build_object('actor_id',actor));
end;$$;

create or replace function public.droid_trade_chat(request_id uuid,offer uuid,message text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.droid_trade_actor(); l public.droid_trade_listings; o public.droid_trade_offers; old public.droid_trade_messages;
begin
 select * into o from public.droid_trade_offers where id=offer;
 select * into l from public.droid_trade_listings where id=o.listing_id for update;
 select * into o from public.droid_trade_offers where id=offer;
 if o.id is null or actor not in (l.owner_id,o.user_id) then raise exception 'Chat unavailable.' using errcode='42501'; end if;
 select * into old from public.droid_trade_messages where id=request_id;
 if found then if old.user_id<>actor or old.offer_id<>offer then raise exception 'Invalid message.'; end if; return; end if;
 if o.status<>'accepted' then raise exception 'Chat opens after acceptance and closes when the trade ends.'; end if;
 if message is null or length(btrim(message)) not between 1 and 1000 or request_id is null then raise exception 'Enter a message of 1â€“1,000 characters.'; end if;
 if (select count(*) from public.droid_trade_messages where user_id=actor and created_at>now()-interval '1 minute')>=20 then raise exception 'Please slow down before sending more messages.'; end if;
 if (select count(*) from public.droid_trade_messages where offer_id=offer)>=500 then raise exception 'Conversation limit reached.'; end if;
 insert into public.droid_trade_messages values(request_id,offer,actor,btrim(message),now());
 perform public.droid_trade_log(l.id,offer,'chat_message',jsonb_build_object('chat',jsonb_build_object('id',request_id,'sender_id',actor,'text',btrim(message),'sent_at',now())));
end;$$;

create or replace function public.droid_trade_close(listing uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.droid_trade_actor(); l public.droid_trade_listings;
begin
 select * into l from public.droid_trade_listings where id=listing for update;
 if l.id is null or l.owner_id<>actor then raise exception 'Listing unavailable.'; end if;
 if l.status='closed' then return; end if;
 if l.status<>'open' then raise exception 'Cancel the accepted trade first.'; end if;
 update public.droid_trade_listings set status='closed',updated_at=now() where id=listing;
 perform public.droid_trade_log(listing,null,'listing_closed');
end;$$;

create or replace function public.droid_trade_browse() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(row order by created_at desc),'[]'::jsonb) from (
 select l.created_at,jsonb_build_object('id',l.id,'criteria',public.droid_trade_items(l.criteria),'giving',public.droid_trade_items(l.giving),'multiple',l.multiple,'owner_badge',public.droid_trade_owner_badge(l.owner_id),'taken',public.droid_trade_taken(l.id),'tags',l.tags,'status',l.status,'created_at',l.created_at,'mine',coalesce(l.owner_id=auth.uid(),false),
 'involved',exists(select 1 from public.droid_trade_offers o where o.listing_id=l.id and o.user_id=auth.uid())) row
 from public.droid_trade_listings l where l.status in ('open','accepted') or l.owner_id=auth.uid() or exists(select 1 from public.droid_trade_offers o where o.listing_id=l.id and o.user_id=auth.uid())
 order by l.created_at desc limit 200) rows;
$$;
create or replace function public.droid_trade_detail(listing uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); l public.droid_trade_listings; offers jsonb;
begin
 select * into l from public.droid_trade_listings where id=listing;
 if not found then raise exception 'Listing unavailable.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'droid',public.droid_trade_items(o.droid),'receiving',o.receiving,'owner_badge',public.droid_trade_owner_badge(o.user_id),'status',o.status,'mine',o.user_id=actor,'owner_confirmed',o.owner_confirmed,'offerer_confirmed',o.offerer_confirmed,
 'owner_epic_name',case when o.accepted_at is not null then l.epic_name else null end,
 'offerer_epic_name',case when o.accepted_at is not null then o.epic_name else null end,
 'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'mine',m.user_id=actor,'sender',case when m.user_id=l.owner_id then l.epic_name else o.epic_name end,'created_at',m.created_at) order by m.created_at,m.id),'[]'::jsonb) from public.droid_trade_messages m where m.offer_id=o.id)) order by o.created_at desc),'[]'::jsonb)
 into offers from public.droid_trade_offers o where o.listing_id=listing and actor in (l.owner_id,o.user_id);
 return jsonb_build_object('id',l.id,'criteria',public.droid_trade_items(l.criteria),'giving',public.droid_trade_items(l.giving),'multiple',l.multiple,'owner_badge',public.droid_trade_owner_badge(l.owner_id),'taken',public.droid_trade_taken(l.id),'tags',l.tags,'status',l.status,'mine',coalesce(l.owner_id=actor,false),'offers',offers);
end;$$;

revoke all on function public.droid_trade_items(jsonb),public.droid_trade_validate_items(jsonb,boolean),public.droid_trade_owner_badge(uuid),public.droid_trade_taken(uuid),public.droid_trade_audit_items(jsonb) from public,anon,authenticated;
revoke all on function public.droid_trade_actor(),public.droid_trade_validate(jsonb,boolean),public.droid_trade_matches(jsonb,jsonb),public.droid_trade_log(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.droid_trade_create(uuid,text,jsonb,text[],boolean,jsonb,boolean),public.droid_trade_offer(uuid,uuid,text,jsonb,boolean,integer[]),public.droid_trade_action(uuid,text),public.droid_trade_chat(uuid,uuid,text),public.droid_trade_close(uuid),public.droid_trade_browse(),public.droid_trade_detail(uuid) from public,anon,authenticated;
grant execute on function public.droid_trade_create(uuid,text,jsonb,text[],boolean,jsonb,boolean),public.droid_trade_offer(uuid,uuid,text,jsonb,boolean,integer[]),public.droid_trade_action(uuid,text),public.droid_trade_chat(uuid,uuid,text),public.droid_trade_close(uuid),public.droid_trade_browse(),public.droid_trade_detail(uuid) to authenticated;
grant execute on function public.droid_trade_browse(),public.droid_trade_detail(uuid) to anon;
create or replace function public.droid_trade_receipts() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'items',case when l.owner_id=auth.uid() then public.droid_trade_items(o.droid) else
 (select coalesce(jsonb_agg(public.droid_trade_items(l.giving)->i),'[]'::jsonb) from unnest(o.receiving) i) end)),'[]'::jsonb)
 from public.droid_trade_offers o join public.droid_trade_listings l on l.id=o.listing_id
 where o.status='completed' and auth.uid() in (l.owner_id,o.user_id);
$$;
revoke all on function public.droid_trade_receipts() from public,anon,authenticated;
grant execute on function public.droid_trade_receipts() to authenticated;

commit;

