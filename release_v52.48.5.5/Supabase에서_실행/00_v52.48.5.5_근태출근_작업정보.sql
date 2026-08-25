begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- v52.48.5.5
-- 출근 QR 촬영 후 작업 동·층·공정 입력을 완료해야 출근 확정
-- =========================================================

alter table public.attendance_events
  add column if not exists work_location_mode text,
  add column if not exists work_building text,
  add column if not exists work_floor integer,
  add column if not exists work_location_text text,
  add column if not exists work_trade_name text;

comment on column public.attendance_events.work_location_mode
  is 'v52.48.5.5 출근 작업위치 구분: standard 또는 other';
comment on column public.attendance_events.work_building
  is 'v52.48.5.5 골구도에서 선택한 작업 동';
comment on column public.attendance_events.work_floor
  is 'v52.48.5.5 골구도에서 선택한 지상 작업 층';
comment on column public.attendance_events.work_location_text
  is 'v52.48.5.5 지하 등 기타 작업위치 한 줄 입력';
comment on column public.attendance_events.work_trade_name
  is 'v52.48.5.5 해당일 출근 시 선택한 공정';

-- 과거 자유입력 중 현재 표준 목록과 의미가 같은 값만 안전하게 정규화합니다.
update public.attendance_workers
set trade_name = case trim(trade_name)
  when '먹메김' then '먹매김'
  when '경량' then '경량벽체'
  when '경량골조' then '경량벽체'
  when '경량석고' then '경량벽체'
  when '천정' then '세대천정'
  else trim(trade_name)
end,
updated_at = now()
where trim(trade_name) in (
  '먹메김', '경량', '경량골조', '경량석고', '천정'
);

-- =========================================================
-- 1. 표준 공정 선택형 가입
-- =========================================================

