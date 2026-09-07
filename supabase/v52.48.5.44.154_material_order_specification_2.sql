-- v52.48.5.44.154
-- 자재발주서 마스터 규격 고정 및 규격(2) 추가
-- 선행: v52.48.5.44.152
-- Supabase SQL Editor에서 1회 직접 실행

begin;

alter table public.material_supply_order_items
  add column if not exists specification_2 text;

alter table public.material_supply_project_items
  add column if not exists specification_2 text;

create or replace function public.material_supply_project_item_key(
  p_category_id uuid,
  p_process_name text,
  p_standard_name text,
  p_specification text,
  p_specification_2 text,
  p_unit text
)
returns text
language sql
immutable
as $$
  select concat_ws(
    '|',
    coalesce(p_category_id::text, ''),
    regexp_replace(lower(trim(coalesce(p_process_name, ''))), '\s+', ' ', 'g'),
    regexp_replace(lower(trim(coalesce(p_standard_name, ''))), '\s+', ' ', 'g'),
    regexp_replace(lower(trim(coalesce(p_specification, ''))), '\s+', ' ', 'g'),
    regexp_replace(lower(trim(coalesce(p_specification_2, ''))), '\s+', ' ', 'g'),
    regexp_replace(lower(trim(coalesce(p_unit, ''))), '\s+', ' ', 'g')
  );
$$;

update public.material_supply_project_items
set identity_key = public.material_supply_project_item_key(
  category_id,
  process_name,
  standard_name,
  specification,
  specification_2,
  unit
);

create or replace function public.material_supply_project_items_fill_fields()
returns trigger
language plpgsql
as $$
begin
  new.identity_key := public.material_supply_project_item_key(
    new.category_id,
    new.process_name,
    new.standard_name,
    new.specification,
    new.specification_2,
    new.unit
  );
  new.search_text := lower(
    concat_ws(
      ' ',
      coalesce(new.standard_name, ''),
      coalesce(new.specification, ''),
      coalesce(new.specification_2, ''),
      coalesce(new.unit, ''),
      coalesce(new.process_name, '')
    )
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_material_supply_project_items_fill_fields
  on public.material_supply_project_items;
create trigger trg_material_supply_project_items_fill_fields
before insert or update of category_id, process_name, standard_name, specification,
  specification_2, unit, identity_key, search_text
on public.material_supply_project_items
for each row execute function public.material_supply_project_items_fill_fields();

create or replace function public.resolve_material_supply_project_item(
  p_project_name text,
  p_material_id uuid,
  p_category_id uuid,
  p_process_name text,
  p_standard_name text,
  p_specification text,
  p_specification_2 text,
  p_unit text,
  p_updated_by text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_identity_key text;
  v_project_material_id uuid;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;
  if nullif(trim(p_standard_name), '') is null then
    raise exception 'standard name is required';
  end if;

  v_identity_key := public.material_supply_project_item_key(
    p_category_id,
    p_process_name,
    p_standard_name,
    p_specification,
    p_specification_2,
    p_unit
  );

  insert into public.material_supply_project_items (
    project_name, material_id, category_id, process_name, standard_name,
    specification, specification_2, unit, identity_key, created_by, updated_by
  )
  values (
    trim(p_project_name),
    p_material_id,
    p_category_id,
    nullif(trim(coalesce(p_process_name, '')), ''),
    trim(p_standard_name),
    nullif(trim(coalesce(p_specification, '')), ''),
    nullif(trim(coalesce(p_specification_2, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_identity_key,
    p_updated_by,
    p_updated_by
  )
  on conflict (project_name, identity_key)
  do update set
    material_id = coalesce(public.material_supply_project_items.material_id, excluded.material_id),
    category_id = excluded.category_id,
    process_name = excluded.process_name,
    standard_name = excluded.standard_name,
    specification = excluded.specification,
    specification_2 = excluded.specification_2,
    unit = excluded.unit,
    is_active = true,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_project_material_id;

  return v_project_material_id;
end;
$$;

grant execute on function public.material_supply_project_item_key(uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.resolve_material_supply_project_item(text, uuid, uuid, text, text, text, text, text, text)
  to authenticated;

commit;
