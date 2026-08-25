-- 사내시스템 v52.48.5.9
-- 퇴근 QR에서 완료 세대를 제출하고 담당자 승인 후에만 unit_progress에 반영합니다.
-- 선행 조건: v52.48.5.5 및 v52.48.5.6 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- 1. 작업자 제출 원본과 선택 세대 보관
-- =========================================================

create table if not exists public.attendance_progress_submissions (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  worker_id uuid references public.attendance_workers(id) on delete set null,
  work_date date not null,
  check_in_event_id uuid not null references public.attendance_events(id) on delete restrict,
  check_out_event_id uuid not null references public.attendance_events(id) on delete restrict,
  building text,
  floor integer,
  attendance_trade_name text,
  progress_process_type text,
  completion_state text not null check (completion_state in ('none', 'submitted')),
  review_status text not null check (review_status in ('not_required', 'pending', 'approved', 'rejected')),
  submitted_units_count integer not null default 0 check (submitted_units_count >= 0),
  applied_units_count integer not null default 0 check (applied_units_count >= 0),
  skipped_units_count integer not null default 0 check (skipped_units_count >= 0),
  submitted_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_out_event_id)
);

create table if not exists public.attendance_progress_submission_units (
  submission_id uuid not null references public.attendance_progress_submissions(id) on delete cascade,
  unit text not null,
  created_at timestamptz not null default now(),
  primary key (submission_id, unit)
);

create index if not exists idx_attendance_progress_submissions_project_status
  on public.attendance_progress_submissions(project_name, review_status, submitted_at desc);

create index if not exists idx_attendance_progress_submissions_worker_date
  on public.attendance_progress_submissions(worker_id, work_date desc);

alter table public.attendance_progress_submissions enable row level security;
alter table public.attendance_progress_submission_units enable row level security;

revoke all on public.attendance_progress_submissions from public, anon, authenticated;
revoke all on public.attendance_progress_submission_units from public, anon, authenticated;

comment on table public.attendance_progress_submissions
  is 'v52.48.5.9 퇴근 시 제출한 완료세대와 담당자 승인상태';
comment on table public.attendance_progress_submission_units
  is 'v52.48.5.9 작업자가 골구도에서 선택한 완료 세대 원본';

-- =========================================================
-- 2. 근태 공정 → 기존 진척관리 세부공정 매핑
-- =========================================================

create or replace function public.attendance_progress_process_options_v52_48_5_9(
  p_attendance_trade_name text
)
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
  select case trim(coalesce(p_attendance_trade_name, ''))
    when '먹매김' then array['바닥먹', '허리먹']::text[]
    when '단열' then array['단열']::text[]
    when '합지' then array['합지']::text[]
    when '경량벽체' then array['경량골조', '경량석고']::text[]
    when '세대천정' then array['세대천정']::text[]
    when '몰딩' then array['1차몰딩', '2차몰딩']::text[]
    when '걸레받이' then array['1차 걸레받이', '2차 걸레받이']::text[]
    else array[]::text[]
  end;
$$;

