-- 사내시스템 v52.48.5.6
-- 통합관리시스템 > 근태 기록에 출근 시 입력한 작업위치/당일 공정을 표시합니다.
-- 선행 조건: v52.48.5.5 SQL이 먼저 적용되어 있어야 합니다.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.attendance_manager_dashboard_v52_48_5_6(
  p_project_name text,
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dashboard jsonb;
  v_daily_records jsonb;
begin
  -- 기존 v52.14 함수의 권한 검사와 나머지 대시보드 데이터를 그대로 사용합니다.
  v_dashboard := public.attendance_manager_dashboard_v52_14(
    p_project_name,
    p_work_date
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'worker_id', worker.id,
        'name_ko', worker.name_ko,
        'name_en', worker.name_en,
        'company_name', worker.company_name,
        'trade_name', worker.trade_name,
        'phone', worker.phone,
        'check_in_at', check_in.event_at,
        'check_in_source', check_in.source,
        'check_out_at', check_out.event_at,
        'check_out_source', check_out.source,
        'work_location_mode', check_in.work_location_mode,
        'work_building', check_in.work_building,
        'work_floor', check_in.work_floor,
        'work_location_text', check_in.work_location_text,
        'work_trade_name', check_in.work_trade_name
      )
      order by worker.company_name, worker.name_ko
    ),
    '[]'::jsonb
  )
  into v_daily_records
  from public.attendance_workers worker
  left join public.attendance_events check_in
    on check_in.worker_id = worker.id
   and check_in.work_date = p_work_date
   and check_in.event_type = 'check_in'
  left join public.attendance_events check_out
    on check_out.worker_id = worker.id
   and check_out.work_date = p_work_date
   and check_out.event_type = 'check_out'
  where worker.project_name = trim(p_project_name)
    and worker.status = 'active';

  return jsonb_set(
    v_dashboard,
    '{daily_records}',
    v_daily_records,
    true
  );
end;
$$;

revoke all on function public.attendance_manager_dashboard_v52_48_5_6(text, date)
  from public;
grant execute on function public.attendance_manager_dashboard_v52_48_5_6(text, date)
  to authenticated;

commit;

-- 적용 확인: true가 나오면 정상입니다.
select to_regprocedure(
  'public.attendance_manager_dashboard_v52_48_5_6(text,date)'
) is not null as dashboard_function_ready;
