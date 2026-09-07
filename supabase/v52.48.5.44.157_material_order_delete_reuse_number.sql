-- v52.48.5.44.157
-- 삭제 후 남은 발주번호 기준 재발급
-- 선행: v52.48.5.44.156
-- Supabase SQL Editor에서 1회 실행

begin;

create or replace function public.next_material_supply_order_no(
  p_project_name text,
  p_order_date date
)
returns text
language plpgsql
security invoker
as $$
declare
  v_order_date date := coalesce(p_order_date, current_date);
  v_order_day text := to_char(v_order_date, 'YYYYMMDD');
  v_prefix text := to_char(v_order_date, 'YYMMDD');
  v_next integer;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_project_name) || ':' || v_order_day));

  select coalesce(max((substring(order_row.order_no from '-([0-9]+)$'))::integer), 0) + 1
    into v_next
    from public.material_supply_orders order_row
   where order_row.project_name = trim(p_project_name)
     and order_row.status <> 'draft'
     and order_row.order_date = v_order_date
     and order_row.order_no ~ ('^' || v_prefix || '-[0-9]+$');

  insert into public.material_supply_order_sequence (
    project_name,
    year_month,
    last_no,
    updated_at
  )
  values (
    trim(p_project_name),
    v_order_day,
    v_next,
    now()
  )
  on conflict (project_name, year_month)
  do update set
    last_no = excluded.last_no,
    updated_at = now();

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
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
  v_order_date date := coalesce(p_order_date, current_date);
  v_prefix text := to_char(v_order_date, 'YYMMDD');
  v_next integer;
begin
  if nullif(trim(p_project_name), '') is null then
    raise exception 'project name is required';
  end if;

  select coalesce(max((substring(order_row.order_no from '-([0-9]+)$'))::integer), 0) + 1
    into v_next
    from public.material_supply_orders order_row
   where order_row.project_name = trim(p_project_name)
     and order_row.status <> 'draft'
     and order_row.order_date = v_order_date
     and order_row.order_no ~ ('^' || v_prefix || '-[0-9]+$');

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function public.next_material_supply_order_no(text, date)
  to authenticated;
grant execute on function public.preview_material_supply_order_no(text, date)
  to authenticated;

commit;
