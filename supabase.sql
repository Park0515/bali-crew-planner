-- BALI TOGETHER / Supabase SQL Editor에 전체 실행 (새 프로젝트 권장)
-- Database + Auth RLS + invite-only workspace + realtime.
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.trips (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 80),
 start_date date not null, end_date date not null, owner_id uuid not null references auth.users(id),
 invite_code text not null unique default encode(gen_random_bytes(12),'hex'),
 created_at timestamptz not null default now(),
 constraint trips_range check(end_date>=start_date and end_date<=start_date+92)
);
create table if not exists public.trip_members (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null, name text not null check(length(name) between 1 and 30),
 starts_on date not null, ends_on date not null, role text not null default 'member' check(role in ('organizer','member')),
 created_at timestamptz not null default now(), check(ends_on>=starts_on), unique(trip_id,id)
);
create unique index if not exists unique_crew_login on public.trip_members(trip_id,user_id) where user_id is not null;
create index if not exists ix_members_trip on public.trip_members(trip_id);
create table if not exists public.trip_events (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 date date not null, time text, title text not null, category text not null default 'activity', area text,
 note text, status text not null default 'idea' check(status in ('idea','booked')),
 created_at timestamptz not null default now()
);
create index if not exists ix_events_tripdate on public.trip_events(trip_id,date);
create table if not exists public.watch_items (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 kind text not null check(kind in ('flight','stay')), label text not null, provider text, url text,
 origin text, dest text, depart_on date, return_on date, nonstop boolean not null default true,
 checkin_on date, checkout_on date, amadeus_hotel_id text,
 adults integer not null default 1 check(adults between 1 and 9), rooms integer not null default 1 check(rooms between 1 and 9),
 currency text not null default 'KRW' check(currency='KRW'),target_price bigint check(target_price>=0),
 is_active boolean not null default true,note text,created_at timestamptz not null default now(),unique(trip_id,id)
);
create index if not exists ix_watches_trip on public.watch_items(trip_id);
create table if not exists public.price_quotes (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 watch_id uuid not null, price bigint not null check(price>0),currency text not null default 'KRW' check(currency='KRW'),
 observed_at timestamptz not null default now(),provider text,summary text,
 constraint quotes_own_watch foreign key(trip_id,watch_id) references public.watch_items(trip_id,id) on delete cascade
);
create index if not exists ix_quotes_watchdate on public.price_quotes(watch_id,observed_at);
create table if not exists public.trip_expenses (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null,amount bigint not null check(amount>0),expense_date date not null,
 payer_id uuid,split_rule text not null default 'present' check(split_rule in ('present','nights','custom')),
 participant_ids uuid[] not null default '{}',from_date date,to_date date,note text,created_at timestamptz not null default now(),
 foreign key(trip_id,payer_id) references public.trip_members(trip_id,id) on delete set null (payer_id)
);
create index if not exists ix_expenses_trip on public.trip_expenses(trip_id);

