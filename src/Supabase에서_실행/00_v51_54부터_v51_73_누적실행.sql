-- ============================================================
-- 현장관리 v51.74 누적 배포 SQL
-- 현재 운영 v51.53 -> v51.54~v51.73 누적 반영
--
-- 포함 SQL
--   1) v51.54 타입별 도면분석 도면 공제항목 저장
--   2) v51.72 회원관리 접속현황 및 기록
--
-- 이미 일부 SQL을 실행한 환경에서도 재실행할 수 있도록
-- 원본 SQL의 IF NOT EXISTS / CREATE OR REPLACE 구조를 유지합니다.
-- ============================================================

-- ============================================================
-- 현장관리 v51.54
-- 타입별 도면분석 > 창호·도어 두 점 지정 + 폭×높이 공제면적
--
-- 선행 조건
--   - v51.53 SQL이 실행되어 drawing_quantity_drawings 테이블과
--     drawing_user_can_access_project(text) 함수가 존재해야 합니다.
--
-- 주요 내용
--   1) 현장·타입·실별 창호/도어 위치와 치수 저장
--   2) 도면에서 선택한 시작점·끝점 좌표 저장
--   3) 폭(mm) × 높이(mm) × 개수로 면적(㎡) 자동 계산
--   4) 선택한 WL- 공정 레이어에 창호·도어 공제면적 자동 합산
--   5) 레이어·블록이 잘못되어도 사용자가 직접 두 점을 지정 가능
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 창호·도어 설정 테이블
-- ------------------------------------------------------------
create table if not exists public.drawing_quantity_openings (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null
    references public.drawing_quantity_drawings(id)
    on delete cascade,
  project_name text not null,
  drawing_type text not null,
  opening_key text not null,
  room_key text not null,
  opening_type text not null
    check (opening_type in ('window', 'door')),
  opening_name text not null,
  width_mm numeric(16, 3) not null check (width_mm > 0),
  height_mm numeric(16, 3) not null check (height_mm > 0),
  quantity integer not null default 1 check (quantity > 0),
  area_m2 numeric(16, 6) not null check (area_m2 >= 0),
  start_x numeric(18, 6) not null,
  start_y numeric(18, 6) not null,
  end_x numeric(18, 6) not null,
  end_y numeric(18, 6) not null,
  center_x numeric(18, 6) not null,
  center_y numeric(18, 6) not null,
  applied_layers text[] not null default '{}'::text[],
  created_by uuid null default auth.uid(),
  updated_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drawing_quantity_openings_drawing_key_unique
    unique (drawing_id, opening_key),
  constraint drawing_quantity_openings_project_not_blank
    check (length(btrim(project_name)) > 0),
  constraint drawing_quantity_openings_type_not_blank
    check (length(btrim(drawing_type)) > 0),
  constraint drawing_quantity_openings_key_not_blank
    check (length(btrim(opening_key)) > 0),
  constraint drawing_quantity_openings_room_key_not_blank
    check (length(btrim(room_key)) > 0),
  constraint drawing_quantity_openings_name_not_blank
    check (length(btrim(opening_name)) > 0)
);

create index if not exists idx_drawing_quantity_openings_drawing
  on public.drawing_quantity_openings (drawing_id, room_key, opening_name);

create index if not exists idx_drawing_quantity_openings_project_type
  on public.drawing_quantity_openings (project_name, drawing_type);

create or replace function public.set_drawing_quantity_openings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_drawing_quantity_openings_updated_at
  on public.drawing_quantity_openings;

create trigger trg_drawing_quantity_openings_updated_at
before update on public.drawing_quantity_openings
for each row
execute function public.set_drawing_quantity_openings_updated_at();

alter table public.drawing_quantity_openings enable row level security;

revoke all on table public.drawing_quantity_openings from anon;
revoke all on table public.drawing_quantity_openings from authenticated;
grant select on table public.drawing_quantity_openings to authenticated;

drop policy if exists drawing_quantity_openings_select
  on public.drawing_quantity_openings;
create policy drawing_quantity_openings_select
on public.drawing_quantity_openings
for select
to authenticated
using (public.drawing_user_can_access_project(project_name));

