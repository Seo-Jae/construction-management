begin;

drop function if exists public.labor_worker_excel_import_v52_47(jsonb);
drop function if exists public.labor_worker_excel_preview_v52_47(jsonb);
drop function if exists public.labor_worker_master_secure_upsert_v52_47(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text,text,text,text
);
drop function if exists public.labor_worker_master_list_v52_47(text, integer);
drop function if exists public.labor_birth_date_from_identity_v52_47(text);
drop function if exists public.labor_identity_fingerprint_v52_47(text);

-- v52.47 추가 컬럼은 기존 데이터가 생길 수 있으므로 자동 롤백에서 삭제하지 않습니다.

commit;
