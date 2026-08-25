-- v52.48.5.44.7.4 기성 회차 삭제 시 표준양식 계약원본까지 안전하게 정리

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
  v_remaining_claims_for_version integer := 0;
  v_standard_contract_item_count integer := 0;
  v_total_contract_item_count integer := 0;
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

  if to_regclass('public.progress_claim_work_drafts') is not null then
    execute
      'delete from public.progress_claim_work_drafts
        where btrim(project_name) = btrim($1)
          and claim_no = $2'
    using v_project_name, v_claim_no;

    get diagnostics v_deleted_drafts = row_count;
  end if;

  if v_contract_version_id is not null then
    select count(*)
      into v_remaining_claims_for_version
    from public.progress_claims pc
    where pc.contract_version_id = v_contract_version_id;

    if v_remaining_claims_for_version = 0 then
      select
        count(*),
        count(*) filter (
          where coalesce(source_key, '') like 'new-contract:%'
        )
      into
        v_total_contract_item_count,
        v_standard_contract_item_count
      from public.progress_contract_items
      where contract_version_id = v_contract_version_id;

      if
        v_total_contract_item_count > 0
        and v_standard_contract_item_count = v_total_contract_item_count
      then
        delete from public.progress_contract_items
         where contract_version_id = v_contract_version_id;

        get diagnostics v_deleted_contract_items = row_count;

        delete from public.progress_contract_versions
         where id = v_contract_version_id;

        get diagnostics v_deleted_contract_versions = row_count;
      end if;
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
    'contract_master_deleted', (v_deleted_contract_versions > 0)
  );
end;
$$;

revoke all on function public.admin_delete_progress_claim_v1(text) from public;
grant execute on function public.admin_delete_progress_claim_v1(text) to authenticated;

do $cleanup$
declare
  v_version record;
begin
  if
    to_regclass('public.progress_contract_versions') is null
    or to_regclass('public.progress_contract_items') is null
    or to_regclass('public.progress_claims') is null
  then
    return;
  end if;

  for v_version in
    select pcv.id
    from public.progress_contract_versions pcv
    where not exists (
      select 1
      from public.progress_claims pc
      where pc.contract_version_id = pcv.id
    )
      and exists (
        select 1
        from public.progress_contract_items pci
        where pci.contract_version_id = pcv.id
      )
      and not exists (
        select 1
        from public.progress_contract_items pci
        where pci.contract_version_id = pcv.id
          and coalesce(pci.source_key, '') not like 'new-contract:%'
      )
  loop
    delete from public.progress_contract_items
     where contract_version_id = v_version.id;

    delete from public.progress_contract_versions
     where id = v_version.id;
  end loop;
end;
$cleanup$;
