-- v52.48.5.44.7.6.3
-- 삭제된 기성 회차의 계약품목/공정연결 잔여자료 강제 초기화 보완
--
-- 확인된 원인:
-- 과거 계약품목의 source_key가
--   68a_1공구|경량벽체칸막이|...
-- 형태의 레거시 키라서 v7.6.1의 new-contract:/template: 안전조건에 걸리지 않았습니다.
--
-- 이번 버전은 source_key 형식으로 판단하지 않습니다.
-- 대신 "같은 현장 + 같은 계약버전명에 등록 기성 회차가 0건"일 때만
-- 계약품목/공정연결을 초기화합니다.
--
-- 추가 안전장치:
-- 이 SQL을 처음 실행할 때 자동복구 후보가 정확히 1개일 때만 자동 삭제합니다.
-- 후보가 2개 이상이면 아무 것도 삭제하지 않고 오류로 중단합니다.

create or replace function public.admin_reset_progress_contract_master_v2(
  p_project_name text,
  p_version_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_version_label text := btrim(coalesce(p_version_label, ''));
  v_claim_count integer := 0;
  v_version_count integer := 0;
  v_item_count integer := 0;
  v_deleted_child_rows integer := 0;
  v_deleted_item_rows integer := 0;
  v_deleted_version_rows integer := 0;
  v_deleted_draft_rows integer := 0;
  v_row_count integer := 0;
  v_has_draft_version_column boolean := false;
  v_fk record;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 계약품목 연동자료를 초기화할 수 있습니다.';
  end if;

  if v_project_name = '' or v_version_label = '' then
    raise exception '현장명과 계약버전명이 필요합니다.';
  end if;

  select count(*)
    into v_claim_count
  from public.progress_claims pc
  join public.progress_contract_versions pcv
    on pcv.id = pc.contract_version_id
  where btrim(pc.project_name) = v_project_name
    and btrim(pcv.version_label) = v_version_label;

  if v_claim_count > 0 then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'registered_claim_exists',
      'project_name', v_project_name,
      'version_label', v_version_label,
      'registered_claim_count', v_claim_count
    );
  end if;

  select
    count(distinct pcv.id),
    count(distinct pci.id)
  into
    v_version_count,
    v_item_count
  from public.progress_contract_versions pcv
  left join public.progress_contract_items pci
    on pci.contract_version_id = pcv.id
  where btrim(pcv.project_name) = v_project_name
    and btrim(pcv.version_label) = v_version_label;

  if v_version_count = 0 then
    return jsonb_build_object(
      'skipped', false,
      'already_clean', true,
      'project_name', v_project_name,
      'version_label', v_version_label,
      'deleted_contract_item_rows', 0,
      'deleted_contract_version_rows', 0
    );
  end if;

  /*
    progress_contract_items(id)를 직접 참조하는 단일열 FK 하위행을 선삭제.
    공정연결 이력/보조테이블이 추가되어 있어도 같이 초기화됩니다.
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
      and parent.relname = 'progress_contract_items'
      and parent_col.attname = 'id'
      and array_length(fk.conkey, 1) = 1
      and array_length(fk.confkey, 1) = 1
  loop
    execute format(
      'delete from %I.%I child
       using public.progress_contract_items pci,
             public.progress_contract_versions pcv
       where child.%I::text = pci.id::text
         and pci.contract_version_id = pcv.id
         and btrim(pcv.project_name) = $1
         and btrim(pcv.version_label) = $2',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name
    )
    using v_project_name, v_version_label;

    get diagnostics v_row_count = row_count;
    v_deleted_child_rows :=
      v_deleted_child_rows + coalesce(v_row_count, 0);
  end loop;

  delete from public.progress_contract_items pci
  using public.progress_contract_versions pcv
  where pci.contract_version_id = pcv.id
    and btrim(pcv.project_name) = v_project_name
    and btrim(pcv.version_label) = v_version_label;

  get diagnostics v_deleted_item_rows = row_count;

  delete from public.progress_contract_versions pcv
  where btrim(pcv.project_name) = v_project_name
    and btrim(pcv.version_label) = v_version_label
    and not exists (
      select 1
      from public.progress_claims pc
      where pc.contract_version_id = pcv.id
    );

  get diagnostics v_deleted_version_rows = row_count;

  /*
    같은 현장/계약버전의 임시저장도 존재하면 정리.
    현재 진단에서는 0건이었지만 향후 삭제경로를 완전하게 맞추기 위한 보완입니다.
  */
  if to_regclass('public.progress_claim_work_drafts') is not null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'progress_claim_work_drafts'
        and column_name = 'contract_version_label'
    )
    into v_has_draft_version_column;

    if v_has_draft_version_column then
      execute
        'delete from public.progress_claim_work_drafts
         where btrim(project_name) = $1
           and btrim(contract_version_label) = $2'
      using v_project_name, v_version_label;

      get diagnostics v_deleted_draft_rows = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'skipped', false,
    'already_clean', false,
    'project_name', v_project_name,
    'version_label', v_version_label,
    'before_contract_version_count', v_version_count,
    'before_contract_item_count', v_item_count,
    'deleted_child_rows', v_deleted_child_rows,
    'deleted_contract_item_rows', v_deleted_item_rows,
    'deleted_contract_version_rows', v_deleted_version_rows,
    'deleted_draft_rows', v_deleted_draft_rows
  );