-- building_settings.config_json의 필로티·예외세대·합쳐진 세대(aliasUnits)를
-- 기존 골구도와 같은 규칙으로 계산해 해당 층의 실제 세대번호만 반환합니다.
create or replace function public.attendance_valid_floor_units_v52_48_5_9(
  p_project_name text,
  p_building text,
  p_floor integer
)
returns table(unit text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_floors integer := 0;
  v_units_per_floor integer := 0;
  v_floor_key text := p_floor::text;
  v_has_exception boolean := false;
  v_is_piloti boolean := false;
begin
  if p_floor is null or p_floor < 1 then
    return;
  end if;

  select setting.config_json
  into v_config
  from public.building_settings setting
  where setting.project_name = trim(p_project_name)
    and setting.building_name = trim(p_building)
  limit 1;

  if not found or v_config is null then
    return;
  end if;

  if coalesce(v_config ->> 'floors', '') ~ '^[0-9]+$' then
    v_floors := (v_config ->> 'floors')::integer;
  end if;
  if p_floor > v_floors then
    return;
  end if;

  if coalesce(v_config ->> 'unitsPerFloor', '') ~ '^[0-9]+$' then
    v_units_per_floor := (v_config ->> 'unitsPerFloor')::integer;
  end if;
  if v_units_per_floor < 1 then
    return;
  end if;

  v_has_exception := coalesce(v_config -> 'exceptions', '{}'::jsonb) ? v_floor_key;
  select exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_config -> 'pilotiFloors', '[]'::jsonb)
    ) item(value)
    where item.value ~ '^[0-9]+$'
      and item.value::integer = p_floor
  ) into v_is_piloti;

  return query
  select distinct
    p_floor::text || lpad(
      (
        case
          when coalesce(
            v_config -> 'aliasUnits' -> v_floor_key ->> visual.visual_unit::text,
            ''
          ) ~ '^[0-9]+$'
          then (
            v_config -> 'aliasUnits' -> v_floor_key ->> visual.visual_unit::text
          )::integer
          else visual.visual_unit
        end
      )::text,
      2,
      '0'
    ) as unit
  from generate_series(1, v_units_per_floor) visual(visual_unit)
  where case
    when v_has_exception then exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          v_config -> 'exceptions' -> v_floor_key -> 'units',
          '[]'::jsonb
        )
      ) active_unit(value)
      where active_unit.value ~ '^[0-9]+$'
        and active_unit.value::integer = visual.visual_unit
    )
    else not v_is_piloti
  end
  order by 1;
end;
$$;

-- =========================================================
-- 3. 퇴근 QR 처리토큰을 작업완료 입력용으로 준비
-- =========================================================

create or replace function public.attendance_prepare_checkout_context_v52_48_5_9(
  p_session_token text,
  p_device_key text,
  p_processing_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid := public.attendance_resolve_worker_v52_14(
    p_session_token,
    p_device_key,
    true
  );
  v_worker public.attendance_workers%rowtype;
  v_exchange public.attendance_qr_exchanges%rowtype;
  v_check_in public.attendance_events%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_extended_expires_at timestamptz := clock_timestamp() + interval '15 minutes';
  v_process_options text[] := array[]::text[];
  v_building_config jsonb;
  v_completed_units jsonb := '[]'::jsonb;
  v_can_submit boolean := false;
  v_unavailable_reason text := '';
begin
  select *
  into v_exchange
  from public.attendance_qr_exchanges
  where processing_token_hash = public.attendance_hash_v52_14(trim(p_processing_token))
    and worker_id = v_worker_id
    and consumed_at is null
    and expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception '일회용 처리시간이 지났거나 이미 사용된 요청입니다.';
  end if;
  if v_exchange.proposed_event_type <> 'check_out' then
    raise exception '퇴근 처리에서만 작업완료를 입력할 수 있습니다.';
  end if;

  select * into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  select *
  into v_check_in
  from public.attendance_events event_row
  where event_row.worker_id = v_worker_id
    and event_row.work_date = v_today
    and event_row.event_type = 'check_in'
  order by event_row.event_at
  limit 1;

  if not found then
    raise exception '출근 기록이 없어 퇴근 처리할 수 없습니다.';
  end if;

  update public.attendance_qr_exchanges
  set expires_at = greatest(expires_at, v_extended_expires_at)
  where id = v_exchange.id;

  v_process_options := public.attendance_progress_process_options_v52_48_5_9(
    v_check_in.work_trade_name
  );

  if v_check_in.work_location_mode <> 'standard' then
    v_unavailable_reason := 'other_location';
  elsif cardinality(v_process_options) = 0 then
    v_unavailable_reason := 'unsupported_trade';
  else
    select setting.config_json
    into v_building_config
    from public.building_settings setting
    where setting.project_name = v_worker.project_name
      and setting.building_name = v_check_in.work_building
    limit 1;

    if not found or v_building_config is null or not exists (
      select 1
      from public.attendance_valid_floor_units_v52_48_5_9(
        v_worker.project_name,
        v_check_in.work_building,
        v_check_in.work_floor
      )
    ) then
      v_unavailable_reason := 'no_building_data';
    else
      v_can_submit := true;
    end if;
  end if;

  if v_can_submit then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'unit', progress_row.unit,
          'process_type', progress_row.process_type
        )
        order by progress_row.process_type, progress_row.unit
      ),
      '[]'::jsonb
    )
    into v_completed_units
    from public.unit_progress progress_row
    where progress_row.project_name = v_worker.project_name
      and progress_row.building = v_check_in.work_building
      and progress_row.process_type = any(v_process_options)
      and progress_row.status = '작업완료'
      and exists (
        select 1
        from public.attendance_valid_floor_units_v52_48_5_9(
          v_worker.project_name,
          v_check_in.work_building,
          v_check_in.work_floor
        ) allowed
        where allowed.unit = progress_row.unit
      );
  end if;

  return jsonb_build_object(
    'processing_token', trim(p_processing_token),
    'event_type', 'check_out',
    'project_name', v_worker.project_name,
    'work_date', v_today,
    'work_location_mode', v_check_in.work_location_mode,
    'work_building', v_check_in.work_building,
    'work_floor', v_check_in.work_floor,
    'work_location_text', v_check_in.work_location_text,
    'work_trade_name', v_check_in.work_trade_name,
    'can_submit_progress', v_can_submit,
    'progress_unavailable_reason', nullif(v_unavailable_reason, ''),
    'progress_process_options', to_jsonb(v_process_options),
    'building_config', coalesce(v_building_config, '{}'::jsonb),
    'completed_units', coalesce(v_completed_units, '[]'::jsonb),
    'expires_at', v_extended_expires_at
  );
