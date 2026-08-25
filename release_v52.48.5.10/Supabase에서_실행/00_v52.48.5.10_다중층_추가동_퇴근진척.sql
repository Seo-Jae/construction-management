-- 사내시스템 v52.48.5.10
-- 출근 시 1개 동의 여러 층을 작업범위로 등록하고,
-- 퇴근 시 다른 동·층을 추가한 뒤 동·층별 완료세대를 제출합니다.
-- 선행 조건: v52.48.5.9 SQL 적용 완료

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- 1. 다중 작업범위와 다중 동·층 제출원본
-- =========================================================

create table if not exists public.attendance_work_scopes (
  check_in_event_id uuid not null references public.attendance_events(id) on delete cascade,
  project_name text not null references public.attendance_sites(project_name),
  building text not null,
  floor integer not null check (floor >= 1),
  scope_mode text not null default 'whole_floor'
    check (scope_mode in ('whole_floor', 'selected_units')),
  created_at timestamptz not null default now(),
  primary key (check_in_event_id, building, floor)
);

alter table public.attendance_work_scopes
  add column if not exists scope_mode text not null default 'whole_floor';

create table if not exists public.attendance_work_scope_units (
  check_in_event_id uuid not null,
  building text not null,
  floor integer not null check (floor >= 1),
  unit text not null,
  created_at timestamptz not null default now(),
  primary key (check_in_event_id, building, unit),
  foreign key (check_in_event_id, building, floor)
    references public.attendance_work_scopes(check_in_event_id, building, floor)
    on delete cascade
);

create index if not exists idx_attendance_work_scopes_project_building
  on public.attendance_work_scopes(project_name, building, floor);

create table if not exists public.attendance_progress_submission_scopes (
  submission_id uuid not null references public.attendance_progress_submissions(id) on delete cascade,
  building text not null,
  floor integer not null check (floor >= 1),
  scope_source text not null check (scope_source in ('check_in', 'checkout_added')),
  created_at timestamptz not null default now(),
  primary key (submission_id, building, floor)
);

create table if not exists public.attendance_progress_submission_unit_details (
  submission_id uuid not null references public.attendance_progress_submissions(id) on delete cascade,
  building text not null,
  floor integer not null check (floor >= 1),
  unit text not null,
  scope_source text not null check (scope_source in ('check_in', 'checkout_added')),
  created_at timestamptz not null default now(),
  primary key (submission_id, building, unit)
);

create index if not exists idx_attendance_progress_scope_submission
  on public.attendance_progress_submission_scopes(submission_id, scope_source);
create index if not exists idx_attendance_progress_unit_detail_submission
  on public.attendance_progress_submission_unit_details(submission_id, building, floor);

alter table public.attendance_work_scopes enable row level security;
alter table public.attendance_work_scope_units enable row level security;
alter table public.attendance_progress_submission_scopes enable row level security;
alter table public.attendance_progress_submission_unit_details enable row level security;

revoke all on public.attendance_work_scopes from public, anon, authenticated;
revoke all on public.attendance_work_scope_units from public, anon, authenticated;
revoke all on public.attendance_progress_submission_scopes from public, anon, authenticated;
revoke all on public.attendance_progress_submission_unit_details from public, anon, authenticated;

comment on table public.attendance_work_scopes
  is 'v52.48.5.10 출근 시 등록한 1개 동의 다중 작업층';
comment on table public.attendance_work_scope_units
  is 'v52.48.5.10 출근 시 작업예정으로 선택한 세대';
comment on table public.attendance_progress_submission_scopes
  is 'v52.48.5.10 퇴근 진척제출의 출근 범위와 퇴근 시 추가한 동·층';
comment on table public.attendance_progress_submission_unit_details
  is 'v52.48.5.10 여러 동에서 중복되는 호수를 구분하는 완료세대 원본';

-- 기존 단일 동·층 출근기록을 새 작업범위로 이관합니다.
insert into public.attendance_work_scopes (
  check_in_event_id,
  project_name,
  building,
  floor
)
select
  event_row.id,
  event_row.project_name,
  event_row.work_building,
  event_row.work_floor
from public.attendance_events event_row
where event_row.event_type = 'check_in'
  and event_row.work_location_mode = 'standard'
  and nullif(trim(event_row.work_building), '') is not null
  and event_row.work_floor is not null
