-- v52.30 롤백
-- 주의: sort_order 값과 v52.30 기능을 제거합니다.
begin;

drop function if exists public.attendance_delete_risk_broadcasts_v52_30(uuid[]);
drop function if exists public.attendance_move_risk_broadcasts_v52_30(uuid[], text);
drop function if exists public.attendance_risk_management_v52_30();
drop function if exists public.attendance_risk_can_manage_v52_30(uuid, uuid);

drop trigger if exists trg_attendance_risk_assign_sort_order_v52_30
on public.attendance_risk_broadcasts;

drop function if exists public.attendance_risk_assign_sort_order_v52_30();

drop index if exists public.idx_attendance_risk_scope_order_v52_30;

alter table public.attendance_risk_broadcasts
  drop constraint if exists attendance_risk_broadcasts_sort_order_check;

alter table public.attendance_risk_broadcasts
  drop column if exists sort_order;

-- attendance_worker_me_v52_21은 기존 v52.21 SQL을 다시 실행하면 원래 정의로 복원됩니다.

commit;
