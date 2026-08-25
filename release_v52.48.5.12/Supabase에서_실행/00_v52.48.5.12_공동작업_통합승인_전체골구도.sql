-- 사내시스템 v52.48.5.12
-- 같은 날·같은 진척공정의 중복 제출을 공동작업으로 통합 승인하고,
-- 담당자 화면에 해당 동 전체 골구도와 기존 완료세대를 제공합니다.
-- 선행 조건: v52.48.5.11 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- 1. 공동작업 승인 묶음과 승인 전 진척 원본
-- =========================================================

create table if not exists public.attendance_progress_approval_groups (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  work_date date not null,
  progress_process_type text not null,
  review_status text not null check (review_status in ('approved', 'rejected')),
  submission_count integer not null default 0 check (submission_count >= 0),
  total_submitted_units_count integer not null default 0 check (total_submitted_units_count >= 0),
  unique_units_count integer not null default 0 check (unique_units_count >= 0),
  duplicate_units_count integer not null default 0 check (duplicate_units_count >= 0),
  applied_units_count integer not null default 0 check (applied_units_count >= 0),
  skipped_units_count integer not null default 0 check (skipped_units_count >= 0),
  reviewed_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_progress_approval_group_submissions (
  group_id uuid not null
    references public.attendance_progress_approval_groups(id) on delete cascade,
  submission_id uuid not null
    references public.attendance_progress_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, submission_id),
  unique (submission_id)
);

create table if not exists public.attendance_progress_approval_group_units (
  group_id uuid not null
    references public.attendance_progress_approval_groups(id) on delete cascade,
  building text not null,
  floor integer not null check (floor >= 1),
  unit text not null,
  previous_exists boolean not null,
  previous_status text,
  previous_completion_date date,
  created_at timestamptz not null default now(),
  primary key (group_id, building, unit)
);

create index if not exists idx_attendance_progress_approval_groups_project_date
  on public.attendance_progress_approval_groups(project_name, work_date desc, progress_process_type);

alter table public.attendance_progress_approval_groups enable row level security;
alter table public.attendance_progress_approval_group_submissions enable row level security;
alter table public.attendance_progress_approval_group_units enable row level security;

revoke all on public.attendance_progress_approval_groups from public, anon, authenticated;
revoke all on public.attendance_progress_approval_group_submissions from public, anon, authenticated;
revoke all on public.attendance_progress_approval_group_units from public, anon, authenticated;

comment on table public.attendance_progress_approval_groups
  is 'v52.48.5.12 같은 날짜·공정의 공동작업 통합 승인 원본';
comment on table public.attendance_progress_approval_group_submissions
  is 'v52.48.5.12 통합 승인에 포함된 작업자별 퇴근 제출';
comment on table public.attendance_progress_approval_group_units
  is 'v52.48.5.12 통합 승인 고유세대와 승인 전 unit_progress 상태';

-- =========================================================
-- 2. 담당자 목록에 동일 공정 기존 완료세대 추가
-- =========================================================

create or replace function public.attendance_manager_progress_submissions_v52_48_5_12(
  p_project_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  v_base := public.attendance_manager_progress_submissions_v52_48_5_10(
    p_project_name
  );

  select coalesce(
    jsonb_agg(
      row_item.value || jsonb_build_object(
        'completed_units', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'building', progress_row.building,
              'floor', case
                when progress_row.unit ~ '^[0-9]{3,}$'
                  then left(progress_row.unit, length(progress_row.unit) - 2)::integer
                else null
              end,
              'unit', progress_row.unit,
              'completion_date', progress_row.completion_date
            )
            order by progress_row.building, progress_row.unit
          )
          from public.unit_progress progress_row
          where progress_row.project_name = trim(p_project_name)
            and progress_row.process_type = (row_item.value ->> 'progress_process_type')
            and progress_row.status = '작업완료'
            and exists (
              select 1
              from jsonb_array_elements(
                coalesce(row_item.value -> 'scopes', '[]'::jsonb)
              ) scope_item(value)
              where (scope_item.value ->> 'building') = progress_row.building
            )
        ), '[]'::jsonb)
      )
      order by row_item.ordinality
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_base, '[]'::jsonb))
    with ordinality row_item(value, ordinality);

  return v_rows;
end;
$$;

-- =========================================================
-- 3. 같은 날짜·공정 승인대기를 한 번에 통합 처리
-- =========================================================