on conflict (check_in_event_id, building, floor) do nothing;

-- v52.48.5.9에서 이미 제출된 단일 동·층 데이터도 이관합니다.
insert into public.attendance_progress_submission_scopes (
  submission_id,
  building,
  floor,
  scope_source
)
select
  submission.id,
  submission.building,
  submission.floor,
  'check_in'
from public.attendance_progress_submissions submission
where submission.completion_state = 'submitted'
  and nullif(trim(submission.building), '') is not null
  and submission.floor is not null
on conflict (submission_id, building, floor) do nothing;

insert into public.attendance_progress_submission_unit_details (
  submission_id,
  building,
  floor,
  unit,
  scope_source
)
select
  old_unit.submission_id,
  submission.building,
  submission.floor,
  old_unit.unit,
  'check_in'
from public.attendance_progress_submission_units old_unit
join public.attendance_progress_submissions submission
  on submission.id = old_unit.submission_id
where nullif(trim(submission.building), '') is not null
  and submission.floor is not null
on conflict (submission_id, building, unit) do nothing;

-- =========================================================
-- 2. 출근 화면: 동·층·호수 골구도 준비
-- =========================================================

create or replace function public.attendance_prepare_work_context_v52_48_5_10(
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
  v_base jsonb;
  v_buildings jsonb := '[]'::jsonb;
begin
  v_base := public.attendance_prepare_work_context_v52_48_5_5(
    p_session_token,
    p_device_key,
    p_processing_token
  );

  select * into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'building_name', setting.building_name,
        'floors', case
          when coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
            then (setting.config_json ->> 'floors')::integer
          else 0
        end,
        'config_json', setting.config_json
      )
      order by setting.building_name
    ),
    '[]'::jsonb
  )
  into v_buildings
  from public.building_settings setting
  where setting.project_name = v_worker.project_name
    and coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
    and (setting.config_json ->> 'floors')::integer > 0;

  return v_base || jsonb_build_object(
    'buildings', coalesce(v_buildings, '[]'::jsonb)
  );
end;
$$;

-- =========================================================
-- 3. 출근 확정: 1개 동 + 여러 층 + 선택 호수
-- =========================================================

