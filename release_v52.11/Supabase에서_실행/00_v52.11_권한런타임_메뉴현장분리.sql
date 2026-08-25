begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =========================================================
-- v52.11
-- 회원관리에서 이미 저장하고 있던 권한 템플릿/개인별 추가·차단 설정을
-- 실제 메뉴 노출 및 현장 접근범위에 연결하기 위한 "내 권한 조회" RPC.
--
-- 기존 권한 데이터/템플릿은 변경하지 않는다.
-- 담당자/관리자라는 역할 자체로 전체현장이나 Dashboard를 강제하지 않고,
-- user_access_settings_v2 + user_project_access_v2 + permission override를 사용한다.
-- =========================================================

-- 현장 담당자 계열 템플릿은 기존 화면처럼 Dashboard를 기본 노출하지 않는다.
-- 필요한 담당자만 회원관리 > 세부권한 > 공사일보·공정 > Dashboard > 조회를
-- '추가'로 지정하면 보이도록 한다. 관리자는 site_manager 템플릿에서 기본 조회한다.
delete from public.template_permissions
where template_code in ('site_construction', 'site_safety', 'site_administration')
  and permission_key = 'construction.dashboard.view';

create or replace function public.get_my_runtime_access_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_account_status text;
  v_organization_type text;
  v_legacy_project_name text;
  v_department_code text;
  v_permission_template_code text;
  v_access_scope text;
  v_has_access_setting boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인 정보가 없습니다.';
  end if;

  select
    coalesce(up.role, '담당자'),
    coalesce(up.account_status, 'active'),
    coalesce(up.organization_type, '현장'),
    trim(coalesce(up.project_name, ''))
  into
    v_role,
    v_account_status,
    v_organization_type,
    v_legacy_project_name
  from public.user_profiles up
  where up.auth_user_id = v_user_id
  limit 1;

  if not found then
    raise exception '회원정보를 찾을 수 없습니다.';
  end if;

  if v_account_status <> 'active' then
    raise exception '사용 중인 계정만 권한정보를 조회할 수 있습니다.';
  end if;

  select
    s.department_code,
    s.permission_template_code,
    s.access_scope
  into
    v_department_code,
    v_permission_template_code,
    v_access_scope
  from public.user_access_settings_v2 s
  where s.auth_user_id = v_user_id;

  if found then
    v_has_access_setting := true;
  else
    -- v52.00.2 이전 계정이 남아 있어도 화면이 막히지 않도록 안전한 이전값을 제공한다.
    v_department_code := case
      when v_organization_type = '외부업체' then 'external'
      else 'construction'
    end;

    v_permission_template_code := case
      when v_role = '최고관리자' then 'super_admin'
      when v_organization_type = '본사' then 'hq_construction'
      when v_organization_type = '외부업체' then 'external_partner'
      when v_role = '관리자' then 'site_manager'
      else 'site_construction'
    end;

    v_access_scope := case
      when v_role = '최고관리자' or v_legacy_project_name = '전체현장' then 'all'
      else 'home_project'
    end;
  end if;

  return jsonb_build_object(
    'auth_user_id', v_user_id,
    'role', v_role,
    'organization_type', v_organization_type,
    'department_code', v_department_code,
    'permission_template_code', v_permission_template_code,
    'access_scope', v_access_scope,
    'runtime_source', case when v_has_access_setting then 'v2' else 'legacy_fallback' end,
    'project_names', case
      when v_access_scope = 'all' then '[]'::jsonb
      when v_has_access_setting then coalesce((
        select jsonb_agg(p.project_name order by p.project_name)
        from public.user_project_access_v2 p
        where p.auth_user_id = v_user_id
          and p.is_active = true
          and (p.access_start_date is null or p.access_start_date <= current_date)
          and (p.access_end_date is null or p.access_end_date >= current_date)
      ), '[]'::jsonb)
      when v_legacy_project_name not in ('', '본사', '전체현장') then jsonb_build_array(v_legacy_project_name)
      else '[]'::jsonb
    end,
    'template_permissions', coalesce((
      select jsonb_agg(tp.permission_key order by tp.permission_key)
      from public.template_permissions tp
      where tp.template_code = v_permission_template_code
        and tp.is_granted = true
    ), '[]'::jsonb),
    'permission_overrides', case
      when v_has_access_setting then coalesce((
        select jsonb_agg(jsonb_build_object(
          'scope_key', o.scope_key,
          'permission_key', o.permission_key,
          'effect', o.effect
        ) order by o.scope_key, o.permission_key)
        from public.user_permission_overrides_v2 o
        where o.auth_user_id = v_user_id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    'special_permissions', case
      when v_has_access_setting then coalesce((
        select jsonb_agg(sp.permission_key order by sp.permission_key)
        from public.user_special_permissions_v2 sp
        where sp.auth_user_id = v_user_id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.get_my_runtime_access_v2() from public;
grant execute on function public.get_my_runtime_access_v2() to authenticated;

comment on function public.get_my_runtime_access_v2() is
  'v52.11 현재 로그인 사용자의 권한 템플릿, 개인별 추가/차단, 접근현장을 런타임 UI에 제공';

commit;
