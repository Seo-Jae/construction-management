-- 사내시스템 v52.48.5.13
-- 공정별 현황 입력 골구도에서 완료 세대에 커서를 올리거나 터치하면
-- 해당 세대를 승인받은 작업자 이름을 표시합니다.
-- 선행 조건: v52.48.5.12 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- 1. 세대별 완료 작업자 표시용 자료
-- =========================================================

alter table public.unit_progress
  add column if not exists completion_worker_ids uuid[] not null default array[]::uuid[],
  add column if not exists completion_worker_names text[] not null default array[]::text[],
  add column if not exists completion_source text,
  add column if not exists completion_approval_group_id uuid;

create index if not exists idx_unit_progress_completion_approval_group
  on public.unit_progress(completion_approval_group_id)
  where completion_approval_group_id is not null;

comment on column public.unit_progress.completion_worker_ids
  is 'v52.48.5.13 해당 세대 완료 승인에 참여한 근태 작업자 ID';
comment on column public.unit_progress.completion_worker_names
  is 'v52.48.5.13 골구도 툴팁에 표시할 완료 작업자명';
comment on column public.unit_progress.completion_source
  is 'v52.48.5.13 완료 입력 출처: attendance 또는 manual';
comment on column public.unit_progress.completion_approval_group_id
  is 'v52.48.5.13 완료 작업자를 만든 공동작업 승인 그룹';

-- =========================================================
-- 2. 공동작업 승인 후 세대별 실제 참여 작업자 저장
-- =========================================================

create or replace function public.attendance_manager_review_progress_group_v52_48_5_13(
  p_submission_ids uuid[],
  p_approved boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_group_id uuid;
begin
  v_result := public.attendance_manager_review_progress_group_v52_48_5_12(
    p_submission_ids,
    p_approved,
    p_reason
  );

  if not coalesce(p_approved, false) then
    return v_result;
  end if;

  v_group_id := nullif(v_result ->> 'group_id', '')::uuid;

  with contributor_rows as (
    select
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
    where member.group_id = v_group_id
  ), contributors as (
    select
      building,
      unit,
      array_agg(distinct worker_id) as worker_ids,
      array_agg(distinct worker_name order by worker_name)
        filter (where nullif(worker_name, '') is not null) as worker_names
    from contributor_rows
    group by building, unit
  )
  update public.unit_progress progress_row
  set completion_worker_ids = coalesce(contributors.worker_ids, array[]::uuid[]),
      completion_worker_names = coalesce(contributors.worker_names, array[]::text[]),
      completion_source = 'attendance',
      completion_approval_group_id = v_group_id
  from public.attendance_progress_approval_group_units group_unit
  join contributors
    on contributors.building = group_unit.building
   and contributors.unit = group_unit.unit
  join public.attendance_progress_approval_groups approval_group
    on approval_group.id = group_unit.group_id
  where group_unit.group_id = v_group_id
    and not (
      group_unit.previous_exists
      and group_unit.previous_status = '작업완료'
    )
    and progress_row.project_name = approval_group.project_name
    and progress_row.building = group_unit.building
    and progress_row.unit = group_unit.unit
    and progress_row.process_type = approval_group.progress_process_type
    and progress_row.status = '작업완료'
    and progress_row.completion_date = approval_group.work_date;

  return v_result || jsonb_build_object(
    'completion_workers_saved', true
  );
end;
$$;

-- =========================================================
-- 3. v52.48.5.12에서 이미 승인한 자료도 가능한 범위에서 자동 연결
-- =========================================================

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
), candidates as (
  select
    progress_row.project_name,
    progress_row.building,
    progress_row.unit,
    progress_row.process_type,
    approval_group.id as group_id,
    contributors.worker_ids,
    contributors.worker_names,
    row_number() over (
      partition by
        progress_row.project_name,
        progress_row.building,
        progress_row.unit,
        progress_row.process_type
      order by approval_group.reviewed_at desc, approval_group.id desc
    ) as priority
  from public.unit_progress progress_row
  join public.attendance_progress_approval_groups approval_group
    on approval_group.project_name = progress_row.project_name
   and approval_group.progress_process_type = progress_row.process_type
   and approval_group.work_date = progress_row.completion_date
   and approval_group.review_status = 'approved'
  join public.attendance_progress_approval_group_units group_unit
    on group_unit.group_id = approval_group.id
   and group_unit.building = progress_row.building
   and group_unit.unit = progress_row.unit
  join contributors
    on contributors.group_id = approval_group.id
   and contributors.building = progress_row.building
   and contributors.unit = progress_row.unit
  where progress_row.status = '작업완료'
    and not (
      group_unit.previous_exists
      and group_unit.previous_status = '작업완료'
    )
)
update public.unit_progress progress_row
set completion_worker_ids = coalesce(candidates.worker_ids, array[]::uuid[]),
    completion_worker_names = coalesce(candidates.worker_names, array[]::text[]),
    completion_source = 'attendance',
    completion_approval_group_id = candidates.group_id
from candidates
where candidates.priority = 1
  and progress_row.project_name = candidates.project_name
  and progress_row.building = candidates.building
  and progress_row.unit = candidates.unit
  and progress_row.process_type = candidates.process_type;

-- =========================================================
-- 4. 테스트계정 초기화 시 표시 작업자도 함께 정리
-- =========================================================

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
  v_group_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_refreshed_units integer := 0;
  v_cleared_units integer := 0;
begin
  select coalesce(array_agg(distinct approval_group.id), array[]::uuid[])
  into v_group_ids
  from public.attendance_progress_approval_groups approval_group
  join public.attendance_progress_approval_group_submissions member
    on member.group_id = approval_group.id
  join public.attendance_progress_submissions submission
    on submission.id = member.submission_id
  where approval_group.review_status = 'approved'
    and submission.worker_id = p_worker_id
    and submission.project_name = trim(coalesce(p_project_name, ''))
    and submission.work_date = p_work_date;

  v_result := public.attendance_manager_reset_test_attendance_v52_48_5_12(
    p_project_name,
    p_worker_id,
    p_work_date,
    p_reason
  );

  if cardinality(v_group_ids) < 1 then
    return v_result || jsonb_build_object(
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
    'completion_worker_units_refreshed', v_refreshed_units,
    'completion_worker_units_cleared', v_cleared_units
  );
end;
$$;

-- =========================================================
-- 5. 실행권한
-- =========================================================

revoke all on function public.attendance_manager_review_progress_group_v52_48_5_13(
  uuid[], boolean, text
) from public, anon, authenticated;
revoke all on function public.attendance_manager_reset_test_attendance_v52_48_5_13(
  text, uuid, date, text
) from public, anon, authenticated;

grant execute on function public.attendance_manager_review_progress_group_v52_48_5_13(
  uuid[], boolean, text
) to authenticated;
grant execute on function public.attendance_manager_reset_test_attendance_v52_48_5_13(
  text, uuid, date, text
) to authenticated;

commit;

-- =========================================================
-- 6. 적용결과 확인
-- =========================================================

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'unit_progress'
  and column_name in (
    'completion_worker_ids',
    'completion_worker_names',
    'completion_source',
    'completion_approval_group_id'
  )
order by column_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_manager_review_progress_group_v52_48_5_13',
    'attendance_manager_reset_test_attendance_v52_48_5_13'
  )
order by routine_name;
