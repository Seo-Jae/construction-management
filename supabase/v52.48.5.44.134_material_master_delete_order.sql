-- v52.48.5.44.134
-- 자재마스터 명시적 삭제·표시순서 변경
-- Supabase SQL Editor에서 1회 실행

begin;

alter table public.material_master_items
  add column if not exists display_order integer not null default 1000;

-- 최초 적용 때만 현재 자재의 안정적인 정렬 순서로 표시순서를 초기화합니다.
-- 이미 사용자가 저장한 순서가 있으면 재실행해도 덮어쓰지 않습니다.
do $$
begin
  if exists (select 1 from public.material_master_items)
     and not exists (
       select 1
       from public.material_master_items
       where display_order <> 1000
     ) then
    with ranked as (
      select
        id,
        row_number() over (
          order by
            coalesce(process_name, ''),
            coalesce(main_sort_order, 100),
            standard_name,
            id
        ) as row_no
      from public.material_master_items
    )
    update public.material_master_items material_row
       set display_order = (ranked.row_no * 10)::integer
      from ranked
     where ranked.id = material_row.id;
  end if;
end;
$$;

create index if not exists material_master_items_display_order_idx
  on public.material_master_items (is_active, display_order, standard_name);

-- UI 단건 등록과 Excel 신규 등록 모두 현재 목록의 마지막 순서에 추가합니다.
create or replace function public.set_material_master_display_order_v52_48_5_44_134()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_order is null or new.display_order = 1000 then
    select coalesce(max(material_row.display_order), 0) + 10
      into new.display_order
      from public.material_master_items material_row;
  end if;
  return new;
end;
$$;

drop trigger if exists material_master_display_order_v52_48_5_44_134
  on public.material_master_items;
create trigger material_master_display_order_v52_48_5_44_134
before insert on public.material_master_items
for each row
execute function public.set_material_master_display_order_v52_48_5_44_134();

create or replace function public.save_material_master_order_v52_48_5_44_134(
  p_ordered_ids uuid[],
  p_updated_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_count integer := 0;
  v_input_count integer := 0;
  v_distinct_count integer := 0;
  v_updated_count integer := 0;
begin
  v_input_count := coalesce(cardinality(p_ordered_ids), 0);
  if v_input_count = 0 then
    raise exception '저장할 자재 순서가 없습니다.';
  end if;

  select count(*)::integer
    into v_active_count
    from public.material_master_items
   where is_active = true;

  select count(distinct material_id)::integer
    into v_distinct_count
    from unnest(p_ordered_ids) as selected(material_id)
   where material_id is not null;

  if v_input_count <> v_distinct_count then
    raise exception '중복되거나 비어 있는 자재가 포함되어 있습니다.';
  end if;

  if v_input_count <> v_active_count
     or exists (
       select 1
       from public.material_master_items material_row
       where material_row.is_active = true
         and not (material_row.id = any(p_ordered_ids))
     )
     or exists (
       select 1
       from unnest(p_ordered_ids) as selected(material_id)
       left join public.material_master_items material_row
         on material_row.id = selected.material_id
        and material_row.is_active = true
       where material_row.id is null
     ) then
    raise exception '전체 자재 목록이 변경되었습니다. 새로고침 후 다시 순서를 변경해주세요.';
  end if;

  with ordered as (
    select material_id, position
    from unnest(p_ordered_ids) with ordinality
      as selected(material_id, position)
  )
  update public.material_master_items material_row
     set display_order = (ordered.position * 10)::integer,
         updated_by = p_updated_by,
         updated_at = now()
    from ordered
   where material_row.id = ordered.material_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_active_count then
    raise exception '일부 자재의 순서를 저장하지 못했습니다.';
  end if;

  return jsonb_build_object(
    'updated', v_updated_count,
    'total', v_active_count
  );
end;
$$;

create or replace function public.delete_material_master_items_v52_48_5_44_134(
  p_ids uuid[],
  p_updated_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_input_count integer := 0;
  v_distinct_count integer := 0;
  v_deleted_count integer := 0;
  v_deactivated_count integer := 0;
  v_has_reference boolean := false;
begin
  v_input_count := coalesce(cardinality(p_ids), 0);
  if v_input_count = 0 then
    raise exception '삭제할 자재를 선택해주세요.';
  end if;

  select count(distinct material_id)::integer
    into v_distinct_count
    from unnest(p_ids) as selected(material_id)
   where material_id is not null;

  if v_input_count <> v_distinct_count then
    raise exception '중복되거나 비어 있는 자재가 포함되어 있습니다.';
  end if;

  foreach v_id in array p_ids
  loop
    if not exists (
      select 1
      from public.material_master_items material_row
      where material_row.id = v_id
        and material_row.is_active = true
    ) then
      raise exception '이미 삭제되었거나 찾을 수 없는 자재가 포함되어 있습니다.';
    end if;

    v_has_reference :=
      exists (
        select 1
        from public.material_supply_order_items order_item
        where order_item.material_id = v_id
      )
      or exists (
        select 1
        from public.material_project_materials project_material
        where project_material.material_id = v_id
      );

    if v_has_reference then
      update public.material_master_items
         set is_active = false,
             is_main_material = false,
             updated_by = p_updated_by,
             updated_at = now()
       where id = v_id;
      v_deactivated_count := v_deactivated_count + 1;
    else
      begin
        delete from public.material_master_items
         where id = v_id;
        v_deleted_count := v_deleted_count + 1;
      exception
        when foreign_key_violation then
          -- 예기치 않은 다른 참조가 있어도 과거 자료를 손상시키지 않습니다.
          update public.material_master_items
             set is_active = false,
                 is_main_material = false,
                 updated_by = p_updated_by,
                 updated_at = now()
           where id = v_id;
          v_deactivated_count := v_deactivated_count + 1;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'deleted', v_deleted_count,
    'deactivated', v_deactivated_count,
    'total', v_deleted_count + v_deactivated_count
  );
end;
$$;

grant execute on function public.save_material_master_order_v52_48_5_44_134(uuid[], text)
  to authenticated;
grant execute on function public.delete_material_master_items_v52_48_5_44_134(uuid[], text)
  to authenticated;

commit;