create or replace function public.attendance_finalize_checkin_scopes_v52_48_5_10(
  p_session_token text,
  p_device_key text,
  p_processing_token text,
  p_location_mode text,
  p_building text,
  p_floors integer[],
  p_scope_mode text,
  p_units jsonb,
  p_location_text text,
  p_trade_name text
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
  v_location_mode text := trim(coalesce(p_location_mode, ''));
  v_building text := trim(coalesce(p_building, ''));
  v_scope_mode text := trim(coalesce(p_scope_mode, 'whole_floor'));
  v_floors integer[] := array[]::integer[];
  v_units_payload jsonb := case
    when jsonb_typeof(coalesce(p_units, '[]'::jsonb)) = 'array'
      then coalesce(p_units, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_normalized_units jsonb := '[]'::jsonb;
  v_item jsonb;
  v_unit text;
  v_unit_floor integer;
  v_building_floors integer := 0;
  v_result jsonb;
  v_event_id uuid;
  v_proposed_event_type text;
  v_project_name text;
begin
  select exchange_row.proposed_event_type
  into v_proposed_event_type
  from public.attendance_qr_exchanges exchange_row
  where exchange_row.processing_token_hash = public.attendance_hash_v52_14(
      trim(p_processing_token)
    )
    and exchange_row.worker_id = v_worker_id
    and exchange_row.consumed_at is null
    and exchange_row.expires_at >= clock_timestamp()
  limit 1;

  if not found or v_proposed_event_type <> 'check_in' then
    raise exception '출근 처리 요청이 아니거나 일회용 처리시간이 지났습니다.';
  end if;

  select worker.project_name
  into v_project_name
  from public.attendance_workers worker
  where worker.id = v_worker_id;

  if v_location_mode = 'standard' then
    select coalesce(array_agg(floor_value order by floor_value), array[]::integer[])
    into v_floors
    from (
      select distinct floor_value
      from unnest(coalesce(p_floors, array[]::integer[])) floor_value
      where floor_value is not null and floor_value >= 1
    ) normalized;

    if v_building = '' or cardinality(v_floors) < 1 then
      raise exception '작업할 동과 시작·마지막 층을 선택해주세요.';
    end if;
    if cardinality(v_floors) > 60 then
      raise exception '한 번에 등록할 수 있는 작업층 범위를 초과했습니다.';
    end if;

    select case
      when coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
        then (setting.config_json ->> 'floors')::integer
      else 0
    end
    into v_building_floors
    from public.building_settings setting
    where setting.project_name = v_project_name
      and setting.building_name = v_building
    limit 1;

    if not found or v_building_floors < 1 then
      raise exception '선택한 동의 골구도 정보를 확인할 수 없습니다.';
    end if;
    if v_floors[cardinality(v_floors)] > v_building_floors then
      raise exception '선택한 동에 존재하지 않는 층이 포함되어 있습니다.';
    end if;

    if v_scope_mode not in ('whole_floor', 'selected_units') then
      raise exception '세대 작업범위 입력방식을 확인해주세요.';
    end if;

    if v_scope_mode = 'selected_units' then
      if jsonb_array_length(v_units_payload) < 1 then
        raise exception '오늘 작업할 호수를 한 곳 이상 선택해주세요.';
      end if;
      if jsonb_array_length(v_units_payload) > 500 then
        raise exception '한 번에 선택할 수 있는 세대 수를 초과했습니다.';
      end if;

      for v_item in select value from jsonb_array_elements(v_units_payload)
      loop
        v_unit := trim(coalesce(v_item ->> 'unit', ''));
        if trim(coalesce(v_item ->> 'building', '')) <> v_building
           or coalesce(v_item ->> 'floor', '') !~ '^[0-9]+$' then
          raise exception '작업예정 세대의 동·층 정보가 올바르지 않습니다.';
        end if;
        v_unit_floor := (v_item ->> 'floor')::integer;

        if not (v_unit_floor = any(v_floors)) or not exists (
          select 1
          from public.attendance_valid_floor_units_v52_48_5_9(
            v_project_name,
            v_building,
            v_unit_floor
          ) allowed
          where allowed.unit = v_unit
        ) then
          raise exception '선택한 작업층에 존재하지 않는 세대가 포함되어 있습니다.';
        end if;

        v_normalized_units := v_normalized_units || jsonb_build_array(
          jsonb_build_object('floor', v_unit_floor, 'unit', v_unit)
        );
      end loop;
    end if;
  else
    v_floors := array[]::integer[];
    v_scope_mode := 'whole_floor';
    v_normalized_units := '[]'::jsonb;
  end if;

  v_result := public.attendance_finalize_scan_v52_48_5_5(
    p_session_token,
    p_device_key,
    p_processing_token,
    v_location_mode,
    nullif(v_building, ''),
    case when cardinality(v_floors) > 0 then v_floors[1] else null end,
    p_location_text,
    p_trade_name
  );

  v_event_id := (v_result ->> 'event_id')::uuid;

  if v_location_mode = 'standard' then
    insert into public.attendance_work_scopes (
      check_in_event_id,
      project_name,
      building,
      floor,
      scope_mode
    )
    select
      v_event_id,
      v_result ->> 'project_name',
      v_building,
      floor_value,
      v_scope_mode
    from unnest(v_floors) floor_value
    on conflict (check_in_event_id, building, floor) do nothing;
  end if;

  if v_location_mode = 'standard' and v_scope_mode = 'selected_units' then
    insert into public.attendance_work_scope_units (
      check_in_event_id,
      building,
      floor,
      unit
    )
    select distinct
      v_event_id,
      v_building,
      (item.value ->> 'floor')::integer,
      item.value ->> 'unit'
    from jsonb_array_elements(v_normalized_units) item(value)
    on conflict (check_in_event_id, building, unit) do nothing;
  end if;

  return v_result || jsonb_build_object('work_floors', to_jsonb(v_floors));
end;
$$;

-- =========================================================
-- 3. 퇴근 화면: 오전 범위 + 현장 전체 동 정보
-- =========================================================

create or replace function public.attendance_prepare_checkout_context_v52_48_5_10(
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
  v_check_in public.attendance_events%rowtype;
  v_base jsonb;
  v_process_options text[] := array[]::text[];
  v_work_scopes jsonb := '[]'::jsonb;
  v_buildings jsonb := '[]'::jsonb;
  v_completed_units jsonb := '[]'::jsonb;
  v_planned_units jsonb := '[]'::jsonb;
  v_can_submit boolean := false;
  v_unavailable_reason text := '';
begin
  -- v52.48.5.9의 일회용 처리토큰 검증·연장을 그대로 사용합니다.
  v_base := public.attendance_prepare_checkout_context_v52_48_5_9(
    p_session_token,
    p_device_key,
    p_processing_token
  );

  select * into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  select * into v_check_in
  from public.attendance_events event_row
  where event_row.worker_id = v_worker_id
    and event_row.work_date = (clock_timestamp() at time zone 'Asia/Seoul')::date
    and event_row.event_type = 'check_in'
  order by event_row.event_at
  limit 1;

  if not found then
    raise exception '출근 기록이 없어 퇴근 처리할 수 없습니다.';
  end if;

  v_process_options := public.attendance_progress_process_options_v52_48_5_9(
    v_check_in.work_trade_name
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'building', scope_row.building,
        'floor', scope_row.floor,
        'scope_source', 'check_in',
        'scope_mode', scope_row.scope_mode,
        'config_json', coalesce(setting.config_json, '{}'::jsonb)
      )
      order by scope_row.building, scope_row.floor
    ),
    '[]'::jsonb
  )
  into v_work_scopes
  from public.attendance_work_scopes scope_row
  left join public.building_settings setting
    on setting.project_name = scope_row.project_name
   and setting.building_name = scope_row.building
  where scope_row.check_in_event_id = v_check_in.id;

  if jsonb_array_length(v_work_scopes) = 0
     and v_check_in.work_location_mode = 'standard'
     and nullif(trim(v_check_in.work_building), '') is not null
     and v_check_in.work_floor is not null then
    select jsonb_build_array(
      jsonb_build_object(
        'building', v_check_in.work_building,
        'floor', v_check_in.work_floor,
        'scope_source', 'check_in',
        'scope_mode', 'whole_floor',
        'config_json', coalesce(setting.config_json, '{}'::jsonb)
      )
    )
    into v_work_scopes
    from public.building_settings setting
    where setting.project_name = v_worker.project_name
      and setting.building_name = v_check_in.work_building
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'building_name', setting.building_name,
        'floors', case
          when coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
            then (setting.config_json ->> 'floors')::integer
          else 0
        end,
        'config_json', setting.config_json
      )
      order by setting.building_name
    ),
    '[]'::jsonb
  )
  into v_buildings
  from public.building_settings setting
  where setting.project_name = v_worker.project_name
    and coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
    and (setting.config_json ->> 'floors')::integer > 0;

  if v_check_in.work_location_mode <> 'standard' then
    v_unavailable_reason := 'other_location';
  elsif cardinality(v_process_options) = 0 then
    v_unavailable_reason := 'unsupported_trade';
  elsif not exists (
    select 1
    from public.attendance_work_scopes scope_row
    where scope_row.check_in_event_id = v_check_in.id
      and exists (
        select 1
        from public.attendance_valid_floor_units_v52_48_5_9(
          scope_row.project_name,
          scope_row.building,
          scope_row.floor
        )
      )
  ) and not exists (
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

  if v_can_submit then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'building', planned.building,
          'floor', planned.floor,
          'unit', planned.unit
        )
        order by planned.building, planned.floor, planned.unit
      ),
      '[]'::jsonb
    )
    into v_planned_units
    from public.attendance_work_scope_units planned
    where planned.check_in_event_id = v_check_in.id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'building', progress_row.building,
          'floor', case
            when progress_row.unit ~ '^[0-9]{3,}$'
              then left(progress_row.unit, length(progress_row.unit) - 2)::integer
            else null
          end,
          'unit', progress_row.unit,
          'process_type', progress_row.process_type
        )
        order by progress_row.building, progress_row.process_type, progress_row.unit
      ),
      '[]'::jsonb
    )
    into v_completed_units
    from public.unit_progress progress_row
    where progress_row.project_name = v_worker.project_name
      and progress_row.process_type = any(v_process_options)
      and progress_row.status = '작업완료';
  end if;

  return v_base || jsonb_build_object(
    'can_submit_progress', v_can_submit,
    'progress_unavailable_reason', nullif(v_unavailable_reason, ''),
    'progress_process_options', to_jsonb(v_process_options),
    'work_scopes', coalesce(v_work_scopes, '[]'::jsonb),
    'buildings', coalesce(v_buildings, '[]'::jsonb),
    'planned_units', coalesce(v_planned_units, '[]'::jsonb),
    'completed_units', coalesce(v_completed_units, '[]'::jsonb)
  );
