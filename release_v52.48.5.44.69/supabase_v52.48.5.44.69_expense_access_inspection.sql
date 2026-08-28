-- v52.48.5.44.69 지출결의서 서버 권한 확인용 SQL
-- 주의: 이 파일은 DB를 변경하지 않습니다. 조회만 수행합니다.
-- 목적: 현재 운영 DB의 실제 RPC/RLS 정의를 확보하여, 자기 소속현장 CRUD 권한을 서버에서도 안전하게 확정하기 위함입니다.

-- 1) 지출결의서 관련 RPC와 런타임 권한 RPC 정의
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'save_expense_resolution',
    'delete_expense_resolution',
    'get_my_runtime_access_v2'
  )
order by p.proname, p.oid::regprocedure::text;

-- 2) 지출결의서 테이블 RLS 활성화 상태
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('expense_resolutions', 'expense_resolution_items')
order by c.relname;

-- 3) 현재 RLS 정책 전문
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('expense_resolutions', 'expense_resolution_items')
order by tablename, policyname;

-- 4) 함수 실행 권한 확인
select
  routine_schema,
  routine_name,
  specific_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'save_expense_resolution',
    'delete_expense_resolution',
    'get_my_runtime_access_v2'
  )
order by routine_name, grantee, privilege_type;
