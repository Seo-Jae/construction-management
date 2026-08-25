begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1
    from public.labor_monthly_roster_items
    where coalesce(daily_wage, 0) <> 0
       or coalesce(additional_pay, 0) <> 0
       or coalesce(manual_deduction, 0) <> 0
       or coalesce(pay_note, '') <> ''
       or coalesce(work_entries, '{}'::jsonb) <> '{}'::jsonb
    limit 1
  ) then
    raise exception
      'v52.36 출역/노임 데이터가 이미 저장되어 있습니다. 데이터 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop function if exists public.labor_monthly_roster_save_v52_36(
  text,
  text,
  jsonb
);

drop function if exists public.labor_monthly_roster_get_v52_36(
  text,
  text
);

drop function if exists public.labor_work_entries_valid_v52_36(
  jsonb,
  integer
);

alter table public.labor_monthly_roster_items
  drop constraint if exists labor_monthly_roster_items_daily_wage_v52_36,
  drop constraint if exists labor_monthly_roster_items_additional_pay_v52_36,
  drop constraint if exists labor_monthly_roster_items_manual_deduction_v52_36,
  drop constraint if exists labor_monthly_roster_items_work_entries_object_v52_36;

alter table public.labor_monthly_roster_items
  drop column if exists work_entries,
  drop column if exists daily_wage,
  drop column if exists additional_pay,
  drop column if exists manual_deduction,
  drop column if exists pay_note;

commit;