create or replace function public.attendance_worker_signup_v52_48_5_5(
  p_project_name text,
  p_name_ko text,
  p_is_foreigner boolean,
  p_name_en text,
  p_is_test_account boolean,
  p_phone text,
  p_trade_name text,
  p_password text,
  p_device_key text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text := public.attendance_normalize_phone_v52_14(p_phone);
  v_worker_id uuid;
  v_device_hash text := public.attendance_hash_v52_14(trim(p_device_key));
  v_raw_session text := encode(gen_random_bytes(32), 'hex');
  v_is_test boolean := coalesce(p_is_test_account, false);
  v_trade_name text := trim(coalesce(p_trade_name, ''));
  v_trade_options constant text[] := array[
    '소장', '관리자', '직영', '먹매김', '단열', '합지', '경량벽체',
    '세대천정', '공용홀천정', '몰딩', '걸레받이', '수장', '외주',
    '기타', '용역'
  ];
begin
  if not exists (
    select 1
    from public.attendance_sites
    where project_name = trim(p_project_name)
      and is_active = true
  ) then
    raise exception '선택할 수 없는 현장입니다.';
  end if;

  if trim(coalesce(p_name_ko, '')) !~ '^[가-힣]{2,10}$' then
    raise exception '한글 이름을 정확히 입력해주세요.';
  end if;
  if coalesce(p_is_foreigner, false)
     and trim(coalesce(p_name_en, '')) = '' then
    raise exception '외국인 근로자는 영문명이 필요합니다.';
  end if;
  if v_phone !~ '^01[0-9]{8,9}$' then
    raise exception '휴대폰번호를 정확히 입력해주세요.';
  end if;
  if not (v_trade_name = any(v_trade_options)) then
    raise exception '목록에서 직종·공종을 선택해주세요.';
  end if;
  if v_is_test and coalesce(p_password, '') <> '1' then
    raise exception '테스트계정 비밀번호는 1이어야 합니다.';
  end if;
  if not v_is_test and (
    length(coalesce(p_password, '')) < 8
    or p_password !~ '[A-Za-z]'
    or p_password !~ '[0-9]'
  ) then
    raise exception '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.';
  end if;
  if length(trim(coalesce(p_device_key, ''))) < 16 then
    raise exception '휴대폰 등록정보가 올바르지 않습니다.';
  end if;
  if exists (
    select 1 from public.attendance_workers where phone = v_phone
  ) then
    raise exception '이미 가입된 휴대폰번호입니다.';
  end if;
  if exists (
    select 1
    from public.attendance_workers
    where bound_device_hash = v_device_hash
  ) then
    raise exception '이 휴대폰에는 이미 다른 근로자가 등록되어 있습니다.';
  end if;

  insert into public.attendance_workers (
    project_name,
    name_ko,
    is_foreigner,
    name_en,
    is_test_account,
    phone,
    company_name,
    trade_name,
    password_hash,
    bound_device_hash,
    registered_user_agent
  ) values (
    trim(p_project_name),
    trim(p_name_ko),
    coalesce(p_is_foreigner, false),
    case
      when p_is_foreigner then upper(trim(p_name_en))
      else null
    end,
    v_is_test,
    v_phone,
    '',
    v_trade_name,
    crypt(p_password, gen_salt('bf', 10)),
    v_device_hash,
    left(coalesce(p_user_agent, ''), 500)
  ) returning id into v_worker_id;

  insert into public.attendance_worker_sessions (
    worker_id,
    token_hash,
    device_hash,
    user_agent,
    expires_at
  ) values (
    v_worker_id,
    public.attendance_hash_v52_14(v_raw_session),
    v_device_hash,
    left(coalesce(p_user_agent, ''), 500),
    clock_timestamp() + interval '30 days'
  );

  insert into public.attendance_audit_log (
    project_name,
    worker_id,
    action_code,
    action_label,
    after_value,
    reason
  ) values (
    trim(p_project_name),
    v_worker_id,
    'worker_signup',
    case
      when v_is_test then '테스트계정 가입 신청'
      else '근로자 가입 신청'
    end,
    jsonb_build_object(
      'status', 'pending',
      'device_registered', true,
      'is_test_account', v_is_test,
      'trade_name', v_trade_name
    ),
    case
      when v_is_test then '시범운영용 테스트계정'
      else '근로자 모바일 가입 신청'
    end
  );

  return jsonb_build_object(
    'session_token', v_raw_session,
    'worker_id', v_worker_id,
    'status', 'pending',
    'is_test_account', v_is_test
  );
exception
  when unique_violation then
    raise exception '이미 사용 중인 휴대폰번호 또는 등록기기입니다.';
end;
$$;

-- =========================================================
-- 2. QR 교환 후 출근 작업정보 준비
-- 기존 30초 처리토큰을 작업정보 입력용 10분으로 연장합니다.
-- =========================================================

create or replace function public.attendance_prepare_work_context_v52_48_5_5(
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
  v_extended_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
  v_buildings jsonb;
begin
  select *
  into v_exchange
  from public.attendance_qr_exchanges
  where processing_token_hash = public.attendance_hash_v52_14(
      trim(p_processing_token)
    )
    and worker_id = v_worker_id
    and consumed_at is null
    and expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception '일회용 처리시간이 지났거나 이미 사용된 요청입니다.';
  end if;
  if v_exchange.proposed_event_type <> 'check_in' then
    raise exception '출근 처리에서만 작업정보를 입력할 수 있습니다.';
  end if;

  select *
  into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  update public.attendance_qr_exchanges
  set expires_at = greatest(expires_at, v_extended_expires_at)
  where id = v_exchange.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'building_name', building_row.building_name,
        'floors', building_row.floors
      )
      order by building_row.building_name
    ),
    '[]'::jsonb
  )
  into v_buildings
  from (
    select
      setting.building_name,
      case
        when coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
          then (setting.config_json ->> 'floors')::integer
        else 0
      end as floors
    from public.building_settings setting
    where setting.project_name = v_worker.project_name
  ) building_row
  where building_row.floors > 0;

  return jsonb_build_object(
    'processing_token', trim(p_processing_token),
    'event_type', v_exchange.proposed_event_type,
    'project_name', v_worker.project_name,
    'default_trade_name', v_worker.trade_name,
    'buildings', coalesce(v_buildings, '[]'::jsonb),
    'expires_at', v_extended_expires_at
  );
end;
$$;

-- =========================================================
-- 3. 작업정보 검증 후 출퇴근 확정
-- 출근은 작업정보가 필수이며 퇴근은 기존 흐름을 유지합니다.
-- =========================================================

