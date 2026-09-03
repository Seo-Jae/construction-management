-- v52.48.5.44.131
-- 자재발주 품목 엑셀형 직접입력 지원
-- Supabase SQL Editor에서 1회 실행

begin;

-- 직접 입력한 발주 품목은 자재마스터를 새로 만들지 않고도 저장할 수 있습니다.
alter table public.material_supply_order_items
  alter column material_id drop not null;

-- 같은 마스터 자재도 현장별 규격을 달리하여 여러 행으로 발주할 수 있습니다.
alter table public.material_supply_order_items
  drop constraint if exists material_supply_order_items_order_id_material_id_key;

-- 누계는 자재마스터와 연결된 행만 자재별로 집계합니다.
-- 직접 입력 행은 해당 발주서에는 보존되지만 다른 발주서의 마스터 누계에는 합산하지 않습니다.
create or replace view public.material_supply_cumulative as
select
  o.project_name,
  i.material_id,
  sum(i.current_order_quantity)::numeric(18,4) as cumulative_order_quantity
from public.material_supply_orders o
join public.material_supply_order_items i
  on i.order_id = o.id
where o.status = 'confirmed'
  and i.material_id is not null
group by o.project_name, i.material_id;

grant select on public.material_supply_cumulative to authenticated;

comment on column public.material_supply_order_items.material_id is
  '자재마스터 힌트를 선택한 경우 연결되는 선택값. 발주서 직접입력 행은 NULL 허용.';

-- 프런트엔드가 기존 발주 품목을 지우기 전에 v131 DB 적용 여부를 안전하게 확인합니다.
create or replace function public.material_order_free_rows_ready_v52_48_5_44_131()
returns boolean
language sql
stable
security invoker
as $$
  select
    exists (
      select 1
      from pg_attribute
      where attrelid = 'public.material_supply_order_items'::regclass
        and attname = 'material_id'
        and not attnotnull
        and not attisdropped
    )
    and not exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.material_supply_order_items'::regclass
        and constraint_row.contype = 'u'
        and pg_get_constraintdef(constraint_row.oid) ilike '%(order_id, material_id)%'
    );
$$;

grant execute on function public.material_order_free_rows_ready_v52_48_5_44_131()
  to authenticated;

commit;
