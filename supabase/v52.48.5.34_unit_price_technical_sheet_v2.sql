-- v52.48.5.34 자재관리 > 일위대가작성 > 기술자료 편집기 v2
-- 기존 v52.48.5.32 지시선 데이터는 그대로 유지합니다.
-- 하단 설명 박스의 열수/위치/크기/글자설정만 별도 layout_settings JSON으로 추가 저장합니다.

alter table public.unit_price_technical_annotations
  add column if not exists layout_settings jsonb
  not null
  default '{
    "columns": 2,
    "footerHeight": 190,
    "fontSize": 18,
    "rowGap": 5,
    "columnGap": 34,
    "boxLeft": 5,
    "boxTop": 10,
    "boxWidth": 90,
    "showDescription": false
  }'::jsonb;

alter table public.unit_price_technical_annotations
  drop constraint if exists unit_price_technical_annotations_layout_object_check;

alter table public.unit_price_technical_annotations
  add constraint unit_price_technical_annotations_layout_object_check
  check (jsonb_typeof(layout_settings) = 'object');

create or replace function public.save_unit_price_technical_sheet(
  p_image_key text,
  p_annotations jsonb,
  p_layout_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_key text := btrim(coalesce(p_image_key, ''));
  v_count integer := 0;
  v_layout jsonb := coalesce(
    p_layout_settings,
    '{
      "columns": 2,
      "footerHeight": 190,
      "fontSize": 18,
      "rowGap": 5,
      "columnGap": 34,
      "boxLeft": 5,
      "boxTop": 10,
      "boxWidth": 90,
      "showDescription": false
    }'::jsonb
  );
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

  if jsonb_typeof(v_layout) <> 'object' then
    raise exception '하단 설명 레이아웃 형식이 올바르지 않습니다.';
  end if;

  v_count := jsonb_array_length(p_annotations);
  if v_count > 100 then
    raise exception '기술자료 지시선은 이미지당 최대 100개까지 저장할 수 있습니다.';
  end if;

  insert into public.unit_price_technical_annotations (
    image_key,
    annotations,
    layout_settings,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    v_image_key,
    p_annotations,
    v_layout,
    auth.uid(),
    auth.uid(),
    now(),
    now()
  )
  on conflict (image_key) do update
     set annotations = excluded.annotations,
         layout_settings = excluded.layout_settings,
         updated_by = auth.uid(),
         updated_at = now();
end;
$$;

revoke all on function public.save_unit_price_technical_sheet(text, jsonb, jsonb) from public;
grant execute on function public.save_unit_price_technical_sheet(text, jsonb, jsonb) to authenticated;
