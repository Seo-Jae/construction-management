-- =========================================================
-- 사내 현장관리 시스템 v52.14.7
-- 근태 앱 금월 출결 캘린더
-- 기존 근로자 본인확인 RPC에 본인의 금월 출퇴근 기록만 추가한다.
-- 실행 전제: v52.14 및 v52.14.1 근태관리 SQL 적용 완료
-- =========================================================

begin;

do $$
begin
  if to_regprocedure('public.attendance_worker_me_v52_14(text,text)') is null
     or to_regclass('public.attendance_events') is null then
    raise exception 'v52.14 근태관리 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

create or replace function public.attendance_worker_me_v52_14(
  p_session_token text,
  p_device_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid := public.attendance_resolve_worker_v52_14(p_session_token, p_device_key, false);
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_next_month date := (date_trunc('month', v_today) + interval '1 month')::date;
begin
  return jsonb_build_object(
    'worker', (
      select jsonb_build_object(
        'id', worker.id,
        'project_name', worker.project_name,
        'name_ko', worker.name_ko,
        'name_en', worker.name_en,
        'is_foreigner', worker.is_foreigner,
        'phone', worker.phone,
        'company_name', worker.company_name,
        'trade_name', worker.trade_name,
        'status', worker.status,
        'rejection_reason', worker.rejection_reason,
        'approved_at', worker.approved_at
      )
      from public.attendance_workers worker
      where worker.id = v_worker_id
    ),
    'today_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event_row.id,
        'work_date', event_row.work_date,
        'event_type', event_row.event_type,
        'event_at', event_row.event_at,
        'source', event_row.source
      ) order by event_row.event_at)
      from public.attendance_events event_row
      where event_row.worker_id = v_worker_id
        and event_row.work_date = v_today
    ), '[]'::jsonb),
    'month_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event_row.id,
        'work_date', event_row.work_date,
        'event_type', event_row.event_type,
        'event_at', event_row.event_at,
        'source', event_row.source
      ) order by event_row.work_date, event_row.event_at)
      from public.attendance_events event_row
      where event_row.worker_id = v_worker_id
        and event_row.work_date >= v_month_start
        and event_row.work_date < v_next_month
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end;
$$;

revoke all on function public.attendance_worker_me_v52_14(text, text) from public;
grant execute on function public.attendance_worker_me_v52_14(text, text) to anon, authenticated;

comment on function public.attendance_worker_me_v52_14(text, text)
  is 'v52.14.7 근로자 본인정보·당일기록·금월기록 조회';

commit;
