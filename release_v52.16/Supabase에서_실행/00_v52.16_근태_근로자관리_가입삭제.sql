-- ============================================================
-- 사내시스템 v52.16
-- 근태관리 > 근로자 관리 / 가입내역 삭제 / 재가입 허용
-- 기준: v52.14.9 Production
--
-- 핵심 원칙
-- 1) 담당자(근태관리 manage 권한 보유자)가 근로자 가입계정을 정리할 수 있다.
-- 2) 계정 삭제 후 같은 휴대폰번호와 같은 기기로 즉시 재가입할 수 있다.
-- 3) 과거 근태기록(attendance_events)과 감사이력(attendance_audit_log)은 보존한다.
-- 4) 실제 DB 행을 hard delete하지 않고 개인정보/로그인 식별자를 해제하는 안전삭제 방식이다.
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.attendance_workers') is null
     or to_regclass('public.attendance_worker_sessions') is null
     or to_regclass('public.attendance_audit_log') is null then
    raise exception 'v52.14 근태관리 SQL이 먼저 적용되어 있어야 합니다.';
  end if;

  if to_regprocedure('public.attendance_manager_can_v52_14(text,boolean)') is null then
    raise exception 'attendance_manager_can_v52_14 함수가 없습니다. v52.14 근태관리 SQL 적용 상태를 확인해주세요.';
  end if;
end;
$$;

-- 안전삭제 메타데이터
alter table public.attendance_workers
  add column if not exists deleted_at timestamptz;

alter table public.attendance_workers
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.attendance_workers
  add column if not exists deletion_reason text;

create index if not exists idx_attendance_workers_project_deleted
  on public.attendance_workers(project_name, deleted_at, created_at desc);

-- ============================================================
-- 근로자 관리 목록
-- ============================================================
create or replace function public.attendance_manager_list_workers_v52_16(
  p_project_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.attendance_manager_can_v52_14(trim(p_project_name), false) then
    raise exception '이 현장의 근로자 조회 권한이 없습니다.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', worker.id,
        'project_name', worker.project_name,
        'name_ko', worker.name_ko,
        'name_en', worker.name_en,
        'is_foreigner', worker.is_foreigner,
        'is_test_account', coalesce(worker.is_test_account, false),
        'phone', worker.phone,
        'trade_name', worker.trade_name,
        'status', worker.status,
        'created_at', worker.created_at,
        'approved_at', worker.approved_at,
        'last_login_at', worker.last_login_at
      )
      order by worker.created_at desc, worker.name_ko
    )
    from public.attendance_workers worker
    where worker.project_name = trim(p_project_name)
      and worker.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 근로자 가입내역 안전삭제
-- - 세션/기기변경요청/진행중 QR 교환정보 제거
-- - 기존 phone / bound_device_hash 값을 tombstone 값으로 변경하여 재가입 가능
-- - 과거 출퇴근 이벤트 및 감사이력은 보존
-- ============================================================
create or replace function public.attendance_manager_delete_worker_v52_16(
  p_worker_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker public.attendance_workers%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
  v_deleted_at timestamptz := clock_timestamp();
  v_tombstone text;
begin
  if p_worker_id is null then
    raise exception '삭제할 근로자를 선택해주세요.';
  end if;

  select *
  into v_worker
  from public.attendance_workers
  where id = p_worker_id
  for update;

  if not found then
    raise exception '근로자 가입내역을 찾을 수 없습니다.';
  end if;

  if not public.attendance_manager_can_v52_14(v_worker.project_name, true) then
    raise exception '이 현장의 근로자 가입내역 삭제 권한이 없습니다.';
  end if;

  if v_worker.deleted_at is not null then
    return jsonb_build_object(
      'deleted', false,
      'already_deleted', true,
      'worker_id', v_worker.id
    );
  end if;

  if v_reason = '' then
    raise exception '삭제 사유를 입력해주세요.';
  end if;

  v_tombstone := replace(v_worker.id::text, '-', '');

  -- 현재 로그인/기기변경/진행 중 출퇴근 교환정보 무효화
  delete from public.attendance_worker_sessions
  where worker_id = v_worker.id;

  delete from public.attendance_device_change_requests
  where worker_id = v_worker.id;

  delete from public.attendance_qr_exchanges
  where worker_id = v_worker.id;

  -- phone 및 bound_device_hash를 고유 tombstone 값으로 교체한다.
  -- 따라서 기존 휴대폰번호와 기존 기기키는 즉시 다시 가입에 사용할 수 있다.
  update public.attendance_workers
  set phone = 'deleted:' || v_tombstone,
      bound_device_hash = 'deleted:' || v_tombstone,
      password_hash = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf', 10)),
      registered_user_agent = '',
      status = 'disabled',
      deleted_at = v_deleted_at,
      deleted_by = auth.uid(),
      deletion_reason = v_reason,
      updated_at = now()
  where id = v_worker.id;

  insert into public.attendance_audit_log (
    project_name,
    worker_id,
    action_code,
    action_label,
    actor_user_id,
    before_value,
    after_value,
    reason
  ) values (
    v_worker.project_name,
    v_worker.id,
    'worker_account_deleted',
    '근로자 가입내역 삭제',
    auth.uid(),
    jsonb_build_object(
      'name_ko', v_worker.name_ko,
      'phone', v_worker.phone,
      'trade_name', v_worker.trade_name,
      'status', v_worker.status,
      'is_test_account', coalesce(v_worker.is_test_account, false),
      'created_at', v_worker.created_at
    ),
    jsonb_build_object(
      'account_deleted', true,
      'login_sessions_revoked', true,
      'phone_released_for_signup', true,
      'device_released_for_signup', true,
      'deleted_at', v_deleted_at
    ),
    v_reason
  );

  return jsonb_build_object(
    'deleted', true,
    'already_deleted', false,
    'worker_id', v_worker.id,
    'deleted_at', v_deleted_at,
    'phone_released', true,
    'device_released', true,
    'history_preserved', true
  );
end;
$$;

revoke all on function public.attendance_manager_list_workers_v52_16(text) from public;
revoke all on function public.attendance_manager_delete_worker_v52_16(uuid, text) from public;

grant execute on function public.attendance_manager_list_workers_v52_16(text) to authenticated;
grant execute on function public.attendance_manager_delete_worker_v52_16(uuid, text) to authenticated;

comment on function public.attendance_manager_list_workers_v52_16(text)
  is 'v52.16 근태관리 근로자관리 목록 - 삭제되지 않은 가입계정과 가입일자 조회';
comment on function public.attendance_manager_delete_worker_v52_16(uuid, text)
  is 'v52.16 근로자 가입계정 안전삭제 - 휴대폰/기기 재가입 허용, 과거 근태 및 감사기록 보존';

commit;

-- 설치 확인
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'attendance_manager_list_workers_v52_16',
    'attendance_manager_delete_worker_v52_16'
  )
order by p.proname;