-- Private membership checks avoid recursive RLS queries.
create or replace function private.is_crew_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=(select auth.uid())); $$;
create or replace function private.is_crew_owner(p_trip_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.trips where id=p_trip_id and owner_id=(select auth.uid())); $$;
revoke all on function private.is_crew_member(uuid) from public,anon;
revoke all on function private.is_crew_owner(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_crew_member(uuid),private.is_crew_owner(uuid) to authenticated;

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_events enable row level security;
alter table public.watch_items enable row level security;
alter table public.price_quotes enable row level security;
alter table public.trip_expenses enable row level security;

-- Trips are visible only to existing authenticated members.
create policy "crew_read_trips" on public.trips for select to authenticated using (private.is_crew_member(id));
create policy "owner_edit_trips" on public.trips for update to authenticated using (owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "crew_read_members" on public.trip_members for select to authenticated using (private.is_crew_member(trip_id));
create policy "crew_add_placeholder_members" on public.trip_members for insert to authenticated
 with check(private.is_crew_member(trip_id) and user_id is null and role='member');
create policy "crew_edit_members" on public.trip_members for update to authenticated
 using(private.is_crew_member(trip_id)) with check(private.is_crew_member(trip_id));
create policy "owner_remove_members" on public.trip_members for delete to authenticated using(private.is_crew_owner(trip_id) and role<>'organizer');

-- Forbid a profile edit from altering the authorization fields.
create or replace function private.protect_member_identity() returns trigger language plpgsql set search_path=''
as $$ begin
 if new.trip_id is distinct from old.trip_id or new.user_id is distinct from old.user_id or new.role is distinct from old.role then
  raise exception 'Member authorization fields cannot be edited';
 end if;
 return new;
end $$;
drop trigger if exists trg_protect_crew_member on public.trip_members;
create trigger trg_protect_crew_member before update on public.trip_members for each row execute function private.protect_member_identity();

create policy "crew_read_events" on public.trip_events for select to authenticated using(private.is_crew_member(trip_id));
create policy "crew_add_events" on public.trip_events for insert to authenticated with check(private.is_crew_member(trip_id));
create policy "crew_edit_events" on public.trip_events for update to authenticated using(private.is_crew_member(trip_id)) with check(private.is_crew_member(trip_id));
create policy "crew_delete_events" on public.trip_events for delete to authenticated using(private.is_crew_member(trip_id));
create policy "crew_read_watches" on public.watch_items for select to authenticated using(private.is_crew_member(trip_id));
create policy "crew_add_watches" on public.watch_items for insert to authenticated with check(private.is_crew_member(trip_id));
create policy "crew_edit_watches" on public.watch_items for update to authenticated using(private.is_crew_member(trip_id)) with check(private.is_crew_member(trip_id));
create policy "crew_delete_watches" on public.watch_items for delete to authenticated using(private.is_crew_member(trip_id));
create policy "crew_read_quotes" on public.price_quotes for select to authenticated using(private.is_crew_member(trip_id));
create policy "crew_add_quotes" on public.price_quotes for insert to authenticated with check(private.is_crew_member(trip_id));
create policy "crew_edit_quotes" on public.price_quotes for update to authenticated using(private.is_crew_member(trip_id)) with check(private.is_crew_member(trip_id));
create policy "crew_delete_quotes" on public.price_quotes for delete to authenticated using(private.is_crew_member(trip_id));
create policy "crew_read_expenses" on public.trip_expenses for select to authenticated using(private.is_crew_member(trip_id));
create policy "crew_add_expenses" on public.trip_expenses for insert to authenticated with check(private.is_crew_member(trip_id));
create policy "crew_edit_expenses" on public.trip_expenses for update to authenticated using(private.is_crew_member(trip_id)) with check(private.is_crew_member(trip_id));
create policy "crew_delete_expenses" on public.trip_expenses for delete to authenticated using(private.is_crew_member(trip_id));

-- Only authenticated users may create/join via these strictly scoped RPCs.
create or replace function public.create_crew_trip(p_title text,p_name text,p_start_date date,p_end_date date)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_trip uuid; begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if length(trim(p_title)) not between 1 and 80 or length(trim(p_name)) not between 1 and 30 then raise exception 'Invalid name'; end if;
 if p_end_date<p_start_date or p_end_date>p_start_date+92 then raise exception 'Invalid trip dates'; end if;
 insert into public.trips(title,owner_id,start_date,end_date) values(trim(p_title),auth.uid(),p_start_date,p_end_date) returning id into v_trip;
 insert into public.trip_members(trip_id,user_id,name,starts_on,ends_on,role) values(v_trip,auth.uid(),trim(p_name),p_start_date,p_end_date,'organizer');
 return v_trip;
end $$;
create or replace function public.join_crew_trip(p_invite_code text,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_trip public.trips%rowtype; begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if length(trim(p_name)) not between 1 and 30 then raise exception 'Invalid nickname'; end if;
 select * into v_trip from public.trips where invite_code=lower(trim(p_invite_code));
 if not found then raise exception 'Invalid invitation code'; end if;
 insert into public.trip_members(trip_id,user_id,name,starts_on,ends_on,role)
 values(v_trip.id,auth.uid(),trim(p_name),v_trip.start_date,v_trip.end_date,'member')
 on conflict (trip_id,user_id) where user_id is not null do nothing;
 return v_trip.id;
end $$;
revoke all on function public.create_crew_trip(text,text,date,date) from public,anon;
revoke all on function public.join_crew_trip(text,text) from public,anon;
grant execute on function public.create_crew_trip(text,text,date,date),public.join_crew_trip(text,text) to authenticated;

revoke all on public.trips,public.trip_members,public.trip_events,public.watch_items,public.price_quotes,public.trip_expenses from anon;
grant select,insert,update,delete on public.trips,public.trip_members,public.trip_events,public.watch_items,public.price_quotes,public.trip_expenses to authenticated;
grant all on public.trips,public.trip_members,public.trip_events,public.watch_items,public.price_quotes,public.trip_expenses to service_role;

-- Publish changes to authenticated Supabase Realtime clients (idempotent).
do $$ declare tbl text; begin
 foreach tbl in array array['trips','trip_members','trip_events','watch_items','price_quotes','trip_expenses'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then
   execute format('alter publication supabase_realtime add table public.%I',tbl);
  end if;
 end loop;
end $$;
