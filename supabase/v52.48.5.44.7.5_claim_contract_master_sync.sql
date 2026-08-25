-- v52.48.5.44.7.5
-- 기성 표준양식 <-> 계약품목 공정연결 즉시 동기화
--
-- 목적
-- 1. 기성내역서작성에서 표준양식을 업로드한 즉시 progress_contract_items에 반영
-- 2. 같은 양식을 다시 수정/업로드해도 중복 누적하지 않고 해당 계약버전 품목을 동기화
-- 3. 기존 계약품목 공정연결(process_type)은 source_key 기준으로 보존
-- 4. B열 '구분'(세대/공용/기타)의 classification / housing_type을 최신값으로 갱신
--
-- v52.48.5.44.7.4의 삭제 RPC와 함께 사용합니다.
-- 마지막 등록회차 삭제 시 표준양식 계약품목 원본도 정리되므로
-- 계약품목 공정연결 화면에서도 동일하게 사라집니다.

create or replace function public.sync_progress_contract_master_v1(
  p_project_name text,
  p_contract_version_label text,
  p_effective_date date,
  p_source_file_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_version_label text := btrim(coalesce(p_contract_version_label, ''));
  v_version_id uuid;
  v_item_count integer := 0;
  v_has_unit_price_columns boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = '' then
    raise exception '현장명이 없습니다.';
  end if;

  if v_version_label = '' then
    raise exception '계약버전명이 없습니다.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
  then
    raise exception '동기화할 계약품목이 없습니다.';
  end if;

  create temporary table if not exists pg_temp.cm_contract_sync_items (
    source_key text,
    source_row_no integer,
    sort_order integer,
    classification text,
    housing_type text,
    option_type text,
    work_zone text,
    item_name text,
    base_item_name text,
    specification text,
    unit text,
    process_type text,
    contract_quantity numeric,
    material_unit_price numeric,
    labor_unit_price numeric,
    expense_unit_price numeric,
    contract_material_amount numeric,
    contract_labor_amount numeric,
    contract_expense_amount numeric
  ) on commit drop;

  truncate table pg_temp.cm_contract_sync_items;

  insert into pg_temp.cm_contract_sync_items (
    source_key,
    source_row_no,
    sort_order,
    classification,
    housing_type,
    option_type,
    work_zone,
    item_name,
    base_item_name,
    specification,
    unit,
    process_type,
    contract_quantity,
    material_unit_price,
    labor_unit_price,
    expense_unit_price,
    contract_material_amount,
    contract_labor_amount,
    contract_expense_amount
  )
  select
    btrim(coalesce(x.source_key, '')),
    x.source_row_no,
    x.sort_order,
    btrim(coalesce(x.classification, '')),
    btrim(coalesce(x.housing_type, x.classification, '')),
    btrim(coalesce(x.option_type, '기본')),
    btrim(coalesce(x.work_zone, '')),
    btrim(coalesce(x.item_name, '')),
    btrim(coalesce(x.base_item_name, x.item_name, '')),
    btrim(coalesce(x.specification, '')),
    btrim(coalesce(x.unit, '')),
    btrim(coalesce(x.process_type, '')),
    coalesce(x.contract_quantity, 0),
    coalesce(x.material_unit_price, 0),
    coalesce(x.labor_unit_price, 0),
    coalesce(x.expense_unit_price, 0),
    coalesce(
      x.contract_material_amount,
      coalesce(x.contract_quantity, 0) * coalesce(x.material_unit_price, 0)
    ),
    coalesce(
      x.contract_labor_amount,
      coalesce(x.contract_quantity, 0) * coalesce(x.labor_unit_price, 0)
    ),
    coalesce(
      x.contract_expense_amount,
      coalesce(x.contract_quantity, 0) * coalesce(x.expense_unit_price, 0)
    )
  from jsonb_to_recordset(p_items) as x(
    source_key text,
    source_row_no integer,
    sort_order integer,
    classification text,
    housing_type text,
    option_type text,
    work_zone text,
    item_name text,
    base_item_name text,
    specification text,
    unit text,
    process_type text,
    contract_quantity numeric,
    material_unit_price numeric,
    labor_unit_price numeric,
    expense_unit_price numeric,
    contract_material_amount numeric,
    contract_labor_amount numeric,
    contract_expense_amount numeric
  );

  delete from pg_temp.cm_contract_sync_items
  where source_key = ''
     or item_name = '';

  if exists (
    select 1
    from pg_temp.cm_contract_sync_items
    group by source_key
    having count(*) > 1
  ) then
    raise exception '표준양식에 동일한 SYSTEM_ITEM_KEY가 중복되어 있습니다.';
  end if;

  select count(*)
    into v_item_count
  from pg_temp.cm_contract_sync_items;

  if v_item_count = 0 then
    raise exception '유효한 계약품목이 없습니다.';
  end if;

  select pcv.id
    into v_version_id
  from public.progress_contract_versions pcv
  where btrim(pcv.project_name) = v_project_name
    and btrim(pcv.version_label) = v_version_label
  order by pcv.created_at desc nulls last
  limit 1
  for update;

  if v_version_id is null then
    insert into public.progress_contract_versions (
      project_name,
      version_label,
      effective_date,
      source_file_name
    )
    values (
      v_project_name,
      v_version_label,
      p_effective_date,
      nullif(btrim(coalesce(p_source_file_name, '')), '')
    )
    returning id into v_version_id;
  else
    update public.progress_contract_versions
       set effective_date = coalesce(p_effective_date, effective_date),
           source_file_name = coalesce(
             nullif(btrim(coalesce(p_source_file_name, '')), ''),
             source_file_name
           )
     where id = v_version_id;
  end if;

  create temporary table if not exists pg_temp.cm_contract_existing_mapping (
    source_key text primary key,
    process_type text,
    mapped_by_name text,
    mapped_at timestamptz
  ) on commit drop;

  truncate table pg_temp.cm_contract_existing_mapping;

  insert into pg_temp.cm_contract_existing_mapping (
    source_key,
    process_type,
    mapped_by_name,
    mapped_at
  )
  select distinct on (pci.source_key)
    pci.source_key,
    pci.process_type,
    pci.mapped_by_name,
    pci.mapped_at
  from public.progress_contract_items pci
  where pci.contract_version_id = v_version_id
    and coalesce(pci.source_key, '') <> ''
  order by
    pci.source_key,
    pci.mapped_at desc nulls last,
    pci.sort_order desc nulls last;

  /*
    해당 계약버전의 계약품목을 "현재 업로드 양식" 기준으로 완전 동기화합니다.
    따라서 같은 파일을 다시 올려도 아래에 중복으로 누적되지 않습니다.
    공정연결값은 source_key가 같은 경우 기존값을 보존합니다.
  */
  delete from public.progress_contract_items
  where contract_version_id = v_version_id;

  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'progress_contract_items'
        and column_name = 'material_unit_price'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'progress_contract_items'
        and column_name = 'labor_unit_price'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'progress_contract_items'
        and column_name = 'expense_unit_price'
    )
  into v_has_unit_price_columns;

  if v_has_unit_price_columns then
    insert into public.progress_contract_items (
      contract_version_id,
      project_name,
      source_key,
      source_row_no,
      sort_order,
      classification,
      housing_type,
      option_type,
      work_zone,
      item_name,
      base_item_name,
      specification,
      unit,
      process_type,
      contract_quantity,
      material_unit_price,
      labor_unit_price,
      expense_unit_price,
      contract_material_amount,
      contract_labor_amount,
      contract_expense_amount,
      mapped_by_name,
      mapped_at
    )
    select
      v_version_id,
      v_project_name,
      s.source_key,
      s.source_row_no,
      s.sort_order,
      s.classification,
      case
        when s.classification <> '' then s.classification
        else s.housing_type
      end,
      s.option_type,
      s.work_zone,
      s.item_name,
      s.base_item_name,
      s.specification,
      s.unit,
      coalesce(
        nullif(m.process_type, ''),
        nullif(s.process_type, ''),
        ''
      ),
      s.contract_quantity,
      s.material_unit_price,
      s.labor_unit_price,
      s.expense_unit_price,
      s.contract_material_amount,
      s.contract_labor_amount,
      s.contract_expense_amount,
      m.mapped_by_name,
      m.mapped_at
    from pg_temp.cm_contract_sync_items s
    left join pg_temp.cm_contract_existing_mapping m
      on m.source_key = s.source_key
    order by s.sort_order, s.source_row_no;
  else
    insert into public.progress_contract_items (
      contract_version_id,
      project_name,
      source_key,
      source_row_no,
      sort_order,
      classification,
      housing_type,
      option_type,
      work_zone,
      item_name,
      base_item_name,
      specification,
      unit,
      process_type,
      contract_quantity,
      contract_material_amount,
      contract_labor_amount,
      contract_expense_amount,
      mapped_by_name,
      mapped_at
    )
    select
      v_version_id,
      v_project_name,
      s.source_key,
      s.source_row_no,
      s.sort_order,
      s.classification,
      case
        when s.classification <> '' then s.classification
        else s.housing_type
      end,
      s.option_type,
      s.work_zone,
      s.item_name,
      s.base_item_name,
      s.specification,
      s.unit,
      coalesce(
        nullif(m.process_type, ''),
        nullif(s.process_type, ''),
        ''
      ),
      s.contract_quantity,
      s.contract_material_amount,
      s.contract_labor_amount,
      s.contract_expense_amount,
      m.mapped_by_name,
      m.mapped_at
    from pg_temp.cm_contract_sync_items s
    left join pg_temp.cm_contract_existing_mapping m
      on m.source_key = s.source_key
    order by s.sort_order, s.source_row_no;
  end if;

  return jsonb_build_object(
    'project_name', v_project_name,
    'contract_version_id', v_version_id,
    'contract_version_label', v_version_label,
    'item_count', v_item_count,
    'process_mapping_preserved', true,
    'replace_mode', true
  );
end;
$$;

revoke all on function public.sync_progress_contract_master_v1(
  text,
  text,
  date,
  text,
  jsonb
) from public;

grant execute on function public.sync_progress_contract_master_v1(
  text,
  text,
  date,
  text,
  jsonb
) to authenticated;
