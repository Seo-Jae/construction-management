-- ============================================================
-- 사내시스템 v52.17
-- 근태관리 > 공지사항 관리 + 근로자앱 상단 강제 공지 티커
-- 기준: v52.16 Production
--
-- 기능
-- 1) 현장별 공지사항 등록/수정/사용중지/재사용
-- 2) 게시 시작일~종료일 동안 로그인한 해당 현장 근로자에게 자동 노출
-- 3) 근로자앱에서는 닫기 기능 없음
-- 4) 기존 attendance_worker_me_v52_14 응답에 announcements 배열 추가
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('public.attendance_workers') is null
     or to_regclass('public.attendance_audit_log') is null
     or to_regclass('public.attendance_risk_broadcasts') is null
     or to_regclass('public.user_profiles') is null
     or to_regprocedure('public.attendance_manager_can_v52_14(text,boolean)') is null
     or to_regprocedure('public.attendance_worker_me_v52_14(text,text)') is null then
    raise exception 'v52.14.9 이상 근태관리 SQL이 먼저 적용되어 있어야 합니다.';
  end if;
end;
$$;

-- ============================================================
-- 1. 현장별 근태앱 공지사항
-- ============================================================
create table if not exists public.attendance_notices (
  id uuid primary key default gen_random_uuid(),
  project_name text not null references public.attendance_sites(project_name),
  content text not null check (char_length(trim(content)) between 2 and 1000),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null,
  author_position text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (ends_on >= starts_on)
);

create index if not exists idx_attendance_notices_project_period
  on public.attendance_notices(project_name, is_active, starts_on, ends_on, created_at desc);

alter table public.attendance_notices enable row level security;
revoke all on public.attendance_notices from anon, authenticated;

-- ============================================================
-- 2. 담당자 공지 목록 조회
-- ============================================================
create or replace function public.attendance_manager_list_notices_v52_17(
  p_project_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_project_name text := trim(coalesce(p_project_name, ''));
begin
  if v_project_name = '' then
    raise exception '현장을 선택해주세요.';
  end if;

  if not public.attendance_manager_can_v52_14(v_project_name, false) then
    raise exception '이 현장의 공지사항 조회 권한이 없습니다.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', notice.id,
        'project_name', notice.project_name,
        'content', notice.content,
        'starts_on', notice.starts_on,
        'ends_on', notice.ends_on,
        'is_active', notice.is_active,
        'author_name', notice.author_name,
        'author_position', notice.author_position,
        'created_at', notice.created_at,
        'updated_at', notice.updated_at
      )
      order by notice.is_active desc, notice.starts_on desc, notice.created_at desc
    )
    from public.attendance_notices notice
    where notice.project_name = v_project_name
  ), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 3. 공지 등록/수정
