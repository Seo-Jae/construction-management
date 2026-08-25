-- v52.48.5.17 자재관리 > 일위대가작성
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.

create extension if not exists pgcrypto;

create table if not exists public.unit_price_materials (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  specification text not null default '',
  unit text not null default '',
  current_unit_price numeric(18,4) not null default 0,
  effective_date date not null default current_date,
  price_note text not null default '',
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_price_materials_natural_key unique (item_name, specification, unit)
);

create table if not exists public.unit_price_specs (
  id uuid primary key default gen_random_uuid(),
  major_category text not null check (major_category in ('벽체', '천정')),
  middle_category text not null,
  detail_category text not null,
  image_key text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_price_specs_natural_key unique (
    major_category,
    middle_category,
    detail_category
  )
);

create table if not exists public.unit_price_spec_items (
  id uuid primary key default gen_random_uuid(),
  spec_id uuid not null references public.unit_price_specs(id) on delete cascade,
  material_id uuid references public.unit_price_materials(id) on delete set null,
  cost_type text not null default 'material'
    check (cost_type in ('material', 'labor', 'expense')),
  item_name text not null,
  specification text not null default '',
  unit text not null default '',
  net_quantity numeric(18,6) not null default 0,
  unit_conversion_factor numeric(18,6) not null default 1,
  unit_price_override numeric(18,4),
  sort_order integer not null default 0,
  remarks text not null default '',
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_price_spec_items_order_key unique (spec_id, sort_order)
);

create table if not exists public.unit_price_documents (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  document_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'archived')),
  spec_id uuid references public.unit_price_specs(id) on delete set null,
  major_category text not null,
  middle_category text not null,
  detail_category text not null,
  material_markup_percent numeric(10,4) not null default 0,
  labor_markup_percent numeric(10,4) not null default 0,
  expense_markup_percent numeric(10,4) not null default 0,
  image_url text not null default '',
  notes text not null default '',
  version_no integer not null default 1,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unit_price_document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.unit_price_documents(id) on delete cascade,
  source_template_item_id uuid references public.unit_price_spec_items(id) on delete set null,
  material_id uuid references public.unit_price_materials(id) on delete set null,
  item_code text not null default '',
  cost_type text not null default 'material'
    check (cost_type in ('material', 'labor', 'expense')),
  item_name text not null,
  specification text not null default '',
  unit text not null default '',
  net_quantity numeric(18,6) not null default 0,
  net_unit_price numeric(18,4) not null default 0,
  markup_override_percent numeric(10,4),
  submitted_quantity numeric(18,6) not null default 0,
  remarks text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_price_document_items_order_key unique (document_id, sort_order)
);

create table if not exists public.unit_price_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.unit_price_documents(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint unit_price_document_revisions_version_key unique (document_id, version_no)
);