end;
$$;

-- =========================================================
-- 4. 퇴근 확정 + 진척 제출 원본 생성 (unit_progress 미변경)
-- =========================================================

create or replace function public.attendance_finalize_checkout_progress_v52_48_5_9(
  p_session_token text,
  p_device_key text,
  p_processing_token text,
  p_completion_state text,
  p_progress_process_type text,
  p_units text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid := public.attendance_resolve_worker_v52_14(
    p_session_token,
    p_device_key,
    true
  );
  v_worker public.attendance_workers%rowtype;
  v_exchange public.attendance_qr_exchanges%rowtype;
  v_check_in public.attendance_events%rowtype;
  v_event_at timestamptz := clock_timestamp();
  v_work_date date := (v_event_at at time zone 'Asia/Seoul')::date;
  v_event_id uuid;
  v_submission_id uuid;
  v_completion_state text := trim(coalesce(p_completion_state, ''));
  v_progress_process_type text := trim(coalesce(p_progress_process_type, ''));
  v_process_options text[] := array[]::text[];
  v_units text[] := array[]::text[];
  v_can_submit boolean := false;
begin
  select *
  into v_exchange
  from public.attendance_qr_exchanges
  where processing_token_hash = public.attendance_hash_v52_14(trim(p_processing_token))
    and worker_id = v_worker_id
    and consumed_at is null
    and expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception '일회용 처리시간이 지났거나 이미 사용된 요청입니다.';
  end if;
  if v_exchange.proposed_event_type <> 'check_out' then
    raise exception '퇴근 처리 요청이 아닙니다.';
  end if;

  select * into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  select *
  into v_check_in
  from public.attendance_events event_row
  where event_row.worker_id = v_worker_id
    and event_row.work_date = v_work_date
    and event_row.event_type = 'check_in'
  order by event_row.event_at
  limit 1;

  if not found then
    raise exception '출근 기록이 없어 퇴근 처리할 수 없습니다.';
  end if;

  v_process_options := public.attendance_progress_process_options_v52_48_5_9(
    v_check_in.work_trade_name
  );
  v_can_submit :=
    v_check_in.work_location_mode = 'standard'
    and cardinality(v_process_options) > 0
    and exists (
      select 1
      from public.attendance_valid_floor_units_v52_48_5_9(
        v_worker.project_name,
        v_check_in.work_building,
        v_check_in.work_floor
      )
    );

  if not v_can_submit then
    v_completion_state := 'none';
    v_progress_process_type := '';
    v_units := array[]::text[];
  else
    if v_completion_state not in ('none', 'submitted') then
      raise exception '오늘 완료한 세대가 있는지 선택해주세요.';
    end if;

    if v_completion_state = 'submitted' then
      if not (v_progress_process_type = any(v_process_options)) then
        raise exception '진척에 반영할 수 없는 세부공정입니다.';
      end if;

      select coalesce(array_agg(distinct trim(unit_value)), array[]::text[])
      into v_units
      from unnest(coalesce(p_units, array[]::text[])) unit_value
      where trim(unit_value) <> '';

      if cardinality(v_units) < 1 then
        raise exception '완료한 세대를 한 곳 이상 선택해주세요.';
      end if;
      if cardinality(v_units) > 200 then
        raise exception '한 번에 선택할 수 있는 세대 수를 초과했습니다.';
      end if;

      if exists (
        select 1
        from unnest(v_units) submitted(unit)
        where not exists (
          select 1
          from public.attendance_valid_floor_units_v52_48_5_9(
            v_worker.project_name,
            v_check_in.work_building,
            v_check_in.work_floor
          ) allowed
          where allowed.unit = submitted.unit
        )
      ) then
        raise exception '선택한 동·층에 존재하지 않는 세대가 포함되어 있습니다.';
      end if;

      if exists (
        select 1
        from public.unit_progress progress_row
        where progress_row.project_name = v_worker.project_name
          and progress_row.building = v_check_in.work_building
          and progress_row.process_type = v_progress_process_type
          and progress_row.unit = any(v_units)
          and progress_row.status = '작업완료'
      ) then
        raise exception '이미 작업완료된 세대가 포함되어 있습니다. 화면을 다시 열어 확인해주세요.';
      end if;
    else
      v_progress_process_type := '';
      v_units := array[]::text[];
    end if;
  end if;

  update public.attendance_qr_exchanges
  set consumed_at = v_event_at
  where id = v_exchange.id;

  insert into public.attendance_events (
    worker_id,
    project_name,
    work_date,
    event_type,
    event_at,
    source,
    qr_token_id
  ) values (
    v_worker_id,
    v_worker.project_name,
    v_work_date,
    'check_out',
    v_event_at,
    'qr',
    v_exchange.qr_token_id
  ) returning id into v_event_id;

  insert into public.attendance_progress_submissions (
    project_name,
    worker_id,
    work_date,
    check_in_event_id,
    check_out_event_id,
    building,
    floor,
    attendance_trade_name,
    progress_process_type,
    completion_state,
    review_status,
    submitted_units_count
  ) values (
    v_worker.project_name,
    v_worker_id,
    v_work_date,
    v_check_in.id,
    v_event_id,
    v_check_in.work_building,
    v_check_in.work_floor,
    v_check_in.work_trade_name,
    nullif(v_progress_process_type, ''),
    v_completion_state,
    case when v_completion_state = 'submitted' then 'pending' else 'not_required' end,
    cardinality(v_units)
  ) returning id into v_submission_id;

  if v_completion_state = 'submitted' then
    insert into public.attendance_progress_submission_units (
      submission_id,
      unit
    )
    select v_submission_id, submitted.unit
    from unnest(v_units) submitted(unit);
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_type', 'check_out',
    'event_at', v_event_at,
    'work_date', v_work_date,
    'project_name', v_worker.project_name,
    'submission_id', v_submission_id,
    'completion_state', v_completion_state,
    'review_status', case when v_completion_state = 'submitted' then 'pending' else 'not_required' end,
    'submitted_units_count', cardinality(v_units)
  );
