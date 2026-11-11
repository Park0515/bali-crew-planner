-- Existing projects: run this file once in the Supabase SQL Editor.
-- Keeps existing travel data. With more than one trip, stops without changes.
begin;
lock table public.trips in share row exclusive mode;

create table if not exists private.bali_workspace (
  singleton boolean primary key default true check(singleton),
  trip_id uuid not null unique references public.trips(id)
);
revoke all on private.bali_workspace from public,anon,authenticated;

do $$
declare v_trip uuid; v_owner uuid; v_count integer;
begin
  select trip_id into v_trip from private.bali_workspace where singleton;
  if v_trip is null then
    select count(*) into v_count from public.trips;
    if v_count>1 then
      raise exception 'More than one trip exists. Choose the Bali trip before migrating; no data was changed.';
    elsif v_count=1 then
      select id into v_trip from public.trips;
    else
      select id into v_owner from auth.users
      where email_confirmed_at is not null and not coalesce(is_anonymous,false)
      order by created_at,id limit 1;
      if v_owner is null then
        raise exception 'Create at least one confirmed ID/password account before running this script.';
      end if;
      -- Initial placeholder dates match the original planner; edit in trip settings.
      insert into public.trips(title,start_date,end_date,owner_id)
      values('우리의 발리 여행','2027-09-01','2027-09-21',v_owner)
      returning id into v_trip;
    end if;
    insert into private.bali_workspace(singleton,trip_id) values(true,v_trip);
  end if;
end $$;

-- Access is based on a confirmed, non-anonymous account, not an invitation.
-- Anonymous/public-key-only visitors still cannot access travel data.
create or replace function private.is_crew_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from private.bali_workspace w
    join auth.users u on u.id=(select auth.uid())
    where w.singleton and w.trip_id=p_trip_id
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  );
$$;
revoke all on function private.is_crew_member(uuid) from public,anon;
grant execute on function private.is_crew_member(uuid) to authenticated;

-- Remove the old multi-trip API entry points; keep stored data intact.
revoke all on function public.create_crew_trip(text,text,date,date) from public,anon,authenticated;
revoke all on function public.join_crew_trip(text,text) from public,anon,authenticated;

commit;

select 'Single Bali workspace ready' as result,t.title,t.start_date,t.end_date
from private.bali_workspace w join public.trips t on t.id=w.trip_id;