create table if not exists public.unit_price_price_history (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.unit_price_materials(id) on delete cascade,
  old_unit_price numeric(18,4) not null default 0,
  new_unit_price numeric(18,4) not null default 0,
  effective_date date not null,
  note text not null default '',
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_unit_price_specs_category
  on public.unit_price_specs (major_category, middle_category, detail_category);
create index if not exists idx_unit_price_spec_items_spec
  on public.unit_price_spec_items (spec_id, sort_order);
create index if not exists idx_unit_price_documents_project
  on public.unit_price_documents (project_name, updated_at desc);
create index if not exists idx_unit_price_document_items_document
  on public.unit_price_document_items (document_id, sort_order);
create index if not exists idx_unit_price_price_history_material
  on public.unit_price_price_history (material_id, effective_date desc);

create or replace function public.touch_unit_price_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_touch_unit_price_materials on public.unit_price_materials;
create trigger trg_touch_unit_price_materials
before update on public.unit_price_materials
for each row execute function public.touch_unit_price_updated_at();

drop trigger if exists trg_touch_unit_price_specs on public.unit_price_specs;
create trigger trg_touch_unit_price_specs
before update on public.unit_price_specs
for each row execute function public.touch_unit_price_updated_at();

drop trigger if exists trg_touch_unit_price_spec_items on public.unit_price_spec_items;
create trigger trg_touch_unit_price_spec_items
before update on public.unit_price_spec_items
for each row execute function public.touch_unit_price_updated_at();

drop trigger if exists trg_touch_unit_price_documents on public.unit_price_documents;
create trigger trg_touch_unit_price_documents
before update on public.unit_price_documents
for each row execute function public.touch_unit_price_updated_at();

create or replace function public.save_unit_price_document(
  p_document jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document_id uuid;
  v_version integer;
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_document_id := nullif(p_document ->> 'id', '')::uuid;

  if v_document_id is null then
    insert into public.unit_price_documents (
      project_name,
      document_name,
      status,
      spec_id,
      major_category,
      middle_category,
      detail_category,
      material_markup_percent,
      labor_markup_percent,
      expense_markup_percent,
      image_url,
      notes,
      version_no,
      created_by,
      updated_by
    ) values (
      p_document ->> 'project_name',
      p_document ->> 'document_name',
      coalesce(nullif(p_document ->> 'status', ''), 'draft'),
      nullif(p_document ->> 'spec_id', '')::uuid,
      p_document ->> 'major_category',
      p_document ->> 'middle_category',
      p_document ->> 'detail_category',
      coalesce((p_document ->> 'material_markup_percent')::numeric, 0),
      coalesce((p_document ->> 'labor_markup_percent')::numeric, 0),
      coalesce((p_document ->> 'expense_markup_percent')::numeric, 0),
      coalesce(p_document ->> 'image_url', ''),
      coalesce(p_document ->> 'notes', ''),
      1,
      auth.uid(),
      auth.uid()
    ) returning id, version_no into v_document_id, v_version;
  else
    update public.unit_price_documents
       set project_name = p_document ->> 'project_name',
           document_name = p_document ->> 'document_name',
           status = coalesce(nullif(p_document ->> 'status', ''), 'draft'),
           spec_id = nullif(p_document ->> 'spec_id', '')::uuid,
           major_category = p_document ->> 'major_category',
           middle_category = p_document ->> 'middle_category',
           detail_category = p_document ->> 'detail_category',
           material_markup_percent = coalesce((p_document ->> 'material_markup_percent')::numeric, 0),
           labor_markup_percent = coalesce((p_document ->> 'labor_markup_percent')::numeric, 0),
           expense_markup_percent = coalesce((p_document ->> 'expense_markup_percent')::numeric, 0),
           image_url = coalesce(p_document ->> 'image_url', ''),
           notes = coalesce(p_document ->> 'notes', ''),
           version_no = version_no + 1,
           updated_by = auth.uid(),
           updated_at = now()
     where id = v_document_id
     returning version_no into v_version;

    if v_version is null then
      raise exception '수정할 일위대가 문서를 찾을 수 없습니다.';
    end if;

    delete from public.unit_price_document_items
     where document_id = v_document_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.unit_price_document_items (
      document_id,
      source_template_item_id,
      material_id,
      item_code,
      cost_type,
      item_name,
      specification,
      unit,
      net_quantity,
      net_unit_price,
      markup_override_percent,
      submitted_quantity,
      remarks,
      sort_order
    ) values (
      v_document_id,
      nullif(v_item ->> 'source_template_item_id', '')::uuid,
      nullif(v_item ->> 'material_id', '')::uuid,
      coalesce(v_item ->> 'item_code', ''),
      coalesce(nullif(v_item ->> 'cost_type', ''), 'material'),
      v_item ->> 'item_name',
      coalesce(v_item ->> 'specification', ''),
      coalesce(v_item ->> 'unit', ''),
      coalesce((v_item ->> 'net_quantity')::numeric, 0),
      coalesce((v_item ->> 'net_unit_price')::numeric, 0),
      nullif(v_item ->> 'markup_override_percent', '')::numeric,
      coalesce((v_item ->> 'submitted_quantity')::numeric, 0),
      coalesce(v_item ->> 'remarks', ''),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;

  insert into public.unit_price_document_revisions (
    document_id,
    version_no,
    snapshot,
    created_by
  ) values (
    v_document_id,
    v_version,
    jsonb_build_object('document', p_document, 'items', p_items),
    auth.uid()
  );

  return v_document_id;
end;
$$;

create or replace function public.replace_unit_price_spec_items(
  p_spec_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  delete from public.unit_price_spec_items where spec_id = p_spec_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.unit_price_spec_items (
      spec_id,
      material_id,
      cost_type,
      item_name,
      specification,
      unit,
      net_quantity,
      unit_price_override,
      sort_order,
      remarks
    ) values (
      p_spec_id,
      nullif(v_item ->> 'material_id', '')::uuid,
      coalesce(nullif(v_item ->> 'cost_type', ''), 'material'),
      v_item ->> 'item_name',
      coalesce(v_item ->> 'specification', ''),
      coalesce(v_item ->> 'unit', ''),
      coalesce((v_item ->> 'net_quantity')::numeric, 0),
      nullif(v_item ->> 'unit_price_override', '')::numeric,
      coalesce((v_item ->> 'sort_order')::integer, 0),
      coalesce(v_item ->> 'remarks', '')
    );
  end loop;
end;
$$;

create or replace function public.update_unit_price_prices(p_updates jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_update jsonb;
  v_material_id uuid;
  v_old_price numeric;
  v_new_price numeric;
  v_effective_date date;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  for v_update in
    select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    v_material_id := nullif(v_update ->> 'material_id', '')::uuid;
    v_new_price := coalesce((v_update ->> 'unit_price')::numeric, 0);
    v_effective_date := coalesce(nullif(v_update ->> 'effective_date', '')::date, current_date);

    select current_unit_price into v_old_price
      from public.unit_price_materials
     where id = v_material_id
     for update;

    if found then
      update public.unit_price_materials
         set current_unit_price = v_new_price,
             effective_date = v_effective_date,
             price_note = coalesce(v_update ->> 'note', ''),
             updated_by = auth.uid(),
             updated_at = now()
       where id = v_material_id;

      insert into public.unit_price_price_history (
        material_id,
        old_unit_price,
        new_unit_price,
        effective_date,
        note,
        changed_by
      ) values (
        v_material_id,
        coalesce(v_old_price, 0),
        v_new_price,
        v_effective_date,
        coalesce(v_update ->> 'note', ''),
        auth.uid()
      );

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.unit_price_materials to authenticated;
grant select, insert, update, delete on public.unit_price_specs to authenticated;
grant select, insert, update, delete on public.unit_price_spec_items to authenticated;
grant select, insert, update, delete on public.unit_price_documents to authenticated;
grant select, insert, update, delete on public.unit_price_document_items to authenticated;
grant select, insert, update, delete on public.unit_price_document_revisions to authenticated;
grant select, insert on public.unit_price_price_history to authenticated;
grant execute on function public.save_unit_price_document(jsonb, jsonb) to authenticated;
grant execute on function public.replace_unit_price_spec_items(uuid, jsonb) to authenticated;
grant execute on function public.update_unit_price_prices(jsonb) to authenticated;

alter table public.unit_price_materials enable row level security;
alter table public.unit_price_specs enable row level security;
alter table public.unit_price_spec_items enable row level security;
alter table public.unit_price_documents enable row level security;
alter table public.unit_price_document_items enable row level security;
alter table public.unit_price_document_revisions enable row level security;
alter table public.unit_price_price_history enable row level security;

drop policy if exists unit_price_materials_authenticated on public.unit_price_materials;
create policy unit_price_materials_authenticated on public.unit_price_materials
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_specs_authenticated on public.unit_price_specs;
create policy unit_price_specs_authenticated on public.unit_price_specs
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_spec_items_authenticated on public.unit_price_spec_items;
create policy unit_price_spec_items_authenticated on public.unit_price_spec_items
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_documents_authenticated on public.unit_price_documents;
create policy unit_price_documents_authenticated on public.unit_price_documents
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_document_items_authenticated on public.unit_price_document_items;
create policy unit_price_document_items_authenticated on public.unit_price_document_items
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_document_revisions_authenticated on public.unit_price_document_revisions;
create policy unit_price_document_revisions_authenticated on public.unit_price_document_revisions
  for all to authenticated using (true) with check (true);
drop policy if exists unit_price_price_history_authenticated on public.unit_price_price_history;
create policy unit_price_price_history_authenticated on public.unit_price_price_history
  for all to authenticated using (true) with check (true);

-- 아래부터는 기존 Excel의 벽체·천정 기준정보 초기값입니다.
-- 같은 SQL을 다시 실행해도 이미 등록된 기준정보와 사용자가 수정한 값은 덮어쓰지 않습니다.

insert into public.unit_price_specs (major_category, middle_category, detail_category, image_key, sort_order)
values
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'Clip_Bar천정', 1),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'Clip_Bar천정', 2),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'Clip_Bar천정', 3),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'Clip_Bar천정_내풍압', 4),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'SQ_Bar천정_내풍압', 5),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'MP_Bar천정_내풍압', 6),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'AL_T_PANEL천정_내풍압', 7),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'AL_겹루버_격자루버', 8),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'M_Bar천정_상가', 9),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'M_Bar천정_세대', 10),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'T_Bar천정', 11),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'TH_Bar천정', 12),
  ('벽체', 'C_STUD', 'C-STUD(30형)', 'C_STUD', 13),
  ('벽체', 'C_STUD', 'C-STUD(50형)', 'C_STUD', 14),
  ('벽체', 'C_STUD', 'C-STUD(60형)', 'C_STUD', 15),
  ('벽체', 'C_STUD', 'C-STUD(65형)', 'C_STUD', 16),
  ('벽체', 'C_STUD', 'C-STUD(70형)', 'C_STUD', 17),
  ('벽체', 'C_STUD', 'C-STUD(75형)', 'C_STUD', 18),
  ('벽체', 'C_STUD', 'C-STUD(80형)', 'C_STUD', 19),
  ('벽체', 'C_STUD', 'C-STUD(90형)', 'C_STUD', 20),
  ('벽체', 'C_STUD', 'C-STUD(100형)', 'C_STUD', 21),
  ('벽체', 'C_STUD', 'C-STUD(110형)', 'C_STUD', 22),
  ('벽체', 'C_STUD', 'C-STUD(120형)', 'C_STUD', 23),
  ('벽체', 'C_STUD', 'C-STUD(125형)', 'C_STUD', 24),
  ('벽체', 'C_STUD', 'C-STUD(130형)', 'C_STUD', 25),
  ('벽체', 'C_STUD', 'C-STUD(140형)', 'C_STUD', 26),
  ('벽체', 'C_STUD', 'C-STUD(150형)', 'C_STUD', 27),
  ('벽체', 'C_STUD', 'C-STUD(160형)', 'C_STUD', 28),
  ('벽체', 'C_STUD', 'C-STUD(170형)', 'C_STUD', 29),
  ('벽체', 'C_STUD', 'C-STUD(180형)', 'C_STUD', 30),
  ('벽체', 'C_STUD', 'C-STUD(200형)', 'C_STUD', 31),
  ('벽체', 'C_STUD', 'C-STUD(210형)', 'C_STUD', 32),
  ('벽체', 'CH_STUD', 'CH_STUD(75형)', 'CH_STUD', 33),
  ('벽체', 'CH_STUD', 'CH_STUD(92형)', 'CH_STUD', 34),
  ('벽체', 'CH_STUD', 'CH_STUD(102형)', 'CH_STUD', 35),
  ('벽체', 'CH_STUD', 'CH_STUD(127형)', 'CH_STUD', 36),
  ('벽체', 'CH_STUD', 'CH_STUD(152형)', 'CH_STUD', 37),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(75형)', 'DL_STUD_CH_12.5T', 38),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(92형)', 'DL_STUD_CH_12.5T', 39),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(102형)', 'DL_STUD_CH_12.5T', 40),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(127형)', 'DL_STUD_CH_12.5T', 41),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(152형)', 'DL_STUD_CH_12.5T', 42),
  ('벽체', 'E_STUD', 'E_STUD(64형)', 'E_STUD', 43),
  ('벽체', 'E_STUD', 'E_STUD(75형)', 'E_STUD', 44),
  ('벽체', 'E_STUD', 'E_STUD(92형)', 'E_STUD', 45),
  ('벽체', 'E_STUD', 'E_STUD(102형)', 'E_STUD', 46),
  ('벽체', 'E_STUD', 'E_STUD(125형)', 'E_STUD', 47),
  ('벽체', 'E_STUD', 'E_STUD(152형)', 'E_STUD', 48),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(60형)', 'DL_STUD_문틀보강', 49),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(65형)', 'DL_STUD_문틀보강', 50),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(75형)', 'DL_STUD_문틀보강', 51),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(80형)', 'DL_STUD_문틀보강', 52),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(90형)', 'DL_STUD_문틀보강', 53),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(100형)', 'DL_STUD_문틀보강', 54),
  ('벽체', 'W_STUD', 'W_STUD(50형)', 'W_STUD', 55),
  ('벽체', 'W_STUD', 'W_STUD(74형)', 'W_STUD', 56),
  ('벽체', 'W_STUD', 'W_STUD(90형)', 'W_STUD', 57),
  ('벽체', 'W_STUD', 'W_STUD(100형)', 'W_STUD', 58),
  ('벽체', 'W_STUD', 'W_STUD(124형)', 'W_STUD', 59),
  ('벽체', 'W_STUD', 'W_STUD(140형)', 'W_STUD', 60),
  ('벽체', 'W_STUD', 'W_STUD(150형)', 'W_STUD', 61),
  ('벽체', '시그마_STUD', '시그마_STUD(74형)', '시그마_STUD', 62),
  ('벽체', '시그마_STUD', '시그마_STUD(90형)', '시그마_STUD', 63),
  ('벽체', '시그마_STUD', '시그마_STUD(100형)', '시그마_STUD', 64),
  ('벽체', '시그마_STUD', '시그마_STUD(124형)', '시그마_STUD', 65),
  ('벽체', 'MP_STUD', 'MP_STUD(74형)', 'MP_STUD', 66),
  ('벽체', 'MP_STUD', 'MP_STUD(100형)', 'MP_STUD', 67),
  ('벽체', 'MP_STUD', 'MP_STUD(124형)', 'MP_STUD', 68),
  ('벽체', 'MP_STUD', 'MP_STUD(150형)', 'MP_STUD', 69)
on conflict (major_category, middle_category, detail_category) do nothing;