create or replace function public.attendance_finalize_scan_v52_48_5_5(
  p_session_token text,
  p_device_key text,
  p_processing_token text,
  p_location_mode text,
  p_building text,
  p_floor integer,
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
  v_worker public.attendance_workers%rowtype;
  v_exchange public.attendance_qr_exchanges%rowtype;
  v_event_at timestamptz := clock_timestamp();
  v_work_date date := (v_event_at at time zone 'Asia/Seoul')::date;
  v_event_id uuid;
  v_location_mode text := trim(coalesce(p_location_mode, ''));
  v_building text := trim(coalesce(p_building, ''));
  v_location_text text := trim(coalesce(p_location_text, ''));
  v_trade_name text := trim(coalesce(p_trade_name, ''));
  v_floor integer := p_floor;
  v_building_floors integer;
  v_trade_options constant text[] := array[
    '소장', '관리자', '직영', '먹매김', '단열', '합지', '경량벽체',
    '세대천정', '공용홀천정', '몰딩', '걸레받이', '수장', '외주',
    '기타', '용역'
  ];
begin
  select *
  into v_exchange
  from public.attendance_qr_exchanges
  where processing_token_hash = public.attendance_hash_v52_14(
      trim(p_processing_token)
    )
    and worker_id = v_worker_id
    and consumed_at is null
    and expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception '일회용 처리시간이 지났거나 이미 사용된 요청입니다.';
  end if;

  select *
  into v_worker
  from public.attendance_workers
  where id = v_worker_id;

  if v_exchange.proposed_event_type = 'check_in' then
    if not (v_trade_name = any(v_trade_options)) then
      raise exception '목록에서 오늘 작업할 공정을 선택해주세요.';
    end if;

    if v_location_mode = 'standard' then
      if v_building = '' or v_floor is null or v_floor < 1 then
        raise exception '작업할 동과 층을 선택해주세요.';
      end if;

      select case
        when coalesce(setting.config_json ->> 'floors', '') ~ '^[0-9]+$'
          then (setting.config_json ->> 'floors')::integer
        else 0
      end
      into v_building_floors
      from public.building_settings setting
      where setting.project_name = v_worker.project_name
        and setting.building_name = v_building
      limit 1;

      if not found or v_building_floors < 1 then
        raise exception '선택한 동의 골구도 정보를 확인할 수 없습니다.';
      end if;
      if v_floor > v_building_floors then
        raise exception '선택한 동에 존재하지 않는 층입니다.';
      end if;

      v_location_text := '';
    elsif v_location_mode = 'other' then
      if length(v_location_text) < 2 or length(v_location_text) > 100 then
        raise exception '기타 작업위치를 2자 이상 100자 이내로 입력해주세요.';
      end if;
      v_building := '';
      v_floor := null;
    else
      raise exception '작업위치 입력방식을 선택해주세요.';
    end if;
  else
    v_location_mode := '';
    v_building := '';
    v_floor := null;
    v_location_text := '';
    v_trade_name := '';
  end if;

  if v_exchange.proposed_event_type = 'check_out' and not exists (
    select 1
    from public.attendance_events
    where worker_id = v_worker_id
      and work_date = v_work_date
      and event_type = 'check_in'
  ) then
    raise exception '출근 기록이 없어 퇴근 처리할 수 없습니다.';
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
    qr_token_id,
    work_location_mode,
    work_building,
    work_floor,
    work_location_text,
    work_trade_name
  ) values (
    v_worker_id,
    v_worker.project_name,
    v_work_date,
    v_exchange.proposed_event_type,
    v_event_at,
    'qr',
    v_exchange.qr_token_id,
    nullif(v_location_mode, ''),
    nullif(v_building, ''),
    v_floor,
    nullif(v_location_text, ''),
    nullif(v_trade_name, '')
  ) returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_type', v_exchange.proposed_event_type,
    'event_at', v_event_at,
    'work_date', v_work_date,
    'project_name', v_worker.project_name,
    'work_location_mode', nullif(v_location_mode, ''),
    'work_building', nullif(v_building, ''),
    'work_floor', v_floor,
    'work_location_text', nullif(v_location_text, ''),
    'work_trade_name', nullif(v_trade_name, '')
  );
exception
  when unique_violation then
    raise exception '오늘 같은 출·퇴근 기록이 이미 있습니다.';
end;
$$;

-- =========================================================
-- 4. 실행 권한
-- =========================================================

revoke all on function public.attendance_worker_signup_v52_48_5_5(
  text, text, boolean, text, boolean, text, text, text, text, text
) from public;
revoke all on function public.attendance_prepare_work_context_v52_48_5_5(
  text, text, text
) from public;
revoke all on function public.attendance_finalize_scan_v52_48_5_5(
  text, text, text, text, text, integer, text, text
) from public;

grant execute on function public.attendance_worker_signup_v52_48_5_5(
  text, text, boolean, text, boolean, text, text, text, text, text
) to anon, authenticated;
grant execute on function public.attendance_prepare_work_context_v52_48_5_5(
  text, text, text
) to anon, authenticated;
grant execute on function public.attendance_finalize_scan_v52_48_5_5(
  text, text, text, text, text, integer, text, text
) to anon, authenticated;

commit;

-- =========================================================
-- 5. 실행 결과 확인
-- 아래 결과가 모두 표시되면 SQL 적용 완료입니다.
-- =========================================================

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'attendance_events'
  and column_name in (
    'work_location_mode',
    'work_building',
    'work_floor',
    'work_location_text',
    'work_trade_name'
  )
order by ordinal_position;

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'attendance_worker_signup_v52_48_5_5',
    'attendance_prepare_work_context_v52_48_5_5',
    'attendance_finalize_scan_v52_48_5_5'
  )
order by routine_name;
