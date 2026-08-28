-- v52.48.5.44.70 적용 검증 (조회 전용)
select public.get_my_runtime_access() as runtime_access;

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
