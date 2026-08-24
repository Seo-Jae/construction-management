-- v52.48.5.44 최고관리자 현장관리
-- 목적:
-- 1) 기존 building_settings를 기준으로 현장/동 구조를 시스템에서 조회
-- 2) 최고관리자만 새 현장 및 새 동을 추가
-- 3) 기존 현장의 config_json은 수정 가능하되 현장명/기존 동명/기존 동 삭제는 보호
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.

create or replace function public.is_project_super_admin_v1()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_profiles
     where auth_user_id = auth.uid()
       and role = '최고관리자'
       and coalesce(account_status, 'active') = 'active'
  );
$$;

revoke all on function public.is_project_super_admin_v1() from public;
grant execute on function public.is_project_super_admin_v1() to authenticated;

create or replace function public.admin_list_projects_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 현장관리를 사용할 수 있습니다.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_name', grouped.project_name,
        'buildings', grouped.buildings
      )
      order by grouped.project_name
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      btrim(project_name) as project_name,
      jsonb_agg(
        jsonb_build_object(
          'building_name', btrim(building_name),
          'config_json', coalesce(to_jsonb(config_json), '{}'::jsonb)
        )
        order by btrim(building_name)
      ) as buildings
    from public.building_settings
    where nullif(btrim(project_name), '') is not null
      and nullif(btrim(building_name), '') is not null
    group by btrim(project_name)
  ) grouped;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_projects_v1() from public;
grant execute on function public.admin_list_projects_v1() to authenticated;

create or replace function public.admin_save_project_v1(
  p_original_project_name text,
  p_project_name text,
  p_buildings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original text := btrim(coalesce(p_original_project_name, ''));
  v_project text := btrim(coalesce(p_project_name, ''));
  v_building jsonb;
  v_building_name text;
  v_config jsonb;
  v_floors integer;
  v_units_per_floor integer;
  v_seen_names text[] := array[]::text[];
  v_is_new boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 현장을 추가하거나 수정할 수 있습니다.';
  end if;

  if v_project = '' then
    raise exception '현장명을 입력해주세요.';
  end if;

  if v_project in ('본사', '전체현장') then
    raise exception '본사/전체현장은 현장명으로 사용할 수 없습니다.';
  end if;

  if p_buildings is null or jsonb_typeof(p_buildings) <> 'array' then
    raise exception '동 구성 데이터 형식이 올바르지 않습니다.';
  end if;

  if jsonb_array_length(p_buildings) = 0 then
    raise exception '최소 1개 동을 등록해주세요.';
  end if;

  v_is_new := v_original = '';

  if not v_is_new and v_original <> v_project then
    raise exception '과거 데이터 연결 보호를 위해 기존 현장명은 변경할 수 없습니다.';
  end if;

  if v_is_new and exists (
    select 1
      from public.building_settings
     where btrim(project_name) = v_project
  ) then
    raise exception '이미 등록된 현장명입니다.';
  end if;

  for v_building in
    select value
      from jsonb_array_elements(p_buildings)
  loop
    v_building_name := btrim(coalesce(v_building ->> 'building_name', ''));
    v_config := coalesce(v_building -> 'config_json', '{}'::jsonb);

    if v_building_name = '' then
      raise exception '동명을 입력해주세요.';
    end if;

    if v_building_name = any(v_seen_names) then
      raise exception '같은 동명이 중복되어 있습니다: %', v_building_name;
    end if;
    v_seen_names := array_append(v_seen_names, v_building_name);

    begin
      v_floors := nullif(v_config ->> 'floors', '')::integer;
      v_units_per_floor := nullif(v_config ->> 'unitsPerFloor', '')::integer;
    exception
      when invalid_text_representation then
        raise exception '%의 층수/호수 값이 올바르지 않습니다.', v_building_name;
    end;

    if coalesce(v_floors, 0) <= 0 then
      raise exception '%의 최고층은 1 이상이어야 합니다.', v_building_name;
    end if;

    if coalesce(v_units_per_floor, 0) <= 0 then
      raise exception '%의 기준 호수/층은 1 이상이어야 합니다.', v_building_name;
    end if;

    if not v_is_new and exists (
      select 1
        from public.building_settings
       where btrim(project_name) = v_project
         and btrim(building_name) = v_building_name
    ) then
      update public.building_settings
         set config_json = v_config
       where btrim(project_name) = v_project
         and btrim(building_name) = v_building_name;
    else
      insert into public.building_settings (
        project_name,
        building_name,
        config_json
      ) values (
        v_project,
        v_building_name,
        v_config
      );
    end if;
  end loop;

  return jsonb_build_object(
    'project_name', v_project,
    'building_count', jsonb_array_length(p_buildings),
    'created', v_is_new
  );
end;
$$;

revoke all on function public.admin_save_project_v1(text, text, jsonb) from public;
grant execute on function public.admin_save_project_v1(text, text, jsonb) to authenticated;
