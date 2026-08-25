begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create extension if not exists pgcrypto;

-- =========================================================
-- 1. 근태관리 권한
-- =========================================================
insert into public.permission_definitions (
  permission_key,
  area_code,
  area_label,
  menu_code,
  menu_label,
  action_code,
  action_label,
  action_rank,
  is_sensitive,
  is_preparing
)
values
  ('attendance.management.view', 'attendance', '근태관리', 'attendance_management', '근태관리', 'view', '조회', 10, false, false),
  ('attendance.management.manage', 'attendance', '근태관리', 'attendance_management', '근태관리', 'manage', '가입승인·QR·근태수정', 50, false, false)
on conflict (permission_key) do update
set area_code = excluded.area_code,
    area_label = excluded.area_label,
    menu_code = excluded.menu_code,
    menu_label = excluded.menu_label,
    action_code = excluded.action_code,
    action_label = excluded.action_label,
    action_rank = excluded.action_rank,
    is_sensitive = excluded.is_sensitive,
    is_preparing = excluded.is_preparing;

insert into public.template_permissions (template_code, permission_key, is_granted)
select template_code, permission_key, true
from (values
  ('super_admin', 'attendance.management.view'),
  ('super_admin', 'attendance.management.manage'),
  ('site_manager', 'attendance.management.view'),
  ('site_manager', 'attendance.management.manage'),
  ('site_administration', 'attendance.management.view'),
  ('site_administration', 'attendance.management.manage'),
  ('hq_administration', 'attendance.management.view')
) as permission_seed(template_code, permission_key)
where exists (
  select 1
  from public.permission_templates template
  where template.code = permission_seed.template_code
)
on conflict (template_code, permission_key) do update
set is_granted = excluded.is_granted;

-- =========================================================
-- 2. 데이터 구조
-- =========================================================
create table if not exists public.attendance_sites (
  project_name text primary key,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.attendance_sites (project_name, display_order, is_active)
values
  ('한라건설 용인금어지구', 10, true),
  ('현대건설 용인마크밸리', 20, true),
  ('대우건설 용인현장', 30, true)
on conflict (project_name) do update
set display_order = excluded.display_order,
    is_active = true,
    updated_at = now();

create table if not exists public.attendance_workers (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  name_ko text not null,
  is_foreigner boolean not null default false,
  name_en text,
  phone text not null unique,
  company_name text not null,
  trade_name text not null,
  password_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'disabled')),
  bound_device_hash text not null,
  device_version integer not null default 1,
  registered_user_agent text not null default '',
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists uq_attendance_worker_device
  on public.attendance_workers(bound_device_hash);
create index if not exists idx_attendance_workers_project_status
  on public.attendance_workers(project_name, status, created_at desc);

create table if not exists public.attendance_worker_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.attendance_workers(id) on delete cascade,
  token_hash text not null unique,
  device_hash text not null,
  user_agent text not null default '',
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_worker_sessions_worker
  on public.attendance_worker_sessions(worker_id, expires_at desc);

create table if not exists public.attendance_device_change_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.attendance_workers(id) on delete cascade,
  requested_device_hash text not null,
  requested_user_agent text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  reason text
);

create unique index if not exists uq_attendance_pending_device_request
  on public.attendance_device_change_requests(worker_id)
  where status = 'pending';

create table if not exists public.attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  token_hash text not null unique,
  issued_by uuid not null references auth.users(id) on delete cascade,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_qr_project_expiry
  on public.attendance_qr_tokens(project_name, expires_at desc);

create table if not exists public.attendance_qr_exchanges (
  id uuid primary key default gen_random_uuid(),
  qr_token_id uuid not null references public.attendance_qr_tokens(id) on delete cascade,
  worker_id uuid not null references public.attendance_workers(id) on delete cascade,
  processing_token_hash text not null unique,
  proposed_event_type text not null check (proposed_event_type in ('check_in', 'check_out')),
  exchanged_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (qr_token_id, worker_id)
);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.attendance_workers(id) on delete cascade,
  project_name text not null references public.attendance_sites(project_name),
  work_date date not null,
  event_type text not null check (event_type in ('check_in', 'check_out')),
  event_at timestamptz not null,
  source text not null check (source in ('qr', 'manual')),
  qr_token_id uuid references public.attendance_qr_tokens(id) on delete set null,
  recorded_by_manager uuid references auth.users(id) on delete set null,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, work_date, event_type)
);

