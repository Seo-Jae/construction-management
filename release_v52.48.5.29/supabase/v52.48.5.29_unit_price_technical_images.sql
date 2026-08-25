-- v52.48.5.29 자재관리 > 일위대가작성 > 기술자료 이미지 관리
-- 목적
-- 1) 기존 권한 체계를 유지한 채 '일위대가 기술자료 이미지 관리' 특수권한을 추가합니다.
-- 2) 최고관리자는 항상 관리 가능하고, 최고관리자가 해당 특수권한을 부여한 사용자만 업로드/교체/삭제할 수 있습니다.
-- 3) 일반 사용자는 기술자료 이미지를 조회만 합니다.
-- 4) 기존 일위대가 데이터/버전/금액 계산 로직은 변경하지 않습니다.
--
-- Supabase SQL Editor에서 이 파일 전체를 1회 실행하세요.

begin;

-- 기존 v52.00.2 권한 카탈로그의 실제 테이블명을 하드코딩하지 않고,
-- 현재 운영 DB에서 권한 카탈로그 구조를 찾아 신규 특수권한 1건만 추가합니다.
do $$
declare
  v_permission_table regclass;
  v_row_count integer := 0;
begin
  select c.oid::regclass
    into v_permission_table
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'permission_key' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'area_code' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'area_label' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'menu_code' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'menu_label' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'action_label' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'action_rank' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'is_sensitive' and a.attnum > 0 and not a.attisdropped
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'is_preparing' and a.attnum > 0 and not a.attisdropped
     )
   order by c.relname
   limit 1;

  if v_permission_table is null then
    raise exception '기존 권한 카탈로그 테이블을 자동 탐지하지 못했습니다. 기존 회원권한 SQL 구조를 확인한 뒤 다시 적용해야 합니다.';
  end if;

  execute format(
    'update %s
        set area_code = $2,
            area_label = $3,
            menu_code = $4,
            menu_label = $5,
            action_label = $6,
            action_rank = $7,
            is_sensitive = $8,
            is_preparing = $9
      where permission_key = $1',
    v_permission_table
  )
  using
    'material.unit_price.tech_image.manage',
    'material',
    '자재관리',
    'unit_price',
    '일위대가작성',
    '기술자료 이미지 추가·수정',
    85,
    true,
    false;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    execute format(
      'insert into %s (
         permission_key,
         area_code,
         area_label,
         menu_code,
         menu_label,
         action_label,
         action_rank,
         is_sensitive,
         is_preparing
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      v_permission_table
    )
    using
      'material.unit_price.tech_image.manage',
      'material',
      '자재관리',
      'unit_price',
      '일위대가작성',
      '기술자료 이미지 추가·수정',
      85,
      true,
      false;
  end if;
end;
$$;

-- 최고관리자 또는 회원관리에서 특수권한을 부여받은 사용자만 기술자료 이미지를 관리할 수 있습니다.
create or replace function public.can_manage_unit_price_technical_images()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_runtime jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    return false;
  end if;

  if exists (
    select 1
      from public.user_profiles up
     where up.auth_user_id = auth.uid()
       and trim(coalesce(up.role, '')) = '최고관리자'
       and coalesce(up.account_status, 'active') <> 'disabled'
  ) then
    return true;
  end if;

  begin
    v_runtime := coalesce(to_jsonb(public.get_my_runtime_access_v2()), '{}'::jsonb);
  exception
    when undefined_function then
      return false;
  end;

  return coalesce(
    (v_runtime -> 'special_permissions') ? 'material.unit_price.tech_image.manage',
    false
  );
end;
$$;

-- 이미지 URL은 개별 세부규격이 아니라 기존 image_key 그룹 단위로 함께 갱신합니다.
-- 예: Clip_Bar천정의 300/450/600 규격은 동일한 기술자료 이미지를 공유합니다.
create or replace function public.set_unit_price_technical_image(
  p_image_key text,
  p_image_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_key text := trim(coalesce(p_image_key, ''));
begin
  if not public.can_manage_unit_price_technical_images() then
    raise exception '기술자료 이미지를 수정할 권한이 없습니다.';
  end if;

  if v_image_key = '' then
    raise exception '기술자료 이미지 키가 없습니다.';
  end if;

  update public.unit_price_specs
     set image_url = coalesce(p_image_url, ''),
         updated_by = auth.uid(),
         updated_at = now()
   where image_key = v_image_key;

  if not found then
    raise exception '기술자료 이미지와 연결할 일위대가 규격을 찾지 못했습니다.';
  end if;
end;
$$;

revoke all on function public.can_manage_unit_price_technical_images() from public;
revoke all on function public.set_unit_price_technical_image(text, text) from public;
grant execute on function public.can_manage_unit_price_technical_images() to authenticated;
grant execute on function public.set_unit_price_technical_image(text, text) to authenticated;

-- Supabase Storage: 기술자료 이미지 전용 버킷
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'unit-price-technical-images',
  'unit-price-technical-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 누구나 공개 URL로 조회할 수 있지만, 쓰기 작업은 위 관리권한 함수로 한 번 더 제한합니다.
drop policy if exists unit_price_technical_images_select on storage.objects;
create policy unit_price_technical_images_select
on storage.objects
for select
to authenticated
using (bucket_id = 'unit-price-technical-images');

drop policy if exists unit_price_technical_images_insert on storage.objects;
create policy unit_price_technical_images_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'unit-price-technical-images'
  and public.can_manage_unit_price_technical_images()
);

drop policy if exists unit_price_technical_images_update on storage.objects;
create policy unit_price_technical_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'unit-price-technical-images'
  and public.can_manage_unit_price_technical_images()
)
with check (
  bucket_id = 'unit-price-technical-images'
  and public.can_manage_unit_price_technical_images()
);

drop policy if exists unit_price_technical_images_delete on storage.objects;
create policy unit_price_technical_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'unit-price-technical-images'
  and public.can_manage_unit_price_technical_images()
);

-- 이번 테스트용 기술자료 2장 연결.
-- 실제 파일은 v52.48.5.29 적용 스크립트가 public/unit-price-technical-images/에 추가합니다.
-- 기존에 이미 기술자료가 등록되어 있으면 절대 덮어쓰지 않습니다.
update public.unit_price_specs
   set image_url = '/unit-price-technical-images/clip-bar-ceiling.png'
 where image_key = 'Clip_Bar천정'
   and trim(coalesce(image_url, '')) = '';

update public.unit_price_specs
   set image_url = '/unit-price-technical-images/clip-bar-ceiling-wind-pressure.png'
 where image_key = 'Clip_Bar천정_내풍압'
   and trim(coalesce(image_url, '')) = '';

commit;