exception
  when unique_violation then
    raise exception '오늘 퇴근 기록이 이미 있거나 같은 요청이 처리되었습니다.';
end;
$$;

-- =========================================================
-- 5. 담당자 제출 목록과 승인·반려
-- =========================================================

create or replace function public.attendance_manager_progress_submissions_v52_48_5_9(
  p_project_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.attendance_manager_can_v52_14(p_project_name, false) then
    raise exception '이 현장의 진척 제출 조회 권한이 없습니다.';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(list_row) - 'sort_rank'
      order by list_row.sort_rank, list_row.submitted_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      submission.id,
      submission.work_date,
      submission.worker_id,
      coalesce(worker.name_ko, '삭제된 근로자') as worker_name,
      worker.company_name,
      submission.building,
      submission.floor,
      submission.attendance_trade_name,
      submission.progress_process_type,
      submission.completion_state,
      submission.review_status,
      submission.submitted_units_count,
      submission.applied_units_count,
      submission.skipped_units_count,
      submission.submitted_at,
      submission.reviewed_at,
      submission.reviewed_by,
      submission.review_reason,
      reviewer.manager_name as reviewer_name,
      coalesce(setting.config_json, '{}'::jsonb) as building_config,
      coalesce((
        select jsonb_agg(unit_row.unit order by unit_row.unit)
        from public.attendance_progress_submission_units unit_row
        where unit_row.submission_id = submission.id
      ), '[]'::jsonb) as units,
      case submission.review_status
        when 'pending' then 0
        when 'rejected' then 1
        when 'approved' then 2
        else 3
      end as sort_rank
    from public.attendance_progress_submissions submission
    left join public.attendance_workers worker
      on worker.id = submission.worker_id
    left join public.user_profiles reviewer
      on reviewer.auth_user_id = submission.reviewed_by
    left join public.building_settings setting
      on setting.project_name = submission.project_name
     and setting.building_name = submission.building
    where submission.project_name = trim(p_project_name)
    order by
      case submission.review_status
        when 'pending' then 0
        when 'rejected' then 1
        when 'approved' then 2
        else 3
      end,
      submission.submitted_at desc
    limit 200
  ) list_row;

  return v_rows;
