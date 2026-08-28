-- v52.48.5.44.70
-- 지출결의서 서버 권한을 현재 런타임 현장권한(get_my_runtime_access) 기준으로 동기화합니다.
-- 기존 save/delete 함수의 업무 로직은 재작성하지 않고, 함수 정의 안의 legacy can_access_project 호출만
-- 지출결의서 전용 helper로 치환하여 기존 저장/수정/삭제 동작을 그대로 보존합니다.

begin;

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
begin
  if auth.uid() is null or v_project_name = '' then
    return false;
  end if;

  -- 현재 시스템의 단일 권한 기준점. Dashboard도 동일 RPC를 사용합니다.
  begin
    execute 'select to_jsonb(public.get_my_runtime_access())'
      into v_access;
  exception
    when undefined_function then
      v_access := null;
    when others then
      -- 런타임 권한 RPC 자체 오류가 있을 때만 기존 helper로 안전하게 후퇴합니다.
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

    -- 런타임 권한 정보가 정상적으로 반환되었다면 그 결과가 최종 기준입니다.
    if v_runtime_available then
      return false;
    end if;
  end if;

  -- 구버전 DB에서 get_my_runtime_access가 없거나 정상값을 주지 못할 때만 기존 권한으로 후퇴합니다.
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

-- 기존 RPC 정의를 그대로 보존하면서 권한 helper만 교체합니다.
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
    raise exception '[v52.48.5.44.70 적용 중단] public.save_expense_resolution 함수를 찾지 못했습니다.';
  end if;

  if not v_save_ready then
    raise exception '[v52.48.5.44.70 적용 중단] save_expense_resolution 안에서 legacy can_access_project 호출을 찾지 못했습니다. 함수 원문 확인이 필요합니다.';
  end if;
end;
$patch_expense_rpc$;

-- 목록/수정 항목 조회는 브라우저에서 테이블을 직접 읽으므로 지출결의서 2개 테이블의 RLS도 같은 기준으로 맞춥니다.
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

-- 적용 확인용 결과. save 함수가 true면 핵심 서버 저장 권한 치환이 완료된 상태입니다.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  position('can_access_expense_project' in pg_get_functiondef(p.oid)) > 0 as uses_runtime_expense_access
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
