-- =========================================================
-- 사내 현장관리 시스템 v52.14.9
-- 안전관리자 역할 + 중점위험요인 전파
-- 실행 전제: v52.14.7까지의 근태관리 SQL 및 회원권한 v2 적용 완료
-- =========================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('public.attendance_workers') is null
     or to_regclass('public.attendance_events') is null
     or to_regclass('public.user_profiles') is null
     or to_regclass('public.user_access_settings_v2') is null
     or to_regprocedure('public.attendance_worker_me_v52_14(text,text)') is null
     or to_regprocedure('public.admin_update_user_access_v2(uuid,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text)') is null then
    raise exception 'v52.14.7 근태관리 SQL과 회원권한 v2 SQL을 먼저 적용해주세요.';
  end if;
end;
$$;

-- =========================================================
-- 1. 회원관리에서 안전관리자를 원자적으로 저장하는 전용 함수
-- 기존 계정 저장 함수가 기존 3개 역할만 처리하더라도 안전하게 동작한다.
-- =========================================================
create or replace function public.admin_update_safety_manager_access_v52_14_9(
  p_user_id uuid,
  p_role text,
  p_position_title text,
  p_organization_type text,
  p_department_code text,
  p_permission_template_code text,
  p_access_scope text,
  p_project_names text[],
  p_project_access jsonb,
  p_permission_overrides jsonb,
  p_special_permissions jsonb,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if p_role <> '안전관리자' then
    raise exception '안전관리자 역할만 이 저장 함수를 사용할 수 있습니다.';
  end if;

  if p_organization_type <> '본사'
     or p_department_code <> 'safety'
     or p_permission_template_code <> 'hq_safety' then
    raise exception '안전관리자는 본사·안전부서·본사 안전담당 템플릿으로 설정해주세요.';
  end if;

  v_before := public.admin_user_access_snapshot_v2(p_user_id);

  perform public.admin_update_user_access_v2(
    p_user_id => p_user_id,
    p_role => '담당자',
    p_position_title => p_position_title,
    p_organization_type => p_organization_type,
    p_department_code => p_department_code,
    p_permission_template_code => p_permission_template_code,
    p_access_scope => p_access_scope,
    p_project_names => p_project_names,
    p_project_access => p_project_access,
    p_permission_overrides => p_permission_overrides,
    p_special_permissions => p_special_permissions,
    p_account_status => p_account_status
  );

  update public.user_profiles
  set role = '안전관리자'
  where auth_user_id = p_user_id;

  if not found then
    raise exception '안전관리자로 변경할 회원정보를 찾을 수 없습니다.';
  end if;

  v_after := public.admin_user_access_snapshot_v2(p_user_id);

  insert into public.user_access_audit_log_v2 (
    target_user_id,
    changed_by,
    before_value,
    after_value,
    change_summary,
    changed_fields
  ) values (
    p_user_id,
    auth.uid(),
    v_before,
    v_after,
    '안전관리자 역할 및 권한 저장',
    '["기본정보", "접근현장", "권한템플릿", "안전관리자역할"]'::jsonb
  );
end;
$$;

revoke all on function public.admin_update_safety_manager_access_v52_14_9(uuid, text, text, text, text, text, text, text[], jsonb, jsonb, jsonb, text) from public;
grant execute on function public.admin_update_safety_manager_access_v52_14_9(uuid, text, text, text, text, text, text, text[], jsonb, jsonb, jsonb, text) to authenticated;

-- =========================================================
-- 2. 중점위험요인 권한 카탈로그
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
  ('attendance.risk.view', 'attendance', '근태관리', 'attendance_risk', '중점위험요인 관리', 'view', '조회', 10, false, false),
  ('attendance.risk.manage', 'attendance', '근태관리', 'attendance_risk', '중점위험요인 관리', 'manage', '등록·전파종료', 50, false, false)
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
  ('super_admin', 'attendance.risk.view'),
  ('super_admin', 'attendance.risk.manage'),
  ('hq_construction', 'attendance.risk.view'),
  ('hq_construction', 'attendance.risk.manage'),
  ('hq_safety', 'attendance.risk.view'),
  ('hq_safety', 'attendance.risk.manage'),
  ('hq_administration', 'attendance.risk.view'),
  ('hq_administration', 'attendance.risk.manage'),
  ('hq_material', 'attendance.risk.view'),
  ('hq_material', 'attendance.risk.manage'),
  ('hq_subcontract', 'attendance.risk.view'),
  ('hq_subcontract', 'attendance.risk.manage'),
  ('site_manager', 'attendance.risk.view'),
  ('site_manager', 'attendance.risk.manage'),
  ('site_construction', 'attendance.risk.view'),
  ('site_construction', 'attendance.risk.manage'),
  ('site_safety', 'attendance.risk.view'),
  ('site_safety', 'attendance.risk.manage'),
  ('site_administration', 'attendance.risk.view'),
  ('site_administration', 'attendance.risk.manage'),
  ('hq_safety', 'attendance.management.view'),
  ('site_construction', 'attendance.management.view'),
  ('site_safety', 'attendance.management.view')
) as permission_seed(template_code, permission_key)
where exists (
  select 1
  from public.permission_templates template
  where template.code = permission_seed.template_code
)
on conflict (template_code, permission_key) do update
set is_granted = excluded.is_granted;

