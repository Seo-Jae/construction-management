-- v52.48.5.44.156
-- 자재발주서 일자별 발주번호(YYMMDD-001) 적용
-- 선행: v52.48.5.44.155
-- Supabase SQL Editor에서 1회 직접 실행

begin;

-- 기존 발주서는 유지하고, 새로 발급되는 번호부터 일자별 sequence를 사용합니다.
create or replace function public.next_material_supply_order_no(
  p_project_name text,
  p_order_date date
)
returns text
language plpgsql
security invoker
as $$
declare
  v_order_day text;
  v_next integer;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;

  v_order_day := to_char(coalesce(p_order_date, current_date), 'YYYYMMDD');

  insert into public.material_supply_order_sequence (
    project_name,
    year_month,
    last_no,
    updated_at
  )
  values (
    p_project_name,
    v_order_day,
    1,
    now()
  )
  on conflict (project_name, year_month)
  do update set
    last_no = public.material_supply_order_sequence.last_no + 1,
    updated_at = now()
  returning last_no into v_next;

  return to_char(coalesce(p_order_date, current_date), 'YYMMDD')
    || '-'
    || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.preview_material_supply_order_no(
  p_project_name text,
  p_order_date date
)
returns text
language plpgsql
security invoker
as $$
declare
  v_order_day text;
  v_next integer;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;

  v_order_day := to_char(coalesce(p_order_date, current_date), 'YYYYMMDD');
  select coalesce(last_no, 0) + 1
    into v_next
    from public.material_supply_order_sequence
   where project_name = p_project_name
     and year_month = v_order_day;

  return to_char(coalesce(p_order_date, current_date), 'YYMMDD')
    || '-'
    || lpad(coalesce(v_next, 1)::text, 3, '0');
end;
$$;

grant execute on function public.next_material_supply_order_no(text, date)
  to authenticated;
grant execute on function public.preview_material_supply_order_no(text, date)
  to authenticated;

commit;
