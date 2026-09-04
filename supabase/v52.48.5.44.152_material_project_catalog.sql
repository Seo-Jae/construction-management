-- v52.48.5.44.152
-- 자재발주 현장 전용 자재 ID / 직접입력 재사용 / 발주확정 누계
-- 선행: v120, v122, v131, v147 SQL
-- Supabase SQL Editor에서 1회 직접 실행

begin;

create or replace function public.material_supply_project_item_key(
  p_category_id uuid,
  p_process_name text,
  p_standard_name text,
  p_specification text,
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
    regexp_replace(lower(trim(coalesce(p_unit, ''))), '\s+', ' ', 'g')
  );
$$;

create table if not exists public.material_supply_project_items (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  material_id uuid references public.material_master_items(id) on update cascade on delete set null,
  category_id uuid references public.material_supply_categories(id) on update cascade on delete set null,
  process_name text,
  standard_name text not null,
  specification text,
  unit text,
  identity_key text not null,
  search_text text not null default '',
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_name, identity_key)
);

create index if not exists idx_material_supply_project_items_project
  on public.material_supply_project_items(project_name, is_active, category_id, process_name);

create index if not exists idx_material_supply_project_items_search
  on public.material_supply_project_items using gin (search_text gin_trgm_ops);

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
    new.unit
  );
  new.search_text := lower(
    concat_ws(
      ' ',
      coalesce(new.standard_name, ''),
      coalesce(new.specification, ''),
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
before insert or update of category_id, process_name, standard_name, specification, unit, identity_key, search_text
on public.material_supply_project_items
for each row execute function public.material_supply_project_items_fill_fields();

alter table public.material_supply_order_items
  add column if not exists project_material_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_supply_order_items_project_material_id_fkey'
      and conrelid = 'public.material_supply_order_items'::regclass
  ) then
    alter table public.material_supply_order_items
      add constraint material_supply_order_items_project_material_id_fkey
      foreign key (project_material_id)
      references public.material_supply_project_items(id)
      on update cascade
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_material_supply_order_items_project_material
  on public.material_supply_order_items(project_material_id);

-- 기존 직접입력 행에 폴더명이 비어 있으면 발주서의 선택 폴더를 승계합니다.
update public.material_supply_order_items i
set process_name = o.process_name
from public.material_supply_orders o
where o.id = i.order_id
  and nullif(trim(coalesce(i.process_name, '')), '') is null
  and nullif(trim(coalesce(o.process_name, '')), '') is not null;

-- 기존 발주 품목도 현장·분류·폴더·품명·규격·단위 기준으로 현장 자재 ID를 생성합니다.
insert into public.material_supply_project_items (
  project_name,
  material_id,
  category_id,
  process_name,
  standard_name,
  specification,
  unit,
  identity_key,
  created_by,
  updated_by
)
select distinct on (o.project_name, item_key.identity_key)
  o.project_name,
  i.material_id,
  i.category_id,
  i.process_name,
  i.standard_name,
  i.specification,
  i.unit,
  item_key.identity_key,
  o.created_by,
  o.updated_by
from public.material_supply_order_items i
join public.material_supply_orders o
  on o.id = i.order_id
cross join lateral (
  select public.material_supply_project_item_key(
    i.category_id,
    i.process_name,
    i.standard_name,
    i.specification,
    i.unit
  ) as identity_key
) item_key
where nullif(trim(i.standard_name), '') is not null
order by
  o.project_name,
  item_key.identity_key,
  (i.material_id is not null) desc,
  i.created_at asc
on conflict (project_name, identity_key)
do update set
  material_id = coalesce(
    public.material_supply_project_items.material_id,
    excluded.material_id
  ),
  updated_at = now();

update public.material_supply_order_items i
set project_material_id = project_item.id
from public.material_supply_orders o,
     public.material_supply_project_items project_item
where o.id = i.order_id
  and project_item.project_name = o.project_name
  and project_item.identity_key = public.material_supply_project_item_key(
    i.category_id,
    i.process_name,
    i.standard_name,
    i.specification,
    i.unit
  )
  and i.project_material_id is null;

create or replace function public.resolve_material_supply_project_item(
  p_project_name text,
  p_material_id uuid,
  p_category_id uuid,
  p_process_name text,
  p_standard_name text,
  p_specification text,
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
    p_unit
  );

  insert into public.material_supply_project_items (
    project_name,
    material_id,
    category_id,
    process_name,
    standard_name,
    specification,
    unit,
    identity_key,
    created_by,
    updated_by
  )
  values (
    trim(p_project_name),
    p_material_id,
    p_category_id,
    nullif(trim(coalesce(p_process_name, '')), ''),
    trim(p_standard_name),
    nullif(trim(coalesce(p_specification, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_identity_key,
    p_updated_by,
    p_updated_by
  )
  on conflict (project_name, identity_key)
  do update set
    material_id = coalesce(
      public.material_supply_project_items.material_id,
      excluded.material_id
    ),
    category_id = excluded.category_id,
    process_name = excluded.process_name,
    standard_name = excluded.standard_name,
    specification = excluded.specification,
    unit = excluded.unit,
    is_active = true,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_project_material_id;

  return v_project_material_id;
end;
$$;

alter table public.material_supply_orders
  add column if not exists ordered_at timestamptz;

alter table public.material_supply_orders
  drop constraint if exists material_supply_orders_status_check;

alter table public.material_supply_orders
  add constraint material_supply_orders_status_check
  check (status in ('draft', 'ordered', 'confirmed', 'cancelled'));

drop view if exists public.material_supply_cumulative;
create view public.material_supply_cumulative as
select
  o.project_name,
  i.project_material_id,
  max(i.material_id::text)::uuid as material_id,
  sum(i.current_order_quantity)::numeric(18,4) as cumulative_order_quantity
from public.material_supply_orders o
join public.material_supply_order_items i
  on i.order_id = o.id
where o.status in ('ordered', 'confirmed')
  and i.project_material_id is not null
group by o.project_name, i.project_material_id;

-- 기존 최고관리자 테스트 초기화에도 현장 자재목록을 포함합니다.
create or replace function public.admin_reset_material_order_test_v1(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_role text := '';
  v_deleted_orders integer := 0;
  v_deleted_order_items integer := 0;
  v_deleted_sequences integer := 0;
  v_deleted_project_settings integer := 0;
  v_deleted_project_materials integer := 0;
  v_deleted_project_catalog integer := 0;
  v_deleted_setting_history integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(role, '')
    into v_role
    from public.user_profiles
   where auth_user_id = auth.uid()
     and coalesce(account_status, '') <> 'disabled'
   limit 1;

  if v_role <> '최고관리자' then
    raise exception '자재발주 테스트 초기화는 최고관리자만 가능합니다.';
  end if;

  if v_project_name = '' then
    raise exception '초기화할 현장명이 없습니다.';
  end if;

  select count(*)::integer
    into v_deleted_orders
    from public.material_supply_orders
   where project_name = v_project_name;

  select count(*)::integer
    into v_deleted_order_items
    from public.material_supply_order_items i
    join public.material_supply_orders o on o.id = i.order_id
   where o.project_name = v_project_name;

  delete from public.material_supply_orders
   where project_name = v_project_name;

  delete from public.material_supply_project_items
   where project_name = v_project_name;
  get diagnostics v_deleted_project_catalog = row_count;

  delete from public.material_supply_order_sequence
   where project_name = v_project_name;
  get diagnostics v_deleted_sequences = row_count;

  delete from public.material_order_setting_history
   where project_name = v_project_name;
  get diagnostics v_deleted_setting_history = row_count;

  delete from public.material_order_project_settings
   where project_name = v_project_name;
  get diagnostics v_deleted_project_settings = row_count;

  delete from public.material_project_materials
   where project_name = v_project_name;
  get diagnostics v_deleted_project_materials = row_count;

  return jsonb_build_object(
    'project_name', v_project_name,
    'deleted_orders', v_deleted_orders,
    'deleted_order_items', v_deleted_order_items,
    'deleted_project_catalog', v_deleted_project_catalog,
    'deleted_sequences', v_deleted_sequences,
    'deleted_project_settings', v_deleted_project_settings,
    'deleted_project_materials', v_deleted_project_materials,
    'deleted_setting_history', v_deleted_setting_history,
    'kept_material_master', true,
    'kept_material_categories', true
  );
end;
$$;

create or replace function public.material_supply_project_catalog_ready_v52_48_5_44_152()
returns boolean
language sql
stable
security invoker
as $$
  select
    to_regclass('public.material_supply_project_items') is not null
    and exists (
      select 1
      from pg_attribute
      where attrelid = 'public.material_supply_order_items'::regclass
        and attname = 'project_material_id'
        and not attisdropped
    );
$$;

alter table public.material_supply_project_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'material_supply_project_items'
      and policyname = 'material_supply_project_items_authenticated_all'
  ) then
    create policy material_supply_project_items_authenticated_all
      on public.material_supply_project_items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

grant select, insert, update, delete
  on public.material_supply_project_items
  to authenticated;
grant select on public.material_supply_cumulative to authenticated;
grant execute on function public.material_supply_project_item_key(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.resolve_material_supply_project_item(text, uuid, uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.material_supply_project_catalog_ready_v52_48_5_44_152()
  to authenticated;
revoke all on function public.admin_reset_material_order_test_v1(text)
  from public;
grant execute on function public.admin_reset_material_order_test_v1(text)
  to authenticated;

commit;
