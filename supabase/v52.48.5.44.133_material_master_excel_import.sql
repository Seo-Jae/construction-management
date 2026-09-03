-- v52.48.5.44.133
-- 자재마스터 Excel 일괄 갱신을 한 트랜잭션으로 처리
-- Supabase SQL Editor에서 1회 실행

begin;

create or replace function public.import_material_master_excel_v52_48_5_44_133(
  p_rows jsonb,
  p_updated_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_id_text text;
  v_category_id uuid;
  v_standard_name text;
  v_aliases text[];
  v_update_count integer := 0;
  v_insert_count integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '자재마스터 업로드 자료 형식이 올바르지 않습니다.';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception '업로드할 자재가 없습니다.';
  end if;

  if jsonb_array_length(p_rows) > 10000 then
    raise exception '한 번에 최대 10000개 자재까지 업로드할 수 있습니다.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_rows)
  loop
    v_id_text := nullif(trim(coalesce(v_item ->> 'id', '')), '');
    v_id := case when v_id_text is null then null else v_id_text::uuid end;
    v_category_id := nullif(trim(coalesce(v_item ->> 'category_id', '')), '')::uuid;
    v_standard_name := nullif(trim(coalesce(v_item ->> 'standard_name', '')), '');

    if v_category_id is null or not exists (
      select 1
      from public.material_supply_categories category_row
      where category_row.id = v_category_id
        and category_row.is_active = true
    ) then
      raise exception '사용할 수 없는 자재분류가 포함되어 있습니다.';
    end if;

    if v_standard_name is null then
      raise exception '표준 품명이 비어 있는 행이 있습니다.';
    end if;

    select coalesce(array_agg(alias_text), '{}'::text[])
    into v_aliases
    from (
      select nullif(trim(alias_value), '') as alias_text
      from jsonb_array_elements_text(
        coalesce(v_item -> 'aliases', '[]'::jsonb)
      ) as alias_rows(alias_value)
    ) alias_rows
    where alias_text is not null;

    if v_id is not null then
      update public.material_master_items
      set
        category_id = v_category_id,
        process_name = nullif(trim(coalesce(v_item ->> 'process_name', '')), ''),
        standard_name = v_standard_name,
        specification = nullif(trim(coalesce(v_item ->> 'specification', '')), ''),
        unit = nullif(trim(coalesce(v_item ->> 'unit', '')), ''),
        manufacturer = nullif(trim(coalesce(v_item ->> 'manufacturer', '')), ''),
        aliases = v_aliases,
        note = nullif(trim(coalesce(v_item ->> 'note', '')), ''),
        is_active = coalesce((v_item ->> 'is_active')::boolean, true),
        is_main_material = coalesce((v_item ->> 'is_main_material')::boolean, false),
        main_sort_order = greatest(1, coalesce((v_item ->> 'main_sort_order')::integer, 100)),
        updated_by = p_updated_by,
        updated_at = now()
      where id = v_id;

      if not found then
        raise exception '현재 자재마스터에 없는 관리ID가 포함되어 있습니다: %', v_id_text;
      end if;

      v_update_count := v_update_count + 1;
    else
      insert into public.material_master_items (
        category_id,
        process_name,
        standard_name,
        specification,
        unit,
        manufacturer,
        aliases,
        note,
        is_active,
        is_main_material,
        main_sort_order,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      values (
        v_category_id,
        nullif(trim(coalesce(v_item ->> 'process_name', '')), ''),
        v_standard_name,
        nullif(trim(coalesce(v_item ->> 'specification', '')), ''),
        nullif(trim(coalesce(v_item ->> 'unit', '')), ''),
        nullif(trim(coalesce(v_item ->> 'manufacturer', '')), ''),
        v_aliases,
        nullif(trim(coalesce(v_item ->> 'note', '')), ''),
        coalesce((v_item ->> 'is_active')::boolean, true),
        coalesce((v_item ->> 'is_main_material')::boolean, false),
        greatest(1, coalesce((v_item ->> 'main_sort_order')::integer, 100)),
        p_updated_by,
        p_updated_by,
        now(),
        now()
      );

      v_insert_count := v_insert_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_update_count,
    'inserted', v_insert_count,
    'total', v_update_count + v_insert_count
  );
end;
$$;

grant execute on function public.import_material_master_excel_v52_48_5_44_133(jsonb, text)
  to authenticated;

commit;
