-- Add active-any-colour Kyber requests; exact offers still require a real variant.
begin;
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


create or replace function public.droid_trade_receipts() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'items',case when l.owner_id=auth.uid() then public.droid_trade_items(o.droid) else
 (select coalesce(jsonb_agg(public.droid_trade_items(l.giving)->i),'[]'::jsonb) from unnest(o.receiving) i) end)),'[]'::jsonb)
 from public.droid_trade_offers o join public.droid_trade_listings l on l.id=o.listing_id
 where o.status='completed' and auth.uid() in (l.owner_id,o.user_id);
$$;
revoke all on function public.droid_trade_receipts() from public,anon,authenticated;
grant execute on function public.droid_trade_receipts() to authenticated;

commit;
