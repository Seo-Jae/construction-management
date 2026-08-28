-- v52.48.5.44.71
-- 지출결의서 서버 권한을 현재 운영 중인 get_my_runtime_access_v2 기준으로 동기화합니다.
-- .70의 get_my_runtime_access() 참조 오타를 수정하고,
-- .69 프론트엔드와 동일하게 담당자/관리자가 자기 소속현장의 지출결의서를 사용할 수 있도록 합니다.

begin;

-- 현재 프론트엔드가 실제 호출하는 런타임 권한 RPC가 존재하는지 먼저 확인합니다.
do $check_runtime_v2$
begin
  if to_regprocedure('public.get_my_runtime_access_v2()') is null then
    raise exception '[v52.48.5.44.71 적용 중단] public.get_my_runtime_access_v2() 함수를 찾지 못했습니다.';
  end if;
end;
$check_runtime_v2$;

create or replace function public.can_access_expense_project(p_project_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_access jsonb;
  v_runtime_available boolean := false;
  v_allowed boolean := false;
  v_role text := '';
  v_home_project text := '';
  v_email text := btrim(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_project_name = '' then
    return false;
  end if;

  -- .69 프론트엔드와 동일한 자기 소속현장 기본 허용 규칙.
  -- user_profiles는 앱에서도 로그인 프로필을 읽는 기준 테이블입니다.
  begin
    if v_email <> '' then
      select
        btrim(coalesce(up.role, '')),
        btrim(coalesce(up.project_name, ''))
      into v_role, v_home_project
      from public.user_profiles up
      where lower(btrim(coalesce(up.email, ''))) = lower(v_email)
      limit 1;
    end if;
  exception
    when others then
      v_role := '';
      v_home_project := '';
  end;

  if v_role = '최고관리자' then
    return true;
  end if;

  if v_role in ('담당자', '관리자')
     and v_home_project <> ''
     and v_home_project = v_project_name then
    return true;
  end if;

  -- Dashboard가 실제 사용 중인 런타임 권한 RPC(v2)를 동일하게 사용합니다.
  begin
    execute 'select to_jsonb(public.get_my_runtime_access_v2())'
      into v_access;
  exception
    when undefined_function then
      v_access := null;
    when others then
      v_access := null;
  end;

  if v_access is not null and jsonb_typeof(v_access) = 'object' then
    v_runtime_available :=
      coalesce(v_access ->> 'access_scope', '') <> ''
      or jsonb_typeof(v_access -> 'project_names') = 'array';

    if coalesce(v_access ->> 'access_scope', '') = 'all' then
      return true;
    end if;

    if jsonb_typeof(v_access -> 'project_names') = 'array' then
      select exists (
        select 1
        from jsonb_array_elements_text(v_access -> 'project_names') as project_name(value)
        where btrim(project_name.value) = v_project_name
      )
      into v_allowed;

      if v_allowed then
        return true;
      end if;
    end if;

    -- v2가 정상적으로 권한 정보를 반환했다면 그 결과가 최종 기준입니다.
    if v_runtime_available then
      return false;
    end if;
  end if;

  -- v2 호출 자체가 비정상인 경우에만 구버전 helper로 안전하게 후퇴합니다.
  begin
    execute 'select public.can_access_project($1)'
      into v_allowed
      using v_project_name;
    return coalesce(v_allowed, false);
  exception
    when undefined_function then
      return false;
    when others then
      return false;
  end;
end;
$function$;

revoke all on function public.can_access_expense_project(text) from public;
grant execute on function public.can_access_expense_project(text) to authenticated;

-- .70을 이미 실행했든 아직 실행하지 않았든 모두 안전하게 처리합니다.
-- 기존 저장/삭제 함수의 업무 로직은 그대로 두고 권한 helper 참조만 교체합니다.
do $patch_expense_rpc$
declare
  r record;
  v_definition text;
  v_patched_definition text;
  v_save_found boolean := false;
  v_save_ready boolean := false;
begin
  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_expense_resolution', 'delete_expense_resolution')
    order by p.proname, p.oid
  loop
    v_definition := pg_get_functiondef(r.oid);

    if r.proname = 'save_expense_resolution' then
      v_save_found := true;
    end if;

    if position('can_access_expense_project' in v_definition) > 0 then
      if r.proname = 'save_expense_resolution' then
        v_save_ready := true;
      end if;
      continue;
    end if;

    v_patched_definition := v_definition;
    v_patched_definition := regexp_replace(
      v_patched_definition,
      '"public"[.]can_access_project[[:space:]]*[(]',
      'public.can_access_expense_project(',
      'g'
    );
    v_patched_definition := regexp_replace(
      v_patched_definition,
      'public[.]can_access_project[[:space:]]*[(]',
      'public.can_access_expense_project(',
      'g'
    );
    v_patched_definition := regexp_replace(
      v_patched_definition,
      '\mcan_access_project[[:space:]]*[(]',
      'public.can_access_expense_project(',
      'g'
    );

    if v_patched_definition <> v_definition then
      execute v_patched_definition;
      if r.proname = 'save_expense_resolution' then
        v_save_ready := true;
      end if;
    end if;
  end loop;

  if not v_save_found then
    raise exception '[v52.48.5.44.71 적용 중단] public.save_expense_resolution 함수를 찾지 못했습니다.';
  end if;

  if not v_save_ready then
    raise exception '[v52.48.5.44.71 적용 중단] save_expense_resolution의 권한 helper를 확인하지 못했습니다. 함수 원문 확인이 필요합니다.';
  end if;
end;
$patch_expense_rpc$;

-- 목록/수정 항목 조회용 RLS도 같은 helper 기준으로 맞춥니다.
do $patch_expense_rls$
declare
  r record;
  v_qual text;
  v_check text;
  v_new_qual text;
  v_new_check text;
  v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('expense_resolutions', 'expense_resolution_items')
    order by tablename, policyname
  loop
    v_qual := r.qual;
    v_check := r.with_check;
    v_new_qual := v_qual;
    v_new_check := v_check;

    if v_new_qual is not null then
      v_new_qual := regexp_replace(v_new_qual, '"public"[.]can_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
      v_new_qual := regexp_replace(v_new_qual, 'public[.]can_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
      v_new_qual := regexp_replace(v_new_qual, '\mcan_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
    end if;

    if v_new_check is not null then
      v_new_check := regexp_replace(v_new_check, '"public"[.]can_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
      v_new_check := regexp_replace(v_new_check, 'public[.]can_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
      v_new_check := regexp_replace(v_new_check, '\mcan_access_project[[:space:]]*[(]', 'public.can_access_expense_project(', 'g');
    end if;

    if v_new_qual is not distinct from v_qual
       and v_new_check is not distinct from v_check then
      continue;
    end if;

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    if v_new_qual is distinct from v_qual then
      v_sql := v_sql || format(' using (%s)', v_new_qual);
    end if;

    if v_new_check is distinct from v_check then
      v_sql := v_sql || format(' with check (%s)', v_new_check);
    end if;

    execute v_sql;
  end loop;
end;
$patch_expense_rls$;

commit;

-- SQL Editor는 로그인 사용자의 JWT가 없을 수 있으므로 런타임 RPC를 직접 실행하지 않습니다.
-- 대신 함수 존재 여부와 실제 참조 상태만 검증합니다.
select
  to_regprocedure('public.get_my_runtime_access_v2()') is not null as runtime_access_v2_exists,
  to_regprocedure('public.can_access_expense_project(text)') is not null as expense_helper_exists;

select
  position(
    'get_my_runtime_access_v2' in
    pg_get_functiondef(to_regprocedure('public.can_access_expense_project(text)'))
  ) > 0 as helper_uses_runtime_v2;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  position('can_access_expense_project' in pg_get_functiondef(p.oid)) > 0 as uses_expense_access_helper
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_expense_resolution', 'delete_expense_resolution')
order by p.proname, p.oid;

select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('expense_resolutions', 'expense_resolution_items')
order by tablename, policyname;