create or replace function public.attendance_manager_review_progress_group_v52_48_5_12(
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
  v_input_ids uuid[] := array[]::uuid[];
  v_target_ids uuid[] := array[]::uuid[];
  v_anchor public.attendance_progress_submissions%rowtype;
  v_submission record;
  v_group_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_result jsonb;
  v_submission_count integer := 0;
  v_total_units integer := 0;
  v_unique_units integer := 0;
  v_duplicate_units integer := 0;
  v_applied_units integer := 0;
  v_skipped_units integer := 0;
begin
  select coalesce(array_agg(distinct submission_id), array[]::uuid[])
  into v_input_ids
  from unnest(coalesce(p_submission_ids, array[]::uuid[])) submission_id
  where submission_id is not null;

  if cardinality(v_input_ids) < 1 or cardinality(v_input_ids) > 100 then
    raise exception '통합 처리할 진척 승인 요청을 확인해주세요.';
  end if;

  select * into v_anchor
  from public.attendance_progress_submissions submission
  where submission.id = any(v_input_ids)
    and submission.review_status = 'pending'
    and submission.completion_state = 'submitted'
  order by submission.submitted_at, submission.id
  limit 1
  for update;

  if not found then
    raise exception '처리할 승인대기 진척을 찾을 수 없습니다.';
  end if;
  if not public.attendance_manager_can_v52_14(v_anchor.project_name, true) then
    raise exception '이 현장의 진척 승인 권한이 없습니다.';
  end if;
  if not coalesce(p_approved, false) and length(v_reason) < 2 then
    raise exception '반려 사유를 2자 이상 입력해주세요.';
  end if;

  if (
    select count(*)
    from public.attendance_progress_submissions submission
    where submission.id = any(v_input_ids)
  ) <> cardinality(v_input_ids) then
    raise exception '일부 진척 승인 요청을 찾을 수 없습니다. 목록을 새로고침해주세요.';
  end if;

  if exists (
    select 1
    from public.attendance_progress_submissions submission
    where submission.id = any(v_input_ids)
      and (
        submission.project_name is distinct from v_anchor.project_name
        or submission.work_date is distinct from v_anchor.work_date
        or submission.progress_process_type is distinct from v_anchor.progress_process_type
        or submission.review_status <> 'pending'
      )
  ) then
    raise exception '같은 날짜와 같은 진척공정의 승인대기만 통합 처리할 수 있습니다.';
  end if;

  -- 담당자가 화면에서 실제로 확인한 요청만 통합합니다.
  -- 승인 뒤 제출되는 동일 세대는 작업자 화면과 서버 완료검증에서 차단됩니다.
  select coalesce(array_agg(submission.id order by submission.submitted_at, submission.id), array[]::uuid[])
  into v_target_ids
  from public.attendance_progress_submissions submission
  where submission.id = any(v_input_ids);

  if cardinality(v_target_ids) > 100 then
    raise exception '한 번에 통합 처리할 수 있는 승인 요청 수를 초과했습니다.';
  end if;

  select count(*), coalesce(sum(submission.submitted_units_count), 0)::integer
  into v_submission_count, v_total_units
  from public.attendance_progress_submissions submission
  where submission.id = any(v_target_ids);

  insert into public.attendance_progress_approval_groups (
    project_name,
    work_date,
    progress_process_type,
    review_status,
    submission_count,
    total_submitted_units_count,
    reviewed_by,
    review_reason
  ) values (
    v_anchor.project_name,
    v_anchor.work_date,
    v_anchor.progress_process_type,
    case when coalesce(p_approved, false) then 'approved' else 'rejected' end,
    v_submission_count,
    v_total_units,
    auth.uid(),
    case
      when coalesce(p_approved, false) and v_reason = '' then '공동작업 골구도 통합 확인 후 승인'
      else v_reason
    end
  ) returning id into v_group_id;

  insert into public.attendance_progress_approval_group_submissions (
    group_id,
    submission_id
  )
  select v_group_id, submission.id
  from public.attendance_progress_submissions submission
  where submission.id = any(v_target_ids)
  on conflict (submission_id) do nothing;

  with submitted as (
    select detail.building, detail.floor, detail.unit
    from public.attendance_progress_submissions submission
    join public.attendance_progress_submission_unit_details detail
      on detail.submission_id = submission.id
    where submission.id = any(v_target_ids)
    union all
    select submission.building, submission.floor, old_unit.unit
    from public.attendance_progress_submissions submission
    join public.attendance_progress_submission_units old_unit
      on old_unit.submission_id = submission.id
    where submission.id = any(v_target_ids)
      and not exists (
        select 1
        from public.attendance_progress_submission_unit_details detail_check
        where detail_check.submission_id = submission.id
      )
  ), unique_submitted as (
    select building, floor, unit
    from submitted
    where nullif(trim(building), '') is not null
      and floor is not null
      and nullif(trim(unit), '') is not null
    group by building, floor, unit
  )
  insert into public.attendance_progress_approval_group_units (
    group_id,
    building,
    floor,
    unit,
    previous_exists,
    previous_status,
    previous_completion_date
  )
  select
    v_group_id,
    unique_submitted.building,
    unique_submitted.floor,
    unique_submitted.unit,
    progress_row.project_name is not null,
    progress_row.status,
    progress_row.completion_date
  from unique_submitted
  left join public.unit_progress progress_row
    on progress_row.project_name = v_anchor.project_name
   and progress_row.building = unique_submitted.building
   and progress_row.unit = unique_submitted.unit
   and progress_row.process_type = v_anchor.progress_process_type;

  select count(*) into v_unique_units
  from public.attendance_progress_approval_group_units group_unit
  where group_unit.group_id = v_group_id;
  v_duplicate_units := greatest(0, v_total_units - v_unique_units);

  for v_submission in
    select submission.id
    from public.attendance_progress_submissions submission
    where submission.id = any(v_target_ids)
    order by submission.submitted_at, submission.id
  loop
    v_result := public.attendance_manager_review_progress_v52_48_5_10(
      v_submission.id,
      p_approved,
      case
        when coalesce(p_approved, false) and v_reason = '' then '공동작업 골구도 통합 확인 후 승인'
        else v_reason
      end
    );
    v_applied_units := v_applied_units + coalesce((v_result ->> 'applied_units_count')::integer, 0);
    v_skipped_units := v_skipped_units + coalesce((v_result ->> 'skipped_units_count')::integer, 0);
  end loop;

  update public.attendance_progress_approval_groups
  set unique_units_count = v_unique_units,
      duplicate_units_count = v_duplicate_units,
      applied_units_count = v_applied_units,
      skipped_units_count = v_skipped_units
  where id = v_group_id;

  insert into public.attendance_audit_log (
    project_name,
    action_code,
    action_label,
    actor_user_id,
    before_value,
    after_value,
    reason
  ) values (
    v_anchor.project_name,
    case when coalesce(p_approved, false)
      then 'progress_group_approved'
      else 'progress_group_rejected'
    end,
    case when coalesce(p_approved, false)
      then '공동작업 진척 통합 승인'
      else '공동작업 진척 통합 반려'
    end,
    auth.uid(),
    jsonb_build_object(
      'work_date', v_anchor.work_date,
      'process_type', v_anchor.progress_process_type,
      'submission_count', v_submission_count,
      'total_submitted_units_count', v_total_units
    ),
    jsonb_build_object(
      'group_id', v_group_id,
      'unique_units_count', v_unique_units,
      'duplicate_units_count', v_duplicate_units,
      'applied_units_count', v_applied_units,
      'skipped_units_count', v_skipped_units
    ),
    case
      when coalesce(p_approved, false) and v_reason = '' then '공동작업 골구도 통합 확인 후 승인'
      else v_reason
    end
  );

  return jsonb_build_object(
    'group_id', v_group_id,
    'review_status', case when coalesce(p_approved, false) then 'approved' else 'rejected' end,
    'submission_count', v_submission_count,
    'total_submitted_units_count', v_total_units,
    'unique_units_count', v_unique_units,
    'duplicate_units_count', v_duplicate_units,
    'applied_units_count', v_applied_units,
    'skipped_units_count', v_skipped_units
  );
end;
$$;

-- =========================================================
-- 4. 공동승인과 테스트계정 근태 초기화 연동
-- =========================================================

create or replace function public.attendance_manager_reset_test_attendance_v52_48_5_12(
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
  v_group record;
  v_group_unit record;
  v_progress public.unit_progress%rowtype;
  v_base jsonb;
  v_other_members integer := 0;
  v_group_submission_units integer := 0;
  v_restored_group_progress integer := 0;
  v_preserved_shared_progress integer := 0;
  v_base_preserved_legacy integer := 0;
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

  select coalesce(sum(submission.submitted_units_count), 0)::integer
  into v_group_submission_units
  from public.attendance_progress_approval_group_submissions member
  join public.attendance_progress_approval_groups approval_group
    on approval_group.id = member.group_id
   and approval_group.review_status = 'approved'
  join public.attendance_progress_submissions submission
    on submission.id = member.submission_id
  where submission.worker_id = p_worker_id
    and submission.project_name = v_project_name
    and submission.work_date = p_work_date;

  for v_group in
    select distinct approval_group.*
    from public.attendance_progress_approval_groups approval_group
    join public.attendance_progress_approval_group_submissions member
      on member.group_id = approval_group.id
    join public.attendance_progress_submissions submission
      on submission.id = member.submission_id
    where approval_group.review_status = 'approved'
      and submission.worker_id = p_worker_id
      and submission.project_name = v_project_name
      and submission.work_date = p_work_date
    order by approval_group.reviewed_at desc
  loop
    select count(*) into v_other_members
    from public.attendance_progress_approval_group_submissions member
    join public.attendance_progress_submissions submission
      on submission.id = member.submission_id
    where member.group_id = v_group.id
      and not (
        submission.worker_id = p_worker_id
        and submission.work_date = p_work_date
      );

    if v_other_members > 0 then
      select count(*) into v_other_members
      from public.attendance_progress_approval_group_units group_unit
      where group_unit.group_id = v_group.id;
      v_preserved_shared_progress := v_preserved_shared_progress + v_other_members;
      continue;
    end if;

    for v_group_unit in
      select *
      from public.attendance_progress_approval_group_units group_unit
      where group_unit.group_id = v_group.id
      order by group_unit.building, group_unit.unit
    loop
      select * into v_progress
      from public.unit_progress progress_row
      where progress_row.project_name = v_group.project_name
        and progress_row.building = v_group_unit.building
        and progress_row.unit = v_group_unit.unit
        and progress_row.process_type = v_group.progress_process_type
      for update;

      if v_group_unit.previous_exists then
        if not found then
          raise exception '공동승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
        end if;
        if v_group_unit.previous_status = '작업완료' then
          if v_progress.status is distinct from v_group_unit.previous_status
             or v_progress.completion_date is distinct from v_group_unit.previous_completion_date then
            raise exception '공동승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
          end if;
        elsif v_progress.status is distinct from '작업완료'
           or v_progress.completion_date is distinct from v_group.work_date then
          raise exception '공동승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
        end if;

        update public.unit_progress
        set status = v_group_unit.previous_status,
            completion_date = v_group_unit.previous_completion_date
        where project_name = v_group.project_name
          and building = v_group_unit.building
          and unit = v_group_unit.unit
          and process_type = v_group.progress_process_type;
      else
        if not found
           or v_progress.status is distinct from '작업완료'
           or v_progress.completion_date is distinct from v_group.work_date then
          raise exception '공동승인 후 진척자료가 변경되어 안전하게 초기화할 수 없습니다.';
        end if;

        delete from public.unit_progress
        where project_name = v_group.project_name
          and building = v_group_unit.building
          and unit = v_group_unit.unit
          and process_type = v_group.progress_process_type;
      end if;

      v_restored_group_progress := v_restored_group_progress + 1;
    end loop;

    delete from public.attendance_progress_approval_groups
    where id = v_group.id;
  end loop;

  v_base := public.attendance_manager_reset_test_attendance_v52_48_5_11(
    p_project_name,
    p_worker_id,
    p_work_date,
    p_reason
  );

  v_base_preserved_legacy := coalesce(
    (v_base ->> 'preserved_legacy_progress_count')::integer,
    0
  );

  delete from public.attendance_progress_approval_groups approval_group
  where not exists (
    select 1
    from public.attendance_progress_approval_group_submissions member
    where member.group_id = approval_group.id
  );

  return v_base || jsonb_build_object(
    'restored_group_progress_count', v_restored_group_progress,
    'preserved_shared_progress_count', v_preserved_shared_progress,
    'preserved_legacy_progress_count', greatest(
      0,
      v_base_preserved_legacy - v_group_submission_units
    )
  );
end;
$$;

-- =========================================================
-- 5. 실행권한
-- =========================================================

revoke all on function public.attendance_manager_progress_submissions_v52_48_5_12(text)
  from public, anon, authenticated;
revoke all on function public.attendance_manager_review_progress_group_v52_48_5_12(
  uuid[], boolean, text
) from public, anon, authenticated;
revoke all on function public.attendance_manager_reset_test_attendance_v52_48_5_12(
  text, uuid, date, text
) from public, anon, authenticated;

grant execute on function public.attendance_manager_progress_submissions_v52_48_5_12(text)
  to authenticated;
grant execute on function public.attendance_manager_review_progress_group_v52_48_5_12(
  uuid[], boolean, text
) to authenticated;
grant execute on function public.attendance_manager_reset_test_attendance_v52_48_5_12(
  text, uuid, date, text
) to authenticated;

commit;

-- =========================================================
-- 6. 적용결과 확인
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'attendance_progress_approval_groups',
    'attendance_progress_approval_group_submissions',
    'attendance_progress_approval_group_units'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_manager_progress_submissions_v52_48_5_12',
    'attendance_manager_review_progress_group_v52_48_5_12',
    'attendance_manager_reset_test_attendance_v52_48_5_12'
  )
order by routine_name;
