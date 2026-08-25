-- ============================================================
-- 현장관리 v51.72
-- 회원관리 > 접속현황 및 기록
--
-- 적용 내용
--   1) 활성 회원의 접속 시작·마지막 활동·접속 종료 기록
--   2) 최고관리자 전용 접속기록 조회 RPC
--   3) 브라우저가 종료 RPC를 완료하지 못한 경우 최근 heartbeat를
--      접속종료 시각의 대체값으로 표시
--
-- 주의
--   - 이 SQL을 실행한 이후부터의 접속기록이 쌓입니다.
--   - 기존 과거 접속 이력은 소급 생성되지 않습니다.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 접속 세션 테이블
-- ------------------------------------------------------------
create table if not exists public.user_access_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  access_started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  access_ended_at timestamptz null,
  end_reason text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_access_sessions_session_key_not_blank
    check (length(btrim(session_key)) > 0)
);

-- 이미 일부 컬럼만 있는 환경에서도 재실행 가능하도록 보완
alter table public.user_access_sessions
  add column if not exists session_key text,
  add column if not exists auth_user_id uuid,
  add column if not exists access_started_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists access_ended_at timestamptz null,
  add column if not exists end_reason text null,
  add column if not exists user_agent text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ux_user_access_sessions_session_key
  on public.user_access_sessions (session_key);

create index if not exists idx_user_access_sessions_user_started
  on public.user_access_sessions (auth_user_id, access_started_at desc);

create index if not exists idx_user_access_sessions_active
  on public.user_access_sessions (last_seen_at desc)
  where access_ended_at is null;

alter table public.user_access_sessions enable row level security;

-- 테이블 직접 접근은 막고 아래 보안 RPC만 사용
revoke all on table public.user_access_sessions from anon;
revoke all on table public.user_access_sessions from authenticated;

-- ------------------------------------------------------------
-- 2. 최고관리자 확인 함수
-- ------------------------------------------------------------
create or replace function public.is_active_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = auth.uid()
      and lower(coalesce(profile.account_status, 'active')) = 'active'
      and (
        coalesce(profile.role, '') = '최고관리자'
        or lower(regexp_replace(coalesce(profile.role, ''), '[[:space:]_\-]', '', 'g'))
           in ('superadmin', 'masteradmin')
      )
  );
$$;

revoke all on function public.is_active_super_admin() from public;
grant execute on function public.is_active_super_admin() to authenticated;

-- ------------------------------------------------------------
-- 3. 접속 시작
-- ------------------------------------------------------------
create or replace function public.start_user_access_session(
  p_session_key text,
  p_user_agent text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_existing_user_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인 사용자만 접속기록을 시작할 수 있습니다.';
  end if;

  if nullif(btrim(coalesce(p_session_key, '')), '') is null then
    raise exception '접속 세션 키가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = v_user_id
      and lower(coalesce(profile.account_status, 'active')) = 'active'
  ) then
    raise exception '승인 완료된 활성 회원만 접속기록을 시작할 수 있습니다.';
  end if;

  select session.id, session.auth_user_id
    into v_session_id, v_existing_user_id
  from public.user_access_sessions session
  where session.session_key = btrim(p_session_key)
  limit 1;

  if v_session_id is not null then
    if v_existing_user_id <> v_user_id then
      raise exception '다른 사용자에게 연결된 접속 세션 키입니다.';
    end if;

    update public.user_access_sessions
    set last_seen_at = now(),
        access_ended_at = null,
        end_reason = null,
        user_agent = nullif(left(coalesce(p_user_agent, ''), 1000), ''),
        updated_at = now()
    where id = v_session_id;

    return v_session_id;
  end if;

  -- 이전 세션이 명시적으로 종료되지 않았고 heartbeat도 끊겼다면
  -- 마지막 활동시각을 종료시각으로 확정합니다.
  update public.user_access_sessions
  set access_ended_at = last_seen_at,
      end_reason = coalesce(end_reason, 'heartbeat_timeout'),
      updated_at = now()
  where auth_user_id = v_user_id
    and access_ended_at is null
    and last_seen_at < now() - interval '90 seconds';

  insert into public.user_access_sessions (
    session_key,
    auth_user_id,
    access_started_at,
    last_seen_at,
    user_agent
  )
  values (
    btrim(p_session_key),
    v_user_id,
    now(),
    now(),
    nullif(left(coalesce(p_user_agent, ''), 1000), '')
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.start_user_access_session(text, text) from public;
grant execute on function public.start_user_access_session(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. 접속 중 heartbeat 갱신
-- ------------------------------------------------------------
create or replace function public.touch_user_access_session(
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if auth.uid() is null or p_session_id is null then
    return false;
  end if;

  update public.user_access_sessions
  set last_seen_at = now(),
      updated_at = now()
  where id = p_session_id
    and auth_user_id = auth.uid()
    and access_ended_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.touch_user_access_session(uuid) from public;
grant execute on function public.touch_user_access_session(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. 접속 종료
-- ------------------------------------------------------------
create or replace function public.end_user_access_session(
  p_session_id uuid,
  p_end_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if auth.uid() is null or p_session_id is null then
    return false;
  end if;

  update public.user_access_sessions
  set last_seen_at = now(),
      access_ended_at = coalesce(access_ended_at, now()),
      end_reason = coalesce(nullif(btrim(p_end_reason), ''), 'logout'),
      updated_at = now()
  where id = p_session_id
    and auth_user_id = auth.uid();

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.end_user_access_session(uuid, text) from public;
grant execute on function public.end_user_access_session(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. 최고관리자용 접속현황 및 기록 조회
-- ------------------------------------------------------------
create or replace function public.admin_get_user_access_history(
  p_limit integer default 1000
)
returns table (
  auth_user_id uuid,
  access_session_id uuid,
  project_name text,
  position_title text,
  manager_name text,
  access_started_at timestamptz,
  access_ended_at timestamptz,
  is_online boolean,
  end_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
begin
  if not public.is_active_super_admin() then
    raise exception '최고관리자만 접속현황 및 기록을 조회할 수 있습니다.';
  end if;

  return query
  select
    profile.auth_user_id,
    session.id as access_session_id,
    coalesce(nullif(btrim(profile.project_name), ''), '-')::text as project_name,
    coalesce(nullif(btrim(profile.position_title), ''), '-')::text as position_title,
    coalesce(nullif(btrim(profile.manager_name), ''), '-')::text as manager_name,
    session.access_started_at,
    case
      when session.id is null then null
      when session.access_ended_at is not null then session.access_ended_at
      when session.last_seen_at < now() - interval '90 seconds' then session.last_seen_at
      else null
    end as access_ended_at,
    (
      session.id is not null
      and session.access_ended_at is null
      and session.last_seen_at >= now() - interval '90 seconds'
    ) as is_online,
    case
      when session.id is null then null
      when session.access_ended_at is not null then session.end_reason
      when session.last_seen_at < now() - interval '90 seconds'
        then coalesce(session.end_reason, 'heartbeat_timeout')
      else session.end_reason
    end as end_reason
  from public.user_profiles profile
  left join public.user_access_sessions session
    on session.auth_user_id = profile.auth_user_id
  where lower(coalesce(profile.account_status, 'active')) = 'active'
    and profile.auth_user_id is not null
  order by
    (
      session.id is not null
      and session.access_ended_at is null
      and session.last_seen_at >= now() - interval '90 seconds'
    ) desc,
    session.access_started_at desc nulls last,
    profile.manager_name asc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.admin_get_user_access_history(integer) from public;
grant execute on function public.admin_get_user_access_history(integer) to authenticated;

commit;
