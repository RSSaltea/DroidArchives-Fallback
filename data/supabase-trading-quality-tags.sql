-- Add fixed quality tags without changing existing listings.
begin;
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

commit;
