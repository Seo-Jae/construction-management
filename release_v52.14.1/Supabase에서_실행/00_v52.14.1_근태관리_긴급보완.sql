-- =========================================================
-- 사내 현장관리 시스템 v52.14.1
-- 근태관리 긴급보완
-- 1) 한글 IME 입력 보완은 프론트 코드에서 처리
-- 2) 소속업체 입력 제거(기존 DB 칸은 호환용 빈값 유지)
-- 3) 임시 테스트계정 및 비밀번호 1 지원
-- 4) 관리자 화면과 분리된 18시간 QR 표시 세션
-- 실행 전제: v52.14 SQL이 먼저 적용되어 있어야 합니다.
-- =========================================================

begin;

do $$
begin
  if to_regclass('public.attendance_workers') is null
     or to_regclass('public.attendance_qr_tokens') is null then
    raise exception 'v52.14 근태관리 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

alter table public.attendance_workers
  add column if not exists is_test_account boolean not null default false;

alter table public.attendance_workers
  alter column company_name set default '';

create table if not exists public.attendance_qr_display_sessions (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  last_issued_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_attendance_qr_display_project_active
  on public.attendance_qr_display_sessions(project_name, expires_at desc);

alter table public.attendance_qr_display_sessions enable row level security;
revoke all on public.attendance_qr_display_sessions from anon, authenticated;

-- =========================================================
-- 테스트계정 지원 가입 함수
-- =========================================================
create or replace function public.attendance_worker_signup_v52_14_1(
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
  if length(trim(coalesce(p_trade_name, ''))) < 1 then
    raise exception '직종·공종을 입력해주세요.';
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
    trim(p_trade_name),
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
      'is_test_account', v_is_test
    ),
    case
      when v_is_test then '내일 시범운영용 테스트계정'
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
-- 관리자 QR 표시 세션: 한 현장에 한 개만 활성화
-- =========================================================
create or replace function public.attendance_start_qr_display_v52_14_1(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_name text := trim(p_project_name);
  v_raw_token text := encode(gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := clock_timestamp() + interval '18 hours';
  v_session_id uuid;
begin
  if not public.attendance_manager_can_v52_14(v_project_name, true) then
    raise exception '이 현장의 근태관리 수정 권한이 없습니다.';
  end if;

  update public.attendance_qr_display_sessions
  set revoked_at = clock_timestamp()
  where project_name = v_project_name
    and revoked_at is null
    and expires_at > clock_timestamp();

  delete from public.attendance_qr_display_sessions
  where expires_at < clock_timestamp() - interval '7 days';

  insert into public.attendance_qr_display_sessions (
    project_name,
    token_hash,
    created_by,
    expires_at
  ) values (
    v_project_name,
    public.attendance_hash_v52_14(v_raw_token),
    auth.uid(),
    v_expires_at
  ) returning id into v_session_id;

  insert into public.attendance_audit_log (
    project_name,
    action_code,
    action_label,
    actor_user_id,
    after_value,
    reason
  ) values (
    v_project_name,
    'qr_display_started',
    '출·퇴근 QR 전용 창 시작',
    auth.uid(),
    jsonb_build_object(
      'display_session_id', v_session_id,
      'expires_at', v_expires_at
    ),
    '관리 기능과 분리된 QR 표시 세션 발급'
  );

  return jsonb_build_object(
    'display_token', v_raw_token,
    'project_name', v_project_name,
    'expires_at', v_expires_at
  );
end;
$$;

-- 표시 토큰으로 가능한 작업은 7초짜리 QR 발급뿐입니다.
create or replace function public.attendance_issue_display_qr_v52_14_1(
  p_display_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_display public.attendance_qr_display_sessions%rowtype;
  v_raw_qr_token text := encode(gen_random_bytes(32), 'hex');
  v_issued_at timestamptz := clock_timestamp();
  v_qr_expires_at timestamptz := v_issued_at + interval '7 seconds';
begin
  if length(trim(coalesce(p_display_token, ''))) < 32 then
    raise exception '유효하지 않은 QR 표시 세션입니다.';
  end if;

  select * into v_display
  from public.attendance_qr_display_sessions
  where token_hash = public.attendance_hash_v52_14(trim(p_display_token))
    and revoked_at is null
    and expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception 'QR 표시 세션이 만료되었습니다. 담당자가 근태관리에서 다시 열어주세요.';
  end if;

  delete from public.attendance_qr_tokens
  where expires_at < clock_timestamp() - interval '1 day';

  insert into public.attendance_qr_tokens (
    project_name,
    token_hash,
    issued_by,
    issued_at,
    expires_at
  ) values (
    v_display.project_name,
    public.attendance_hash_v52_14(v_raw_qr_token),
    v_display.created_by,
    v_issued_at,
    v_qr_expires_at
  );

  update public.attendance_qr_display_sessions
  set last_issued_at = v_issued_at
  where id = v_display.id;

  return jsonb_build_object(
    'qr_token', v_raw_qr_token,
    'project_name', v_display.project_name,
    'issued_at', v_issued_at,
    'expires_at', v_qr_expires_at,
    'session_expires_at', v_display.expires_at
  );
end;
$$;

revoke all on function public.attendance_worker_signup_v52_14_1(text, text, boolean, text, boolean, text, text, text, text, text) from public;
revoke all on function public.attendance_start_qr_display_v52_14_1(text) from public;
revoke all on function public.attendance_issue_display_qr_v52_14_1(text) from public;

grant execute on function public.attendance_worker_signup_v52_14_1(text, text, boolean, text, boolean, text, text, text, text, text) to anon, authenticated;
grant execute on function public.attendance_start_qr_display_v52_14_1(text) to authenticated;
grant execute on function public.attendance_issue_display_qr_v52_14_1(text) to anon, authenticated;

comment on column public.attendance_workers.is_test_account is 'v52.14.1 시범운영용 임시 테스트계정 표시';
comment on table public.attendance_qr_display_sessions is 'v52.14.1 관리자 화면과 분리된 18시간 QR 전용 표시 세션';

commit;
