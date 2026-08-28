-- v52.48.5.44.72
-- 지출결의서 소속현장 기본 CRUD 권한 수정
-- 실제 save/delete RPC가 호출하는 public.expense_resolution_can_access_project(text) 자체를 교체합니다.

begin;

do $precheck$
begin
  if to_regprocedure('public.expense_resolution_can_access_project(text)') is null then
    raise exception '[v52.48.5.44.72 적용 중단] public.expense_resolution_can_access_project(text) 함수를 찾지 못했습니다.';
  end if;

  if to_regprocedure('public.get_my_runtime_access_v2()') is null then
    raise exception '[v52.48.5.44.72 적용 중단] public.get_my_runtime_access_v2() 함수를 찾지 못했습니다.';
  end if;

  if to_regclass('public.user_profiles') is null then
    raise exception '[v52.48.5.44.72 적용 중단] public.user_profiles 테이블을 찾지 못했습니다.';
  end if;
end;
$precheck$;

create or replace function public.expense_resolution_can_access_project(p_project_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_home_project text := '';
  v_role text := '';
  v_account_status text := '';
  v_access jsonb := null;
  v_access_scope text := '';
  v_has_project boolean := false;
  v_granted boolean := false;
  v_effect text := null;
  v_permission_key constant text := 'report.expense.view';
begin
  if auth.uid() is null or v_project_name = '' then
    return false;
  end if;

  select
    btrim(coalesce(up.project_name, '')),
    btrim(coalesce(up.role, '')),
    lower(btrim(coalesce(up.account_status, 'active')))
  into
    v_home_project,
    v_role,
    v_account_status
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  if not found then
    return false;
  end if;

  if v_account_status in ('disabled', 'rejected') then
    return false;
  end if;

  if v_role = '최고관리자' then
    return true;
  end if;

  -- 자기 소속현장은 별도 ACL과 무관하게 지출결의서 기본 허용
  if v_home_project <> ''
     and v_home_project <> '본사'
     and v_home_project <> '전체현장'
     and v_home_project = v_project_name then
    return true;
  end if;

  -- 다른 추가 접근현장은 현재 Dashboard와 동일한 런타임 권한(v2)을 사용
  begin
    select to_jsonb(public.get_my_runtime_access_v2())
      into v_access;
  exception
    when others then
      v_access := null;
  end;

  if v_access is null or jsonb_typeof(v_access) <> 'object' then
    return false;
  end if;

  v_access_scope := btrim(coalesce(v_access ->> 'access_scope', ''));

  if v_access_scope = 'all' then
    v_has_project := true;
  elsif jsonb_typeof(v_access -> 'project_names') = 'array' then
    select exists (
      select 1
      from jsonb_array_elements_text(v_access -> 'project_names') as p(value)
      where btrim(p.value) = v_project_name
    )
    into v_has_project;
  end if;

  if not v_has_project then
    return false;
  end if;

  -- Dashboard.hasPermission과 동일한 순서:
  -- template/special -> 공통 override -> 현장 override
  v_granted :=
    (
      jsonb_typeof(v_access -> 'template_permissions') = 'array'
      and exists (
        select 1
        from jsonb_array_elements_text(v_access -> 'template_permissions') as p(value)
        where btrim(p.value) = v_permission_key
      )
    )
    or
    (
      jsonb_typeof(v_access -> 'special_permissions') = 'array'
      and exists (
        select 1
        from jsonb_array_elements_text(v_access -> 'special_permissions') as p(value)
        where btrim(p.value) = v_permission_key
      )
    );

  if jsonb_typeof(v_access -> 'permission_overrides') = 'array' then
    select lower(btrim(coalesce(o.value ->> 'effect', '')))
      into v_effect
    from jsonb_array_elements(v_access -> 'permission_overrides') as o(value)
    where btrim(coalesce(o.value ->> 'scope_key', '')) = '*'
      and btrim(coalesce(o.value ->> 'permission_key', '')) = v_permission_key
    limit 1;

    if v_effect in ('allow', 'deny') then
      v_granted := (v_effect = 'allow');
    end if;

    v_effect := null;

    select lower(btrim(coalesce(o.value ->> 'effect', '')))
      into v_effect
    from jsonb_array_elements(v_access -> 'permission_overrides') as o(value)
    where btrim(coalesce(o.value ->> 'scope_key', '')) = v_project_name
      and btrim(coalesce(o.value ->> 'permission_key', '')) = v_permission_key
    limit 1;

    if v_effect in ('allow', 'deny') then
      v_granted := (v_effect = 'allow');
    end if;
  end if;

  return coalesce(v_granted, false);
end;
$function$;

revoke all on function public.expense_resolution_can_access_project(text) from public;
grant execute on function public.expense_resolution_can_access_project(text) to authenticated;

commit;

-- 적용 검증(읽기 전용)
select
  to_regprocedure('public.expense_resolution_can_access_project(text)') is not null
    as expense_project_helper_exists,
  position(
    'user_profiles' in
    pg_get_functiondef(to_regprocedure('public.expense_resolution_can_access_project(text)'))
  ) > 0
    as helper_uses_user_profiles,
  position(
    'get_my_runtime_access_v2' in
    pg_get_functiondef(to_regprocedure('public.expense_resolution_can_access_project(text)'))
  ) > 0
    as helper_uses_runtime_v2,
  position(
    'report.expense.view' in
    pg_get_functiondef(to_regprocedure('public.expense_resolution_can_access_project(text)'))
  ) > 0
    as helper_uses_expense_permission;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  position(
    'expense_resolution_can_access_project' in pg_get_functiondef(p.oid)
  ) > 0 as uses_actual_expense_project_helper
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_expense_resolution', 'delete_expense_resolution')
order by p.proname, p.oid;