end;
$$;

revoke all on function public.admin_reset_progress_contract_master_v2(text, text) from public;
grant execute on function public.admin_reset_progress_contract_master_v2(text, text) to authenticated;


/*
  현재 이미 삭제된 회차 때문에 남은 orphan 자료 1회 자동복구.
  source_key 형식은 보지 않습니다.

  후보 조건:
  - 계약품목이 1건 이상 있음
  - 같은 현장 + version_label을 사용하는 등록 기성 회차가 0건
  - 동일 현장/계약버전 임시저장이 없음

  안전조건:
  - 후보가 정확히 1개일 때만 자동복구
  - 2개 이상이면 삭제하지 않고 예외
*/
do $repair$
declare
  v_candidate record;
  v_candidate_count integer := 0;
  v_candidate_project_name text;
  v_candidate_version_label text;
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

  for v_candidate in
    select distinct
      btrim(pcv.project_name) as project_name,
      btrim(pcv.version_label) as version_label
    from public.progress_contract_versions pcv
    where coalesce(btrim(pcv.project_name), '') <> ''
      and coalesce(btrim(pcv.version_label), '') <> ''
      and exists (
        select 1
        from public.progress_contract_items pci
        where pci.contract_version_id = pcv.id
      )
      and not exists (
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
           where btrim(project_name) = $1
             and btrim(contract_version_label) = $2
         )'
      into v_has_matching_draft
      using v_candidate.project_name, v_candidate.version_label;
    end if;

    if not v_has_matching_draft then
      v_candidate_count := v_candidate_count + 1;
      v_candidate_project_name := v_candidate.project_name;
      v_candidate_version_label := v_candidate.version_label;
    end if;
  end loop;

  if v_candidate_count = 0 then
    raise notice '자동복구 대상 orphan 계약자료가 없습니다.';
    return;
  end if;

  if v_candidate_count > 1 then
    raise exception
      '자동복구 후보가 %개입니다. 안전을 위해 자동삭제하지 않았습니다. 진단 SQL로 project_name/version_label을 확인해주세요.',
      v_candidate_count;
  end if;

  /*
    함수는 auth.uid() / 최고관리자 검사를 하므로 SQL Editor의 do block에서는
    직접 동일 삭제를 수행합니다.
  */
  delete from public.progress_contract_items pci
  using public.progress_contract_versions pcv
  where pci.contract_version_id = pcv.id
    and btrim(pcv.project_name) = btrim(v_candidate_project_name)
    and btrim(pcv.version_label) = btrim(v_candidate_version_label);

  delete from public.progress_contract_versions pcv
  where btrim(pcv.project_name) = btrim(v_candidate_project_name)
    and btrim(pcv.version_label) = btrim(v_candidate_version_label)
    and not exists (
      select 1
      from public.progress_claims pc
      where pc.contract_version_id = pcv.id
    );

  raise notice
    'orphan 계약자료 자동복구 완료: project=%, version=%',
    v_candidate_project_name,
    v_candidate_version_label;
end;
$repair$;


/*
  실행 후 잔여 orphan 요약.
  정상적으로 현재 테스트자료가 정리되었다면 0 rows가 나와야 합니다.
*/
select
  btrim(pcv.project_name) as project_name,
  btrim(pcv.version_label) as version_label,
  count(distinct pcv.id) as version_count,
  count(distinct pci.id) as item_count
from public.progress_contract_versions pcv
join public.progress_contract_items pci
  on pci.contract_version_id = pcv.id
where not exists (
  select 1
  from public.progress_claims pc
  join public.progress_contract_versions pcv2
    on pcv2.id = pc.contract_version_id
  where btrim(pc.project_name) = btrim(pcv.project_name)
    and btrim(pcv2.version_label) = btrim(pcv.version_label)
)
group by
  btrim(pcv.project_name),
  btrim(pcv.version_label)
order by
  btrim(pcv.project_name),
  btrim(pcv.version_label);
