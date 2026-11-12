-- URL 숙소 가격 추적 초기 설정. Supabase SQL Editor에서 한 번 실행합니다.
-- 기존 가격은 총액(total)으로 유지하고 새 URL 수집은 1박(nightly)으로 구분합니다.
alter table public.watch_items add column if not exists price_basis text not null default 'total' check(price_basis in ('total','nightly'));
alter table public.price_quotes add column if not exists price_basis text not null default 'total' check(price_basis in ('total','nightly'));
alter table public.price_quotes add column if not exists context_key text;

create table if not exists public.stay_price_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  watch_id uuid not null,
  context_key text not null,
  checked_on date not null,
  checked_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','ok','no_offer','blocked','unverified','error')),
  unique(watch_id,context_key,checked_on),
  foreign key(trip_id,watch_id) references public.watch_items(trip_id,id) on delete cascade
);
alter table public.stay_price_checks enable row level security;
revoke all on public.stay_price_checks from public,anon,authenticated;
grant select on public.stay_price_checks to authenticated;
grant all on public.stay_price_checks to service_role;
drop policy if exists crew_read_stay_checks on public.stay_price_checks;
create policy crew_read_stay_checks on public.stay_price_checks
for select to authenticated using(private.is_crew_member(trip_id));
