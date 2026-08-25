-- 사내시스템 v52.48.5.11
-- 테스트계정에 한해 선택일자의 근태기록과 연결자료를 안전하게 초기화합니다.
-- 선행 조건: v52.48.5.10 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- 1. 테스트계정 진척 승인 전 상태 보관
-- =========================================================

create table if not exists public.attendance_test_progress_snapshots (
  submission_id uuid not null
    references public.attendance_progress_submissions(id) on delete cascade,
  project_name text not null,
  building text not null,
  unit text not null,
  process_type text not null,
  previous_exists boolean not null,
  previous_status text,
  previous_completion_date date,
  created_at timestamptz not null default now(),
  primary key (submission_id, building, unit, process_type)
);

alter table public.attendance_test_progress_snapshots enable row level security;
revoke all on public.attendance_test_progress_snapshots
  from public, anon, authenticated;

comment on table public.attendance_test_progress_snapshots
  is 'v52.48.5.11 테스트계정 진척 승인 전 unit_progress 상태 원본';

-- =========================================================
-- 2. 테스트계정 진척 승인 시 원래 상태 선저장
-- =========================================================

create or replace function public.attendance_manager_review_progress_v52_48_5_11(
  p_submission_id uuid,
  p_approved boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.attendance_progress_submissions%rowtype;
  v_is_test_account boolean := false;
begin
  select * into v_submission
  from public.attendance_progress_submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception '진척 승인 요청을 찾을 수 없습니다.';
  end if;
  if not public.attendance_manager_can_v52_14(v_submission.project_name, true) then
    raise exception '이 현장의 진척 승인 권한이 없습니다.';
  end if;
  if v_submission.review_status <> 'pending' then
    raise exception '이미 처리된 진척 승인 요청입니다.';
  end if;

  select coalesce(worker.is_test_account, false)
  into v_is_test_account
  from public.attendance_workers worker
  where worker.id = v_submission.worker_id;

  if coalesce(p_approved, false) and v_is_test_account then
    insert into public.attendance_test_progress_snapshots (
      submission_id,
      project_name,
      building,
      unit,
      process_type,
      previous_exists,
      previous_status,
      previous_completion_date
    )
    select distinct
      v_submission.id,
      v_submission.project_name,
      submitted.building,
      submitted.unit,
      v_submission.progress_process_type,
      progress_row.project_name is not null,
      progress_row.status,
      progress_row.completion_date
    from (
      select detail.building, detail.unit
      from public.attendance_progress_submission_unit_details detail
      where detail.submission_id = v_submission.id
      union all
      select v_submission.building, old_unit.unit
      from public.attendance_progress_submission_units old_unit
      where old_unit.submission_id = v_submission.id
        and not exists (
          select 1
          from public.attendance_progress_submission_unit_details detail_check
          where detail_check.submission_id = v_submission.id
        )
    ) submitted
    left join public.unit_progress progress_row
      on progress_row.project_name = v_submission.project_name
     and progress_row.building = submitted.building
     and progress_row.unit = submitted.unit
     and progress_row.process_type = v_submission.progress_process_type
    on conflict (submission_id, building, unit, process_type) do nothing;
  end if;

  return public.attendance_manager_review_progress_v52_48_5_10(
    p_submission_id,
    p_approved,
    p_reason
  );
end;
$$;

-- =========================================================
-- 3. 테스트계정 선택일자 근태 및 연결자료 초기화
-- =========================================================

create or replace function public.attendance_manager_reset_test_attendance_v52_48_5_11(
  p_project_name text,
  p_worker_id uuid,
  p_work_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_reason text := trim(coalesce(p_reason, ''));
  v_worker public.attendance_workers%rowtype;
  v_snapshot record;
  v_progress public.unit_progress%rowtype;
  v_event_count integer := 0;
  v_submission_count integer := 0;
  v_restored_progress_count integer := 0;
  v_preserved_legacy_progress_count integer := 0;
  v_exchange_count integer := 0;
begin
  if v_project_name = '' or p_worker_id is null or p_work_date is null then
    raise exception '초기화할 테스트계정과 근태일자를 확인해주세요.';
  end if;
  if length(v_reason) < 2 then
    raise exception '초기화 사유를 2자 이상 입력해주세요.';
  end if;
  if not public.attendance_manager_can_v52_14(v_project_name, true) then
    raise exception '이 현장의 근태기록 초기화 권한이 없습니다.';
  end if;

  select * into v_worker
  from public.attendance_workers worker
  where worker.id = p_worker_id
    and worker.project_name = v_project_name
  for update;

  if not found then
    raise exception '초기화할 근로자 계정을 찾을 수 없습니다.';
  end if;
  if not coalesce(v_worker.is_test_account, false) then
    raise exception '테스트계정의 근태기록만 초기화할 수 있습니다.';
  end if;

  select count(*) into v_event_count
  from public.attendance_events event_row
  where event_row.worker_id = p_worker_id
    and event_row.project_name = v_project_name
    and event_row.work_date = p_work_date;

  if v_event_count = 0 then
    return jsonb_build_object(
      'already_reset', true,
      'deleted_events_count', 0,
      'deleted_submissions_count', 0,
      'restored_progress_count', 0,
      'preserved_legacy_progress_count', 0
    );
  end if;

  -- v52.48.5.11 이후 승인된 테스트 진척은 승인 직전 상태와 현재 상태를
  -- 대조한 뒤 정확히 원복합니다. 이후 다른 변경이 있었다면 안전을 위해 중단합니다.
  for v_snapshot in
    select
      snapshot_row.*,
      submission.work_date
    from public.attendance_test_progress_snapshots snapshot_row
    join public.attendance_progress_submissions submission
      on submission.id = snapshot_row.submission_id
     and submission.review_status = 'approved'
    where submission.worker_id = p_worker_id
      and submission.project_name = v_project_name
      and submission.work_date = p_work_date
    order by snapshot_row.created_at desc
  loop
    select * into v_progress
    from public.unit_progress progress_row
    where progress_row.project_name = v_snapshot.project_name
      and progress_row.building = v_snapshot.building
      and progress_row.unit = v_snapshot.unit
      and progress_row.process_type = v_snapshot.process_type
    for update;

    if v_snapshot.previous_exists then
      if not found then
        raise exception '승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
      end if;

      if v_snapshot.previous_status = '작업완료' then
        if v_progress.status is distinct from v_snapshot.previous_status
           or v_progress.completion_date is distinct from v_snapshot.previous_completion_date then
          raise exception '승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
        end if;
      elsif v_progress.status is distinct from '작업완료'
         or v_progress.completion_date is distinct from v_snapshot.work_date then
        raise exception '승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
      end if;

      update public.unit_progress
      set status = v_snapshot.previous_status,
          completion_date = v_snapshot.previous_completion_date
      where project_name = v_snapshot.project_name
        and building = v_snapshot.building
        and unit = v_snapshot.unit
        and process_type = v_snapshot.process_type;
    else
      if not found
         or v_progress.status is distinct from '작업완료'
         or v_progress.completion_date is distinct from v_snapshot.work_date then
        raise exception '승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
      end if;

      delete from public.unit_progress
      where project_name = v_snapshot.project_name
        and building = v_snapshot.building
        and unit = v_snapshot.unit
        and process_type = v_snapshot.process_type;
    end if;

    v_restored_progress_count := v_restored_progress_count + 1;
  end loop;

  -- 이 버전 적용 전에 승인되어 원래 상태를 알 수 없는 진척은 삭제하지 않고 보존합니다.
  select coalesce(sum(submission.submitted_units_count), 0)::integer
  into v_preserved_legacy_progress_count
  from public.attendance_progress_submissions submission
  where submission.worker_id = p_worker_id
    and submission.project_name = v_project_name
    and submission.work_date = p_work_date
    and submission.review_status = 'approved'
    and not exists (
      select 1
      from public.attendance_test_progress_snapshots snapshot_row
      where snapshot_row.submission_id = submission.id
    );

  delete from public.attendance_progress_submissions submission
  where submission.worker_id = p_worker_id
    and submission.project_name = v_project_name
    and submission.work_date = p_work_date;
  get diagnostics v_submission_count = row_count;

  delete from public.attendance_events event_row
  where event_row.worker_id = p_worker_id
    and event_row.project_name = v_project_name
    and event_row.work_date = p_work_date;
  get diagnostics v_event_count = row_count;

  delete from public.attendance_qr_exchanges exchange_row
  where exchange_row.worker_id = p_worker_id
    and (exchange_row.exchanged_at at time zone 'Asia/Seoul')::date = p_work_date;
  get diagnostics v_exchange_count = row_count;

  insert into public.attendance_audit_log (
    project_name,
    worker_id,
    action_code,
    action_label,
    actor_user_id,
    before_value,
    after_value,
    reason
  ) values (
    v_project_name,
    p_worker_id,
    'test_attendance_reset',
    '테스트계정 근태 초기화',
    auth.uid(),
    jsonb_build_object(
      'work_date', p_work_date,
      'event_count', v_event_count,
      'submission_count', v_submission_count
    ),
    jsonb_build_object(
      'deleted_events_count', v_event_count,
      'deleted_submissions_count', v_submission_count,
      'deleted_exchanges_count', v_exchange_count,
      'restored_progress_count', v_restored_progress_count,
      'preserved_legacy_progress_count', v_preserved_legacy_progress_count
    ),
    v_reason
  );

  return jsonb_build_object(
    'already_reset', false,
    'deleted_events_count', v_event_count,
    'deleted_submissions_count', v_submission_count,
    'deleted_exchanges_count', v_exchange_count,
    'restored_progress_count', v_restored_progress_count,
    'preserved_legacy_progress_count', v_preserved_legacy_progress_count
  );
end;
$$;

-- =========================================================
-- 4. 근태기록 목록에 테스트계정 여부 추가
-- =========================================================

create or replace function public.attendance_manager_dashboard_v52_48_5_11(
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
  v_dashboard := public.attendance_manager_dashboard_v52_48_5_10(
    p_project_name,
    p_work_date
  );

  select coalesce(
    jsonb_agg(
      record_row.value || jsonb_build_object(
        'is_test_account', coalesce(worker.is_test_account, false)
      )
      order by record_row.ordinality
    ),
    '[]'::jsonb
  )
  into v_daily_records
  from jsonb_array_elements(
    coalesce(v_dashboard -> 'daily_records', '[]'::jsonb)
  ) with ordinality record_row(value, ordinality)
  left join public.attendance_workers worker
    on worker.id = nullif(record_row.value ->> 'worker_id', '')::uuid;

  return jsonb_set(v_dashboard, '{daily_records}', v_daily_records, true);
end;
$$;

-- =========================================================
-- 5. 실행권한
-- =========================================================

revoke all on function public.attendance_manager_review_progress_v52_48_5_11(
  uuid, boolean, text
) from public, anon, authenticated;
revoke all on function public.attendance_manager_reset_test_attendance_v52_48_5_11(
  text, uuid, date, text
) from public, anon, authenticated;
revoke all on function public.attendance_manager_dashboard_v52_48_5_11(
  text, date
) from public, anon, authenticated;

grant execute on function public.attendance_manager_review_progress_v52_48_5_11(
  uuid, boolean, text
) to authenticated;
grant execute on function public.attendance_manager_reset_test_attendance_v52_48_5_11(
  text, uuid, date, text
) to authenticated;
grant execute on function public.attendance_manager_dashboard_v52_48_5_11(
  text, date
) to authenticated;

commit;

-- =========================================================
-- 6. 적용결과 확인
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'attendance_test_progress_snapshots';

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_manager_review_progress_v52_48_5_11',
    'attendance_manager_reset_test_attendance_v52_48_5_11',
    'attendance_manager_dashboard_v52_48_5_11'
  )
order by routine_name;
