-- v52.48.5.44.7.6
-- 기성 회차 삭제 <-> 계약품목 공정연결 완전 연동
--
-- 핵심 수정
-- 1. 삭제 기준을 contract_version_id 1개가 아니라
--    "현장 + 계약버전명" 전체로 묶습니다.
-- 2. 마지막 등록 회차가 삭제되면 같은 현장/계약버전명의
--    progress_contract_items 전체를 삭제합니다.
-- 3. progress_contract_items.process_type에 저장된
--    계약품목 공정연결도 따라서 함께 초기화됩니다.
-- 4. 과거 버그로 남은 orphan 계약버전/계약품목도 이 SQL 실행 시 1회 정리합니다.
--
-- 주의
-- 현재 시스템 설계에서 "등록 기성 회차가 하나도 없는 계약버전 원본"은
-- 잔여자료로 판단합니다. 단, 같은 현장/계약버전명의 임시저장(draft)이 있으면
-- 1회 정리 대상에서 제외합니다.

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
  v_contract_version_id uuid;
  v_contract_version_label text;
  v_latest_claim_no integer;
  v_remaining_claims_same_label integer := 0;
  v_deleted_parent integer := 0;
  v_deleted_children integer := 0;
  v_deleted_drafts integer := 0;
  v_deleted_contract_items integer := 0;
  v_deleted_contract_versions integer := 0;
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
    pc.status,
    pc.contract_version_id,
    pcv.version_label
  into
    v_project_name,
    v_claim_no,
    v_status,
    v_contract_version_id,
    v_contract_version_label
  from public.progress_claims pc
  left join public.progress_contract_versions pcv
    on pcv.id = pc.contract_version_id
  where pc.id::text = v_claim_id
  for update of pc;

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
    progress_claims(id)를 직접 참조하는 FK 하위행을 먼저 정리합니다.
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
    v_deleted_children :=
      v_deleted_children + coalesce(v_row_count, 0);
  end loop;

  delete from public.progress_claims
   where id::text = v_claim_id;

  get diagnostics v_deleted_parent = row_count;

  if v_deleted_parent <> 1 then
    raise exception '기성 회차 삭제 처리에 실패했습니다.';
  end if;

  /*
    같은 회차의 임시저장도 제거합니다.
  */
  if to_regclass('public.progress_claim_work_drafts') is not null then
    execute
      'delete from public.progress_claim_work_drafts
        where btrim(project_name) = btrim($1)
          and claim_no = $2'
    using v_project_name, v_claim_no;

    get diagnostics v_deleted_drafts = row_count;
  end if;

  /*
    중요:
    contract_version_id 하나만 보면 같은 "최초계약" 이름의 중복 버전이
    DB에 남을 수 있습니다.
    따라서 현장 + version_label 전체 기준으로 남은 기성 회차를 확인합니다.
  */
  if coalesce(btrim(v_contract_version_label), '') <> '' then
    select count(*)
      into v_remaining_claims_same_label
    from public.progress_claims pc
    join public.progress_contract_versions pcv
      on pcv.id = pc.contract_version_id
    where btrim(pc.project_name) = btrim(v_project_name)
      and btrim(pcv.version_label) = btrim(v_contract_version_label);

    if v_remaining_claims_same_label = 0 then
      /*
        마지막 사용 회차가 없어졌으므로
        같은 현장/계약버전명의 계약품목을 전부 초기화합니다.
        공정연결은 progress_contract_items.process_type에 있으므로
        계약품목 공정연결 화면도 같이 초기화됩니다.
      */
      delete from public.progress_contract_items pci
      using public.progress_contract_versions pcv
      where pci.contract_version_id = pcv.id
        and btrim(pcv.project_name) = btrim(v_project_name)
        and btrim(pcv.version_label) = btrim(v_contract_version_label);

      get diagnostics v_deleted_contract_items = row_count;

      delete from public.progress_contract_versions pcv
      where btrim(pcv.project_name) = btrim(v_project_name)
        and btrim(pcv.version_label) = btrim(v_contract_version_label)
        and not exists (
          select 1
          from public.progress_claims pc
          where pc.contract_version_id = pcv.id
        );

      get diagnostics v_deleted_contract_versions = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'project_name', v_project_name,
    'claim_no', v_claim_no,
    'status', v_status,
    'contract_version_id', v_contract_version_id,
    'contract_version_label', v_contract_version_label,
    'deleted_claim_rows', v_deleted_parent,
    'deleted_child_rows', v_deleted_children,
    'deleted_draft_rows', v_deleted_drafts,
    'deleted_contract_item_rows', v_deleted_contract_items,
    'deleted_contract_version_rows', v_deleted_contract_versions,
    'remaining_claims_same_label', v_remaining_claims_same_label,
    'contract_master_deleted',
      (v_deleted_contract_items > 0 or v_deleted_contract_versions > 0)
  );
end;
$$;

revoke all on function public.admin_delete_progress_claim_v1(text) from public;
grant execute on function public.admin_delete_progress_claim_v1(text) to authenticated;


/*
  1회 복구:
  이전 버전에서 등록 회차만 삭제되고
  progress_contract_versions / progress_contract_items만 남아 있는 자료 정리.

  안전 규칙:
  - 같은 현장 + version_label을 사용하는 등록 기성 회차가 0건
  - 같은 현장 + version_label의 work draft가 있으면 보존
*/
do $repair$
declare
  v_group record;
  v_has_draft_table boolean := false;
  v_has_draft_version_column boolean := false;
  v_has_matching_draft boolean := false;
begin
  if
    to_regclass('public.progress_contract_versions') is null
    or to_regclass('public.progress_contract_items') is null
    or to_regclass('public.progress_claims') is null
  then
    return;
  end if;

  v_has_draft_table :=
    to_regclass('public.progress_claim_work_drafts') is not null;

  if v_has_draft_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'progress_claim_work_drafts'
        and column_name = 'contract_version_label'
    )
    into v_has_draft_version_column;
  end if;

  for v_group in
    select
      btrim(pcv.project_name) as project_name,
      btrim(pcv.version_label) as version_label
    from public.progress_contract_versions pcv
    where coalesce(btrim(pcv.project_name), '') <> ''
      and coalesce(btrim(pcv.version_label), '') <> ''
    group by
      btrim(pcv.project_name),
      btrim(pcv.version_label)
    having not exists (
      select 1
      from public.progress_claims pc
      join public.progress_contract_versions pcv2
        on pcv2.id = pc.contract_version_id
      where btrim(pc.project_name) = btrim(pcv.project_name)
        and btrim(pcv2.version_label) = btrim(pcv.version_label)
    )
  loop
    v_has_matching_draft := false;

    if v_has_draft_table and v_has_draft_version_column then
      execute
        'select exists (
           select 1
           from public.progress_claim_work_drafts
           where btrim(project_name) = btrim($1)
             and btrim(contract_version_label) = btrim($2)
         )'
      into v_has_matching_draft
      using v_group.project_name, v_group.version_label;
    end if;

    if not v_has_matching_draft then
      delete from public.progress_contract_items pci
      using public.progress_contract_versions pcv
      where pci.contract_version_id = pcv.id
        and btrim(pcv.project_name) = btrim(v_group.project_name)
        and btrim(pcv.version_label) = btrim(v_group.version_label);

      delete from public.progress_contract_versions pcv
      where btrim(pcv.project_name) = btrim(v_group.project_name)
        and btrim(pcv.version_label) = btrim(v_group.version_label)
        and not exists (
          select 1
          from public.progress_claims pc
          where pc.contract_version_id = pcv.id
        );
    end if;
  end loop;
end;
$repair$;
