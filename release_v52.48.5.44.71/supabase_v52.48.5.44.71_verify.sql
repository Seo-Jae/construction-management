-- v52.48.5.44.71 조회 전용 검증
-- SQL Editor에서는 auth.uid()/JWT가 없을 수 있으므로 런타임 RPC를 직접 호출하지 않습니다.

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
