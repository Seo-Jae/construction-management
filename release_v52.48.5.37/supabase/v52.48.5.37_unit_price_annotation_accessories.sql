-- v52.48.5.37
-- 자재관리 > 일위대가작성 > 기술자료 부속자재 연결 직관화 / VIEW 선택연동 보강
--
-- 기존 v52.48.5.36 데이터는 삭제하지 않습니다.
-- annotation_id 연결에 번호/명칭 메타데이터를 함께 저장하여
-- VIEW에서 번호/명칭 클릭 시 해당 부속자재를 더 안정적으로 찾도록 보강합니다.

alter table public.unit_price_technical_annotation_accessories
  add column if not exists annotation_symbol text;

alter table public.unit_price_technical_annotation_accessories
  add column if not exists annotation_title text;

-- 기존 v36 연결정보를 현재 저장된 지시선 JSON에서 가능한 범위까지 자동 보완합니다.
update public.unit_price_technical_annotation_accessories as link
set
  annotation_symbol = nullif(annotation.value ->> 'symbol', ''),
  annotation_title = nullif(annotation.value ->> 'title', '')
from public.unit_price_technical_annotations as sheet
cross join lateral jsonb_array_elements(sheet.annotations) as annotation(value)
where sheet.image_key = link.image_key
  and annotation.value ->> 'id' = link.annotation_id
  and (
    link.annotation_symbol is null
    or link.annotation_title is null
  );

create index if not exists idx_unit_price_technical_annotation_accessories_symbol
  on public.unit_price_technical_annotation_accessories(
    image_key,
    annotation_symbol,
    sort_order
  );

create or replace function public.save_unit_price_technical_sheet_v37(
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
    annotation_symbol,
    annotation_title,
    accessory_id,
    sort_order,
    created_by,
    created_at
  )
  select
    v_image_key,
    normalized.annotation_id,
    annotation_meta.annotation_symbol,
    annotation_meta.annotation_title,
    normalized.accessory_id,
    normalized.sort_order,
    auth.uid(),
    now()
  from (
    select distinct on (
      link.annotation_id,
      link.accessory_id
    )
      btrim(link.annotation_id) as annotation_id,
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
  join lateral (
    select
      nullif(annotation.value ->> 'symbol', '') as annotation_symbol,
      nullif(annotation.value ->> 'title', '') as annotation_title
    from jsonb_array_elements(p_annotations) as annotation(value)
    where annotation.value ->> 'id' = normalized.annotation_id
    limit 1
  ) as annotation_meta on true
  join public.unit_price_technical_accessory_library as library
    on library.id = normalized.accessory_id
   and library.is_active = true
  order by
    normalized.annotation_id,
    normalized.sort_order;
end;
$$;

revoke all
on function public.save_unit_price_technical_sheet_v37(
  text,
  jsonb,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.save_unit_price_technical_sheet_v37(
  text,
  jsonb,
  jsonb,
  jsonb
)
to authenticated;
