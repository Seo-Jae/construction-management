begin;

drop function if exists public.labor_worker_master_delete_v52_46(uuid);

-- 삭제감사 기록은 이미 데이터가 있을 수 있으므로 자동 롤백에서 테이블을 삭제하지 않습니다.

commit;
