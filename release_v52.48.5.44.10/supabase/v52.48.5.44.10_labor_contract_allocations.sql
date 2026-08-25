-- v52.48.5.44.10 복합공정 계약품목 노무비 단가 배분
-- Supabase SQL Editor에서 전체를 한 번 실행합니다.

begin;

create extension if not exists pgcrypto;

create or replace function public.normalize_labor_contract_process_v1(
  p_process_type text
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when btrim(coalesce(p_process_type, '')) in ('경량골조', '경량석고') then '경량벽체'
    when btrim(coalesce(p_process_type, '')) in ('1차몰딩', '2차몰딩') then '몰딩'
    when btrim(coalesce(p_process_type, '')) in ('1차 걸레받이', '2차 걸레받이') then '걸레받이'
    else btrim(coalesce(p_process_type, ''))
  end;
$$;

create or replace function public.labor_contract_process_signature_v1(
  p_process_type text
)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(process_type, ' + ' order by process_type), '')
  from (
    select distinct public.normalize_labor_contract_process_v1(token.value) as process_type
    from regexp_split_to_table(
      coalesce(p_process_type, ''),
      '\s*\+\s*|\s*,\s*'
    ) as token(value)
    where public.normalize_labor_contract_process_v1(token.value) <> ''
  ) normalized;
$$;

create table if not exists public.labor_contract_item_process_allocations (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  contract_version_id uuid not null,
  contract_item_id uuid not null,
  process_type text not null,
  allocated_labor_unit_price numeric not null
    constraint labor_contract_allocation_price_nonnegative check (allocated_labor_unit_price >= 0),
  source_labor_unit_price_snapshot numeric not null,
  source_process_type_snapshot text not null,
  contract_quantity_snapshot numeric not null,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_contract_item_process_allocations_item_process_key
    unique (project_name, contract_version_id, contract_item_id, process_type)
);

create index if not exists idx_labor_contract_allocations_project_version
  on public.labor_contract_item_process_allocations (project_name, contract_version_id);

create index if not exists idx_labor_contract_allocations_item
  on public.labor_contract_item_process_allocations (contract_item_id);

comment on table public.labor_contract_item_process_allocations is
  '연결 공정이 2개 이상인 최초계약 품목의 공정별 노무비 단가 배분값';

alter table public.labor_contract_item_process_allocations enable row level security;

drop policy if exists labor_contract_allocations_select_authenticated
  on public.labor_contract_item_process_allocations;

create policy labor_contract_allocations_select_authenticated
  on public.labor_contract_item_process_allocations
  for select
  to authenticated
  using (auth.uid() is not null);

revoke all on table public.labor_contract_item_process_allocations from anon;
grant select on table public.labor_contract_item_process_allocations to authenticated;

alter table public.labor_process_contract_item_links
  add column if not exists source_contract_labor_amount_snapshot numeric;

alter table public.labor_process_contract_item_links
  add column if not exists applied_labor_unit_price_snapshot numeric;

alter table public.labor_process_contract_item_links
  add column if not exists allocation_status text;

comment on column public.labor_process_contract_item_links.contract_labor_amount_snapshot is
  '해당 공정에 실제 적용된 계약 노무비';

comment on column public.labor_process_contract_item_links.source_contract_labor_amount_snapshot is
  '복합공정 배분 전 원 계약 노무비';

