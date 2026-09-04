-- v52.48.5.44.146
-- '각 공정 잡자재'를 '각 공정자재'로 통합한 뒤 기존 분류를 안전하게 삭제합니다.
-- Supabase SQL Editor에서 1회 직접 실행하세요.

begin;

do $$
declare
  v_source_id uuid;
  v_target_id uuid;
begin
  select id
    into v_source_id
    from public.material_supply_categories
   where name = '각 공정 잡자재'
   limit 1;

  if v_source_id is null then
    raise notice '각 공정 잡자재 분류가 없어 처리하지 않았습니다.';
    return;
  end if;

  select id
    into v_target_id
    from public.material_supply_categories
   where name = '각 공정자재'
   limit 1;

  if v_target_id is null then
    raise exception '통합 대상인 각 공정자재 분류를 찾을 수 없습니다.';
  end if;

  update public.material_master_items
     set category_id = v_target_id,
         updated_at = now()
   where category_id = v_source_id;

  update public.material_supply_orders
     set category_id = v_target_id,
         updated_at = now()
   where category_id = v_source_id;

  update public.material_supply_order_items
     set category_id = v_target_id
   where category_id = v_source_id;

  delete from public.material_supply_categories
   where id = v_source_id;
end;
$$;

commit;
