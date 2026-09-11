-- v185 적용 후 확인용입니다. 조회만 하며 운영 데이터를 변경하지 않습니다.
select tablename, rowsecurity
from pg_tables where schemaname = 'public'
  and tablename in ('material_shared_aliases', 'material_shared_alias_reports');

-- 두 테이블 모두 authenticated 직접 SELECT/INSERT/UPDATE/DELETE 권한이 false여야 합니다.
select table_name,
  has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as direct_select,
  has_table_privilege('authenticated', 'public.' || table_name, 'INSERT') as direct_insert,
  has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE') as direct_update,
  has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') as direct_delete
from (values ('material_shared_aliases'), ('material_shared_alias_reports')) t(table_name);

-- RPC 5개 모두 authenticated=true, anon=false여야 합니다.
select p.proname, p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'list_material_aliases_v185', 'propose_material_alias_v185', 'review_material_aliases_v185',
  'list_material_alias_reviews_v185', 'report_material_alias_v185'
);

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'material_registration_requests' and column_name = 'search_term';
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.material_registration_requests'::regclass and tgname = 'trg_capture_material_request_alias_v185';
