-- =========================================================
-- v52.20 작업자 출·퇴근 앱 로그인 유지
-- 목적:
-- 1) 기존 30일 세션 만료 제거
-- 2) 신규 작업자 세션도 명시적 로그아웃/삭제 전까지 유지
-- 3) 기존 attendance_worker_logout_v52_14()의 DELETE 방식은 그대로 사용
--
-- 중요:
-- - 작업자 세션은 등록기기(device_hash / bound_device_hash) 검증을 계속 사용합니다.
-- - 기기 변경 승인, 계정 삭제 등으로 세션이 삭제/무효화되면 다시 로그인이 필요합니다.
-- =========================================================

do $$
begin
  if to_regclass('public.attendance_worker_sessions') is null then
    raise exception 'attendance_worker_sessions 테이블이 없습니다. 기존 근태관리 SQL을 먼저 확인해주세요.';
  end if;
end;
$$;

-- 새 세션 INSERT 또는 향후 expires_at 변경 시에도
-- 애플리케이션 자동 만료가 발생하지 않도록 PostgreSQL infinity를 사용합니다.
create or replace function public.attendance_worker_keep_session_v52_20()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.expires_at := 'infinity'::timestamptz;
  return new;
end;
$$;

drop trigger if exists trg_attendance_worker_keep_session_v52_20
on public.attendance_worker_sessions;

create trigger trg_attendance_worker_keep_session_v52_20
before insert or update of expires_at
on public.attendance_worker_sessions
for each row
execute function public.attendance_worker_keep_session_v52_20();

-- 현재 살아 있는/과거 생성된 세션도 동일한 정책으로 통일합니다.
-- 실제 세션 사용 시에는 기존 attendance_resolve_worker_v52_14()가
-- token_hash, device_hash, bound_device_hash를 계속 검증합니다.
update public.attendance_worker_sessions
set expires_at = 'infinity'::timestamptz
where expires_at <> 'infinity'::timestamptz;

revoke all on function public.attendance_worker_keep_session_v52_20()
from public, anon, authenticated;

-- 검증용:
-- select
--   count(*) as session_count,
--   count(*) filter (where expires_at = 'infinity'::timestamptz) as persistent_session_count
-- from public.attendance_worker_sessions;