-- ============================================================
create or replace function public.attendance_manager_save_notice_v52_17(
  p_notice_id uuid,
  p_project_name text,
  p_content text,
  p_starts_on date,
  p_ends_on date,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_content text := trim(coalesce(p_content, ''));
  v_author_name text := '관리자';
  v_author_position text := '';
  v_notice public.attendance_notices%rowtype;
  v_saved_id uuid;
  v_action_code text;
  v_action_label text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = '' or not exists (
    select 1 from public.attendance_sites site
    where site.project_name = v_project_name and site.is_active = true
  ) then
    raise exception '사용 가능한 현장을 선택해주세요.';
  end if;

  if not public.attendance_manager_can_v52_14(v_project_name, true) then
    raise exception '이 현장의 공지사항 관리 권한이 없습니다.';
  end if;

  if char_length(v_content) < 2 or char_length(v_content) > 1000 then
    raise exception '공지내용은 2자 이상 1,000자 이하로 입력해주세요.';
  end if;

  if p_starts_on is null or p_ends_on is null then
    raise exception '게시 시작일과 종료일을 선택해주세요.';
  end if;

  if p_ends_on < p_starts_on then
    raise exception '게시 종료일은 시작일보다 빠를 수 없습니다.';
  end if;

  select
    coalesce(nullif(trim(profile.manager_name), ''), '관리자'),
    coalesce(nullif(trim(profile.position_title), ''), nullif(trim(profile.role), ''), '')
  into v_author_name, v_author_position
  from public.user_profiles profile
  where profile.auth_user_id = v_user_id
  limit 1;

  if not found then
    v_author_name := '관리자';
    v_author_position := '';
  end if;

  if p_notice_id is null then
    insert into public.attendance_notices (
      project_name,
      content,
      starts_on,
      ends_on,
      is_active,
      author_user_id,
      author_name,
      author_position,
      updated_by
    ) values (
      v_project_name,
      v_content,
      p_starts_on,
      p_ends_on,
      coalesce(p_is_active, true),
      v_user_id,
      v_author_name,
      v_author_position,
      v_user_id
    )
    returning id into v_saved_id;

    v_action_code := 'attendance_notice_created';
    v_action_label := '근태앱 공지 등록';
  else
    select *
    into v_notice
    from public.attendance_notices
    where id = p_notice_id
    for update;

    if not found then
      raise exception '수정할 공지사항을 찾을 수 없습니다.';
    end if;

    if v_notice.project_name <> v_project_name then
      raise exception '다른 현장의 공지사항은 수정할 수 없습니다.';
    end if;

    update public.attendance_notices
    set content = v_content,
        starts_on = p_starts_on,
        ends_on = p_ends_on,
        is_active = coalesce(p_is_active, true),
        updated_by = v_user_id,
        updated_at = clock_timestamp()
    where id = p_notice_id
    returning id into v_saved_id;

    v_action_code := 'attendance_notice_updated';
    v_action_label := '근태앱 공지 수정';
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
    v_project_name,
    null,
    v_action_code,
    v_action_label,
    v_user_id,
    case
      when p_notice_id is null then null
      else jsonb_build_object(
        'content', v_notice.content,
        'starts_on', v_notice.starts_on,
        'ends_on', v_notice.ends_on,
        'is_active', v_notice.is_active
      )
    end,
    jsonb_build_object(
      'notice_id', v_saved_id,
      'content', v_content,
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'is_active', coalesce(p_is_active, true)
    ),
    case when p_notice_id is null then '근태앱 공지 등록' else '근태앱 공지 수정' end
  );

  return jsonb_build_object(
    'saved', true,
    'notice_id', v_saved_id
  );
end;
$$;

-- ============================================================
-- 4. 사용중지 / 사용재개
-- ============================================================
create or replace function public.attendance_manager_set_notice_active_v52_17(
  p_notice_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_notice public.attendance_notices%rowtype;
  v_next_active boolean := coalesce(p_is_active, false);
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_notice
  from public.attendance_notices
  where id = p_notice_id
  for update;

  if not found then
    raise exception '공지사항을 찾을 수 없습니다.';
  end if;

  if not public.attendance_manager_can_v52_14(v_notice.project_name, true) then
    raise exception '이 현장의 공지사항 관리 권한이 없습니다.';
  end if;

  update public.attendance_notices
  set is_active = v_next_active,
      updated_by = v_user_id,
      updated_at = clock_timestamp()
  where id = v_notice.id;

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
    v_notice.project_name,
    null,
    case when v_next_active then 'attendance_notice_enabled' else 'attendance_notice_disabled' end,
    case when v_next_active then '근태앱 공지 사용재개' else '근태앱 공지 사용중지' end,
    v_user_id,
    jsonb_build_object('notice_id', v_notice.id, 'is_active', v_notice.is_active),
    jsonb_build_object('notice_id', v_notice.id, 'is_active', v_next_active),
    case when v_next_active then '공지사항 사용재개' else '공지사항 사용중지' end
  );

  return jsonb_build_object(
    'updated', true,
    'notice_id', v_notice.id,
    'is_active', v_next_active
  );
end;
$$;

