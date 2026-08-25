-- v52.48.5.36 자재관리 > 일위대가작성 > 기술자료 부속자재 명칭별 연결
-- v52.48.5.35의 공통 부속자재 라이브러리는 그대로 유지합니다.
-- 이번 버전은 "기술자료 전체" 연결에서 "지시선/하단 명칭별" 연결로 확장합니다.

create table if not exists public.unit_price_technical_annotation_accessories (
  image_key text not null,
  annotation_id text not null,
  accessory_id uuid not null
    references public.unit_price_technical_accessory_library(id)
    on delete cascade,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (image_key, annotation_id, accessory_id)
);

create index if not exists idx_unit_price_technical_annotation_accessories_lookup
  on public.unit_price_technical_annotation_accessories(
    image_key,
    annotation_id,
    sort_order
  );

alter table public.unit_price_technical_annotation_accessories
  enable row level security;

drop policy if exists unit_price_technical_annotation_accessories_select_authenticated
  on public.unit_price_technical_annotation_accessories;

create policy unit_price_technical_annotation_accessories_select_authenticated
on public.unit_price_technical_annotation_accessories
for select
to authenticated
using (true);

grant select
on public.unit_price_technical_annotation_accessories
to authenticated;

revoke insert, update, delete
on public.unit_price_technical_annotation_accessories
from authenticated;

-- 지시선/하단설명 + 명칭별 부속자재 연결을 한 번에 저장합니다.
-- 기존 save_unit_price_technical_sheet()을 호출한 뒤 같은 트랜잭션에서 연결정보를 저장합니다.
create or replace function public.save_unit_price_technical_sheet_v36(
  p_image_key text,
  p_annotations jsonb,
  p_layout_settings jsonb,
  p_accessory_links jsonb
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

  if p_annotations is null or jsonb_typeof(p_annotations) <> 'array' then
    raise exception '지시선 데이터 형식이 올바르지 않습니다.';
  end if;

  if p_accessory_links is null or jsonb_typeof(p_accessory_links) <> 'array' then
    raise exception '부속자재 연결 데이터 형식이 올바르지 않습니다.';
  end if;

  perform public.save_unit_price_technical_sheet(
    v_image_key,
    p_annotations,
    p_layout_settings
  );

  delete from public.unit_price_technical_annotation_accessories
   where image_key = v_image_key;

  insert into public.unit_price_technical_annotation_accessories (
    image_key,
    annotation_id,
    accessory_id,
    sort_order,
    created_by,
    created_at
  )
  select
    v_image_key,
    normalized.annotation_id,
    normalized.accessory_id,
    normalized.sort_order,
    auth.uid(),
    now()
  from (
    select distinct on (
      link.annotation_id,
      link.accessory_id
    )
      link.annotation_id,
      link.accessory_id,
      greatest(coalesce(link.sort_order, 0), 0) as sort_order
    from jsonb_to_recordset(p_accessory_links)
      as link(
        annotation_id text,
        accessory_id uuid,
        sort_order integer
      )
    where btrim(coalesce(link.annotation_id, '')) <> ''
      and link.accessory_id is not null
    order by
      link.annotation_id,
      link.accessory_id,
      greatest(coalesce(link.sort_order, 0), 0)
  ) as normalized
  join public.unit_price_technical_accessory_library library
    on library.id = normalized.accessory_id
   and library.is_active = true
  where exists (
    select 1
    from jsonb_array_elements(p_annotations) annotation
    where annotation ->> 'id' = normalized.annotation_id
  )
  order by normalized.annotation_id, normalized.sort_order;
end;
$$;

revoke all
on function public.save_unit_price_technical_sheet_v36(
  text,
  jsonb,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.save_unit_price_technical_sheet_v36(
  text,
  jsonb,
  jsonb,
  jsonb
)
to authenticated;