end;
$$;

create or replace function public.attendance_manager_review_progress_v52_48_5_9(
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
  v_total integer := 0;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_reason text := trim(coalesce(p_reason, ''));
  v_process_options text[] := array[]::text[];
begin
  select *
  into v_submission
  from public.attendance_progress_submissions
  where id = p_submission_id
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
  if not coalesce(p_approved, false) and length(v_reason) < 2 then
    raise exception '반려 사유를 2자 이상 입력해주세요.';
  end if;

  select count(*)
  into v_total
  from public.attendance_progress_submission_units unit_row
  where unit_row.submission_id = v_submission.id;

  if v_total <> v_submission.submitted_units_count or v_total < 1 then
    raise exception '제출된 완료 세대 원본을 확인할 수 없습니다.';
  end if;

  if coalesce(p_approved, false) then
    v_process_options := public.attendance_progress_process_options_v52_48_5_9(
      v_submission.attendance_trade_name
    );
    if not (v_submission.progress_process_type = any(v_process_options)) then
      raise exception '출근 공정과 진척 세부공정 연결을 확인할 수 없습니다.';
    end if;

    if exists (
      select 1
      from public.attendance_progress_submission_units submitted
      where submitted.submission_id = v_submission.id
        and not exists (
          select 1
          from public.attendance_valid_floor_units_v52_48_5_9(
            v_submission.project_name,
            v_submission.building,
            v_submission.floor
          ) allowed
          where allowed.unit = submitted.unit
        )
    ) then
      raise exception '현재 골구도와 일치하지 않는 세대가 포함되어 있습니다.';
    end if;

    insert into public.unit_progress (
      project_name,
      building,
      unit,
      process_type,
      status,
      completion_date
    )
    select
      v_submission.project_name,
      v_submission.building,
      submitted.unit,
      v_submission.progress_process_type,
      '작업완료',
      v_submission.work_date
    from public.attendance_progress_submission_units submitted
    where submitted.submission_id = v_submission.id
    on conflict (project_name, building, unit, process_type)
    do update set
      status = excluded.status,
      completion_date = excluded.completion_date
    where unit_progress.status is distinct from '작업완료';

    get diagnostics v_applied = row_count;
    v_skipped := greatest(0, v_total - v_applied);

    update public.attendance_progress_submissions
    set review_status = 'approved',
        applied_units_count = v_applied,
        skipped_units_count = v_skipped,
        reviewed_at = clock_timestamp(),
        reviewed_by = auth.uid(),
        review_reason = case when v_reason = '' then '담당자 골구도 확인 후 승인' else v_reason end,
        updated_at = now()
    where id = v_submission.id;
  else
    update public.attendance_progress_submissions
    set review_status = 'rejected',
        applied_units_count = 0,
        skipped_units_count = 0,
        reviewed_at = clock_timestamp(),
        reviewed_by = auth.uid(),
        review_reason = v_reason,
        updated_at = now()
    where id = v_submission.id;
  end if;

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
    v_submission.project_name,
    v_submission.worker_id,
    case when p_approved then 'progress_submission_approved' else 'progress_submission_rejected' end,
    case when p_approved then '퇴근 진척 승인' else '퇴근 진척 반려' end,
    auth.uid(),
    jsonb_build_object(
      'submission_id', v_submission.id,
      'review_status', 'pending',
      'submitted_units_count', v_total
    ),
    jsonb_build_object(
      'review_status', case when p_approved then 'approved' else 'rejected' end,
      'process_type', v_submission.progress_process_type,
      'applied_units_count', v_applied,
      'skipped_units_count', v_skipped
    ),
    case when p_approved and v_reason = '' then '담당자 골구도 확인 후 승인' else v_reason end
  );

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'review_status', case when p_approved then 'approved' else 'rejected' end,
    'submitted_units_count', v_total,
    'applied_units_count', v_applied,
    'skipped_units_count', v_skipped
  );