insert into public.unit_price_materials (item_code, item_name, specification, unit, current_unit_price, effective_date, price_note)
values
  ('UPM-0001', '앙카(Insert)', '9mm', 'EA', 70, current_date, ''),
  ('UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 640, current_date, ''),
  ('UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 17, current_date, ''),
  ('UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 130, current_date, ''),
  ('UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 635, current_date, ''),
  ('UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 75, current_date, ''),
  ('UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 390, current_date, ''),
  ('UPM-0008', 'Minor Channel Clip 원터치', '', 'EA', 115, current_date, ''),
  ('UPM-0009', 'Clip-Bar', '0.5T 24X35', 'M', 610, current_date, ''),
  ('UPM-0010', 'Clip-Bar Joint', '', 'EA', 75, current_date, ''),
  ('UPM-0011', 'Clip-Bar Clip( 캐링용)', '38*12', 'EA', 190, current_date, ''),
  ('UPM-0012', '판스프링', '', 'EA', 120, current_date, ''),
  ('UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 850, current_date, ''),
  ('UPM-0014', 'SQ-Bar Hanger+Pin', 'L=150', 'SET', 375, current_date, ''),
  ('UPM-0015', 'SQ-Bar (C/C용)', '0.45T 40x30', 'M', 1030, current_date, ''),
  ('UPM-0016', 'SQ-Bar Joint', '', 'EA', 120, current_date, ''),
  ('UPM-0017', 'Clip Bar Clip', 'SQ-Bar 용', 'EA', 200, current_date, ''),
  ('UPM-0018', '와샤(후렌지너트)', '각파이프고정', 'EA', 50, current_date, ''),
  ('UPM-0019', '칼라각파이프', '20*20*1.4', 'M', 1246, current_date, ''),
  ('UPM-0020', '캡볼트 (ROLL)', '', 'EA', 360, current_date, ''),
  ('UPM-0021', 'SQ-Bar (M/W용)', '0.45T 40x30', 'M', 1030, current_date, ''),
  ('UPM-0022', 'SQ-BAR Clip(신형)', 'SUS', 'EA', 240, current_date, ''),
  ('UPM-0023', '꽉몰딩 / ㄷ-몰딩', '1.0T 18*37', 'M', 1490, current_date, ''),
  ('UPM-0024', '꾹-클립 / 꽉몰딩용', '', 'EA', 100, current_date, ''),
  ('UPM-0025', 'Canotile Main Joiner (AL, 도장)', '1.0T 15X13', 'M', 1210, current_date, ''),
  ('UPM-0026', 'Canotile Cross Joiner (AL, 도장)', '1.0T 15X7', 'M', 820, current_date, ''),
  ('UPM-0027', 'Canotile Cross Joiner Clip', '15*5', 'EA', 80, current_date, ''),
  ('UPM-0028', 'MPS-Hanger& Pin', '120*25*2.0', 'SET', 450, current_date, ''),
  ('UPM-0029', 'MPS-BAR(상부구조)', '40*30*0.5', 'M', 1140, current_date, ''),
  ('UPM-0030', 'MPS-BAR CLIP', '90*50*0.8', 'EA', 250, current_date, ''),
  ('UPM-0031', 'MP-BAR 이중 CLIP', '50*23*0.8', 'EA', 0, current_date, 'Excel 원본 단가 미입력'),
  ('UPM-0032', 'MPS-BAR', '40*30*0.5', 'M', 1140, current_date, ''),
  ('UPM-0033', 'MPS-BAR JOINT', '90*30*0.8', 'EA', 200, current_date, ''),
  ('UPM-0034', '십자-CLIP', '50*50*0.8', 'SET', 0, current_date, 'Excel 원본 단가 미입력'),
  ('UPM-0035', 'Lover Hanger', 'H=50', 'EA', 150, current_date, ''),
  ('UPM-0036', 'ㅂ-Bar(도장)', '1.2T 10*48', 'M', 2250, current_date, ''),
  ('UPM-0037', 'ㅂ-Bar Joint', '', 'EA', 150, current_date, ''),
  ('UPM-0038', 'AL Angle 몰딩(루버도장)', '1.0*25*50', 'M', 2050, current_date, ''),
  ('UPM-0039', 'Minor Channel Clip 19형 + 피스', 'K.S', 'EA', 81, current_date, ''),
  ('UPM-0040', 'M-Bar ㉿ 19형 Double', '0.5T 50X19', 'M', 515, current_date, ''),
  ('UPM-0041', 'M-Bar Clip KS 19형', '19형', 'EA', 45, current_date, ''),
  ('UPM-0042', 'M-Bar Joint KS 19형', 'K.S', 'EA', 55, current_date, ''),
  ('UPM-0043', '피스(매거진)_백색코팅', '3*21', 'EA', 9, current_date, ''),
  ('UPM-0044', 'APT M-BAR', '36*14*0.4T', 'M', 325, current_date, ''),
  ('UPM-0045', 'APT CARRIER', '25*14*0.8T', 'M', 580, current_date, ''),
  ('UPM-0046', '각재(띠장목)', '30*30', 'M', 458, current_date, ''),
  ('UPM-0047', '톱니달대(무타공)', 'H=280MM(꺽기전)', 'EA', 140, current_date, ''),
  ('UPM-0048', '타정총핀(영우)', '19MM에어용', 'EA', 9, current_date, ''),
  ('UPM-0049', '매거진피스', '6*25 외날', 'EA', 8, current_date, ''),
  ('UPM-0050', 'Main T-Bar 25mm/3658', '0.4T 25X38', 'M', 740, current_date, ''),
  ('UPM-0051', 'Cross T-Bar 25mm/610', '0.4T 25X25', 'M', 660, current_date, ''),
  ('UPM-0052', 'T-Bar 앵글 몰딩', '0.5T 22X22', 'M', 670, current_date, ''),
  ('UPM-0053', 'C/T Clip (T-BAR용)_신형', '신형', 'EA', 100, current_date, ''),
  ('UPM-0054', 'H-Bar', '0.45T*20*20', 'M', 520, current_date, ''),
  ('UPM-0055', '아스텍스(벽산) ', '6T 300*600 / 18매', 'M2', 4629.62962962963, current_date, ''),
  ('UPM-0056', '시트락 집텍스 / BORAL', '9.5T 300*600 / 18매', 'M2', 4629.62962962963, current_date, ''),
  ('UPM-0057', '석고텍스 / KCC', '9.5T 300*600 / 18매', 'M2', 4629.62962962963, current_date, ''),
  ('UPM-0058', '마이톤/시스톤 / T-bar / M/T-400(FS,0-0,무)', '15*603*603', 'M2', 7200, current_date, ''),
  ('UPM-0059', '마이톤/시스톤 / M-bar / M/T-440(FS,0-0,무)(9T)', '9*300*600', 'M2', 7300, current_date, ''),
  ('UPM-0060', '마이톤/시스톤 / M-bar / M/T-440(FS,0-0,무)(12T)', '12*300*600', 'M2', 7300, current_date, ''),
  ('UPM-0061', '마이톤/시스톤 / M-bar / M/T-441(FS,0-0,면)', '12*300*600', 'M2', 7300, current_date, ''),
  ('UPM-0062', '마이톤/시스톤 / T&H-bar / M/T-420(F K/S,0-0,무)', '15*300*1210', 'M2', 9800, current_date, ''),
  ('UPM-0063', '마이톤/시스톤 / T&H-bar / M/T-421(F K/S,0-0,면)', '15*300*1210', 'M2', 9800, current_date, ''),
  ('UPM-0064', '암면흡음텍스 / 마이텍스 / M/T-441(FS,0-0,면,PISS)', '12*300*600', 'M2', 7100, current_date, ''),
  ('UPM-0065', '암면흡음텍스 / 이지톤 / ', '12*300*600', 'M2', 7000, current_date, ''),
  ('UPM-0066', '일반석고보드(9.5T)', '일반석고보드 / 9.5*900*1800', 'M2', 2098.7654320987654, current_date, ''),
  ('UPM-0067', '일반석고보드(12.5T)', '일반석고보드 / 12.5*900*1800', 'M2', 2820.9876543209875, current_date, ''),
  ('UPM-0068', '일반석고보드(15T)', '일반석고보드 / 15*900*1800', 'M2', 3456.79012345679, current_date, ''),
  ('UPM-0069', '방균석고보드(9.5T)', '방균보드 / 9.5*900*1800', 'M2', 2265.432098765432, current_date, ''),
  ('UPM-0070', '방균석고보드(12.5T)', '방균보드 / 12.5*900*1800', 'M2', 3049.3827160493825, current_date, ''),
  ('UPM-0071', '방균석고보드(15T)', '방균보드 / 15*900*1800', 'M2', 3716.049382716049, current_date, ''),
  ('UPM-0072', '방화석고보드(12.5T)', '방화보드 / 12.5*900*1800', 'M2', 3617.2839506172836, current_date, ''),
  ('UPM-0073', '방화석고보드(15T)', '방화보드 / 15*900*1800', 'M2', 4530.864197530864, current_date, ''),
  ('UPM-0074', '방화석고보드(19T)', '방화보드 / 19*900*1800', 'M2', 6296.296296296296, current_date, ''),
  ('UPM-0075', '방화석고보드(25T)', '방화보드 / 25*600*1800', 'M2', 8953.703703703703, current_date, ''),
  ('UPM-0076', '방수석고보드(9.5T)', '방수보드 / 9.5*900*1800', 'M2', 3358.0246913580245, current_date, ''),
  ('UPM-0077', '방수석고보드(12.5T)', '방수보드 / 12.5*900*1800', 'M2', 4783.95061728395, current_date, ''),
  ('UPM-0078', '방수석고보드(15T)', '방수보드 / 15*900*1800', 'M2', 6512.3456790123455, current_date, ''),
  ('UPM-0079', '방화방수석고보드(12.5T)', '방화방수보드 / 12.5*900*1800', 'M2', 5987.654320987654, current_date, ''),
  ('UPM-0080', '방화방수석고보드(15T)', '방화방수보드 / 15*900*1800', 'M2', 7290.123456790123, current_date, ''),
  ('UPM-0081', '방화방수석고보드(19T)', '방화방수보드 / 19*900*1800', 'M2', 9327.16049382716, current_date, ''),
  ('UPM-0082', '방화방수석고보드(25T)', '방화방수보드 / 25*600*1800', 'M2', 12277.777777777777, current_date, ''),
  ('UPM-0083', '차음석고보드(9.5T)', '차음보드 / 9.5*900*1800', 'M2', 2481.4814814814813, current_date, ''),
  ('UPM-0084', '차음석고보드(12.5T)', '차음보드 / 12.5*900*1800', 'M2', 3283.9506172839506, current_date, ''),
  ('UPM-0085', '차음석고보드(15T)', '차음보드 / 15*900*1800', 'M2', 3999.9999999999995, current_date, ''),
  ('UPM-0086', '전방수석고보드(12.5T)', '전방수석고보드12.5', 'M2', 12209.876543209875, current_date, ''),
  ('UPM-0087', '전방수석고보드(15T)', '전방수석고보드15', 'M2', 14651.85185185185, current_date, ''),
  ('UPM-0088', '고강도_전방수석고보드(12.5T)', '고강도_전방수석고보드12.5', 'M2', 22790.123456790123, current_date, ''),
  ('UPM-0089', '고강도석고보드(12.5T)', '고강도석고보드 12.5', 'M2', 4746.913580246914, current_date, ''),
  ('UPM-0090', 'CRC보드(3.2T*900*1800)', 'CRC / 3.2*900*1800', 'M2', 2777.7777777777774, current_date, ''),
  ('UPM-0091', 'CRC보드(3.2T*900*2600)', 'CRC / 3.2*900*2600', 'M2', 2521.367521367521, current_date, ''),
  ('UPM-0092', 'CRC보드(4.5T*900*1800)', 'CRC / 4.5*900*1800', 'M2', 3580.2469135802467, current_date, ''),
  ('UPM-0093', 'CRC보드(4.5T*900*2600)', 'CRC / 4.5*900*2600', 'M2', 2991.4529914529912, current_date, ''),
  ('UPM-0094', 'CRC보드(6T*900*2700)', 'CRC / 6*900*2700', 'M2', 5390.946502057613, current_date, ''),
  ('UPM-0095', 'CRC보드(9T*900*1800)', 'CRC / 9*900*1800', 'M2', 6296.296296296296, current_date, ''),
  ('UPM-0096', '마그네슘보드(3T)', '마그네슘보드 3T', 'M2', 2654.320987654321, current_date, ''),
  ('UPM-0097', '마그네슘보드(4T)', '마그네슘보드 4T', 'M2', 2932.0987654320984, current_date, ''),
  ('UPM-0098', '마그네슘보드(6T)', '마그네슘보드 6T', 'M2', 3672.8395061728393, current_date, ''),
  ('UPM-0099', '마그네슘보드(8T)', '마그네슘보드 8T', 'M2', 4567.901234567901, current_date, ''),
  ('UPM-0100', '마그네슘보드(9T)', '마그네슘보드 9T', 'M2', 4753.086419753086, current_date, ''),
  ('UPM-0101', '아쿠아패널(12.5T)', '아쿠아패널 12.5T', 'M2', 19135.8024691358, current_date, ''),
  ('UPM-0102', '국산(준내수) 합판 9T KS/E0', '국산(준내수) 합판 9T KS/E0', '매', 7118.055555555556, current_date, ''),
  ('UPM-0103', '국산(준내수) 합판 12T KS/E0', '국산(준내수) 합판 12T KS/E0', '매', 9548.611111111111, current_date, ''),
  ('UPM-0104', 'AL 100S 아이보리/실버/골드/백색', '0.5T W=100+10', 'M2', 16100, current_date, ''),
  ('UPM-0105', 'AL 100S 도장', '', 'M2', 18700, current_date, ''),
  ('UPM-0106', 'AL 200S 아이보리/실버/골드/백색', '0.6T W=180+20', 'M2', 16250, current_date, ''),
  ('UPM-0107', 'AL 200S 도장', '0.6T W=180+20', 'M2', 17800, current_date, ''),
  ('UPM-0108', 'AL 300S 도장', '0.8T W=280+20', 'M2', 21437.62, current_date, ''),
  ('UPM-0109', 'AL ANGLE (SPANDREL, ROLL)', '0.5T 22*22', 'M2', 590, current_date, ''),
  ('UPM-0110', 'AL TILE (ROLL) 평,원형', '0.7T 300*300', 'M2', 21666.666666666664, current_date, ''),
  ('UPM-0111', 'AL TILE (ROLL) 평형', '0.7T 300*600', 'M2', 19166.666666666664, current_date, ''),
  ('UPM-0112', 'AL TILE (ROLL) 평,원형/일반,피스형', '0.7T 450*450', 'M2', 17283.95061728395, current_date, ''),
  ('UPM-0113', 'AL TILE (ROLL) 평,원형/일반,피스형', '0.7T 600*600', 'M2', 16250, current_date, ''),
  ('UPM-0114', 'AL TILE(도장판)', '0.7T 600*600', 'M2', 17916.666666666664, current_date, ''),
  ('UPM-0115', 'AL TILE(도장판)+불연도장비', '0.7T 600*600', 'M2', 23472.222222222223, current_date, ''),
  ('UPM-0116', 'AL 윈디판_외부용_신성', '600×600×0.7T', 'M2', 16666.666666666668, current_date, ''),
  ('UPM-0117', 'AL 윈디판 캡_외부용_신성', '고정캡(원형,사각)&피스 ', 'M2', 300, current_date, ''),
  ('UPM-0118', 'S.M.C(300*300) _ 성일', '300*300', 'M2', 16222.22222222222, current_date, ''),
  ('UPM-0119', 'S.M.C(450*450) _ 성일', '450*450', 'M2', 14814.814814814814, current_date, ''),
  ('UPM-0120', 'S.M.C(600*600) _ 성일', '600*600', 'M2', 10416.666666666666, current_date, ''),
  ('UPM-0121', 'S.M.C(600*600) - 외부용 성일', '600*600', 'M2', 11111.111111111111, current_date, ''),
  ('UPM-0122', 'S.M.C- 외부용 캡볼트 성일', 'set', 'M2', 400, current_date, ''),
  ('UPM-0123', 'AL CANOTILE - 외부용/유창', '600*600*0.7', 'M2', 19305.555555555555, current_date, ''),
  ('UPM-0124', 'AL CANOTILE - 외부용/유창 _ 도장판', '600*600*0.7', 'M2', 20138.888888888887, current_date, ''),
  ('UPM-0125', 'MPS 판넬(알루미늄) - 외부용/대한', '600*600*0.8', 'M2', 20944.444444444445, current_date, ''),
  ('UPM-0126', 'AL T-PANEL (ㅗ형/도장)', '1.3T W=100', 'M2', 69900, current_date, ''),
  ('UPM-0127', '보랄_아트사운드(유공흡음석고보드)', '12.5T 900*1800', 'M2', 15814.814814814814, current_date, ''),
  ('UPM-0128', 'KCC_사운드윈(유공흡음석고보드)', '12.5T 900*1800', 'M2', 16469.135802469136, current_date, ''),
  ('UPM-0129', '다노라인:Micro 3x3(유공흡음석고보드)', '', 'M2', 30000, current_date, ''),
  ('UPM-0130', 'AL LOVER(겹살)/0.5T 50*50(50)*10', '1020*1020', 'M2', 58000, current_date, ''),
  ('UPM-0131', 'AL LOVER(겹살)/0.5T 75*75(50)*10', '1020*1020', 'M2', 38000, current_date, ''),
  ('UPM-0132', 'AL LOVER(겹살)/0.5T 85*85(50)*10', '1020*1020', 'M2', 31500, current_date, ''),
  ('UPM-0133', 'AL LOVER(겹살)/0.5T 100*100(50)*10', '1000*1000', 'M2', 25000, current_date, ''),
  ('UPM-0134', 'AL 스크린루바(시트)', '60*150 L:3000~6000 @', 'M2', 15400, current_date, ''),
  ('UPM-0135', 'AL 스크린루바(도장)', '60*150 L:3000~6000 @', 'M2', 12500, current_date, ''),
  ('UPM-0136', 'AL점검구(300*300) _ 개폐형', '300*300', 'M2', 7700, current_date, ''),
  ('UPM-0137', 'AL점검구(450*450) _ 개폐형', '450*450', 'M2', 8700, current_date, ''),
  ('UPM-0138', 'AL점검구(600*600) _ 개폐형', '600*600', 'M2', 9900, current_date, ''),
  ('UPM-0139', 'AL점검구(800*800) _ 개폐형', '600*600', 'M2', 17000, current_date, ''),
  ('UPM-0140', 'AL점검구(1000*1000) _ 개폐형', '600*600', 'M2', 20000, current_date, ''),
  ('UPM-0141', 'STL 점검구(450*450)_무도장 동전키', '', 'M2', 24000, current_date, ''),
  ('UPM-0142', 'STL 점검구(600*600)_무도장 동전키', '', 'M2', 28100, current_date, ''),
  ('UPM-0143', 'STL 점검구(450*450)_무도장 모자형', '', 'M2', 20900, current_date, ''),
  ('UPM-0144', 'STL 점검구(600*600)_무도장 모자형', '', 'M2', 26000, current_date, ''),
  ('UPM-0145', 'AL 스크린루바(도장)', '30*150', 'M2', 11120, current_date, ''),
  ('UPM-0146', 'AL 스크린루바(도장)', '50*150', 'M2', 12600, current_date, ''),
  ('UPM-0147', 'AL 스크린루바(방염시트)', '30*150', 'M2', 16210, current_date, ''),
  ('UPM-0148', 'AL 스크린루바(방염시트)', '50*150', 'M2', 17550, current_date, ''),
  ('UPM-0149', 'AL 스크린루바(방염시트) / 30*150/LGNW033방염', '30*150', 'M2', 14720, current_date, ''),
  ('UPM-0150', 'AL 스크린루바(방염시트) / 30*100/LGNW033방염', '30*100', 'M2', 10500, current_date, ''),
  ('UPM-0151', '마구리', 'LGNW033방염', 'M2', 1700, current_date, ''),
  ('UPM-0152', '브라켓', '', 'M2', 850, current_date, ''),
  ('UPM-0153', 'C-STUD(30형)', '30*32*0.6T', 'M', 740, current_date, ''),
  ('UPM-0154', 'C-RUNNER(30형)', '32*32*0.8T', 'M', 675, current_date, ''),
  ('UPM-0155', 'C-STUD(50형) ㉿', '50*45*0.8T', 'M', 1150, current_date, ''),
  ('UPM-0156', 'C-RUNNER(50형) ㉿', '52*40*0.8T', 'M', 980, current_date, ''),
  ('UPM-0157', 'C-STUD(60형)', '60*45*0.8T', 'M', 1225, current_date, ''),
  ('UPM-0158', 'C-RUNNER(60형)', '62*40*0.8T', 'M', 1060, current_date, ''),
  ('UPM-0159', 'C-STUD(65형) ㉿', '65*45*0.8T', 'M', 1265, current_date, ''),
  ('UPM-0160', 'C-RUNNER(65형) ㉿', '67*40*0.8T', 'M', 1100, current_date, ''),
  ('UPM-0161', 'C-STUD(70형)', '70*45*0.8T', 'M', 1305, current_date, ''),
  ('UPM-0162', 'C-RUNNER(70형)', '72*40*0.8T', 'M', 1135, current_date, ''),
  ('UPM-0163', 'C-STUD(75형) ㉿', '75*45*0.8T', 'M', 1340, current_date, ''),
  ('UPM-0164', 'C-RUNNER(75형) ㉿', '77*40*0.8T', 'M', 1175, current_date, ''),
  ('UPM-0165', 'C-STUD(80형)', '80*45*0.8T', 'M', 1380, current_date, ''),
  ('UPM-0166', 'C-RUNNER(80형)', '82*40*0.8T', 'M', 1210, current_date, ''),
  ('UPM-0167', 'C-STUD(90형) ㉿', '90*45*0.8T', 'M', 1455, current_date, ''),
  ('UPM-0168', 'C-RUNNER(90형) ㉿', '92*40*0.8T', 'M', 1290, current_date, ''),
  ('UPM-0169', 'C-STUD(100형) ㉿', '100*45*0.8T', 'M', 1535, current_date, ''),
  ('UPM-0170', 'C-RUNNER(100형) ㉿', '102*40*0.8T', 'M', 1365, current_date, ''),
  ('UPM-0171', 'C-STUD(110형)', '110*45*0.8T', 'M', 1610, current_date, ''),
  ('UPM-0172', 'C-RUNNER(110형)', '110*40*0.8T', 'M', 1440, current_date, ''),
  ('UPM-0173', 'C-STUD(120형)', '120*45*0.8T', 'M', 1690, current_date, ''),
  ('UPM-0174', 'C-RUNNER(120형)', '120*40*0.8T', 'M', 1520, current_date, ''),
  ('UPM-0175', 'C-STUD(125형)', '125*45*0.8T', 'M', 1725, current_date, ''),
  ('UPM-0176', 'C-RUNNER(125형)', '125*40*0.8T', 'M', 1560, current_date, ''),
  ('UPM-0177', 'C-STUD(130형)', '130*45*0.8T', 'M', 1765, current_date, ''),
  ('UPM-0178', 'C-RUNNER(130형)', '132*40*0.8T', 'M', 1595, current_date, ''),
  ('UPM-0179', 'C-STUD(140형)', '140*45*0.8T', 'M', 1840, current_date, ''),
  ('UPM-0180', 'C-RUNNER(140형)', '142*40*0.8T', 'M', 1670, current_date, ''),
  ('UPM-0181', 'C-STUD(150형)', '150*45*0.8T', 'M', 1915, current_date, ''),
  ('UPM-0182', 'C-RUNNER(150형)', '152*40*0.8T', 'M', 1750, current_date, ''),
  ('UPM-0183', 'C-STUD(160형)', '160*45*0.8T', 'M', 1995, current_date, ''),
  ('UPM-0184', 'C-RUNNER(160형)', '162*40*0.8T', 'M', 1825, current_date, ''),
  ('UPM-0185', 'C-STUD(170형)', '170*45*0.8T', 'M', 2070, current_date, ''),
  ('UPM-0186', 'C-RUNNER(170형)', '172*40*0.8T', 'M', 1900, current_date, ''),
  ('UPM-0187', 'C-STUD(180형)', '180*45*0.8T', 'M', 2150, current_date, ''),
  ('UPM-0188', 'C-RUNNER(180형)', '182*40*0.8T', 'M', 1980, current_date, ''),
  ('UPM-0189', 'C-STUD(200형)', '200*45*0.8T', 'M', 2360, current_date, ''),
  ('UPM-0190', 'C-RUNNER(200형)', '202*40*0.8T', 'M', 2310, current_date, ''),
  ('UPM-0191', 'C-STUD(210형)', '210*45*0.8T', 'M', 2460, current_date, ''),
  ('UPM-0192', 'C-RUNNER(210형)', '212*40*0.8T', 'M', 2450, current_date, ''),
  ('UPM-0193', 'CH_STUD(75형)', '75*35*0.8T', 'M', 1725, current_date, ''),
  ('UPM-0194', 'J_RUNNER(75형)', '75*0.8T', 'M', 1090, current_date, ''),
  ('UPM-0195', 'CH_STUD(92형)', '92*35*0.8T', 'M', 1860, current_date, ''),
  ('UPM-0196', 'J_RUNNER(92형)', '92*0.8T', 'M', 1225, current_date, ''),
  ('UPM-0197', 'CH_STUD(102형)', '102*35*0.8T', 'M', 1935, current_date, ''),
  ('UPM-0198', 'J_RUNNER(102형)', '102*0.8T', 'M', 1300, current_date, ''),
  ('UPM-0199', 'CH_STUD(127형)', '127*35*0.8T', 'M', 2130, current_date, ''),
  ('UPM-0200', 'J_RUNNER(127형)', '127*0.8T', 'M', 1495, current_date, ''),
  ('UPM-0201', 'CH_STUD(152형)', '152*35*0.8T', 'M', 2320, current_date, ''),
  ('UPM-0202', 'J_RUNNER(152형)', '152*0.8T', 'M', 1685, current_date, ''),
  ('UPM-0203', 'DL_STUD(75형)', '75*35*0.8T', 'M', 1800, current_date, ''),
  ('UPM-0204', 'DL_STUD(92형)', '92*35*0.8T', 'M', 1920, current_date, ''),
  ('UPM-0205', 'DL_STUD(102형)', '102*35*0.8T', 'M', 2005, current_date, ''),
  ('UPM-0206', 'DL_STUD(127형)', '127*35*0.8T', 'M', 2210, current_date, ''),
  ('UPM-0207', 'DL_STUD(152형)', '152*35*0.8T', 'M', 2400, current_date, ''),
  ('UPM-0208', 'E_STUD(64형)', '64*0.8T', 'M', 2370, current_date, ''),
  ('UPM-0209', 'Metal_RUNNER(64형)', '64*32*0.8T', 'M', 1250, current_date, ''),
  ('UPM-0210', 'E_STUD(75형)', '75*0.8T', 'M', 2480, current_date, ''),
  ('UPM-0211', 'Metal_RUNNER(75형)', '75*32*0.8T', 'M', 1370, current_date, ''),
  ('UPM-0212', 'E_STUD(92형)', '92*0.8T', 'M', 2620, current_date, ''),
  ('UPM-0213', 'Metal_RUNNER(92형)', '92*32*0.8T', 'M', 1560, current_date, ''),
  ('UPM-0214', 'E_STUD(102형)', '102*0.8T', 'M', 2730, current_date, ''),
  ('UPM-0215', 'Metal_RUNNER(102형)', '102*32*0.8T', 'M', 1610, current_date, ''),
  ('UPM-0216', 'E_STUD(125형)', '125*0.8T', 'M', 3100, current_date, ''),
  ('UPM-0217', 'Metal_RUNNER(125형)', '127*32*0.8T', 'M', 1800, current_date, ''),
  ('UPM-0218', 'E_STUD(152형)', '152*0.8T', 'M', 3340, current_date, ''),
  ('UPM-0219', 'Metal_RUNNER(152형)', '152*32*0.8T', 'M', 2120, current_date, ''),
  ('UPM-0220', 'DL_STUD(60형)', 'W60*0.8T(문틀보강)', 'M', 1240, current_date, ''),
  ('UPM-0221', 'DL_STUD(65형)', 'W65*0.8T(문틀보강)', 'M', 1285, current_date, ''),
  ('UPM-0222', 'C-RUNNER(65형)', '67*40*0.8T ㉿ ', 'M', 1100, current_date, ''),
  ('UPM-0223', 'DL_STUD(75형)', 'W75*0.8T(문틀보강)', 'M', 1380, current_date, ''),
  ('UPM-0224', 'C-RUNNER(75형)', '77*40*0.8T ㉿ ', 'M', 1175, current_date, ''),
  ('UPM-0225', 'DL_STUD(80형)', 'W80*0.8T(문틀보강)', 'M', 1435, current_date, ''),
  ('UPM-0226', 'DL_STUD(90형)', 'W90*0.8T(문틀보강)', 'M', 1525, current_date, ''),
  ('UPM-0227', 'C-RUNNER(90형)', '92*40*0.8T ㉿ ', 'M', 1290, current_date, ''),
  ('UPM-0228', 'DL_STUD(100형)', 'W100*0.8T(문틀보강)', 'M', 1620, current_date, ''),
  ('UPM-0229', 'C-RUNNER(100형)', '102*40*0.8T ㉿ ', 'M', 1365, current_date, ''),
  ('UPM-0230', 'W_STUD(50형)', '50*45*0.6T', 'M', 2161, current_date, ''),
  ('UPM-0231', 'W_RUNNER(50형)', '52*40*0.6T', 'M', 1348, current_date, ''),
  ('UPM-0232', 'W_STUD(74형)', '74*45*0.6T', 'M', 2170, current_date, ''),
  ('UPM-0233', 'W_RUNNER(74형)', '76*40*0.8T', 'M', 1370, current_date, ''),
  ('UPM-0234', 'W_STUD(90형)', '90*45*0.6T', 'M', 2310, current_date, ''),
  ('UPM-0235', 'W_RUNNER(90형)', '92*40*0.8T', 'M', 1510, current_date, ''),
  ('UPM-0236', 'W_STUD(100형)', '100*45*0.6T', 'M', 2380, current_date, ''),
  ('UPM-0237', 'W_RUNNER(100형)', '102*40*0.8T', 'M', 1550, current_date, ''),
  ('UPM-0238', 'W_STUD(124형)', '124*45*0.6T', 'M', 2540, current_date, ''),
  ('UPM-0239', 'W_RUNNER(124형)', '127*40*0.8T', 'M', 1710, current_date, ''),
  ('UPM-0240', 'W_STUD(140형)', '140*45*0.6T', 'M', 2745, current_date, ''),
  ('UPM-0241', 'W_RUNNER(140형)', '142*40*0.8T', 'M', 1878, current_date, ''),
  ('UPM-0242', 'W_STUD(150형)', '150*45*0.6T', 'M', 2760, current_date, ''),
  ('UPM-0243', 'W_RUNNER(150형)', '152*40*0.8T', 'M', 1890, current_date, ''),
  ('UPM-0244', '시그마_STUD(74형)', '74*45*0.5T', 'M', 2475, current_date, ''),
  ('UPM-0245', '시그마_RUNNER(74형)', '76*40*0.6T', 'M', 1370, current_date, ''),
  ('UPM-0246', '시그마_STUD(90형)', '90*45*0.5T', 'M', 2574, current_date, ''),
  ('UPM-0247', '시그마_RUNNER(90형)', '92*40*0.6T', 'M', 1514, current_date, ''),
  ('UPM-0248', '시그마_STUD(100형)', '100*45*0.5T', 'M', 2706, current_date, ''),
  ('UPM-0249', '시그마_RUNNER(100형)', '102*40*0.6T', 'M', 1562, current_date, ''),
  ('UPM-0250', '시그마_STUD(124형)', '124*45*0.6T', 'M', 2860, current_date, ''),
  ('UPM-0251', '시그마_RUNNER(124형)', '127*40*0.6T', 'M', 1723, current_date, ''),
  ('UPM-0252', 'MP_STUD(74형)', '74*40*0.55T', 'M', 2760, current_date, ''),
  ('UPM-0253', 'MP_RUNNER(74형)', '77*40*0.8T(타공)', 'M', 1930, current_date, ''),
  ('UPM-0254', 'MP_STUD(100형)', '100*40*0.55T', 'M', 3010, current_date, ''),
  ('UPM-0255', 'MP_RUNNER(100형)', '102*40*0.8T(타공)', 'M', 2210, current_date, ''),
  ('UPM-0256', 'MP_STUD(124형)', '124*40*0.55T', 'M', 3530, current_date, ''),
  ('UPM-0257', 'MP_RUNNER(124형)', '129*40*0.8T(타공)', 'M', 2500, current_date, ''),
  ('UPM-0258', 'MP_STUD(150형)', '150*40*0.55T', 'M', 3910, current_date, ''),
  ('UPM-0259', 'MP_RUNNER(150형)', '152*40*0.8T(타공)', 'M', 2760, current_date, '')
on conflict (item_name, specification, unit) do nothing;

with seed_items (major_category, middle_category, detail_category, item_code, item_name, specification, unit, net_quantity, sort_order) as (
values
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 1.1, 0),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0012', '판스프링', '', 'EA', 0.95, 1),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0011', 'Clip-Bar Clip( 캐링용)', '38*12', 'EA', 3.89, 2),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0010', 'Clip-Bar Joint', '', 'EA', 0.858, 3),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0009', 'Clip-Bar', '0.5T 24X35', 'M', 3.43, 4),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0008', 'Minor Channel Clip 원터치', '', 'EA', 0.458, 5),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 6),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 7),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 8),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 9),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 10),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 11),
  ('천정', 'Clip_Bar천정', 'Clip Bar(300x300)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 12),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 1.1, 0),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0012', '판스프링', '', 'EA', 0.95, 1),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0011', 'Clip-Bar Clip( 캐링용)', '38*12', 'EA', 2.98, 2),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0010', 'Clip-Bar Joint', '', 'EA', 0.65, 3),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0009', 'Clip-Bar', '0.5T 24X35', 'M', 2.57, 4),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0008', 'Minor Channel Clip 원터치', '', 'EA', 0.458, 5),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 6),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 7),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 8),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 9),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 10),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 11),
  ('천정', 'Clip_Bar천정', 'Clip Bar(450x450)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 12),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 1.1, 0),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0012', '판스프링', '', 'EA', 0.95, 1),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0011', 'Clip-Bar Clip( 캐링용)', '38*12', 'EA', 1.907, 2),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0010', 'Clip-Bar Joint', '', 'EA', 0.429, 3),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0009', 'Clip-Bar', '0.5T 24X35', 'M', 1.717, 4),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0008', 'Minor Channel Clip 원터치', '', 'EA', 0.458, 5),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 6),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 7),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 8),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 9),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 10),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 11),
  ('천정', 'Clip_Bar천정', 'Clip Bar(600x600)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 12),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0020', '캡볼트 (ROLL)', '', 'EA', 2.862, 0),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0019', '칼라각파이프', '20*20*1.4', 'M', 1.272, 1),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0018', '와샤(후렌지너트)', '각파이프고정', 'EA', 2.544, 2),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0017', 'Clip Bar Clip', 'SQ-Bar 용', 'EA', 1.907, 3),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0016', 'SQ-Bar Joint', '', 'EA', 0.71, 4),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0015', 'SQ-Bar (C/C용)', '0.45T 40x30', 'M', 1.272, 5),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0014', 'SQ-Bar Hanger+Pin', 'L=150', 'SET', 1.272, 6),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 1.1, 7),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0012', '판스프링', '', 'EA', 0.95, 8),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0010', 'Clip-Bar Joint', '', 'EA', 0.429, 9),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0009', 'Clip-Bar', '0.5T 24X35', 'M', 1.717, 10),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 11),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 12),
  ('천정', 'Clip_Bar천정_내풍압', 'Sq Bar+Clip Bar(600x600)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 13),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0019', '칼라각파이프', '20*20*1.4', 'M', 1.272, 0),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0018', '와샤(후렌지너트)', '각파이프고정', 'EA', 2.544, 1),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0027', 'Canotile Cross Joiner Clip', '15*5', 'EA', 5.446, 2),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0026', 'Canotile Cross Joiner (AL, 도장)', '1.0T 15X7', 'M', 1.675, 3),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0025', 'Canotile Main Joiner (AL, 도장)', '1.0T 15X13', 'M', 1.675, 4),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0024', '꾹-클립 / 꽉몰딩용', '', 'EA', 0.8, 5),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0023', '꽉몰딩 / ㄷ-몰딩', '1.0T 18*37', 'M', 0.8, 6),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0022', 'SQ-BAR Clip(신형)', 'SUS', 'EA', 1.861, 7),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0016', 'SQ-Bar Joint', '', 'EA', 0.419, 8),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0021', 'SQ-Bar (M/W용)', '0.45T 40x30', 'M', 1.675, 9),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0015', 'SQ-Bar (C/C용)', '0.45T 40x30', 'M', 1.272, 10),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0014', 'SQ-Bar Hanger+Pin', 'L=150', 'SET', 1.272, 11),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 5.08, 12),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 13),
  ('천정', 'SQ_Bar천정_내풍압', 'Cano Tile(600x600)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 14),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0034', '십자-CLIP', '50*50*0.8', 'SET', 2.8, 0),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0033', 'MPS-BAR JOINT', '90*30*0.8', 'EA', 0.6, 1),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0032', 'MPS-BAR', '40*30*0.5', 'M', 1.717, 2),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0031', 'MP-BAR 이중 CLIP', '50*23*0.8', 'EA', 1.907, 3),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0030', 'MPS-BAR CLIP', '90*50*0.8', 'EA', 1.907, 4),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0029', 'MPS-BAR(상부구조)', '40*30*0.5', 'M', 1.272, 5),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0028', 'MPS-Hanger& Pin', '120*25*2.0', 'SET', 1.272, 6),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0019', '칼라각파이프', '20*20*1.4', 'M', 1.272, 7),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0018', '와샤(후렌지너트)', '각파이프고정', 'EA', 2.544, 8),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0013', 'ㄷ-몰딩', '1.0T 15*30*15', 'M', 1.1, 9),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0012', '판스프링', '', 'EA', 0.95, 10),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0008', 'Minor Channel Clip 원터치', '', 'EA', 0.458, 11),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 12),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 13),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 14),
  ('천정', 'MP_Bar천정_내풍압', 'MP-Bar(600x600)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 15),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0019', '칼라각파이프', '20*20*1.4', 'M', 1.272, 0),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0018', '와샤(후렌지너트)', '각파이프고정', 'EA', 2.544, 1),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0022', 'SQ-BAR Clip(신형)', 'SUS', 'EA', 2.544, 2),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0016', 'SQ-Bar Joint', '', 'EA', 0.419, 3),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0021', 'SQ-Bar (M/W용)', '0.45T 40x30', 'M', 2.57, 4),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0015', 'SQ-Bar (C/C용)', '0.45T 40x30', 'M', 1.272, 5),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0014', 'SQ-Bar Hanger+Pin', 'L=150', 'SET', 1.272, 6),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 7),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 8),
  ('천정', 'AL_T_PANEL천정_내풍압', 'AL T-Panel', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 9),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0038', 'AL Angle 몰딩(루버도장)', '1.0*25*50', 'M', 1.3333333333333333, 0),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0037', 'ㅂ-Bar Joint', '', 'EA', 0.404, 1),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0036', 'ㅂ-Bar(도장)', '1.2T 10*48', 'M', 1.212, 2),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0035', 'Lover Hanger', 'H=50', 'EA', 1.272, 3),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 4),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 5),
  ('천정', 'AL_겹루버_격자루버', 'AL-겹루버(격자루버)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 6),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0043', '피스(매거진)_백색코팅', '3*21', 'EA', 36, 0),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0042', 'M-Bar Joint KS 19형', 'K.S', 'EA', 0.875, 1),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0041', 'M-Bar Clip KS 19형', '19형', 'EA', 3.89, 2),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0040', 'M-Bar ㉿ 19형 Double', '0.5T 50X19', 'M', 3.43, 3),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0039', 'Minor Channel Clip 19형 + 피스', 'K.S', 'EA', 0.458, 4),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 5),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 6),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 7),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 8),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 9),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 10),
  ('천정', 'M_Bar천정_상가', 'M_Bar천정(상가)', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 11),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0049', '매거진피스', '6*25 외날', 'EA', 18.333333333333332, 0),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0048', '타정총핀(영우)', '19MM에어용', 'EA', 1.9, 1),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0047', '톱니달대(무타공)', 'H=280MM(꺽기전)', 'EA', 1.9, 2),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0046', '각재(띠장목)', '30*30', 'M', 1.1, 3),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0045', 'APT CARRIER', '25*14*0.8T', 'M', 1.45, 4),
  ('천정', 'M_Bar천정_세대', 'M_Bar천정(세대)', 'UPM-0044', 'APT M-BAR', '36*14*0.4T', 'M', 3.5, 5),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0053', 'C/T Clip (T-BAR용)_신형', '신형', 'EA', 2, 0),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0052', 'T-Bar 앵글 몰딩', '0.5T 22X22', 'M', 1.3333333333333333, 1),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0051', 'Cross T-Bar 25mm/610', '0.4T 25X25', 'M', 1.8, 2),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0050', 'Main T-Bar 25mm/3658', '0.4T 25X38', 'M', 1.8, 3),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0039', 'Minor Channel Clip 19형 + 피스', 'K.S', 'EA', 0.458, 4),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.412, 5),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 6),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 7),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 8),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 9),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 10),
  ('천정', 'T_Bar천정', 'T-Bar천정', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 11),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0053', 'C/T Clip (T-BAR용)_신형', '신형', 'EA', 2, 0),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0054', 'H-Bar', '0.45T*20*20', 'M', 3.2, 1),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0050', 'Main T-Bar 25mm/3658', '0.4T 25X38', 'M', 1.4, 2),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0039', 'Minor Channel Clip 19형 + 피스', 'K.S', 'EA', 0.6, 3),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0007', 'Minor Channel ㉿ 19형', '1.2T 19X10', 'M', 0.5, 4),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0006', 'Carrying Channel Joint', 'K.S', 'EA', 0.3, 5),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0005', 'Carrying Channel ㉿ 19형', '1.2T 38X12', 'M', 1.272, 6),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0004', 'Hanger 150mm+Hanger Pin', 'H=150', 'EA', 1.272, 7),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0003', 'Nut(도금, 9mm)', '3/8 (9mm)', 'EA', 2.54, 8),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0002', 'Bolt (전산도금, 9mm)', '3/8(9mm) 500 이상', 'M', 1.272, 9),
  ('천정', 'TH_Bar천정', 'T/H-Bar천정', 'UPM-0001', '앙카(Insert)', '9mm', 'EA', 1.272, 10),
  ('벽체', 'C_STUD', 'C-STUD(30형)', 'UPM-0154', 'C-RUNNER(30형)', '32*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(30형)', 'UPM-0153', 'C-STUD(30형)', '30*32*0.6T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(50형)', 'UPM-0156', 'C-RUNNER(50형) ㉿', '52*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(50형)', 'UPM-0155', 'C-STUD(50형) ㉿', '50*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(60형)', 'UPM-0158', 'C-RUNNER(60형)', '62*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(60형)', 'UPM-0157', 'C-STUD(60형)', '60*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(65형)', 'UPM-0160', 'C-RUNNER(65형) ㉿', '67*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(65형)', 'UPM-0159', 'C-STUD(65형) ㉿', '65*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(70형)', 'UPM-0162', 'C-RUNNER(70형)', '72*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(70형)', 'UPM-0161', 'C-STUD(70형)', '70*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(75형)', 'UPM-0164', 'C-RUNNER(75형) ㉿', '77*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(75형)', 'UPM-0163', 'C-STUD(75형) ㉿', '75*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(80형)', 'UPM-0166', 'C-RUNNER(80형)', '82*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(80형)', 'UPM-0165', 'C-STUD(80형)', '80*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(90형)', 'UPM-0168', 'C-RUNNER(90형) ㉿', '92*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(90형)', 'UPM-0167', 'C-STUD(90형) ㉿', '90*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(100형)', 'UPM-0170', 'C-RUNNER(100형) ㉿', '102*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(100형)', 'UPM-0169', 'C-STUD(100형) ㉿', '100*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(110형)', 'UPM-0172', 'C-RUNNER(110형)', '110*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(110형)', 'UPM-0171', 'C-STUD(110형)', '110*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(120형)', 'UPM-0174', 'C-RUNNER(120형)', '120*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(120형)', 'UPM-0173', 'C-STUD(120형)', '120*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(125형)', 'UPM-0176', 'C-RUNNER(125형)', '125*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(125형)', 'UPM-0175', 'C-STUD(125형)', '125*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(130형)', 'UPM-0178', 'C-RUNNER(130형)', '132*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(130형)', 'UPM-0177', 'C-STUD(130형)', '130*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(140형)', 'UPM-0180', 'C-RUNNER(140형)', '142*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(140형)', 'UPM-0179', 'C-STUD(140형)', '140*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(150형)', 'UPM-0182', 'C-RUNNER(150형)', '152*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(150형)', 'UPM-0181', 'C-STUD(150형)', '150*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(160형)', 'UPM-0184', 'C-RUNNER(160형)', '162*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(160형)', 'UPM-0183', 'C-STUD(160형)', '160*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(170형)', 'UPM-0186', 'C-RUNNER(170형)', '172*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(170형)', 'UPM-0185', 'C-STUD(170형)', '170*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(180형)', 'UPM-0188', 'C-RUNNER(180형)', '182*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(180형)', 'UPM-0187', 'C-STUD(180형)', '180*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(200형)', 'UPM-0190', 'C-RUNNER(200형)', '202*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(200형)', 'UPM-0189', 'C-STUD(200형)', '200*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'C_STUD', 'C-STUD(210형)', 'UPM-0192', 'C-RUNNER(210형)', '212*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'C_STUD', 'C-STUD(210형)', 'UPM-0191', 'C-STUD(210형)', '210*45*0.8T', 'M', 2.7, 1),
  ('벽체', 'CH_STUD', 'CH_STUD(75형)', 'UPM-0194', 'J_RUNNER(75형)', '75*0.8T', 'M', 0.8, 0),
  ('벽체', 'CH_STUD', 'CH_STUD(75형)', 'UPM-0193', 'CH_STUD(75형)', '75*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'CH_STUD', 'CH_STUD(92형)', 'UPM-0196', 'J_RUNNER(92형)', '92*0.8T', 'M', 0.8, 0),
  ('벽체', 'CH_STUD', 'CH_STUD(92형)', 'UPM-0195', 'CH_STUD(92형)', '92*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'CH_STUD', 'CH_STUD(102형)', 'UPM-0198', 'J_RUNNER(102형)', '102*0.8T', 'M', 0.8, 0),
  ('벽체', 'CH_STUD', 'CH_STUD(102형)', 'UPM-0197', 'CH_STUD(102형)', '102*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'CH_STUD', 'CH_STUD(127형)', 'UPM-0200', 'J_RUNNER(127형)', '127*0.8T', 'M', 0.8, 0),
  ('벽체', 'CH_STUD', 'CH_STUD(127형)', 'UPM-0199', 'CH_STUD(127형)', '127*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'CH_STUD', 'CH_STUD(152형)', 'UPM-0202', 'J_RUNNER(152형)', '152*0.8T', 'M', 0.8, 0),
  ('벽체', 'CH_STUD', 'CH_STUD(152형)', 'UPM-0201', 'CH_STUD(152형)', '152*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(75형)', 'UPM-0194', 'J_RUNNER(75형)', '75*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(75형)', 'UPM-0203', 'DL_STUD(75형)', '75*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(92형)', 'UPM-0196', 'J_RUNNER(92형)', '92*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(92형)', 'UPM-0204', 'DL_STUD(92형)', '92*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(102형)', 'UPM-0198', 'J_RUNNER(102형)', '102*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(102형)', 'UPM-0205', 'DL_STUD(102형)', '102*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(127형)', 'UPM-0200', 'J_RUNNER(127형)', '127*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(127형)', 'UPM-0206', 'DL_STUD(127형)', '127*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(152형)', 'UPM-0202', 'J_RUNNER(152형)', '152*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_CH_12.5T', 'DL_STUD(152형)', 'UPM-0207', 'DL_STUD(152형)', '152*35*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(64형)', 'UPM-0209', 'Metal_RUNNER(64형)', '64*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(64형)', 'UPM-0208', 'E_STUD(64형)', '64*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(75형)', 'UPM-0211', 'Metal_RUNNER(75형)', '75*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(75형)', 'UPM-0210', 'E_STUD(75형)', '75*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(92형)', 'UPM-0213', 'Metal_RUNNER(92형)', '92*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(92형)', 'UPM-0212', 'E_STUD(92형)', '92*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(102형)', 'UPM-0215', 'Metal_RUNNER(102형)', '102*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(102형)', 'UPM-0214', 'E_STUD(102형)', '102*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(125형)', 'UPM-0217', 'Metal_RUNNER(125형)', '127*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(125형)', 'UPM-0216', 'E_STUD(125형)', '125*0.8T', 'M', 2.7, 1),
  ('벽체', 'E_STUD', 'E_STUD(152형)', 'UPM-0219', 'Metal_RUNNER(152형)', '152*32*0.8T', 'M', 0.8, 0),
  ('벽체', 'E_STUD', 'E_STUD(152형)', 'UPM-0218', 'E_STUD(152형)', '152*0.8T', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(60형)', 'UPM-0158', 'C-RUNNER(60형)', '62*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(60형)', 'UPM-0220', 'DL_STUD(60형)', 'W60*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(65형)', 'UPM-0222', 'C-RUNNER(65형)', '67*40*0.8T ㉿ ', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(65형)', 'UPM-0221', 'DL_STUD(65형)', 'W65*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(75형)', 'UPM-0224', 'C-RUNNER(75형)', '77*40*0.8T ㉿ ', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(75형)', 'UPM-0223', 'DL_STUD(75형)', 'W75*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(80형)', 'UPM-0166', 'C-RUNNER(80형)', '82*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(80형)', 'UPM-0225', 'DL_STUD(80형)', 'W80*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(90형)', 'UPM-0227', 'C-RUNNER(90형)', '92*40*0.8T ㉿ ', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(90형)', 'UPM-0226', 'DL_STUD(90형)', 'W90*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(100형)', 'UPM-0229', 'C-RUNNER(100형)', '102*40*0.8T ㉿ ', 'M', 0.8, 0),
  ('벽체', 'DL_STUD_문틀보강', 'DL_STUD(100형)', 'UPM-0228', 'DL_STUD(100형)', 'W100*0.8T(문틀보강)', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(50형)', 'UPM-0231', 'W_RUNNER(50형)', '52*40*0.6T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(50형)', 'UPM-0230', 'W_STUD(50형)', '50*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(74형)', 'UPM-0233', 'W_RUNNER(74형)', '76*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(74형)', 'UPM-0232', 'W_STUD(74형)', '74*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(90형)', 'UPM-0235', 'W_RUNNER(90형)', '92*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(90형)', 'UPM-0234', 'W_STUD(90형)', '90*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(100형)', 'UPM-0237', 'W_RUNNER(100형)', '102*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(100형)', 'UPM-0236', 'W_STUD(100형)', '100*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(124형)', 'UPM-0239', 'W_RUNNER(124형)', '127*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(124형)', 'UPM-0238', 'W_STUD(124형)', '124*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(140형)', 'UPM-0241', 'W_RUNNER(140형)', '142*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(140형)', 'UPM-0240', 'W_STUD(140형)', '140*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'W_STUD', 'W_STUD(150형)', 'UPM-0243', 'W_RUNNER(150형)', '152*40*0.8T', 'M', 0.8, 0),
  ('벽체', 'W_STUD', 'W_STUD(150형)', 'UPM-0242', 'W_STUD(150형)', '150*45*0.6T', 'M', 2.7, 1),
  ('벽체', '시그마_STUD', '시그마_STUD(74형)', 'UPM-0245', '시그마_RUNNER(74형)', '76*40*0.6T', 'M', 0.8, 0),
  ('벽체', '시그마_STUD', '시그마_STUD(74형)', 'UPM-0244', '시그마_STUD(74형)', '74*45*0.5T', 'M', 2.7, 1),
  ('벽체', '시그마_STUD', '시그마_STUD(90형)', 'UPM-0247', '시그마_RUNNER(90형)', '92*40*0.6T', 'M', 0.8, 0),
  ('벽체', '시그마_STUD', '시그마_STUD(90형)', 'UPM-0246', '시그마_STUD(90형)', '90*45*0.5T', 'M', 2.7, 1),
  ('벽체', '시그마_STUD', '시그마_STUD(100형)', 'UPM-0249', '시그마_RUNNER(100형)', '102*40*0.6T', 'M', 0.8, 0),
  ('벽체', '시그마_STUD', '시그마_STUD(100형)', 'UPM-0248', '시그마_STUD(100형)', '100*45*0.5T', 'M', 2.7, 1),
  ('벽체', '시그마_STUD', '시그마_STUD(124형)', 'UPM-0251', '시그마_RUNNER(124형)', '127*40*0.6T', 'M', 0.8, 0),
  ('벽체', '시그마_STUD', '시그마_STUD(124형)', 'UPM-0250', '시그마_STUD(124형)', '124*45*0.6T', 'M', 2.7, 1),
  ('벽체', 'MP_STUD', 'MP_STUD(74형)', 'UPM-0253', 'MP_RUNNER(74형)', '77*40*0.8T(타공)', 'M', 0.8, 0),
  ('벽체', 'MP_STUD', 'MP_STUD(74형)', 'UPM-0252', 'MP_STUD(74형)', '74*40*0.55T', 'M', 2.7, 1),
  ('벽체', 'MP_STUD', 'MP_STUD(100형)', 'UPM-0255', 'MP_RUNNER(100형)', '102*40*0.8T(타공)', 'M', 0.8, 0),
  ('벽체', 'MP_STUD', 'MP_STUD(100형)', 'UPM-0254', 'MP_STUD(100형)', '100*40*0.55T', 'M', 2.7, 1),
  ('벽체', 'MP_STUD', 'MP_STUD(124형)', 'UPM-0257', 'MP_RUNNER(124형)', '129*40*0.8T(타공)', 'M', 0.8, 0),
  ('벽체', 'MP_STUD', 'MP_STUD(124형)', 'UPM-0256', 'MP_STUD(124형)', '124*40*0.55T', 'M', 2.7, 1),
  ('벽체', 'MP_STUD', 'MP_STUD(150형)', 'UPM-0259', 'MP_RUNNER(150형)', '152*40*0.8T(타공)', 'M', 0.8, 0),
  ('벽체', 'MP_STUD', 'MP_STUD(150형)', 'UPM-0258', 'MP_STUD(150형)', '150*40*0.55T', 'M', 2.7, 1)
)
insert into public.unit_price_spec_items (spec_id, material_id, cost_type, item_name, specification, unit, net_quantity, sort_order)
select s.id, m.id, 'material', v.item_name, v.specification, v.unit, v.net_quantity, v.sort_order
from seed_items v
join public.unit_price_specs s
  on s.major_category = v.major_category
 and s.middle_category = v.middle_category
 and s.detail_category = v.detail_category
left join public.unit_price_materials m on m.item_code = v.item_code
where not exists (select 1 from public.unit_price_spec_items existing where existing.spec_id = s.id);

do $$
begin
  raise notice '일위대가작성 DB 적용 완료: 규격 69개, Excel 기준 자재 355행 반영';
end $$;
