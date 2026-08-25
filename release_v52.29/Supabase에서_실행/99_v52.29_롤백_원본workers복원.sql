-- =============================================================
-- v52.29 DB 보정 롤백
-- 00_v52.29 SQL 실행 전 백업된 workers를 되돌립니다.
-- 필요할 때만 실행하세요.
-- =============================================================

begin;

update public.daily_reports dr
set workers = b.workers
from public.daily_reports_workers_backup_v52_29 b
where dr.project_name = b.project_name
  and dr.date = b.report_date
  and b.project_name = '한라건설 용인금어지구'
  and b.report_date between '25.07.01' and '26.05.31';

commit;

select
  count(*) as restored_report_count
from public.daily_reports_workers_backup_v52_29
where project_name = '한라건설 용인금어지구'
  and report_date between '25.07.01' and '26.05.31';
