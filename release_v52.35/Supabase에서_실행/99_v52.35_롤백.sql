begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.labor_monthly_roster_items') is not null
     and exists (
       select 1
       from public.labor_monthly_roster_items
       limit 1
     ) then
    raise exception
      '저장된 월별 노임 명단이 존재합니다. 데이터 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop function if exists public.labor_monthly_roster_save_v52_35(
  text, text, jsonb
);
drop function if exists public.labor_monthly_worker_create_v52_35(
  text, text, date, text, text
);
drop function if exists public.labor_monthly_roster_get_v52_35(
  text, text
);

drop table if exists public.labor_monthly_roster_audit;
drop table if exists public.labor_monthly_roster_items;
drop table if exists public.labor_monthly_rosters;

commit;