create index if not exists idx_attendance_events_project_date
  on public.attendance_events(project_name, work_date, event_type);

create table if not exists public.attendance_audit_log (
  id bigint generated by default as identity primary key,
  project_name text not null,
  worker_id uuid references public.attendance_workers(id) on delete set null,
  action_code text not null,
  action_label text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_audit_project_created
  on public.attendance_audit_log(project_name, created_at desc);

-- 테이블 직접 접근은 막고 검증된 RPC로만 처리한다.
alter table public.attendance_sites enable row level security;
alter table public.attendance_workers enable row level security;
alter table public.attendance_worker_sessions enable row level security;
alter table public.attendance_device_change_requests enable row level security;
alter table public.attendance_qr_tokens enable row level security;
alter table public.attendance_qr_exchanges enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_audit_log enable row level security;

revoke all on public.attendance_sites from anon, authenticated;
revoke all on public.attendance_workers from anon, authenticated;
revoke all on public.attendance_worker_sessions from anon, authenticated;
revoke all on public.attendance_device_change_requests from anon, authenticated;
revoke all on public.attendance_qr_tokens from anon, authenticated;
revoke all on public.attendance_qr_exchanges from anon, authenticated;
revoke all on public.attendance_events from anon, authenticated;
revoke all on public.attendance_audit_log from anon, authenticated;

-- =========================================================
-- 3. 내부 보안 함수
-- =========================================================
create or replace function public.attendance_hash_v52_14(p_value text)
returns text
language sql
immutable
strict
security definer
set search_path = public, extensions
as $$
  select encode(digest(p_value, 'sha256'), 'hex');
$$;

create or replace function public.attendance_normalize_phone_v52_14(p_phone text)
returns text
language sql
immutable
strict
as $$
  select regexp_replace(p_phone, '[^0-9]', '', 'g');
$$;

create or replace function public.attendance_permission_effective_v52_14(
  p_permission_key text,
  p_project_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_status text;
  v_template_code text;
  v_granted boolean := false;
  v_effect text;
begin
  if v_user_id is null then return false; end if;

  select coalesce(role, '담당자'), coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = v_user_id
  limit 1;

  if not found or v_status <> 'active' then return false; end if;
  if v_role = '최고관리자' then return true; end if;

  select permission_template_code
  into v_template_code
  from public.user_access_settings_v2
  where auth_user_id = v_user_id;

  if not found then return false; end if;

  select exists (
    select 1
    from public.template_permissions
    where template_code = v_template_code
      and permission_key = p_permission_key
      and is_granted = true
  ) into v_granted;

  select effect into v_effect
  from public.user_permission_overrides_v2
  where auth_user_id = v_user_id
    and scope_key = '*'
    and permission_key = p_permission_key;
  if found then v_granted := v_effect = 'allow'; end if;

  select effect into v_effect
  from public.user_permission_overrides_v2
  where auth_user_id = v_user_id
    and scope_key = trim(p_project_name)
    and permission_key = p_permission_key;
  if found then v_granted := v_effect = 'allow'; end if;

  return v_granted;
end;
$$;

create or replace function public.attendance_manager_can_v52_14(
  p_project_name text,
  p_manage boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_status text;
  v_scope text;
  v_project_ok boolean := false;
  v_permission_key text;
begin
  if v_user_id is null then return false; end if;

  select coalesce(role, '담당자'), coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = v_user_id
  limit 1;

  if not found or v_status <> 'active' then return false; end if;
  if v_role = '최고관리자' then return true; end if;

  select access_scope into v_scope
  from public.user_access_settings_v2
  where auth_user_id = v_user_id;
  if not found then return false; end if;

  if v_scope = 'all' then
    v_project_ok := true;
  else
    select exists (
      select 1
      from public.user_project_access_v2 access_row
      where access_row.auth_user_id = v_user_id
        and access_row.project_name = trim(p_project_name)
        and access_row.is_active = true
        and (access_row.access_start_date is null or access_row.access_start_date <= current_date)
        and (access_row.access_end_date is null or access_row.access_end_date >= current_date)
    ) into v_project_ok;
  end if;

  if not v_project_ok then return false; end if;
  v_permission_key := case when p_manage then 'attendance.management.manage' else 'attendance.management.view' end;
  return public.attendance_permission_effective_v52_14(v_permission_key, p_project_name);
end;
$$;

create or replace function public.attendance_resolve_worker_v52_14(
  p_session_token text,
  p_device_key text,
  p_require_active boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_worker_id uuid;
  v_status text;
  v_device_hash text := public.attendance_hash_v52_14(trim(p_device_key));
begin
  if trim(coalesce(p_session_token, '')) = '' or trim(coalesce(p_device_key, '')) = '' then
    raise exception '로그인이 필요합니다.';
  end if;

  select worker.id, worker.status
  into v_worker_id, v_status
  from public.attendance_worker_sessions session_row
  join public.attendance_workers worker on worker.id = session_row.worker_id
  where session_row.token_hash = public.attendance_hash_v52_14(trim(p_session_token))
    and session_row.device_hash = v_device_hash
    and worker.bound_device_hash = v_device_hash
    and session_row.expires_at > clock_timestamp()
  limit 1;

  if not found then raise exception '로그인 정보가 만료되었거나 등록된 휴대폰이 아닙니다.'; end if;
  if p_require_active and v_status <> 'active' then raise exception '승인된 근로자만 출·퇴근 처리할 수 있습니다.'; end if;

  update public.attendance_worker_sessions
  set last_seen_at = clock_timestamp()
  where token_hash = public.attendance_hash_v52_14(trim(p_session_token));

  return v_worker_id;
end;
$$;

revoke all on function public.attendance_hash_v52_14(text) from public;
revoke all on function public.attendance_normalize_phone_v52_14(text) from public;
revoke all on function public.attendance_permission_effective_v52_14(text, text) from public;
revoke all on function public.attendance_manager_can_v52_14(text, boolean) from public;
revoke all on function public.attendance_resolve_worker_v52_14(text, text, boolean) from public;

-- =========================================================
-- 4. 근로자 가입·로그인
-- =========================================================
create or replace function public.attendance_worker_signup_v52_14(
  p_project_name text,
  p_name_ko text,
  p_is_foreigner boolean,
  p_name_en text,
  p_phone text,
  p_company_name text,
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
begin
  if not exists (select 1 from public.attendance_sites where project_name = trim(p_project_name) and is_active = true) then
    raise exception '선택할 수 없는 현장입니다.';
  end if;
  if trim(coalesce(p_name_ko, '')) !~ '^[가-힣]{2,10}$' then raise exception '한글 이름을 정확히 입력해주세요.'; end if;
  if coalesce(p_is_foreigner, false) and trim(coalesce(p_name_en, '')) = '' then raise exception '외국인 근로자는 영문명이 필요합니다.'; end if;
  if v_phone !~ '^01[0-9]{8,9}$' then raise exception '휴대폰번호를 정확히 입력해주세요.'; end if;
  if length(trim(coalesce(p_company_name, ''))) < 2 or length(trim(coalesce(p_trade_name, ''))) < 1 then raise exception '소속업체와 직종을 입력해주세요.'; end if;
  if length(coalesce(p_password, '')) < 8 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then raise exception '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.'; end if;
  if length(trim(coalesce(p_device_key, ''))) < 16 then raise exception '휴대폰 등록정보가 올바르지 않습니다.'; end if;
  if exists (select 1 from public.attendance_workers where phone = v_phone) then raise exception '이미 가입된 휴대폰번호입니다.'; end if;
  if exists (select 1 from public.attendance_workers where bound_device_hash = v_device_hash) then raise exception '이 휴대폰에는 이미 다른 근로자가 등록되어 있습니다.'; end if;

  insert into public.attendance_workers (
    project_name, name_ko, is_foreigner, name_en, phone,
    company_name, trade_name, password_hash, bound_device_hash,
    registered_user_agent
  ) values (
    trim(p_project_name), trim(p_name_ko), coalesce(p_is_foreigner, false),
    case when p_is_foreigner then upper(trim(p_name_en)) else null end,
    v_phone, trim(p_company_name), trim(p_trade_name),
    crypt(p_password, gen_salt('bf', 10)), v_device_hash,
    left(coalesce(p_user_agent, ''), 500)
  ) returning id into v_worker_id;

  insert into public.attendance_worker_sessions (
    worker_id, token_hash, device_hash, user_agent, expires_at
  ) values (
    v_worker_id, public.attendance_hash_v52_14(v_raw_session), v_device_hash,
    left(coalesce(p_user_agent, ''), 500), clock_timestamp() + interval '30 days'
  );

  insert into public.attendance_audit_log (
    project_name, worker_id, action_code, action_label, after_value, reason
  ) values (
    trim(p_project_name), v_worker_id, 'worker_signup', '근로자 가입 신청',
    jsonb_build_object('status', 'pending', 'device_registered', true),
    '근로자 모바일 가입 신청'
  );

  return jsonb_build_object('session_token', v_raw_session, 'worker_id', v_worker_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception '이미 사용 중인 휴대폰번호 또는 등록기기입니다.';
end;
$$;

create or replace function public.attendance_worker_login_v52_14(
  p_phone text,
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
  v_worker public.attendance_workers%rowtype;
  v_device_hash text := public.attendance_hash_v52_14(trim(p_device_key));
  v_raw_session text := encode(gen_random_bytes(32), 'hex');
begin
  select * into v_worker from public.attendance_workers where phone = v_phone limit 1;
  if not found or v_worker.password_hash <> crypt(p_password, v_worker.password_hash) then
    raise exception '휴대폰번호 또는 비밀번호가 맞지 않습니다.';
  end if;
  if v_worker.status = 'disabled' then raise exception '사용이 중지된 계정입니다.'; end if;

  if v_worker.bound_device_hash <> v_device_hash then
    insert into public.attendance_device_change_requests (
      worker_id, requested_device_hash, requested_user_agent, status, requested_at
    ) values (
      v_worker.id, v_device_hash, left(coalesce(p_user_agent, ''), 500), 'pending', clock_timestamp()
    )
    on conflict (worker_id) where status = 'pending' do update
    set requested_device_hash = excluded.requested_device_hash,
        requested_user_agent = excluded.requested_user_agent,
        requested_at = clock_timestamp();

    return jsonb_build_object(
      'code', 'device_change_requested',
      'message', '등록된 휴대폰과 다릅니다. 현장담당자에게 기기 변경 승인을 요청했습니다.'
    );
  end if;

  delete from public.attendance_worker_sessions where expires_at <= clock_timestamp();
  insert into public.attendance_worker_sessions (
    worker_id, token_hash, device_hash, user_agent, expires_at
  ) values (
    v_worker.id, public.attendance_hash_v52_14(v_raw_session), v_device_hash,
    left(coalesce(p_user_agent, ''), 500), clock_timestamp() + interval '30 days'
  );
  update public.attendance_workers set last_login_at = clock_timestamp(), updated_at = now() where id = v_worker.id;

  return jsonb_build_object('session_token', v_raw_session, 'worker_id', v_worker.id, 'status', v_worker.status);
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
        'event_type', event_row.event_type,
        'event_at', event_row.event_at,
        'source', event_row.source
      ) order by event_row.event_at)
      from public.attendance_events event_row
      where event_row.worker_id = v_worker_id
        and event_row.work_date = v_today
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end;
$$;

create or replace function public.attendance_worker_logout_v52_14(p_session_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.attendance_worker_sessions
  where token_hash = public.attendance_hash_v52_14(trim(p_session_token));
$$;

-- =========================================================
-- 5. 5초 QR → 30초 일회용 처리 토큰 → 출퇴근 확정
-- =========================================================
create or replace function public.attendance_issue_qr_v52_14(p_project_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw_token text := encode(gen_random_bytes(32), 'hex');
  v_issued_at timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_issued_at + interval '7 seconds';
begin
  if not public.attendance_manager_can_v52_14(p_project_name, true) then
    raise exception '이 현장의 근태관리 권한이 없습니다.';
  end if;
  delete from public.attendance_qr_tokens where expires_at < clock_timestamp() - interval '1 day';
  insert into public.attendance_qr_tokens (
    project_name, token_hash, issued_by, issued_at, expires_at
  ) values (
    trim(p_project_name), public.attendance_hash_v52_14(v_raw_token), auth.uid(), v_issued_at, v_expires_at
  );
  return jsonb_build_object(
    'qr_token', v_raw_token,
    'project_name', trim(p_project_name),
    'issued_at', v_issued_at,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.attendance_exchange_qr_v52_14(
  p_session_token text,
  p_device_key text,
  p_qr_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker_id uuid := public.attendance_resolve_worker_v52_14(p_session_token, p_device_key, true);
  v_worker public.attendance_workers%rowtype;
  v_qr public.attendance_qr_tokens%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_has_check_in boolean;
  v_has_check_out boolean;
  v_event_type text;
  v_raw_processing text := encode(gen_random_bytes(32), 'hex');
  v_exchange_expires timestamptz := clock_timestamp() + interval '30 seconds';
begin
  select * into v_worker from public.attendance_workers where id = v_worker_id;
  select * into v_qr
  from public.attendance_qr_tokens
  where token_hash = public.attendance_hash_v52_14(trim(p_qr_token))
    and expires_at >= clock_timestamp()
  limit 1;
  if not found then raise exception 'QR 유효시간이 지났습니다. 새 QR을 촬영해주세요.'; end if;
  if v_qr.project_name <> v_worker.project_name then raise exception '가입한 현장의 QR이 아닙니다.'; end if;

  select exists (
    select 1 from public.attendance_events where worker_id = v_worker_id and work_date = v_today and event_type = 'check_in'
  ) into v_has_check_in;
  select exists (
    select 1 from public.attendance_events where worker_id = v_worker_id and work_date = v_today and event_type = 'check_out'
  ) into v_has_check_out;

  if not v_has_check_in then v_event_type := 'check_in';
  elsif not v_has_check_out then v_event_type := 'check_out';
  else raise exception '오늘 출근과 퇴근 처리가 이미 완료되었습니다.';
  end if;

  insert into public.attendance_qr_exchanges (
    qr_token_id, worker_id, processing_token_hash, proposed_event_type, expires_at
  ) values (
    v_qr.id, v_worker_id, public.attendance_hash_v52_14(v_raw_processing), v_event_type, v_exchange_expires
  );

  return jsonb_build_object(
    'processing_token', v_raw_processing,
    'event_type', v_event_type,
    'expires_at', v_exchange_expires,
    'server_received_at', clock_timestamp()
  );
exception
  when unique_violation then
    raise exception '같은 QR은 한 번만 사용할 수 있습니다. 새 QR을 촬영해주세요.';
end;
$$;

create or replace function public.attendance_finalize_scan_v52_14(
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
  v_worker_id uuid := public.attendance_resolve_worker_v52_14(p_session_token, p_device_key, true);
  v_worker public.attendance_workers%rowtype;
  v_exchange public.attendance_qr_exchanges%rowtype;
  v_event_at timestamptz := clock_timestamp();
  v_work_date date := (v_event_at at time zone 'Asia/Seoul')::date;
  v_event_id uuid;
begin
  select * into v_exchange
  from public.attendance_qr_exchanges
  where processing_token_hash = public.attendance_hash_v52_14(trim(p_processing_token))
    and worker_id = v_worker_id
    and consumed_at is null
    and expires_at >= clock_timestamp()
  for update;
  if not found then raise exception '일회용 처리시간이 지났거나 이미 사용된 요청입니다.'; end if;

  update public.attendance_qr_exchanges
  set consumed_at = v_event_at
  where id = v_exchange.id;
  select * into v_worker from public.attendance_workers where id = v_worker_id;

  if v_exchange.proposed_event_type = 'check_out' and not exists (
    select 1 from public.attendance_events
    where worker_id = v_worker_id and work_date = v_work_date and event_type = 'check_in'
  ) then
    raise exception '출근 기록이 없어 퇴근 처리할 수 없습니다.';
  end if;

  insert into public.attendance_events (
    worker_id, project_name, work_date, event_type, event_at, source, qr_token_id
  ) values (
    v_worker_id, v_worker.project_name, v_work_date, v_exchange.proposed_event_type,
    v_event_at, 'qr', v_exchange.qr_token_id
  ) returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_type', v_exchange.proposed_event_type,
    'event_at', v_event_at,
    'work_date', v_work_date,
    'project_name', v_worker.project_name
  );
exception
  when unique_violation then
    raise exception '오늘 같은 출·퇴근 기록이 이미 있습니다.';
end;
$$;

-- =========================================================
-- 6. 현장담당자 관리
-- =========================================================
create or replace function public.attendance_manager_dashboard_v52_14(
  p_project_name text,
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.attendance_manager_can_v52_14(p_project_name, false) then
    raise exception '이 현장의 근태 조회 권한이 없습니다.';
  end if;

  return jsonb_build_object(
    'pending_workers', coalesce((
      select jsonb_agg(to_jsonb(worker) - 'password_hash' - 'bound_device_hash' order by worker.created_at)
      from public.attendance_workers worker
      where worker.project_name = trim(p_project_name) and worker.status = 'pending'
    ), '[]'::jsonb),
    'daily_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'worker_id', worker.id,
        'name_ko', worker.name_ko,
        'name_en', worker.name_en,
        'company_name', worker.company_name,
        'trade_name', worker.trade_name,
        'phone', worker.phone,
        'check_in_at', check_in.event_at,
        'check_in_source', check_in.source,
        'check_out_at', check_out.event_at,
        'check_out_source', check_out.source
      ) order by worker.company_name, worker.name_ko)
      from public.attendance_workers worker
      left join public.attendance_events check_in
        on check_in.worker_id = worker.id and check_in.work_date = p_work_date and check_in.event_type = 'check_in'
      left join public.attendance_events check_out
        on check_out.worker_id = worker.id and check_out.work_date = p_work_date and check_out.event_type = 'check_out'
      where worker.project_name = trim(p_project_name) and worker.status = 'active'
    ), '[]'::jsonb),
    'device_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request_row.id,
        'worker_id', worker.id,
        'name_ko', worker.name_ko,
        'phone', worker.phone,
        'company_name', worker.company_name,
        'trade_name', worker.trade_name,
        'requested_at', request_row.requested_at,
        'requested_user_agent', request_row.requested_user_agent
      ) order by request_row.requested_at)
      from public.attendance_device_change_requests request_row
      join public.attendance_workers worker on worker.id = request_row.worker_id
      where worker.project_name = trim(p_project_name) and request_row.status = 'pending'
    ), '[]'::jsonb),
    'recent_audit', coalesce((
      select jsonb_agg(audit_row order by audit_row.created_at desc)
      from (
        select
          audit.id,
          audit.action_label,
          audit.reason,
          audit.created_at,
          worker.name_ko as worker_name,
          profile.manager_name as actor_name
        from public.attendance_audit_log audit
        left join public.attendance_workers worker on worker.id = audit.worker_id
        left join public.user_profiles profile on profile.auth_user_id = audit.actor_user_id
        where audit.project_name = trim(p_project_name)
        order by audit.created_at desc
        limit 100
      ) audit_row
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end;
$$;

create or replace function public.attendance_manager_decide_worker_v52_14(
  p_worker_id uuid,
  p_approved boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker public.attendance_workers%rowtype;
begin
  select * into v_worker from public.attendance_workers where id = p_worker_id for update;
  if not found then raise exception '가입 신청을 찾을 수 없습니다.'; end if;
  if not public.attendance_manager_can_v52_14(v_worker.project_name, true) then raise exception '가입 승인 권한이 없습니다.'; end if;
  if v_worker.status <> 'pending' then raise exception '이미 처리된 가입 신청입니다.'; end if;

  update public.attendance_workers
  set status = case when p_approved then 'active' else 'rejected' end,
      approved_at = case when p_approved then clock_timestamp() else null end,
      approved_by = case when p_approved then auth.uid() else null end,
      rejected_at = case when p_approved then null else clock_timestamp() end,
      rejected_by = case when p_approved then null else auth.uid() end,
      rejection_reason = case when p_approved then null else trim(p_reason) end,
      updated_at = now()
  where id = p_worker_id;

  insert into public.attendance_audit_log (
    project_name, worker_id, action_code, action_label, actor_user_id,
    before_value, after_value, reason
  ) values (
    v_worker.project_name, p_worker_id,
    case when p_approved then 'worker_approved' else 'worker_rejected' end,
    case when p_approved then '근로자 가입 승인' else '근로자 가입 반려' end,
    auth.uid(), jsonb_build_object('status', v_worker.status),
    jsonb_build_object('status', case when p_approved then 'active' else 'rejected' end, 'device_version', v_worker.device_version),
    trim(p_reason)
  );
end;
$$;

create or replace function public.attendance_manager_decide_device_v52_14(
  p_request_id uuid,
  p_approved boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.attendance_device_change_requests%rowtype;
  v_worker public.attendance_workers%rowtype;
begin
  select * into v_request from public.attendance_device_change_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception '처리할 기기 변경 요청이 없습니다.'; end if;
  select * into v_worker from public.attendance_workers where id = v_request.worker_id for update;
  if not public.attendance_manager_can_v52_14(v_worker.project_name, true) then raise exception '기기 변경 승인 권한이 없습니다.'; end if;

  if p_approved then
    if exists (
      select 1 from public.attendance_workers
      where bound_device_hash = v_request.requested_device_hash and id <> v_worker.id
    ) then raise exception '새 휴대폰에 이미 다른 근로자가 등록되어 있습니다.'; end if;
    update public.attendance_workers
    set bound_device_hash = v_request.requested_device_hash,
        registered_user_agent = v_request.requested_user_agent,
        device_version = device_version + 1,
        updated_at = now()
    where id = v_worker.id;
    delete from public.attendance_worker_sessions where worker_id = v_worker.id;
  end if;

  update public.attendance_device_change_requests
  set status = case when p_approved then 'approved' else 'rejected' end,
      decided_at = clock_timestamp(),
      decided_by = auth.uid(),
      reason = trim(p_reason)
  where id = p_request_id;

  insert into public.attendance_audit_log (
    project_name, worker_id, action_code, action_label, actor_user_id,
    before_value, after_value, reason
  ) values (
    v_worker.project_name, v_worker.id,
    case when p_approved then 'device_approved' else 'device_rejected' end,
    case when p_approved then '기기 변경 승인' else '기기 변경 반려' end,
    auth.uid(), jsonb_build_object('device_version', v_worker.device_version),
    jsonb_build_object('device_version', case when p_approved then v_worker.device_version + 1 else v_worker.device_version end),
    trim(p_reason)
  );
end;
$$;

create or replace function public.attendance_manager_correct_event_v52_14(
  p_worker_id uuid,
  p_work_date date,
  p_event_type text,
  p_event_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker public.attendance_workers%rowtype;
  v_before jsonb;
  v_event_id uuid;
begin
  select * into v_worker from public.attendance_workers where id = p_worker_id;
  if not found then raise exception '근로자를 찾을 수 없습니다.'; end if;
  if not public.attendance_manager_can_v52_14(v_worker.project_name, true) then raise exception '근태 수정 권한이 없습니다.'; end if;
  if p_event_type not in ('check_in', 'check_out') then raise exception '출근 또는 퇴근만 수정할 수 있습니다.'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception '수정 사유를 입력해주세요.'; end if;
  if (p_event_at at time zone 'Asia/Seoul')::date <> p_work_date then raise exception '변경시각과 근태일자가 일치하지 않습니다.'; end if;

  select to_jsonb(event_row) into v_before
  from public.attendance_events event_row
  where event_row.worker_id = p_worker_id
    and event_row.work_date = p_work_date
    and event_row.event_type = p_event_type;

  insert into public.attendance_events (
    worker_id, project_name, work_date, event_type, event_at, source,
    recorded_by_manager, correction_reason
  ) values (
    p_worker_id, v_worker.project_name, p_work_date, p_event_type, p_event_at,
    'manual', auth.uid(), trim(p_reason)
  )
  on conflict (worker_id, work_date, event_type) do update
  set event_at = excluded.event_at,
      source = 'manual',
      qr_token_id = null,
      recorded_by_manager = auth.uid(),
      correction_reason = excluded.correction_reason,
      updated_at = now()
  returning id into v_event_id;

  insert into public.attendance_audit_log (
    project_name, worker_id, action_code, action_label, actor_user_id,
    before_value, after_value, reason
  ) values (
    v_worker.project_name, p_worker_id, 'attendance_corrected',
    case when p_event_type = 'check_in' then '출근 기록 수동수정' else '퇴근 기록 수동수정' end,
    auth.uid(), v_before,
    jsonb_build_object('event_id', v_event_id, 'work_date', p_work_date, 'event_type', p_event_type, 'event_at', p_event_at, 'source', 'manual'),
    trim(p_reason)
  );
end;
$$;

-- =========================================================
-- 7. 실행 권한
-- =========================================================
revoke all on function public.attendance_worker_signup_v52_14(text, text, boolean, text, text, text, text, text, text, text) from public;
revoke all on function public.attendance_worker_login_v52_14(text, text, text, text) from public;
revoke all on function public.attendance_worker_me_v52_14(text, text) from public;
revoke all on function public.attendance_worker_logout_v52_14(text) from public;
revoke all on function public.attendance_exchange_qr_v52_14(text, text, text) from public;
revoke all on function public.attendance_finalize_scan_v52_14(text, text, text) from public;
revoke all on function public.attendance_issue_qr_v52_14(text) from public;
revoke all on function public.attendance_manager_dashboard_v52_14(text, date) from public;
revoke all on function public.attendance_manager_decide_worker_v52_14(uuid, boolean, text) from public;
revoke all on function public.attendance_manager_decide_device_v52_14(uuid, boolean, text) from public;
revoke all on function public.attendance_manager_correct_event_v52_14(uuid, date, text, timestamptz, text) from public;

grant execute on function public.attendance_worker_signup_v52_14(text, text, boolean, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.attendance_worker_login_v52_14(text, text, text, text) to anon, authenticated;
grant execute on function public.attendance_worker_me_v52_14(text, text) to anon, authenticated;
grant execute on function public.attendance_worker_logout_v52_14(text) to anon, authenticated;
grant execute on function public.attendance_exchange_qr_v52_14(text, text, text) to anon, authenticated;
grant execute on function public.attendance_finalize_scan_v52_14(text, text, text) to anon, authenticated;

grant execute on function public.attendance_issue_qr_v52_14(text) to authenticated;
grant execute on function public.attendance_manager_dashboard_v52_14(text, date) to authenticated;
grant execute on function public.attendance_manager_decide_worker_v52_14(uuid, boolean, text) to authenticated;
grant execute on function public.attendance_manager_decide_device_v52_14(uuid, boolean, text) to authenticated;
grant execute on function public.attendance_manager_correct_event_v52_14(uuid, date, text, timestamptz, text) to authenticated;

comment on table public.attendance_workers is 'v52.14 ERP 회원과 분리된 근로자 근태 전용 계정';
comment on table public.attendance_qr_tokens is 'v52.14 5초 화면갱신·7초 서버유효 동적 QR';
comment on table public.attendance_qr_exchanges is 'v52.14 QR 인식 즉시 교환되는 30초 일회용 처리토큰';
comment on table public.attendance_audit_log is 'v52.14 승인·반려·기기변경·수동수정 감사이력';

commit;
