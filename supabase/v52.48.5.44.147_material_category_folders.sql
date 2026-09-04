-- v52.48.5.44.147
-- 자재발주 자재분류별 사용자 하위 폴더
-- Supabase SQL Editor에서 1회 직접 실행

begin;

create table if not exists public.material_supply_category_folders (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null
    references public.material_supply_categories(id)
    on update cascade
    on delete cascade,
  name text not null check (nullif(btrim(name), '') is not null),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_supply_category_folders_category
  on public.material_supply_category_folders(category_id, sort_order, name);

create unique index if not exists uq_material_supply_category_folders_name
  on public.material_supply_category_folders(category_id, lower(btrim(name)));

insert into public.material_supply_category_folders (
  category_id,
  name,
  sort_order
)
select
  category_row.id,
  folder_row.name,
  folder_row.sort_order
from public.material_supply_categories category_row
cross join (
  values
    ('경량벽체', 10),
    ('단열', 20),
    ('합지', 30),
    ('세대천정', 40),
    ('공용부천정', 50),
    ('몰딩', 60),
    ('걸레받이', 70),
    ('수장', 80)
) as folder_row(name, sort_order)
where category_row.name = '각 공정자재'
on conflict do nothing;

drop trigger if exists trg_material_supply_category_folders_touch
  on public.material_supply_category_folders;
create trigger trg_material_supply_category_folders_touch
before update on public.material_supply_category_folders
for each row execute function public.material_supply_touch_updated_at();

alter table public.material_supply_category_folders enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'material_supply_category_folders'
      and policyname = 'material_supply_category_folders_authenticated_all'
  ) then
    create policy material_supply_category_folders_authenticated_all
      on public.material_supply_category_folders
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

grant select, insert, update, delete
  on public.material_supply_category_folders
  to authenticated;

comment on table public.material_supply_category_folders is
  '자재발주 자재분류별 사용자 정의 하위 폴더';

commit;

notify pgrst, 'reload schema';
