-- v52.48.5.44.7.3 등록 기성 회차 삭제
-- 규칙
-- 1) 최고관리자만 삭제
-- 2) 해당 현장의 가장 최근 등록 회차만 삭제
-- 3) 계약버전/계약품목(progress_contract_versions/items)은 보존
-- 4) progress_claims를 직접 참조하는 FK 하위행은 먼저 삭제
-- 5) 삭제한 회차와 같은 임시저장 자료가 있으면 함께 정리

create or replace function public.admin_delete_progress_claim_v1(
  p_claim_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_id text := btrim(coalesce(p_claim_id, ''));
  v_project_name text;
  v_claim_no integer;
  v_status text;
  v_latest_claim_no integer;
  v_deleted_parent integer := 0;
  v_deleted_children integer := 0;
  v_deleted_drafts integer := 0;
  v_row_count integer := 0;
  v_fk record;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 등록된 기성 회차를 삭제할 수 있습니다.';
  end if;

  if v_claim_id = '' then
    raise exception '삭제할 기성 회차 ID가 없습니다.';
  end if;

  select
    pc.project_name,
    pc.claim_no,
    pc.status
  into
    v_project_name,
    v_claim_no,
    v_status
  from public.progress_claims pc
  where pc.id::text = v_claim_id
  for update;

  if not found then
    raise exception '이미 삭제되었거나 존재하지 않는 기성 회차입니다.';
  end if;

  select max(pc.claim_no)
    into v_latest_claim_no
  from public.progress_claims pc
  where btrim(pc.project_name) = btrim(v_project_name);

  if coalesce(v_latest_claim_no, 0) <> coalesce(v_claim_no, 0) then
    raise exception
      '누계 연결 보호를 위해 가장 최근 회차부터 삭제해야 합니다. 현재 최근 회차: %회차',
      v_latest_claim_no;
  end if;

  /*
    progress_claims(id)를 직접 참조하는 단일열 FK 테이블을 찾아
    부모 삭제 전에 관련 행을 정리합니다.
    테이블명이 바뀌어도 FK가 정상 구성되어 있으면 자동 대응합니다.
  */
  for v_fk in
    select
      child_ns.nspname as schema_name,
      child.relname as table_name,
      child_col.attname as column_name
    from pg_constraint fk
    join pg_class parent
      on parent.oid = fk.confrelid
    join pg_namespace parent_ns
      on parent_ns.oid = parent.relnamespace
    join pg_class child
      on child.oid = fk.conrelid
    join pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    join pg_attribute child_col
      on child_col.attrelid = fk.conrelid
     and child_col.attnum = fk.conkey[1]
    join pg_attribute parent_col
      on parent_col.attrelid = fk.confrelid
     and parent_col.attnum = fk.confkey[1]
    where fk.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'progress_claims'
      and parent_col.attname = 'id'
      and array_length(fk.conkey, 1) = 1
      and array_length(fk.confkey, 1) = 1
  loop
    execute format(
      'delete from %I.%I where %I::text = $1',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name
    )
    using v_claim_id;

    get diagnostics v_row_count = row_count;
    v_deleted_children := v_deleted_children + coalesce(v_row_count, 0);
  end loop;

  delete from public.progress_claims
   where id::text = v_claim_id;

  get diagnostics v_deleted_parent = row_count;

  if v_deleted_parent <> 1 then
    raise exception '기성 회차 삭제 처리에 실패했습니다.';
  end if;

  /*
    임시저장 테이블은 DB 버전에 따라 없을 수 있으므로 존재할 때만 정리합니다.
    등록 회차 삭제 후 같은 회차의 예전 임시저장이 다시 자동 로드되는 것을 방지합니다.
  */
  if to_regclass('public.progress_claim_work_drafts') is not null then
    execute
      'delete from public.progress_claim_work_drafts
        where btrim(project_name) = btrim($1)
          and claim_no = $2'
    using v_project_name, v_claim_no;

    get diagnostics v_deleted_drafts = row_count;
  end if;

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'project_name', v_project_name,
    'claim_no', v_claim_no,
    'status', v_status,
    'deleted_claim_rows', v_deleted_parent,
    'deleted_child_rows', v_deleted_children,
    'deleted_draft_rows', v_deleted_drafts,
    'contract_master_preserved', true
  );
end;
$$;

revoke all on function public.admin_delete_progress_claim_v1(text) from public;
grant execute on function public.admin_delete_progress_claim_v1(text) to authenticated;
