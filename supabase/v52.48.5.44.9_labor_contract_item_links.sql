-- v52.48.5.44.9 공정별 노임단가-최초계약 품목 연결
-- Supabase SQL Editor에서 전체를 한 번 실행합니다.

begin;

create extension if not exists pgcrypto;

create table if not exists public.labor_process_contract_item_links (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  process_type text not null,
  contract_version_id uuid not null,
  contract_item_id uuid not null,
  source_key_snapshot text,
  classification_snapshot text,
  item_name_snapshot text,
  specification_snapshot text,
  unit_snapshot text,
  contract_quantity_snapshot numeric not null default 0,
  contract_labor_amount_snapshot numeric not null default 0,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_process_contract_item_links_project_process_item_key
    unique (project_name, process_type, contract_item_id)
);

create index if not exists idx_labor_contract_item_links_project_process
  on public.labor_process_contract_item_links (project_name, process_type);

create index if not exists idx_labor_contract_item_links_version
  on public.labor_process_contract_item_links (contract_version_id);

comment on table public.labor_process_contract_item_links is
  '공정별 노임단가에서 선택한 최초계약 품목과 저장 당시 계약값 스냅샷';

alter table public.labor_process_contract_item_links enable row level security;

drop policy if exists labor_contract_item_links_select_authenticated
  on public.labor_process_contract_item_links;

create policy labor_contract_item_links_select_authenticated
  on public.labor_process_contract_item_links
  for select
  to authenticated
  using (auth.uid() is not null);

revoke all on table public.labor_process_contract_item_links from anon;
grant select on table public.labor_process_contract_item_links to authenticated;

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
  v_unit_count integer := 0;
  v_source_unit text := null;
  v_normalized_process_type text := case
    when btrim(coalesce(p_process_type, '')) in ('경량골조', '경량석고') then '경량벽체'
    when btrim(coalesce(p_process_type, '')) in ('1차몰딩', '2차몰딩') then '몰딩'
    when btrim(coalesce(p_process_type, '')) in ('1차 걸레받이', '2차 걸레받이') then '걸레받이'
    else btrim(coalesce(p_process_type, ''))
  end;
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
      coalesce(sum(coalesce(item_row.contract_quantity, 0)), 0),
      coalesce(sum(coalesce(item_row.contract_labor_amount, 0)), 0)
    into
      v_matched_count,
      v_unit_count,
      v_source_unit,
      v_planned_quantity,
      v_contract_labor_amount
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
        where case
          when btrim(process_token.value) in ('경량골조', '경량석고') then '경량벽체'
          when btrim(process_token.value) in ('1차몰딩', '2차몰딩') then '몰딩'
          when btrim(process_token.value) in ('1차 걸레받이', '2차 걸레받이') then '걸레받이'
          else btrim(process_token.value)
        end = v_normalized_process_type
      );

    if v_process_matched_count <> v_requested_count then
      raise exception '현재 공정으로 분류되지 않은 계약품목이 포함되어 있습니다.';
    end if;

    if v_unit_count <> 1 or v_source_unit is null then
      raise exception '단위가 서로 다른 계약품목은 함께 저장할 수 없습니다.';
    end if;

    p_unit := v_source_unit;
  end if;

  -- 기존 노임단가 저장 함수와 품목 연결 저장을 같은 트랜잭션에서 처리합니다.
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
      coalesce(item_row.contract_labor_amount, 0),
      auth.uid(),
      nullif(btrim(coalesce(p_saved_by_name, '')), ''),
      now(),
      now()
    from public.progress_contract_items item_row
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
