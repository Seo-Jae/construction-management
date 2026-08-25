-- 사내시스템 v52.48.5.13.2
-- 테스트계정 승인 진척을 관리자가 이미 작업전으로 되돌린 경우에도
-- 근태 초기화가 중단되지 않도록 복구 기준을 보완합니다.
-- 선행 조건: v52.48.5.13 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.attendance_manager_reset_test_attendance_v52_48_5_13(
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
  v_worker public.attendance_workers%rowtype;
  v_group_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_normalized_units integer := 0;
  v_refreshed_units integer := 0;
  v_cleared_units integer := 0;
begin
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

  select coalesce(array_agg(distinct approval_group.id), array[]::uuid[])
  into v_group_ids
  from public.attendance_progress_approval_groups approval_group
  join public.attendance_progress_approval_group_submissions member
    on member.group_id = approval_group.id
  join public.attendance_progress_submissions submission
    on submission.id = member.submission_id
  where approval_group.review_status = 'approved'
    and submission.worker_id = p_worker_id
    and submission.project_name = v_project_name
    and submission.work_date = p_work_date;

  /*
    기존 초기화 함수는 승인 직후의 작업완료 상태가 그대로 있어야만
    승인 전 원본으로 되돌릴 수 있도록 검사했습니다.

    테스트 중 관리자가 먼저 작업전으로 돌리면 unit_progress 행이 없어지므로
    아래에서 승인 직후 상태를 트랜잭션 안에서 잠시 복원합니다.
    이어서 v52.48.5.12 원복 함수가 승인 전 원본으로 되돌리거나 삭제합니다.
    중간 과정에서 오류가 발생하면 전체 트랜잭션이 취소됩니다.
  */
  insert into public.unit_progress (
    project_name,
    building,
    unit,
    process_type,
    status,
    completion_date
  )
  select
    approval_group.project_name,
    group_unit.building,
    group_unit.unit,
    approval_group.progress_process_type,
    case
      when group_unit.previous_exists
       and group_unit.previous_status = '작업완료'
        then group_unit.previous_status
      else '작업완료'
    end,
    case
      when group_unit.previous_exists
       and group_unit.previous_status = '작업완료'
        then group_unit.previous_completion_date
      else approval_group.work_date
    end
  from public.attendance_progress_approval_groups approval_group
  join public.attendance_progress_approval_group_units group_unit
    on group_unit.group_id = approval_group.id
  where approval_group.id = any(v_group_ids)
    and approval_group.review_status = 'approved'
    and not exists (
      select 1
      from public.attendance_progress_approval_group_submissions other_member
      join public.attendance_progress_submissions other_submission
        on other_submission.id = other_member.submission_id
      where other_member.group_id = approval_group.id
        and not (
          other_submission.worker_id = p_worker_id
          and other_submission.work_date = p_work_date
        )
    )
  on conflict (project_name, building, unit, process_type)
  do update set
    status = excluded.status,
    completion_date = excluded.completion_date;

  get diagnostics v_normalized_units = row_count;

  v_result := public.attendance_manager_reset_test_attendance_v52_48_5_12(
    v_project_name,
    p_worker_id,
    p_work_date,
    p_reason
  );

  if cardinality(v_group_ids) < 1 then
    return v_result || jsonb_build_object(
      'reset_normalized_progress_count', v_normalized_units,
      'completion_worker_units_refreshed', 0,
      'completion_worker_units_cleared', 0
    );
  end if;

  with contributor_rows as (
    select
      member.group_id,
      submitted_unit.building,
      submitted_unit.unit,
      worker.id as worker_id,
      trim(worker.name_ko) as worker_name
    from public.attendance_progress_approval_group_submissions member
    join public.attendance_progress_submissions submission
      on submission.id = member.submission_id
    join public.attendance_workers worker
      on worker.id = submission.worker_id
    join lateral (
      select detail.building, detail.unit
      from public.attendance_progress_submission_unit_details detail
      where detail.submission_id = submission.id
      union
      select submission.building, old_unit.unit
      from public.attendance_progress_submission_units old_unit
      where old_unit.submission_id = submission.id
        and not exists (
          select 1
          from public.attendance_progress_submission_unit_details detail_check
          where detail_check.submission_id = submission.id
        )
    ) submitted_unit on true
    where member.group_id = any(v_group_ids)
  ), contributors as (
    select
      group_id,
      building,
      unit,
      array_agg(distinct worker_id) as worker_ids,
      array_agg(distinct worker_name order by worker_name)
        filter (where nullif(worker_name, '') is not null) as worker_names
    from contributor_rows
    group by group_id, building, unit
  )
  update public.unit_progress progress_row
  set completion_worker_ids = coalesce(contributors.worker_ids, array[]::uuid[]),
      completion_worker_names = coalesce(contributors.worker_names, array[]::text[]),
      completion_source = 'attendance'
  from public.attendance_progress_approval_group_units group_unit
  join public.attendance_progress_approval_groups approval_group
    on approval_group.id = group_unit.group_id
  left join contributors
    on contributors.group_id = group_unit.group_id
   and contributors.building = group_unit.building
   and contributors.unit = group_unit.unit
  where group_unit.group_id = any(v_group_ids)
    and progress_row.completion_approval_group_id = group_unit.group_id
    and progress_row.project_name = approval_group.project_name
    and progress_row.building = group_unit.building
    and progress_row.unit = group_unit.unit
    and progress_row.process_type = approval_group.progress_process_type;

  get diagnostics v_refreshed_units = row_count;

  update public.unit_progress progress_row
  set completion_worker_ids = array[]::uuid[],
      completion_worker_names = array[]::text[],
      completion_source = null,
      completion_approval_group_id = null
  where progress_row.completion_approval_group_id = any(v_group_ids)
    and not exists (
      select 1
      from public.attendance_progress_approval_groups approval_group
      where approval_group.id = progress_row.completion_approval_group_id
    );

  get diagnostics v_cleared_units = row_count;

  return v_result || jsonb_build_object(
    'reset_normalized_progress_count', v_normalized_units,
    'completion_worker_units_refreshed', v_refreshed_units,
    'completion_worker_units_cleared', v_cleared_units
  );
end;
$$;

revoke all on function public.attendance_manager_reset_test_attendance_v52_48_5_13(
  text, uuid, date, text
) from public, anon, authenticated;

grant execute on function public.attendance_manager_reset_test_attendance_v52_48_5_13(
  text, uuid, date, text
) to authenticated;

commit;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'attendance_manager_reset_test_attendance_v52_48_5_13';