create or replace function public.save_labor_contract_item_allocations_v1(
  p_project_name text,
  p_contract_version_id uuid,
  p_allocations jsonb,
  p_saved_by_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_requested_count integer := 0;
  v_requested_item_count integer := 0;
  v_matched_item_count integer := 0;
  v_invalid_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인 후 저장해주세요.';
  end if;

  if v_project_name = '' or p_contract_version_id is null then
    raise exception '현장명과 최초계약 버전은 필수입니다.';
  end if;

  if not exists (
    select 1
    from public.progress_contract_versions version_row
    where version_row.id = p_contract_version_id
      and version_row.project_name = v_project_name
      and version_row.version_label = '최초계약'
  ) then
    raise exception '현재 현장의 최초계약 버전을 확인할 수 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception '노무비 단가 배분값 형식이 올바르지 않습니다.';
  end if;

  create temporary table requested_labor_allocations (
    contract_item_id uuid not null,
    process_type text not null,
    allocated_labor_unit_price numeric not null,
    primary key (contract_item_id, process_type)
  ) on commit drop;

  begin
    insert into requested_labor_allocations (
      contract_item_id,
      process_type,
      allocated_labor_unit_price
    )
    select
      (entry.value ->> 'contract_item_id')::uuid,
      public.normalize_labor_contract_process_v1(entry.value ->> 'process_type'),
      (entry.value ->> 'allocated_labor_unit_price')::numeric
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as entry(value);
  exception
    when invalid_text_representation or not_null_violation or unique_violation then
      raise exception '중복되거나 올바르지 않은 노무비 단가 배분값이 있습니다.';
  end;

  select count(*)::integer, count(distinct contract_item_id)::integer
    into v_requested_count, v_requested_item_count
  from requested_labor_allocations;

  if v_requested_count = 0 then
    raise exception '저장할 노무비 단가 배분값이 없습니다.';
  end if;

  if exists (
    select 1
    from requested_labor_allocations
    where process_type = '' or allocated_labor_unit_price < 0
  ) then
    raise exception '공정명과 0원 이상의 노무비 단가를 입력해주세요.';
  end if;

  select count(*)::integer
    into v_matched_item_count
  from public.progress_contract_items item_row
  where item_row.id in (
    select distinct contract_item_id from requested_labor_allocations
  )
    and item_row.project_name = v_project_name
    and item_row.contract_version_id = p_contract_version_id;

  if v_matched_item_count <> v_requested_item_count then
    raise exception '선택한 계약품목 중 현재 최초계약에서 찾을 수 없는 항목이 있습니다.';
  end if;

  select count(*)::integer
    into v_invalid_count
  from public.progress_contract_items item_row
  cross join lateral (
    select
      count(distinct public.normalize_labor_contract_process_v1(token.value))::integer as process_count
    from regexp_split_to_table(
      coalesce(item_row.process_type, ''),
      '\s*\+\s*|\s*,\s*'
    ) as token(value)
    where public.normalize_labor_contract_process_v1(token.value) <> ''
  ) process_meta
  where item_row.id in (
    select distinct contract_item_id from requested_labor_allocations
  )
    and item_row.project_name = v_project_name
    and item_row.contract_version_id = p_contract_version_id
    and (
      coalesce(item_row.contract_quantity, 0) <= 0
      or process_meta.process_count < 2
    );

  if v_invalid_count > 0 then
    raise exception '계약수량이 없거나 복합공정이 아닌 품목이 포함되어 있습니다.';
  end if;

  select count(*)::integer
    into v_invalid_count
  from requested_labor_allocations requested
  join public.progress_contract_items item_row
    on item_row.id = requested.contract_item_id
   and item_row.project_name = v_project_name
   and item_row.contract_version_id = p_contract_version_id
  where not exists (
    select 1
    from regexp_split_to_table(
      coalesce(item_row.process_type, ''),
      '\s*\+\s*|\s*,\s*'
    ) as token(value)
    where public.normalize_labor_contract_process_v1(token.value) = requested.process_type
  );

  if v_invalid_count > 0 then
    raise exception '계약품목에 연결되지 않은 공정의 배분값이 포함되어 있습니다.';
  end if;

  select count(*)::integer
    into v_invalid_count
  from public.progress_contract_items item_row
  cross join lateral (
    select count(distinct public.normalize_labor_contract_process_v1(token.value))::integer as process_count
    from regexp_split_to_table(
      coalesce(item_row.process_type, ''),
      '\s*\+\s*|\s*,\s*'
    ) as token(value)
    where public.normalize_labor_contract_process_v1(token.value) <> ''
  ) process_meta
  where item_row.id in (
    select distinct contract_item_id from requested_labor_allocations
  )
    and item_row.project_name = v_project_name
    and item_row.contract_version_id = p_contract_version_id
    and process_meta.process_count <> (
      select count(*)
      from requested_labor_allocations requested
      where requested.contract_item_id = item_row.id
    );

  if v_invalid_count > 0 then
    raise exception '복합공정 품목의 모든 연결 공정 단가를 입력해주세요.';
  end if;

  select count(*)::integer
    into v_invalid_count
  from public.progress_contract_items item_row
  where item_row.id in (
    select distinct contract_item_id from requested_labor_allocations
  )
    and item_row.project_name = v_project_name
    and item_row.contract_version_id = p_contract_version_id
    and abs(
      (
        select coalesce(sum(requested.allocated_labor_unit_price), 0)
        from requested_labor_allocations requested
        where requested.contract_item_id = item_row.id
      ) -
      (coalesce(item_row.contract_labor_amount, 0) / item_row.contract_quantity)
    ) > 0.01;

  if v_invalid_count > 0 then
    raise exception '공정별 배분단가 합계가 원 계약 노무비 단가와 일치하지 않습니다.';
  end if;

  delete from public.labor_contract_item_process_allocations allocation_row
  where allocation_row.project_name = v_project_name
    and allocation_row.contract_version_id = p_contract_version_id
    and allocation_row.contract_item_id in (
      select distinct contract_item_id from requested_labor_allocations
    );

  insert into public.labor_contract_item_process_allocations (
    project_name,
    contract_version_id,
    contract_item_id,
    process_type,
    allocated_labor_unit_price,
    source_labor_unit_price_snapshot,
    source_process_type_snapshot,
    contract_quantity_snapshot,
    created_by,
    created_by_name,
    created_at,
    updated_at
  )
  select
    v_project_name,
    p_contract_version_id,
    item_row.id,
    requested.process_type,
    requested.allocated_labor_unit_price,
    coalesce(item_row.contract_labor_amount, 0) / item_row.contract_quantity,
    public.labor_contract_process_signature_v1(item_row.process_type),
    item_row.contract_quantity,
    auth.uid(),
    nullif(btrim(coalesce(p_saved_by_name, '')), ''),
    now(),
    now()
  from requested_labor_allocations requested
  join public.progress_contract_items item_row
    on item_row.id = requested.contract_item_id
   and item_row.project_name = v_project_name
   and item_row.contract_version_id = p_contract_version_id;

  return jsonb_build_object(
    'project_name', v_project_name,
    'contract_version_id', p_contract_version_id,
    'item_count', v_requested_item_count,
    'allocation_count', v_requested_count
  );
end;
$$;

revoke all on function public.save_labor_contract_item_allocations_v1(
  text, uuid, jsonb, text
) from public, anon;

grant execute on function public.save_labor_contract_item_allocations_v1(
  text, uuid, jsonb, text
) to authenticated;

create or replace function public.save_labor_process_inline_with_contract_items_v1(
  p_project_name text,
  p_original_process_type text,
  p_process_type text,
  p_sort_order integer,
  p_unit text,
  p_contract_labor_amount numeric,
  p_execution_labor_total numeric,
  p_planned_quantity numeric,
  p_confirmed_unit_price numeric,
  p_effective_from date,
  p_change_reason text,
  p_contract_version_id uuid default null,
  p_contract_item_ids uuid[] default '{}'::uuid[],
  p_saved_by_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_original_process_type text := nullif(btrim(coalesce(p_original_process_type, '')), '');
  v_process_type text := btrim(coalesce(p_process_type, ''));
  v_item_ids uuid[] := '{}'::uuid[];
  v_requested_count integer := 0;
  v_matched_count integer := 0;
  v_process_matched_count integer := 0;
  v_missing_allocation_count integer := 0;
  v_unit_count integer := 0;
  v_source_unit text := null;
  v_normalized_process_type text := public.normalize_labor_contract_process_v1(p_process_type);
  v_contract_labor_amount numeric := coalesce(p_contract_labor_amount, 0);
  v_planned_quantity numeric := coalesce(p_planned_quantity, 0);
begin
  if auth.uid() is null then
    raise exception '로그인 후 저장해주세요.';
  end if;

  if v_project_name = '' or v_process_type = '' then
    raise exception '현장명과 공정명은 필수입니다.';
  end if;

  select coalesce(array_agg(requested_id order by requested_id), '{}'::uuid[])
    into v_item_ids
  from (
    select distinct requested_id
    from unnest(coalesce(p_contract_item_ids, '{}'::uuid[])) as requested(requested_id)
    where requested_id is not null
  ) normalized;

  v_requested_count := cardinality(v_item_ids);

  if v_requested_count > 0 then
    if p_contract_version_id is null then
      raise exception '최초계약 버전 정보가 없습니다. 계약품목을 다시 선택해주세요.';
    end if;

    if not exists (
      select 1
      from public.progress_contract_versions version_row
      where version_row.id = p_contract_version_id
        and version_row.project_name = v_project_name
        and version_row.version_label = '최초계약'
    ) then
      raise exception '현재 현장의 최초계약 버전을 확인할 수 없습니다.';
    end if;

    select
      count(*)::integer,
      count(distinct nullif(btrim(coalesce(item_row.unit, '')), ''))::integer,
      min(nullif(btrim(coalesce(item_row.unit, '')), '')),
      coalesce(sum(coalesce(item_row.contract_quantity, 0)), 0)
    into
      v_matched_count,
      v_unit_count,
      v_source_unit,
      v_planned_quantity
    from public.progress_contract_items item_row
    where item_row.id = any(v_item_ids)
      and item_row.project_name = v_project_name
      and item_row.contract_version_id = p_contract_version_id;

    if v_matched_count <> v_requested_count then
      raise exception '선택한 계약품목 중 현재 최초계약에서 찾을 수 없는 항목이 있습니다.';
    end if;

    select count(*)::integer
      into v_process_matched_count
    from public.progress_contract_items item_row
    where item_row.id = any(v_item_ids)
      and item_row.project_name = v_project_name
      and item_row.contract_version_id = p_contract_version_id
      and exists (
        select 1
        from regexp_split_to_table(
          coalesce(item_row.process_type, ''),
          '\s*\+\s*|\s*,\s*'
        ) as process_token(value)
        where public.normalize_labor_contract_process_v1(process_token.value) =
          v_normalized_process_type
      );

    if v_process_matched_count <> v_requested_count then
      raise exception '현재 공정으로 분류되지 않은 계약품목이 포함되어 있습니다.';
    end if;

    if v_unit_count <> 1 or v_source_unit is null then
      raise exception '단위가 서로 다른 계약품목은 함께 저장할 수 없습니다.';
    end if;

    select count(*)::integer
      into v_missing_allocation_count
    from public.progress_contract_items item_row
    cross join lateral (
      select
        count(distinct public.normalize_labor_contract_process_v1(token.value))::integer as process_count,
        public.labor_contract_process_signature_v1(item_row.process_type) as process_signature
      from regexp_split_to_table(
        coalesce(item_row.process_type, ''),
        '\s*\+\s*|\s*,\s*'
      ) as token(value)
      where public.normalize_labor_contract_process_v1(token.value) <> ''
    ) process_meta
    left join public.labor_contract_item_process_allocations allocation_row
      on allocation_row.project_name = v_project_name
     and allocation_row.contract_version_id = p_contract_version_id
     and allocation_row.contract_item_id = item_row.id
     and allocation_row.process_type = v_normalized_process_type
    where item_row.id = any(v_item_ids)
      and item_row.project_name = v_project_name
      and item_row.contract_version_id = p_contract_version_id
      and process_meta.process_count > 1
      and (
        allocation_row.id is null
        or allocation_row.source_process_type_snapshot <> process_meta.process_signature
        or abs(
          allocation_row.source_labor_unit_price_snapshot -
          (coalesce(item_row.contract_labor_amount, 0) / nullif(item_row.contract_quantity, 0))
        ) > 0.0001
      );

    if v_missing_allocation_count > 0 then
      raise exception '복합공정 품목의 현재 공정 노무비 단가를 먼저 배분해주세요.';
    end if;

    select coalesce(sum(
      case
        when process_meta.process_count > 1 then
          allocation_row.allocated_labor_unit_price * coalesce(item_row.contract_quantity, 0)
        else coalesce(item_row.contract_labor_amount, 0)
      end
    ), 0)
      into v_contract_labor_amount
    from public.progress_contract_items item_row
    cross join lateral (
      select count(distinct public.normalize_labor_contract_process_v1(token.value))::integer as process_count
      from regexp_split_to_table(
        coalesce(item_row.process_type, ''),
        '\s*\+\s*|\s*,\s*'
      ) as token(value)
      where public.normalize_labor_contract_process_v1(token.value) <> ''
    ) process_meta
    left join public.labor_contract_item_process_allocations allocation_row
      on allocation_row.project_name = v_project_name
     and allocation_row.contract_version_id = p_contract_version_id
     and allocation_row.contract_item_id = item_row.id
     and allocation_row.process_type = v_normalized_process_type
    where item_row.id = any(v_item_ids)
      and item_row.project_name = v_project_name
      and item_row.contract_version_id = p_contract_version_id;

    p_unit := v_source_unit;
  end if;

  perform public.save_labor_process_inline(
    p_project_name => v_project_name,
    p_original_process_type => v_original_process_type,
    p_process_type => v_process_type,
    p_sort_order => p_sort_order,
    p_unit => btrim(coalesce(p_unit, '')),
    p_contract_labor_amount => v_contract_labor_amount,
    p_execution_labor_total => p_execution_labor_total,
    p_planned_quantity => v_planned_quantity,
    p_confirmed_unit_price => p_confirmed_unit_price,
    p_effective_from => p_effective_from,
    p_change_reason => p_change_reason
  );

  delete from public.labor_process_contract_item_links link_row
  where link_row.project_name = v_project_name
    and link_row.process_type in (
      v_process_type,
      coalesce(v_original_process_type, v_process_type)
    );

  if v_requested_count > 0 then
    insert into public.labor_process_contract_item_links (
      project_name,
      process_type,
      contract_version_id,
      contract_item_id,
      source_key_snapshot,
      classification_snapshot,
      item_name_snapshot,
      specification_snapshot,
      unit_snapshot,
      contract_quantity_snapshot,
      contract_labor_amount_snapshot,
      source_contract_labor_amount_snapshot,
      applied_labor_unit_price_snapshot,
      allocation_status,
      created_by,
      created_by_name,
      created_at,
      updated_at
    )
    select
      v_project_name,
      v_process_type,
      p_contract_version_id,
      item_row.id,
      item_row.source_key,
      item_row.classification,
      coalesce(nullif(item_row.item_name, ''), item_row.base_item_name),
      item_row.specification,
      item_row.unit,
      coalesce(item_row.contract_quantity, 0),
      case
        when process_meta.process_count > 1 then
          allocation_row.allocated_labor_unit_price * coalesce(item_row.contract_quantity, 0)
        else coalesce(item_row.contract_labor_amount, 0)
      end,
      coalesce(item_row.contract_labor_amount, 0),
      case
        when process_meta.process_count > 1 then allocation_row.allocated_labor_unit_price
        when coalesce(item_row.contract_quantity, 0) > 0 then
          coalesce(item_row.contract_labor_amount, 0) / item_row.contract_quantity
        else 0
      end,
      case when process_meta.process_count > 1 then 'allocated' else 'single' end,
      auth.uid(),
      nullif(btrim(coalesce(p_saved_by_name, '')), ''),
      now(),
      now()
    from public.progress_contract_items item_row
    cross join lateral (
      select count(distinct public.normalize_labor_contract_process_v1(token.value))::integer as process_count
      from regexp_split_to_table(
        coalesce(item_row.process_type, ''),
        '\s*\+\s*|\s*,\s*'
      ) as token(value)
      where public.normalize_labor_contract_process_v1(token.value) <> ''
    ) process_meta
    left join public.labor_contract_item_process_allocations allocation_row
      on allocation_row.project_name = v_project_name
     and allocation_row.contract_version_id = p_contract_version_id
     and allocation_row.contract_item_id = item_row.id
     and allocation_row.process_type = v_normalized_process_type
    where item_row.id = any(v_item_ids)
      and item_row.project_name = v_project_name
      and item_row.contract_version_id = p_contract_version_id;
  end if;

  return jsonb_build_object(
    'project_name', v_project_name,
    'process_type', v_process_type,
    'linked_item_count', v_requested_count,
    'unit', btrim(coalesce(p_unit, '')),
    'contract_labor_amount', v_contract_labor_amount,
    'planned_quantity', v_planned_quantity
  );
end;
$$;

revoke all on function public.save_labor_process_inline_with_contract_items_v1(
  text, text, text, integer, text, numeric, numeric, numeric,
  numeric, date, text, uuid, uuid[], text
) from public, anon;

grant execute on function public.save_labor_process_inline_with_contract_items_v1(
  text, text, text, integer, text, numeric, numeric, numeric,
  numeric, date, text, uuid, uuid[], text
) to authenticated;

commit;
