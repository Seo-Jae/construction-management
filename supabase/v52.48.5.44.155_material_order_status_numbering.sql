-- v52.48.5.44.155
-- 자재발주서 작성중 번호와 발주확정 번호 분리
-- 선행: v52.48.5.44.152, v52.48.5.44.154
-- Supabase SQL Editor에서 1회 직접 실행

begin;

-- 작성중 발주서는 같은 임시 번호를 가질 수 있도록 기존 전체 unique 제약을 제거합니다.
alter table public.material_supply_orders
  alter column order_no drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.material_supply_orders'::regclass
      and conname = 'material_supply_orders_project_name_order_no_key'
  ) then
    alter table public.material_supply_orders
      drop constraint material_supply_orders_project_name_order_no_key;
  end if;
end;
$$;

-- 발주완료/결재요청/취소 문서만 현장별 발주번호를 고유하게 유지합니다.
create unique index if not exists idx_material_supply_orders_final_order_no
  on public.material_supply_orders(project_name, order_no)
  where status <> 'draft' and order_no is not null;

-- 과거 작성중 문서가 소비했던 번호를 발주완료 문서 기준으로 보정합니다.
update public.material_supply_order_sequence sequence_row
set last_no = coalesce(
  (
    select max((substring(order_row.order_no from '-([0-9]+)$'))::integer)
    from public.material_supply_orders order_row
    where order_row.project_name = sequence_row.project_name
      and order_row.status <> 'draft'
      and order_row.order_no ~ ('^' || right(sequence_row.year_month, 4) || '-[0-9]+$')
  ),
  0
);

-- 작성중 문서가 표시할 다음 임시 번호를 조회합니다.
-- 이 함수는 sequence를 증가시키지 않으므로 여러 작성중 문서가 같은 번호를 표시할 수 있습니다.
create or replace function public.preview_material_supply_order_no(
  p_project_name text,
  p_order_date date
)
returns text
language plpgsql
security invoker
as $$
declare
  v_year_month text;
  v_next integer;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;

  v_year_month := to_char(coalesce(p_order_date, current_date), 'YYYYMM');
  select coalesce(last_no, 0) + 1
    into v_next
    from public.material_supply_order_sequence
   where project_name = p_project_name
     and year_month = v_year_month;

  return to_char(coalesce(p_order_date, current_date), 'YYMM')
    || '-'
    || lpad(coalesce(v_next, 1)::text, 3, '0');
end;
$$;

grant execute on function public.preview_material_supply_order_no(text, date)
  to authenticated;

commit;