-- ------------------------------------------------------------
-- 2. 창호·도어 일괄 저장 RPC
--    한 도면의 창호·도어 설정을 전부 교체합니다.
-- ------------------------------------------------------------
create or replace function public.save_drawing_openings(
  p_drawing_id uuid,
  p_openings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drawing public.drawing_quantity_drawings%rowtype;
  v_opening jsonb;
  v_opening_key text;
  v_room_key text;
  v_opening_type text;
  v_opening_name text;
  v_width_mm numeric;
  v_height_mm numeric;
  v_quantity integer;
  v_start_x numeric;
  v_start_y numeric;
  v_end_x numeric;
  v_end_y numeric;
  v_center_x numeric;
  v_center_y numeric;
  v_area_m2 numeric;
  v_applied_layers text[];
  v_layer_name text;
begin
  select *
    into v_drawing
  from public.drawing_quantity_drawings drawing
  where drawing.id = p_drawing_id
    and public.drawing_user_can_access_project(drawing.project_name);

  if not found then
    raise exception '접근 가능한 저장 도면을 찾지 못했습니다.';
  end if;

  if p_openings is null or jsonb_typeof(p_openings) <> 'array' then
    raise exception '창호·도어 설정 데이터는 배열이어야 합니다.';
  end if;

  delete from public.drawing_quantity_openings
  where drawing_id = p_drawing_id;

  for v_opening in
    select value from jsonb_array_elements(p_openings)
  loop
    v_opening_key := btrim(coalesce(v_opening ->> 'opening_key', ''));
    v_room_key := btrim(coalesce(v_opening ->> 'room_key', ''));
    v_opening_type := btrim(coalesce(v_opening ->> 'opening_type', ''));
    v_opening_name := btrim(coalesce(v_opening ->> 'opening_name', ''));
    v_width_mm := coalesce(nullif(v_opening ->> 'width_mm', '')::numeric, 0);
    v_height_mm := coalesce(nullif(v_opening ->> 'height_mm', '')::numeric, 0);
    v_quantity := coalesce(nullif(v_opening ->> 'quantity', '')::integer, 1);
    v_start_x := nullif(v_opening ->> 'start_x', '')::numeric;
    v_start_y := nullif(v_opening ->> 'start_y', '')::numeric;
    v_end_x := nullif(v_opening ->> 'end_x', '')::numeric;
    v_end_y := nullif(v_opening ->> 'end_y', '')::numeric;

    if v_opening_key = '' then
      raise exception 'opening_key가 비어 있습니다.';
    end if;
    if v_room_key = '' then
      raise exception 'room_key가 비어 있습니다.';
    end if;
    if v_opening_type not in ('window', 'door') then
      raise exception '창호·도어 구분은 window 또는 door여야 합니다.';
    end if;
    if v_opening_name = '' then
      raise exception '창호·도어 명칭이 비어 있습니다.';
    end if;
    if v_width_mm <= 0 or v_height_mm <= 0 or v_quantity <= 0 then
      raise exception '창호·도어 폭, 높이, 개수는 0보다 커야 합니다.';
    end if;
    if v_start_x is null or v_start_y is null or v_end_x is null or v_end_y is null then
      raise exception '창호·도어 도면 위치 두 점이 필요합니다.';
    end if;

    -- 실 설정을 이미 저장한 도면이라면 잘못된 room_key를 차단합니다.
    if exists (
      select 1 from public.drawing_quantity_rooms room
      where room.drawing_id = p_drawing_id
    ) and not exists (
      select 1 from public.drawing_quantity_rooms room
      where room.drawing_id = p_drawing_id
        and room.room_key = v_room_key
    ) then
      raise exception '저장된 실과 일치하지 않는 room_key입니다: %', v_room_key;
    end if;

    v_applied_layers := array(
      select distinct btrim(value)
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(coalesce(v_opening -> 'applied_layers', '[]'::jsonb)) = 'array'
            then coalesce(v_opening -> 'applied_layers', '[]'::jsonb)
          else '[]'::jsonb
        end
      )
      where btrim(value) <> ''
    );

    foreach v_layer_name in array coalesce(v_applied_layers, '{}'::text[])
    loop
      if v_layer_name not like 'WL-%' then
        raise exception '공제 적용 레이어는 WL-로 시작해야 합니다: %', v_layer_name;
      end if;
    end loop;

    v_center_x := (v_start_x + v_end_x) / 2;
    v_center_y := (v_start_y + v_end_y) / 2;
    v_area_m2 := round((v_width_mm * v_height_mm * v_quantity) / 1000000.0, 6);

    insert into public.drawing_quantity_openings (
      drawing_id,
      project_name,
      drawing_type,
      opening_key,
      room_key,
      opening_type,
      opening_name,
      width_mm,
      height_mm,
      quantity,
      area_m2,
      start_x,
      start_y,
      end_x,
      end_y,
      center_x,
      center_y,
      applied_layers,
      created_by,
      updated_by
    ) values (
      v_drawing.id,
      v_drawing.project_name,
      v_drawing.drawing_type,
      v_opening_key,
      v_room_key,
      v_opening_type,
      v_opening_name,
      v_width_mm,
      v_height_mm,
      v_quantity,
      v_area_m2,
      v_start_x,
      v_start_y,
      v_end_x,
      v_end_y,
      v_center_x,
      v_center_y,
      coalesce(v_applied_layers, '{}'::text[]),
      auth.uid(),
      auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.save_drawing_openings(uuid, jsonb) from public;
grant execute on function public.save_drawing_openings(uuid, jsonb) to authenticated;

commit;

-- ------------------------------------------------------------
-- 설치 확인: 아래 값이 모두 true면 정상
-- ------------------------------------------------------------
select
  to_regclass('public.drawing_quantity_openings') is not null
    as openings_table_ready,
  to_regprocedure('public.save_drawing_openings(uuid,jsonb)') is not null
    as openings_save_rpc_ready,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'drawing_quantity_openings'
      and policyname = 'drawing_quantity_openings_select'
  ) as openings_select_policy_ready;


-- ============================================================
-- 다음: v51.72 회원 접속현황 및 기록
-- ============================================================

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