-- ============================================================
-- 5. 근로자 본인 조회에 현재 게시중인 공지 포함
--    기존 v52.14.9의 당일/월간 출결 및 중점위험요인 응답은 그대로 유지
-- ============================================================
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
  v_project_name text;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_next_month date := (date_trunc('month', v_today) + interval '1 month')::date;
begin
  select worker.project_name
  into v_project_name
  from public.attendance_workers worker
  where worker.id = v_worker_id;

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
        'work_date', event_row.work_date,
        'event_type', event_row.event_type,
        'event_at', event_row.event_at,
        'source', event_row.source
      ) order by event_row.event_at)
      from public.attendance_events event_row
      where event_row.worker_id = v_worker_id
        and event_row.work_date = v_today
    ), '[]'::jsonb),
    'month_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event_row.id,
        'work_date', event_row.work_date,
        'event_type', event_row.event_type,
        'event_at', event_row.event_at,
        'source', event_row.source
      ) order by event_row.work_date, event_row.event_at)
      from public.attendance_events event_row
      where event_row.worker_id = v_worker_id
        and event_row.work_date >= v_month_start
        and event_row.work_date < v_next_month
    ), '[]'::jsonb),
    'risk_broadcasts', coalesce((
      select jsonb_agg(risk_row order by risk_row.created_at desc)
      from (
        select
          broadcast.id,
          broadcast.scope_type,
          broadcast.project_name,
          broadcast.content,
          broadcast.author_name,
          broadcast.author_position,
          broadcast.author_role,
          broadcast.created_at
        from public.attendance_risk_broadcasts broadcast
        where broadcast.status = 'active'
          and (
            broadcast.scope_type = 'common'
            or broadcast.project_name = v_project_name
          )
        order by broadcast.created_at desc
        limit 20
      ) risk_row
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(notice_row order by notice_row.created_at desc)
      from (
        select
          notice.id,
          notice.content,
          notice.starts_on,
          notice.ends_on,
          notice.author_name,
          notice.author_position,
          notice.created_at
        from public.attendance_notices notice
        where notice.project_name = v_project_name
          and notice.is_active = true
          and notice.starts_on <= v_today
          and notice.ends_on >= v_today
        order by notice.created_at desc
        limit 20
      ) notice_row
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end;
$$;

-- ============================================================
-- 6. 권한
-- ============================================================
revoke all on function public.attendance_manager_list_notices_v52_17(text) from public;
revoke all on function public.attendance_manager_save_notice_v52_17(uuid, text, text, date, date, boolean) from public;
revoke all on function public.attendance_manager_set_notice_active_v52_17(uuid, boolean) from public;
revoke all on function public.attendance_worker_me_v52_14(text, text) from public;

grant execute on function public.attendance_manager_list_notices_v52_17(text) to authenticated;
grant execute on function public.attendance_manager_save_notice_v52_17(uuid, text, text, date, date, boolean) to authenticated;
grant execute on function public.attendance_manager_set_notice_active_v52_17(uuid, boolean) to authenticated;
grant execute on function public.attendance_worker_me_v52_14(text, text) to anon, authenticated;

comment on table public.attendance_notices
  is 'v52.17 현장별 근태앱 상단 강제 공지 티커';
comment on function public.attendance_manager_list_notices_v52_17(text)
  is 'v52.17 근태관리 공지사항 목록';
comment on function public.attendance_manager_save_notice_v52_17(uuid, text, text, date, date, boolean)
  is 'v52.17 근태앱 공지 등록/수정';
comment on function public.attendance_manager_set_notice_active_v52_17(uuid, boolean)
  is 'v52.17 근태앱 공지 사용중지/재개';
comment on function public.attendance_worker_me_v52_14(text, text)
  is 'v52.17 근로자 본인정보·당일/금월 출결·중점위험요인·게시중 공지 조회';

commit;

-- 설치 확인
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'attendance_manager_list_notices_v52_17',
    'attendance_manager_save_notice_v52_17',
    'attendance_manager_set_notice_active_v52_17',
    'attendance_worker_me_v52_14'
  )
order by p.proname;
