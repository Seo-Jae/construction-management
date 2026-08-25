begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =========================================================
-- v52.46
-- 근로자 마스터 실제 삭제 + 2차 확인 기반
--
-- 원칙
-- 1. 근로자 정보관리 권한 서버 재검증
-- 2. 월별 저장 명단에서 사용 중인 근로자는 삭제 차단
-- 3. 미사용 근로자는 보호정보/보호정보 감사기록과 함께 실제 삭제
-- 4. 삭제 자체는 별도 삭제감사 테이블에 기록
-- =========================================================

do $$
begin
  if to_regclass('public.labor_worker_master') is null then
    raise exception '근로자 마스터 테이블이 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_permission_allowed_v52_33(uuid,text,text)'
  ) is null then
    raise exception '노임 권한 함수가 없습니다.';
  end if;
end;
$$;

create table if not exists public.labor_worker_delete_audit_v52_46 (
  id bigserial primary key,
  worker_master_id uuid not null,
  worker_name text,
  actor_user_id uuid,
  deleted_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb
);

alter table public.labor_worker_delete_audit_v52_46
  enable row level security;

revoke all on public.labor_worker_delete_audit_v52_46
  from public, anon, authenticated;

create index if not exists idx_labor_worker_delete_audit_v52_46_worker
  on public.labor_worker_delete_audit_v52_46(
    worker_master_id,
    deleted_at desc
  );

create or replace function public.labor_worker_master_delete_v52_46(
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_name text;
  v_roster_count integer := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_worker_id is null then
    raise exception '삭제할 근로자 정보가 없습니다.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 삭제 권한이 없습니다.';
  end if;

  select w.name_ko
  into v_worker_name
  from public.labor_worker_master w
  where w.id = p_worker_id
  for update;

  if not found then
    raise exception '삭제할 근로자를 찾을 수 없습니다.';
  end if;

  -- 과거/현재 저장 명단에 연결된 근로자는 이력 보호를 위해 삭제 금지.
  if to_regclass('public.labor_monthly_roster_items') is not null then
    execute
      'select count(*) from public.labor_monthly_roster_items where worker_master_id = $1'
      into v_roster_count
      using p_worker_id;

    if v_roster_count > 0 then
      raise exception
        '월별 노임 명단에 사용된 이력이 있는 근로자는 삭제할 수 없습니다. 명단 이력 보존을 위해 근로자 마스터를 유지해주세요.';
    end if;
  end if;

  -- 실제 삭제 성공 시에도 누가 어떤 근로자를 삭제했는지 최소 감사기록은 남긴다.
  insert into public.labor_worker_delete_audit_v52_46 (
    worker_master_id,
    worker_name,
    actor_user_id,
    detail
  )
  values (
    p_worker_id,
    v_worker_name,
    v_user_id,
    jsonb_build_object(
      'source', 'worker_master_management',
      'version', 'v52.46'
    )
  );

  -- 보호정보 감사로그는 개인정보 원문이 아닌 변경필드 기록이지만,
  -- 기존 FK가 삭제를 막는 환경까지 고려해 미사용 근로자 삭제 시 함께 정리한다.
  if to_regclass('public.labor_worker_private_audit') is not null then
    execute
      'delete from public.labor_worker_private_audit where worker_master_id = $1'
      using p_worker_id;
  end if;

  if to_regclass('public.labor_worker_private') is not null then
    execute
      'delete from public.labor_worker_private where worker_master_id = $1'
      using p_worker_id;
  end if;

  delete from public.labor_worker_master
  where id = p_worker_id;

  if not found then
    raise exception '근로자 삭제에 실패했습니다.';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'worker_master_id', p_worker_id,
    'worker_name', v_worker_name
  );
end;
$$;

revoke all on function public.labor_worker_master_delete_v52_46(uuid)
  from public, anon, authenticated;

grant execute on function public.labor_worker_master_delete_v52_46(uuid)
  to authenticated;

comment on function public.labor_worker_master_delete_v52_46(uuid) is
  'v52.46 미사용 근로자 마스터 실제 삭제. 월별 저장 명단 사용이력 존재 시 삭제 차단.';

comment on table public.labor_worker_delete_audit_v52_46 is
  'v52.46 근로자 삭제 최소 감사기록. 삭제 후 worker FK를 두지 않아 감사기록을 유지.';

commit;
