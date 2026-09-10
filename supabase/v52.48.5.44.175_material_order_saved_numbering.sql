-- Supabase SQL Editor에서 직접 실행하세요. 선행: v52.48.5.44.157
-- 최초 저장부터 현장/발주일별 번호를 예약합니다. 확정 문서 번호는 변경하지 않습니다.
-- 중복/빈 번호/날짜 불일치가 있는 날의 작성중 문서만 생성순으로 재번호합니다.
-- 해당 날짜의 확정 문서가 없으면 001부터, 있으면 확정 번호의 최댓값 다음부터 시작합니다.
-- 삭제나 저장 실패로 사용하지 않게 된 번호는 재사용하지 않습니다.
begin;

lock table public.material_supply_orders in share row exclusive mode;
lock table public.material_supply_order_sequence in share row exclusive mode;

with affected_days as (
  select project_name, order_date
  from public.material_supply_orders
  group by project_name, order_date
  having count(*) > count(distinct order_no)
     or bool_or(status = 'draft' and (
       order_no is null or order_no !~ ('^' || to_char(order_date, 'YYMMDD') || '-[0-9]+$')
     ))
), numbered_drafts as (
  select o.id,
    to_char(o.order_date, 'YYMMDD') as prefix,
    coalesce((
      select max(substring(f.order_no from '-([0-9]+)$')::bigint)
      from public.material_supply_orders f
      where f.project_name = o.project_name and f.order_date = o.order_date
        and f.status <> 'draft'
        and f.order_no ~ ('^' || to_char(o.order_date, 'YYMMDD') || '-[0-9]+$')
    ), 0) + row_number() over (
      partition by o.project_name, o.order_date order by o.created_at, o.id
    ) as number
  from public.material_supply_orders o
  join affected_days d using (project_name, order_date)
  where o.status = 'draft'
)
update public.material_supply_orders o
set order_no = n.prefix || '-' || lpad(n.number::text, greatest(3, length(n.number::text)), '0')
from numbered_drafts n
where o.id = n.id;

-- DB에서도 모든 상태의 번호 중복을 막고 기존 확정번호 인덱스는 유지합니다.
create unique index if not exists idx_material_supply_orders_saved_order_no
  on public.material_supply_orders(project_name, order_no)
  where order_no is not null;

create or replace function public.reserve_material_supply_order_no_v175(
  p_project_name text,
  p_order_date date
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_date date := coalesce(p_order_date, current_date);
  v_project text := trim(p_project_name);
  v_prefix text := to_char(v_date, 'YYMMDD');
  v_existing integer;
  v_next integer;
begin
  if nullif(v_project, '') is null then
    raise exception 'project name is required';
  end if;

  select coalesce(max(substring(o.order_no from '-([0-9]+)$')::integer), 0)
  into v_existing
  from public.material_supply_orders o
  where o.project_name = v_project and o.order_date = v_date
    and o.order_no ~ ('^' || v_prefix || '-[0-9]+$');

  -- 동시에 저장해도 같은 순번 행을 원자적으로 갱신해 별도 번호를 예약합니다. 기존 RLS를 적용합니다.
  insert into public.material_supply_order_sequence(project_name, year_month, last_no, updated_at)
  values (v_project, to_char(v_date, 'YYYYMMDD'), v_existing + 1, now())
  on conflict (project_name, year_month) do update
  set last_no = greatest(public.material_supply_order_sequence.last_no, v_existing) + 1,
      updated_at = now()
  returning last_no into v_next;

  return v_prefix || '-' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
end;
$$;

revoke all on function public.reserve_material_supply_order_no_v175(text, date) from public;
grant execute on function public.reserve_material_supply_order_no_v175(text, date) to authenticated;

-- 이전 화면의 확정 처리도 예약된 번호와 충돌하지 않도록 기존 API의 채번을 통일합니다.
create or replace function public.next_material_supply_order_no(p_project_name text, p_order_date date)
returns text
language sql
security invoker
set search_path = public
as $$
  select public.reserve_material_supply_order_no_v175(p_project_name, p_order_date);
$$;

commit;

-- 실행 후 확인용: 중복이 없으면 0행입니다.
select project_name, order_no, count(*)
from public.material_supply_orders
where order_no is not null
group by project_name, order_no
having count(*) > 1;