end;
$$;

-- =========================================================
-- 4. 퇴근 확정 + 여러 동·층의 완료세대 제출
-- =========================================================

create or replace function public.attendance_finalize_checkout_progress_v52_48_5_10(
  p_session_token text,
  p_device_key text,
  p_processing_token text,
  p_completion_state text,
  p_progress_process_type text,
  p_additional_scopes jsonb,
  p_units jsonb
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
  v_process_type text := trim(coalesce(p_progress_process_type, ''));
  v_process_options text[] := array[]::text[];
  v_additional jsonb := case
    when jsonb_typeof(coalesce(p_additional_scopes, '[]'::jsonb)) = 'array'
      then coalesce(p_additional_scopes, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_units_payload jsonb := case
    when jsonb_typeof(coalesce(p_units, '[]'::jsonb)) = 'array'
      then coalesce(p_units, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_normalized_additional jsonb := '[]'::jsonb;
  v_normalized_units jsonb := '[]'::jsonb;
  v_item jsonb;
  v_building text;
  v_floor integer;
  v_unit text;
  v_unit_count integer := 0;
  v_can_submit boolean := false;
begin
  select * into v_exchange
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

  select * into v_check_in
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
    and (
      exists (
        select 1
        from public.attendance_work_scopes scope_row
        where scope_row.check_in_event_id = v_check_in.id
          and exists (
            select 1
            from public.attendance_valid_floor_units_v52_48_5_9(
              scope_row.project_name,
              scope_row.building,
              scope_row.floor
            )
          )
      )
      or exists (
        select 1
        from public.attendance_valid_floor_units_v52_48_5_9(
          v_worker.project_name,
          v_check_in.work_building,
          v_check_in.work_floor
        )
      )
    );

  if not v_can_submit then
    v_completion_state := 'none';
    v_process_type := '';
    v_additional := '[]'::jsonb;
    v_units_payload := '[]'::jsonb;
  else
    if v_completion_state not in ('none', 'submitted') then
      raise exception '오늘 완료한 세대가 있는지 선택해주세요.';
    end if;

    if v_completion_state = 'submitted' then
      if not (v_process_type = any(v_process_options)) then
        raise exception '진척에 반영할 수 없는 세부공정입니다.';
      end if;
      if jsonb_array_length(v_additional) > 60 then
        raise exception '추가할 수 있는 동·층 범위를 초과했습니다.';
      end if;

      for v_item in select value from jsonb_array_elements(v_additional)
      loop
        v_building := trim(coalesce(v_item ->> 'building', ''));
        if coalesce(v_item ->> 'floor', '') !~ '^[0-9]+$' then
          raise exception '추가 작업범위의 층 정보가 올바르지 않습니다.';
        end if;
        v_floor := (v_item ->> 'floor')::integer;

        if v_building = '' or not exists (
          select 1
          from public.building_settings setting
          where setting.project_name = v_worker.project_name
            and setting.building_name = v_building
            and coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
            and v_floor between 1 and (setting.config_json ->> 'floors')::integer
        ) then
          raise exception '추가한 동·층의 골구도 정보를 확인할 수 없습니다.';
        end if;

        v_normalized_additional := v_normalized_additional || jsonb_build_array(
          jsonb_build_object('building', v_building, 'floor', v_floor)
        );
      end loop;

      if jsonb_array_length(v_units_payload) < 1 then
        raise exception '완료한 세대를 한 곳 이상 선택해주세요.';
      end if;
      if jsonb_array_length(v_units_payload) > 500 then
        raise exception '한 번에 선택할 수 있는 세대 수를 초과했습니다.';
      end if;

      for v_item in select value from jsonb_array_elements(v_units_payload)
      loop
        v_building := trim(coalesce(v_item ->> 'building', ''));
        v_unit := trim(coalesce(v_item ->> 'unit', ''));
        if coalesce(v_item ->> 'floor', '') !~ '^[0-9]+$' then
          raise exception '선택한 세대의 층 정보가 올바르지 않습니다.';
        end if;
        v_floor := (v_item ->> 'floor')::integer;

        if v_building = '' or v_unit = '' or not exists (
          select 1
          from public.attendance_valid_floor_units_v52_48_5_9(
            v_worker.project_name,
            v_building,
            v_floor
          ) allowed
          where allowed.unit = v_unit
        ) then
          raise exception '선택한 동·층에 존재하지 않는 세대가 포함되어 있습니다.';
        end if;

        if not exists (
          select 1
          from public.attendance_work_scopes scope_row
          where scope_row.check_in_event_id = v_check_in.id
            and scope_row.building = v_building
            and scope_row.floor = v_floor
        ) and not (
          v_check_in.work_building = v_building
          and v_check_in.work_floor = v_floor
        ) and not exists (
          select 1
          from jsonb_array_elements(v_normalized_additional) added(value)
          where (added.value ->> 'building') = v_building
            and (added.value ->> 'floor')::integer = v_floor
        ) then
          raise exception '출근 범위 또는 퇴근 시 추가한 범위에 없는 세대입니다.';
        end if;

        v_normalized_units := v_normalized_units || jsonb_build_array(
          jsonb_build_object(
            'building', v_building,
            'floor', v_floor,
            'unit', v_unit
          )
        );
      end loop;

      select count(*)
      into v_unit_count
      from (
        select distinct
          item.value ->> 'building' as building,
          item.value ->> 'unit' as unit
        from jsonb_array_elements(v_normalized_units) item(value)
      ) unique_units;

      if v_unit_count < 1 then
        raise exception '완료한 세대를 한 곳 이상 선택해주세요.';
      end if;

      if exists (
        select 1
        from public.unit_progress progress_row
        join (
          select distinct
            item.value ->> 'building' as building,
            item.value ->> 'unit' as unit
          from jsonb_array_elements(v_normalized_units) item(value)
        ) submitted
          on submitted.building = progress_row.building
         and submitted.unit = progress_row.unit
        where progress_row.project_name = v_worker.project_name
          and progress_row.process_type = v_process_type
          and progress_row.status = '작업완료'
      ) then
        raise exception '이미 작업완료된 세대가 포함되어 있습니다. 화면을 다시 열어 확인해주세요.';
      end if;
    else
      v_process_type := '';
      v_normalized_additional := '[]'::jsonb;
      v_normalized_units := '[]'::jsonb;
      v_unit_count := 0;
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
    nullif(v_process_type, ''),
    v_completion_state,
    case when v_completion_state = 'submitted' then 'pending' else 'not_required' end,
    v_unit_count
  ) returning id into v_submission_id;

  -- 오전 출근 범위를 먼저 복사합니다.
  insert into public.attendance_progress_submission_scopes (
    submission_id,
    building,
    floor,
    scope_source
  )
  select
    v_submission_id,
    scope_row.building,
    scope_row.floor,
    'check_in'
  from public.attendance_work_scopes scope_row
  where scope_row.check_in_event_id = v_check_in.id
  on conflict (submission_id, building, floor) do nothing;

  if not exists (
    select 1
    from public.attendance_progress_submission_scopes
    where submission_id = v_submission_id
  ) and v_check_in.work_location_mode = 'standard' then
    insert into public.attendance_progress_submission_scopes (
      submission_id,
      building,
      floor,
      scope_source
    ) values (
      v_submission_id,
      v_check_in.work_building,
      v_check_in.work_floor,
      'check_in'
    )
    on conflict (submission_id, building, floor) do nothing;
  end if;

  if v_completion_state = 'submitted' then
    insert into public.attendance_progress_submission_scopes (
      submission_id,
      building,
      floor,
      scope_source
    )
    select distinct
      v_submission_id,
      item.value ->> 'building',
      (item.value ->> 'floor')::integer,
      'checkout_added'
    from jsonb_array_elements(v_normalized_additional) item(value)
    on conflict (submission_id, building, floor) do nothing;

    insert into public.attendance_progress_submission_unit_details (
      submission_id,
      building,
      floor,
      unit,
      scope_source
    )
    select distinct
      v_submission_id,
      item.value ->> 'building',
      (item.value ->> 'floor')::integer,
      item.value ->> 'unit',
      case when exists (
        select 1
        from public.attendance_work_scopes scope_row
        where scope_row.check_in_event_id = v_check_in.id
          and scope_row.building = (item.value ->> 'building')
          and scope_row.floor = (item.value ->> 'floor')::integer
      ) or (
        v_check_in.work_building = (item.value ->> 'building')
        and v_check_in.work_floor = (item.value ->> 'floor')::integer
      ) then 'check_in' else 'checkout_added' end
    from jsonb_array_elements(v_normalized_units) item(value)
    on conflict (submission_id, building, unit) do nothing;
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
    'submitted_units_count', v_unit_count
  );
exception
  when unique_violation then
    raise exception '오늘 퇴근 기록이 이미 있거나 같은 요청이 처리되었습니다.';
end;
$$;

-- =========================================================
-- 5. 담당자 목록·승인: 다중 동·층
-- =========================================================

create or replace function public.attendance_manager_progress_submissions_v52_48_5_10(
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
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'building', scope_row.building,
            'floor', scope_row.floor,
            'scope_source', scope_row.scope_source,
            'config_json', coalesce(setting.config_json, '{}'::jsonb)
          )
          order by scope_row.building, scope_row.floor
        )
        from public.attendance_progress_submission_scopes scope_row
        left join public.building_settings setting
          on setting.project_name = submission.project_name
         and setting.building_name = scope_row.building
        where scope_row.submission_id = submission.id
      ), case
        when submission.building is not null and submission.floor is not null then
          jsonb_build_array(jsonb_build_object(
            'building', submission.building,
            'floor', submission.floor,
            'scope_source', 'check_in',
            'config_json', coalesce(legacy_setting.config_json, '{}'::jsonb)
          ))
        else '[]'::jsonb
      end) as scopes,
      case when exists (
        select 1
        from public.attendance_progress_submission_unit_details detail_check
        where detail_check.submission_id = submission.id
      ) then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'building', detail.building,
            'floor', detail.floor,
            'unit', detail.unit,
            'scope_source', detail.scope_source
          )
          order by detail.building, detail.floor, detail.unit
        )
        from public.attendance_progress_submission_unit_details detail
        where detail.submission_id = submission.id
      ), '[]'::jsonb)
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'building', submission.building,
            'floor', submission.floor,
            'unit', old_unit.unit,
            'scope_source', 'check_in'
          )
          order by old_unit.unit
        )
        from public.attendance_progress_submission_units old_unit
        where old_unit.submission_id = submission.id
      ), '[]'::jsonb) end as units,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'building', planned.building,
            'floor', planned.floor,
            'unit', planned.unit
          )
          order by planned.building, planned.floor, planned.unit
        )
        from public.attendance_work_scope_units planned
        where planned.check_in_event_id = submission.check_in_event_id
      ), '[]'::jsonb) as planned_units,
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
    left join public.building_settings legacy_setting
      on legacy_setting.project_name = submission.project_name
     and legacy_setting.building_name = submission.building
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

