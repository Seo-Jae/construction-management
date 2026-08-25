begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Dashboard 일정관리 권한을 일반 세부권한의 "수정" 단계에 연결합니다.
update public.permission_definitions
set action_code = 'edit',
    action_label = '수정',
    action_rank = 30,
    is_sensitive = false
where permission_key = 'construction.dashboard.manage';

-- 기존 특수권한에 저장된 Dashboard 일정관리 권한은 공통 수정권한으로 이전합니다.
insert into public.user_permission_overrides_v2 (
  auth_user_id,
  scope_key,
  permission_key,
  effect,
  created_at,
  updated_at,
  updated_by
)
select
  special.auth_user_id,
  '*',
  special.permission_key,
  'allow',
  coalesce(special.created_at, now()),
  now(),
  special.updated_by
from public.user_special_permissions_v2 special
where special.permission_key = 'construction.dashboard.manage'
on conflict (auth_user_id, scope_key, permission_key) do update
set effect = 'allow',
    updated_at = now(),
    updated_by = excluded.updated_by;

delete from public.user_special_permissions_v2
where permission_key = 'construction.dashboard.manage';

create or replace function public.dashboard_permission_effective_v52_13(
  p_permission_key text,
  p_project_name text default null
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
  v_account_status text;
  v_template_code text;
  v_granted boolean := false;
  v_effect text;
begin
  if v_user_id is null then
    return false;
  end if;

  select
    coalesce(profile.role, '담당자'),
    coalesce(profile.account_status, 'active')
  into
    v_role,
    v_account_status
  from public.user_profiles profile
  where profile.auth_user_id = v_user_id
  limit 1;

  if not found or v_account_status <> 'active' then
    return false;
  end if;

  if v_role = '최고관리자' then
    return true;
  end if;

  select setting.permission_template_code
  into v_template_code
  from public.user_access_settings_v2 setting
  where setting.auth_user_id = v_user_id;

  if not found then
    return false;
  end if;

  select exists (
    select 1
    from public.template_permissions template_permission
    where template_permission.template_code = v_template_code
      and template_permission.permission_key = p_permission_key
      and template_permission.is_granted = true
  )
  into v_granted;

  v_effect := null;
  select override_row.effect
  into v_effect
  from public.user_permission_overrides_v2 override_row
  where override_row.auth_user_id = v_user_id
    and override_row.scope_key = '*'
    and override_row.permission_key = p_permission_key;

  if found then
    v_granted := v_effect = 'allow';
  end if;

  if trim(coalesce(p_project_name, '')) <> '' then
    v_effect := null;
    select override_row.effect
    into v_effect
    from public.user_permission_overrides_v2 override_row
    where override_row.auth_user_id = v_user_id
      and override_row.scope_key = trim(p_project_name)
      and override_row.permission_key = p_permission_key;

    if found then
      v_granted := v_effect = 'allow';
    end if;
  end if;

  return v_granted;
end;
$$;

create or replace function public.can_manage_admin_dashboard_v52_13()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_account_status text;
  v_access_scope text;
  v_has_visible_project boolean := false;
  v_has_read_only_project boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  select
    coalesce(profile.role, '담당자'),
    coalesce(profile.account_status, 'active')
  into
    v_role,
    v_account_status
  from public.user_profiles profile
  where profile.auth_user_id = v_user_id
  limit 1;

  if not found or v_account_status <> 'active' then
    return false;
  end if;

  if v_role = '최고관리자' then
    return true;
  end if;

  select setting.access_scope
  into v_access_scope
  from public.user_access_settings_v2 setting
  where setting.auth_user_id = v_user_id;

  if not found then
    return false;
  end if;

  if v_access_scope = 'all' then
    return public.dashboard_permission_effective_v52_13(
      'construction.dashboard.manage',
      null
    );
  end if;

  select exists (
    select 1
    from public.user_project_access_v2 project_access
    where project_access.auth_user_id = v_user_id
      and project_access.is_active = true
      and (project_access.access_start_date is null or project_access.access_start_date <= current_date)
      and (project_access.access_end_date is null or project_access.access_end_date >= current_date)
      and public.dashboard_permission_effective_v52_13(
        'construction.dashboard.view',
        project_access.project_name
      )
  )
  into v_has_visible_project;

  if not v_has_visible_project then
    return false;
  end if;

  select exists (
    select 1
    from public.user_project_access_v2 project_access
    where project_access.auth_user_id = v_user_id
      and project_access.is_active = true
      and (project_access.access_start_date is null or project_access.access_start_date <= current_date)
      and (project_access.access_end_date is null or project_access.access_end_date >= current_date)
      and public.dashboard_permission_effective_v52_13(
        'construction.dashboard.view',
        project_access.project_name
      )
      and not public.dashboard_permission_effective_v52_13(
        'construction.dashboard.manage',
        project_access.project_name
      )
  )
  into v_has_read_only_project;

  return not v_has_read_only_project;
end;
$$;

create or replace function public.save_admin_dashboard_planning_v52_13(
  p_record_id text,
  p_site_schedules jsonb,
  p_meeting_schedules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_admin_dashboard_v52_13() then
    raise exception 'Dashboard 수정 권한이 없습니다.';
  end if;

  if trim(coalesce(p_record_id, '')) = '' then
    raise exception 'Dashboard 저장 대상을 확인할 수 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_site_schedules, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_meeting_schedules, '[]'::jsonb)) <> 'array' then
    raise exception 'Dashboard 일정 형식이 올바르지 않습니다.';
  end if;

  insert into public.admin_dashboard_planning (
    id,
    site_schedules,
    meeting_schedules,
    updated_by,
    updated_at
  ) values (
    p_record_id,
    coalesce(p_site_schedules, '[]'::jsonb),
    coalesce(p_meeting_schedules, '[]'::jsonb),
    auth.uid(),
    now()
  )
  on conflict (id) do update
  set site_schedules = excluded.site_schedules,
      meeting_schedules = excluded.meeting_schedules,
      updated_by = auth.uid(),
      updated_at = now();
end;
$$;

alter table public.admin_dashboard_planning enable row level security;

drop policy if exists admin_dashboard_planning_insert_requires_manage_v52_13
  on public.admin_dashboard_planning;
create policy admin_dashboard_planning_insert_requires_manage_v52_13
  on public.admin_dashboard_planning
  as restrictive
  for insert
  to authenticated
  with check (public.can_manage_admin_dashboard_v52_13());

drop policy if exists admin_dashboard_planning_update_requires_manage_v52_13
  on public.admin_dashboard_planning;
create policy admin_dashboard_planning_update_requires_manage_v52_13
  on public.admin_dashboard_planning
  as restrictive
  for update
  to authenticated
  using (public.can_manage_admin_dashboard_v52_13())
  with check (public.can_manage_admin_dashboard_v52_13());

drop policy if exists admin_dashboard_planning_delete_requires_manage_v52_13
  on public.admin_dashboard_planning;
create policy admin_dashboard_planning_delete_requires_manage_v52_13
  on public.admin_dashboard_planning
  as restrictive
  for delete
  to authenticated
  using (public.can_manage_admin_dashboard_v52_13());

revoke all on function public.dashboard_permission_effective_v52_13(text, text) from public;
revoke all on function public.can_manage_admin_dashboard_v52_13() from public;
revoke all on function public.save_admin_dashboard_planning_v52_13(text, jsonb, jsonb) from public;

grant execute on function public.dashboard_permission_effective_v52_13(text, text) to authenticated;
grant execute on function public.can_manage_admin_dashboard_v52_13() to authenticated;
grant execute on function public.save_admin_dashboard_planning_v52_13(text, jsonb, jsonb) to authenticated;

comment on function public.save_admin_dashboard_planning_v52_13(text, jsonb, jsonb) is
  'v52.13 Dashboard 수정 권한을 서버에서 확인한 뒤 일정 데이터를 저장';

commit;
