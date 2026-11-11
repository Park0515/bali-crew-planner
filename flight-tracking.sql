-- Supabase SQL Editor에서 한 번 실행합니다. 기존 가격·여행 데이터를 유지합니다.
-- 일일 조회 기록으로 같은 조건의 중복 호출을 막고 무료 API 한도를 보호합니다.
create table if not exists public.flight_price_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  watch_id uuid not null,
  checked_on date not null,
  status text not null default 'pending' check(status in ('pending','ok','no_direct','error')),
  checked_at timestamptz not null default now(),
  unique(watch_id,checked_on),
  foreign key(trip_id,watch_id) references public.watch_items(trip_id,id) on delete cascade
);
alter table public.flight_price_checks enable row level security;
revoke all on public.flight_price_checks from public,anon,authenticated;
grant select on public.flight_price_checks to authenticated;
grant all on public.flight_price_checks to service_role;
drop policy if exists crew_read_flight_checks on public.flight_price_checks;
create policy crew_read_flight_checks on public.flight_price_checks
for select to authenticated using(private.is_crew_member(trip_id));
