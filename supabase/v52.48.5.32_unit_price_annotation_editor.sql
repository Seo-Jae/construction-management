-- v52.48.5.32 자재관리 > 일위대가작성 > 기술자료 편집기 v1
-- 기존 v52.48.5.31까지의 기능/데이터를 변경하지 않고,
-- image_key별 지시선/번호/명칭 좌표 데이터만 별도 저장합니다.
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.

create table if not exists public.unit_price_technical_annotations (
  image_key text primary key,
  annotations jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_price_technical_annotations_array_check
    check (jsonb_typeof(annotations) = 'array')
);

comment on table public.unit_price_technical_annotations is
  '일위대가 기술자료 이미지의 지시선/번호/명칭 좌표 데이터. image_key 그룹 단위 공유.';

alter table public.unit_price_technical_annotations enable row level security;

drop policy if exists unit_price_technical_annotations_select_authenticated
  on public.unit_price_technical_annotations;
create policy unit_price_technical_annotations_select_authenticated
on public.unit_price_technical_annotations
for select
to authenticated
using (true);

grant select on public.unit_price_technical_annotations to authenticated;
revoke insert, update, delete on public.unit_price_technical_annotations from authenticated;

-- 기존 회원관리의 기술자료 이미지 관리 권한을 그대로 사용합니다.
-- 최고관리자는 무조건 허용, 그 외 사용자는 최고관리자가 부여한 특수권한이 있어야 합니다.
create or replace function public.can_manage_unit_price_technical_annotations()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := '';
  v_runtime jsonb := null;
begin
  if auth.uid() is null then
    return false;
  end if;

  select coalesce(role, '')
    into v_role
    from public.user_profiles
   where auth_user_id = auth.uid()
   limit 1;

  if v_role = '최고관리자' then
    return true;
  end if;

  begin
    select public.get_my_runtime_access_v2()
      into v_runtime;
  exception
    when undefined_function then
      v_runtime := null;
  end;

  if exists (
    select 1
      from jsonb_array_elements_text(
        coalesce(v_runtime -> 'special_permissions', '[]'::jsonb)
      ) as permission_key(value)
     where permission_key.value = 'material.unit_price.tech_image.manage'
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_manage_unit_price_technical_annotations() from public;
grant execute on function public.can_manage_unit_price_technical_annotations() to authenticated;

create or replace function public.save_unit_price_technical_annotations(
  p_image_key text,
  p_annotations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_key text := btrim(coalesce(p_image_key, ''));
  v_count integer := 0;
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

  v_count := jsonb_array_length(p_annotations);
  if v_count > 100 then
    raise exception '기술자료 지시선은 이미지당 최대 100개까지 저장할 수 있습니다.';
  end if;

  insert into public.unit_price_technical_annotations (
    image_key,
    annotations,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    v_image_key,
    p_annotations,
    auth.uid(),
    auth.uid(),
    now(),
    now()
  )
  on conflict (image_key) do update
     set annotations = excluded.annotations,
         updated_by = auth.uid(),
         updated_at = now();
end;
$$;

revoke all on function public.save_unit_price_technical_annotations(text, jsonb) from public;
grant execute on function public.save_unit_price_technical_annotations(text, jsonb) to authenticated;