create or replace function public.attendance_manager_review_progress_v52_48_5_10(
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
  select * into v_submission
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

  if exists (
    select 1
    from public.attendance_progress_submission_unit_details detail
    where detail.submission_id = v_submission.id
  ) then
    select count(*) into v_total
    from public.attendance_progress_submission_unit_details detail
    where detail.submission_id = v_submission.id;
  else
    select count(*) into v_total
    from public.attendance_progress_submission_units old_unit
    where old_unit.submission_id = v_submission.id;
  end if;

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
      from (
        select detail.building, detail.floor, detail.unit
        from public.attendance_progress_submission_unit_details detail
        where detail.submission_id = v_submission.id
        union all
        select v_submission.building, v_submission.floor, old_unit.unit
        from public.attendance_progress_submission_units old_unit
        where old_unit.submission_id = v_submission.id
          and not exists (
            select 1
            from public.attendance_progress_submission_unit_details detail_check
            where detail_check.submission_id = v_submission.id
          )
      ) submitted
      where not exists (
        select 1
        from public.attendance_valid_floor_units_v52_48_5_9(
          v_submission.project_name,
          submitted.building,
          submitted.floor
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
      submitted.building,
      submitted.unit,
      v_submission.progress_process_type,
      '작업완료',
      v_submission.work_date
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
-- 6. 근태기록에 다중 층·퇴근 추가위치 표시
-- =========================================================

create or replace function public.attendance_manager_dashboard_v52_48_5_10(
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
  v_dashboard := public.attendance_manager_dashboard_v52_48_5_6(
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
        'work_trade_name', check_in.work_trade_name,
        'work_scopes', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'building', scope_row.building,
              'floor', scope_row.floor,
              'scope_source', 'check_in'
            )
            order by scope_row.building, scope_row.floor
          )
          from public.attendance_work_scopes scope_row
          where scope_row.check_in_event_id = check_in.id
        ), case
          when check_in.work_location_mode = 'standard' then
            jsonb_build_array(jsonb_build_object(
              'building', check_in.work_building,
              'floor', check_in.work_floor,
              'scope_source', 'check_in'
            ))
          else '[]'::jsonb
        end),
        'checkout_added_scopes', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'building', scope_row.building,
              'floor', scope_row.floor,
              'scope_source', scope_row.scope_source
            )
            order by scope_row.building, scope_row.floor
          )
          from public.attendance_progress_submissions submission
          join public.attendance_progress_submission_scopes scope_row
            on scope_row.submission_id = submission.id
           and scope_row.scope_source = 'checkout_added'
          where submission.check_out_event_id = check_out.id
        ), '[]'::jsonb)
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

  return jsonb_set(v_dashboard, '{daily_records}', v_daily_records, true);