end;
$$;

-- =========================================================
-- 6. 실행 권한
-- =========================================================

revoke all on function public.attendance_progress_process_options_v52_48_5_9(text)
  from public, anon, authenticated;
revoke all on function public.attendance_valid_floor_units_v52_48_5_9(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.attendance_prepare_checkout_context_v52_48_5_9(text, text, text)
  from public, anon, authenticated;
revoke all on function public.attendance_finalize_checkout_progress_v52_48_5_9(text, text, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.attendance_manager_progress_submissions_v52_48_5_9(text)
  from public, anon, authenticated;
revoke all on function public.attendance_manager_review_progress_v52_48_5_9(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.attendance_prepare_checkout_context_v52_48_5_9(text, text, text)
  to anon, authenticated;
grant execute on function public.attendance_finalize_checkout_progress_v52_48_5_9(text, text, text, text, text, text[])
  to anon, authenticated;
grant execute on function public.attendance_manager_progress_submissions_v52_48_5_9(text)
  to authenticated;
grant execute on function public.attendance_manager_review_progress_v52_48_5_9(uuid, boolean, text)
  to authenticated;

commit;

-- =========================================================
-- 7. 적용 결과 확인
-- 아래 두 결과표의 항목이 모두 표시되면 정상입니다.
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'attendance_progress_submissions',
    'attendance_progress_submission_units'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_progress_process_options_v52_48_5_9',
    'attendance_valid_floor_units_v52_48_5_9',
    'attendance_prepare_checkout_context_v52_48_5_9',
    'attendance_finalize_checkout_progress_v52_48_5_9',
    'attendance_manager_progress_submissions_v52_48_5_9',
    'attendance_manager_review_progress_v52_48_5_9'
  )
order by routine_name;
