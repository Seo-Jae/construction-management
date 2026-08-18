-- v52.48.5.35 자재관리 > 일위대가작성 > 상세 부속자재 공통 라이브러리
-- 목적:
-- 1) 동일한 천정 공통 부속자재 이미지를 한 번만 업로드하고 여러 기술자료에서 재사용
-- 2) 기술자료 VIEW 우측에 현재 공법에 연결된 상세 부속자재를 표시
-- 3) 기존 기술자료 이미지 관리 권한을 그대로 사용

create table if not exists public.unit_price_technical_accessory_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  storage_path text not null unique,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unit_price_technical_accessory_links (
  image_key text not null,
  accessory_id uuid not null
    references public.unit_price_technical_accessory_library(id)
    on delete cascade,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (image_key, accessory_id)
);

create index if not exists idx_unit_price_technical_accessory_links_image_key
  on public.unit_price_technical_accessory_links(image_key, sort_order);

alter table public.unit_price_technical_accessory_library enable row level security;
alter table public.unit_price_technical_accessory_links enable row level security;

drop policy if exists unit_price_technical_accessory_library_select_authenticated
  on public.unit_price_technical_accessory_library;
create policy unit_price_technical_accessory_library_select_authenticated
on public.unit_price_technical_accessory_library
for select
to authenticated
using (true);

drop policy if exists unit_price_technical_accessory_links_select_authenticated
  on public.unit_price_technical_accessory_links;
create policy unit_price_technical_accessory_links_select_authenticated
on public.unit_price_technical_accessory_links
for select
to authenticated
using (true);

grant select on public.unit_price_technical_accessory_library to authenticated;
grant select on public.unit_price_technical_accessory_links to authenticated;
revoke insert, update, delete on public.unit_price_technical_accessory_library from authenticated;
revoke insert, update, delete on public.unit_price_technical_accessory_links from authenticated;

create or replace function public.save_unit_price_technical_accessory(
  p_accessory_id uuid,
  p_name text,
  p_image_url text,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_accessory_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_image_url text := btrim(coalesce(p_image_url, ''));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.can_manage_unit_price_technical_annotations() then
    raise exception '기술자료 이미지를 편집할 권한이 없습니다.';
  end if;

  if v_name = '' then
    raise exception '부속자재명을 입력해주세요.';
  end if;

  if v_image_url = '' or v_storage_path = '' then
    raise exception '부속자재 이미지 정보가 없습니다.';
  end if;

  insert into public.unit_price_technical_accessory_library (
    id,
    name,
    image_url,
    storage_path,
    is_active,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    v_id,
    v_name,
    v_image_url,
    v_storage_path,
    true,
    auth.uid(),
    auth.uid(),
    now(),
    now()
  )
  on conflict (id) do update
     set name = excluded.name,
         image_url = excluded.image_url,
         storage_path = excluded.storage_path,
         is_active = true,
         updated_by = auth.uid(),
         updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.save_unit_price_technical_accessory(uuid, text, text, text) from public;
grant execute on function public.save_unit_price_technical_accessory(uuid, text, text, text) to authenticated;

create or replace function public.set_unit_price_technical_accessories(
  p_image_key text,
  p_accessory_ids jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_key text := btrim(coalesce(p_image_key, ''));
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.can_manage_unit_price_technical_annotations() then
    raise exception '기술자료 이미지를 편집할 권한이 없습니다.';
  end if;

  if v_image_key = '' then
    raise exception '기술자료 image_key가 없습니다.';
  end if;

  if p_accessory_ids is null or jsonb_typeof(p_accessory_ids) <> 'array' then
    raise exception '부속자재 연결 데이터 형식이 올바르지 않습니다.';
  end if;

  delete from public.unit_price_technical_accessory_links
   where image_key = v_image_key;

  insert into public.unit_price_technical_accessory_links (
    image_key,
    accessory_id,
    sort_order,
    created_by,
    created_at
  )
  select
    v_image_key,
    requested.accessory_id,
    requested.sort_order,
    auth.uid(),
    now()
  from (
    select distinct on ((item.value)::uuid)
      (item.value)::uuid as accessory_id,
      (item.ordinality - 1)::integer as sort_order
    from jsonb_array_elements_text(p_accessory_ids)
      with ordinality as item(value, ordinality)
    order by (item.value)::uuid, item.ordinality
  ) as requested
  join public.unit_price_technical_accessory_library library
    on library.id = requested.accessory_id
   and library.is_active = true
  order by requested.sort_order;
end;
$$;

revoke all on function public.set_unit_price_technical_accessories(text, jsonb) from public;
grant execute on function public.set_unit_price_technical_accessories(text, jsonb) to authenticated;

create or replace function public.delete_unit_price_technical_accessory(
  p_accessory_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storage_path text := '';
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.can_manage_unit_price_technical_annotations() then
    raise exception '기술자료 이미지를 편집할 권한이 없습니다.';
  end if;

  select storage_path
    into v_storage_path
    from public.unit_price_technical_accessory_library
   where id = p_accessory_id;

  delete from public.unit_price_technical_accessory_library
   where id = p_accessory_id;

  return coalesce(v_storage_path, '');
end;
$$;

revoke all on function public.delete_unit_price_technical_accessory(uuid) from public;
grant execute on function public.delete_unit_price_technical_accessory(uuid) to authenticated;