end;
$$;

-- =========================================================
-- 7. 실행권한
-- =========================================================

revoke all on function public.attendance_prepare_work_context_v52_48_5_10(
  text, text, text
) from public, anon, authenticated;
revoke all on function public.attendance_finalize_checkin_scopes_v52_48_5_10(
  text, text, text, text, text, integer[], text, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.attendance_prepare_checkout_context_v52_48_5_10(
  text, text, text
) from public, anon, authenticated;
revoke all on function public.attendance_finalize_checkout_progress_v52_48_5_10(
  text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.attendance_manager_progress_submissions_v52_48_5_10(text)
  from public, anon, authenticated;
revoke all on function public.attendance_manager_review_progress_v52_48_5_10(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.attendance_manager_dashboard_v52_48_5_10(text, date)
  from public, anon, authenticated;

grant execute on function public.attendance_prepare_work_context_v52_48_5_10(
  text, text, text
) to anon, authenticated;
grant execute on function public.attendance_finalize_checkin_scopes_v52_48_5_10(
  text, text, text, text, text, integer[], text, jsonb, text, text
) to anon, authenticated;
grant execute on function public.attendance_prepare_checkout_context_v52_48_5_10(
  text, text, text
) to anon, authenticated;
grant execute on function public.attendance_finalize_checkout_progress_v52_48_5_10(
  text, text, text, text, text, jsonb, jsonb
) to anon, authenticated;
grant execute on function public.attendance_manager_progress_submissions_v52_48_5_10(text)
  to authenticated;
grant execute on function public.attendance_manager_review_progress_v52_48_5_10(uuid, boolean, text)
  to authenticated;
grant execute on function public.attendance_manager_dashboard_v52_48_5_10(text, date)
  to authenticated;

commit;

-- =========================================================
-- 8. 적용결과 확인
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'attendance_work_scopes',
    'attendance_work_scope_units',
    'attendance_progress_submission_scopes',
    'attendance_progress_submission_unit_details'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_prepare_work_context_v52_48_5_10',
    'attendance_finalize_checkin_scopes_v52_48_5_10',
    'attendance_prepare_checkout_context_v52_48_5_10',
    'attendance_finalize_checkout_progress_v52_48_5_10',
    'attendance_manager_progress_submissions_v52_48_5_10',
    'attendance_manager_review_progress_v52_48_5_10',
    'attendance_manager_dashboard_v52_48_5_10'
  )
order by routine_name;