-- =========================================================
-- 3. 전파 데이터
-- =========================================================
create table if not exists public.attendance_risk_broadcasts (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('common', 'project')),
  project_name text references public.attendance_sites(project_name),
  content text not null check (char_length(content) between 5 and 1000),
  status text not null default 'active' check (status in ('active', 'closed')),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null,
  author_position text not null,
  author_role text not null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  check (
    (scope_type = 'common' and project_name is null)
    or (scope_type = 'project' and project_name is not null)
  )
);

create index if not exists idx_attendance_risk_active_scope
  on public.attendance_risk_broadcasts(status, scope_type, project_name, created_at desc);

alter table public.attendance_risk_broadcasts enable row level security;
revoke all on public.attendance_risk_broadcasts from anon, authenticated;

-- =========================================================
-- 4. 내부 현장범위 확인
-- =========================================================
create or replace function public.attendance_risk_project_allowed_v52_14_9(
  p_user_id uuid,
  p_project_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_scope text;
begin
  select coalesce(role, '담당자'), coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = p_user_id
  limit 1;

  if not found or v_status <> 'active' then return false; end if;
  if v_role = '최고관리자' then return true; end if;

  select access_scope
  into v_scope
  from public.user_access_settings_v2
  where auth_user_id = p_user_id;

  if found and v_scope = 'all' then return true; end if;

  if exists (
    select 1
    from public.user_project_access_v2 access_row
    where access_row.auth_user_id = p_user_id
      and access_row.project_name = trim(p_project_name)
      and access_row.is_active = true
      and (access_row.access_start_date is null or access_row.access_start_date <= current_date)
      and (access_row.access_end_date is null or access_row.access_end_date >= current_date)
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = p_user_id
      and profile.project_name = trim(p_project_name)
      and profile.project_name <> '본사'
  );
end;
$$;

revoke all on function public.attendance_risk_project_allowed_v52_14_9(uuid, text) from public;

-- =========================================================
-- 5. 관리 화면 조회
-- =========================================================
create or replace function public.attendance_risk_management_v52_14_9()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_status text;
  v_organization_type text;
  v_access_scope text;
  v_projects text[] := array[]::text[];
  v_can_publish_common boolean := false;
  v_can_publish_project boolean := false;
begin
  if v_user_id is null then raise exception '로그인이 필요합니다.'; end if;

  select coalesce(role, '담당자'), coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = v_user_id
  limit 1;

  if not found or v_status <> 'active' then
    raise exception '사용 가능한 회원계정이 아닙니다.';
  end if;

  if v_role not in ('담당자', '안전관리자', '관리자', '최고관리자') then
    raise exception '중점위험요인 조회 권한이 없습니다.';
  end if;

  select organization_type, access_scope
  into v_organization_type, v_access_scope
  from public.user_access_settings_v2
  where auth_user_id = v_user_id;

  if v_role = '최고관리자' or v_access_scope = 'all' then
    select coalesce(array_agg(site.project_name order by site.display_order, site.project_name), array[]::text[])
    into v_projects
    from public.attendance_sites site
    where site.is_active = true;
  else
    select coalesce(array_agg(project_row.project_name order by project_row.project_name), array[]::text[])
    into v_projects
    from (
      select access_row.project_name
      from public.user_project_access_v2 access_row
      join public.attendance_sites site on site.project_name = access_row.project_name and site.is_active = true
      where access_row.auth_user_id = v_user_id
        and access_row.is_active = true
        and (access_row.access_start_date is null or access_row.access_start_date <= current_date)
        and (access_row.access_end_date is null or access_row.access_end_date >= current_date)
      union
      select profile.project_name
      from public.user_profiles profile
      join public.attendance_sites site on site.project_name = profile.project_name and site.is_active = true
      where profile.auth_user_id = v_user_id
        and profile.project_name <> '본사'
    ) project_row;
  end if;

  v_can_publish_common := v_role in ('안전관리자', '관리자', '최고관리자')
    and public.attendance_permission_effective_v52_14('attendance.risk.manage', '');
  v_can_publish_project := (
    v_role in ('안전관리자', '관리자', '최고관리자')
    or (v_role = '담당자' and v_organization_type = '현장')
  ) and exists (
    select 1
    from unnest(v_projects) as project_item(project_name)
    where public.attendance_permission_effective_v52_14(
      'attendance.risk.manage',
      project_item.project_name
    )
  );

  if not public.attendance_permission_effective_v52_14('attendance.risk.view', '')
     and not exists (
       select 1
       from unnest(v_projects) as project_item(project_name)
       where public.attendance_permission_effective_v52_14(
         'attendance.risk.view',
         project_item.project_name
       )
     ) then
    raise exception '중점위험요인 조회 권한이 없습니다.';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'can_publish_common', v_can_publish_common,
    'can_publish_project', v_can_publish_project,
    'available_projects', to_jsonb(v_projects),
    'records', coalesce((
      select jsonb_agg(record_row order by record_row.created_at desc)
      from (
        select
          broadcast.id,
          broadcast.scope_type,
          broadcast.project_name,
          broadcast.content,
          broadcast.status,
          broadcast.author_name,
          broadcast.author_position,
          broadcast.author_role,
          broadcast.created_at,
          broadcast.closed_at,
          (
            broadcast.status = 'active'
            and (
              broadcast.author_user_id = v_user_id
              or (
                v_role in ('안전관리자', '관리자', '최고관리자')
                and (
                  broadcast.scope_type = 'common'
                  or broadcast.project_name = any(v_projects)
                )
              )
            )
          ) as can_close
        from public.attendance_risk_broadcasts broadcast
        where broadcast.scope_type = 'common'
           or broadcast.project_name = any(v_projects)
        order by broadcast.created_at desc
        limit 100
      ) record_row
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end;
$$;

-- =========================================================
-- 6. 등록 및 전파 종료
-- =========================================================
create or replace function public.attendance_publish_risk_v52_14_9(
  p_scope_type text,
  p_project_name text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope_type text := lower(trim(coalesce(p_scope_type, '')));
  v_project_name text := nullif(trim(coalesce(p_project_name, '')), '');
  v_content text := trim(coalesce(p_content, ''));
  v_role text;
  v_status text;
  v_name text;
  v_position text;
  v_organization_type text;
  v_id uuid;
begin
  if v_user_id is null then raise exception '로그인이 필요합니다.'; end if;

  select
    coalesce(role, '담당자'),
    coalesce(account_status, 'active'),
    coalesce(nullif(trim(manager_name), ''), nullif(trim(email), ''), '작성자'),
    coalesce(nullif(trim(position_title), ''), coalesce(role, '담당자'))
  into v_role, v_status, v_name, v_position
  from public.user_profiles
  where auth_user_id = v_user_id
  limit 1;

  if not found or v_status <> 'active' then raise exception '사용 가능한 회원계정이 아닙니다.'; end if;

  select organization_type
  into v_organization_type
  from public.user_access_settings_v2
  where auth_user_id = v_user_id;

  if v_scope_type not in ('common', 'project') then raise exception '전파 범위가 올바르지 않습니다.'; end if;
  if char_length(v_content) < 5 or char_length(v_content) > 1000 then raise exception '중점위험요인은 5자 이상 1000자 이하로 입력해주세요.'; end if;

  if v_scope_type = 'common' then
    if v_role not in ('안전관리자', '관리자', '최고관리자') then
      raise exception '전체 공통 전파는 안전관리자·관리자·최고관리자만 등록할 수 있습니다.';
    end if;
    if not public.attendance_permission_effective_v52_14('attendance.risk.manage', '') then
      raise exception '중점위험요인 공통 전파 권한이 없습니다.';
    end if;
    v_project_name := null;
  else
    if v_role = '담당자' and v_organization_type <> '현장' then
      raise exception '현장담당자만 담당 현장에 중점위험요인을 등록할 수 있습니다.';
    end if;
    if v_role not in ('담당자', '안전관리자', '관리자', '최고관리자') then
      raise exception '중점위험요인 등록 권한이 없습니다.';
    end if;
    if v_project_name is null
       or not exists (
         select 1 from public.attendance_sites
         where project_name = v_project_name and is_active = true
       ) then
      raise exception '전파할 현장을 확인해주세요.';
    end if;
    if not public.attendance_risk_project_allowed_v52_14_9(v_user_id, v_project_name) then
      raise exception '배정되지 않은 현장에는 전파할 수 없습니다.';
    end if;
    if not public.attendance_permission_effective_v52_14('attendance.risk.manage', v_project_name) then
      raise exception '선택한 현장의 중점위험요인 등록 권한이 없습니다.';
    end if;
  end if;

  insert into public.attendance_risk_broadcasts (
    scope_type,
    project_name,
    content,
    author_user_id,
    author_name,
    author_position,
    author_role
  ) values (
    v_scope_type,
    v_project_name,
    v_content,
    v_user_id,
    v_name,
    v_position,
    v_role
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.attendance_close_risk_v52_14_9(
  p_broadcast_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_status text;
  v_organization_type text;
  v_broadcast public.attendance_risk_broadcasts%rowtype;
  v_can_close boolean := false;
begin
  if v_user_id is null then raise exception '로그인이 필요합니다.'; end if;

  select coalesce(role, '담당자'), coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = v_user_id
  limit 1;
  if not found or v_status <> 'active' then raise exception '사용 가능한 회원계정이 아닙니다.'; end if;

  select organization_type
  into v_organization_type
  from public.user_access_settings_v2
  where auth_user_id = v_user_id;

  select * into v_broadcast
  from public.attendance_risk_broadcasts
  where id = p_broadcast_id
  for update;

  if not found then raise exception '중점위험요인을 찾을 수 없습니다.'; end if;
  if v_broadcast.status <> 'active' then raise exception '이미 종료된 전파입니다.'; end if;

  if v_broadcast.author_user_id = v_user_id then
    v_can_close := v_role in ('안전관리자', '관리자', '최고관리자')
      or (
        v_role = '담당자'
        and v_organization_type = '현장'
        and v_broadcast.scope_type = 'project'
        and public.attendance_risk_project_allowed_v52_14_9(v_user_id, v_broadcast.project_name)
      );
  elsif v_role in ('안전관리자', '관리자', '최고관리자') then
    v_can_close := v_broadcast.scope_type = 'common'
      or public.attendance_risk_project_allowed_v52_14_9(v_user_id, v_broadcast.project_name);
  end if;

  if not v_can_close then raise exception '이 중점위험요인을 종료할 권한이 없습니다.'; end if;

  if not public.attendance_permission_effective_v52_14(
    'attendance.risk.manage',
    coalesce(v_broadcast.project_name, '')
  ) then
    raise exception '중점위험요인 전파 종료 권한이 없습니다.';
  end if;

  update public.attendance_risk_broadcasts
  set status = 'closed',
      closed_at = clock_timestamp(),
      closed_by = v_user_id
  where id = p_broadcast_id;
end;
$$;

-- =========================================================
-- 7. 근로자 본인 조회에 공통 + 소속현장 전파 포함
-- =========================================================
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
    'server_time', clock_timestamp()
  );
end;
$$;

-- =========================================================
-- 8. 실행 권한
-- =========================================================
revoke all on function public.attendance_risk_management_v52_14_9() from public;
revoke all on function public.attendance_publish_risk_v52_14_9(text, text, text) from public;
revoke all on function public.attendance_close_risk_v52_14_9(uuid) from public;
revoke all on function public.attendance_worker_me_v52_14(text, text) from public;

grant execute on function public.attendance_risk_management_v52_14_9() to authenticated;
grant execute on function public.attendance_publish_risk_v52_14_9(text, text, text) to authenticated;
grant execute on function public.attendance_close_risk_v52_14_9(uuid) to authenticated;
grant execute on function public.attendance_worker_me_v52_14(text, text) to anon, authenticated;

comment on table public.attendance_risk_broadcasts
  is 'v52.14.9 근로자 앱에 표시되는 전체 공통·현장별 중점위험요인 전파';
comment on function public.admin_update_safety_manager_access_v52_14_9(uuid, text, text, text, text, text, text, text[], jsonb, jsonb, jsonb, text)
  is 'v52.14.9 최고관리자가 본사 가입자를 안전관리자로 원자적 저장';
comment on function public.attendance_worker_me_v52_14(text, text)
  is 'v52.14.9 근로자 본인정보·당일/금월 출결·공통/소속현장 중점위험요인 조회';

commit;
