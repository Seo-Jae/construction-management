-- Persist site-manager geometry in the existing shared table. No table/data deletion.
begin;

create or replace function public.building_setup_unit_codes_v199(p_config jsonb)
returns table(unit_code text) language sql immutable set search_path = public as $$
  select distinct f::text || lpad(coalesce(nullif(p_config->'aliasUnits'->f::text->>u::text, '')::integer, u)::text, 2, '0')
  from generate_series(1, (p_config->>'floors')::integer) f
  cross join generate_series(1, (p_config->>'unitsPerFloor')::integer) u
  where case
    when coalesce(p_config->'linePilotiFloors', '{}'::jsonb) ? u::text then
      not coalesce(p_config->'linePilotiFloors'->u::text, '[]'::jsonb) @> jsonb_build_array(f)
      and (not coalesce(p_config->'exceptions', '{}'::jsonb) ? f::text
        or coalesce(p_config->'exceptions'->f::text->'units', '[]'::jsonb) @> jsonb_build_array(u))
    when coalesce(p_config->'exceptions', '{}'::jsonb) ? f::text then
      coalesce(p_config->'exceptions'->f::text->'units', '[]'::jsonb) @> jsonb_build_array(u)
    else not coalesce(p_config->'pilotiFloors', '[]'::jsonb) @> jsonb_build_array(f)
  end;
$$;
revoke all on function public.building_setup_unit_codes_v199(jsonb) from public, anon, authenticated;

create or replace function public.save_building_setup_v199(p_project text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  cfg jsonb;
  old_cfg jsonb;
  expected jsonb;
  v_building text;
  seen text[] := '{}';
  removed text[];
  row_exists boolean;
begin
  if auth.uid() is null or not coalesce(public.progress_user_can_access_project(p_project), false)
    or not coalesce(public.dashboard_permission_effective_v52_13('construction.progress.view', p_project), false) then
    raise exception '이 현장의 골구도를 수정할 권한이 없습니다.';
  end if;
  -- Serialize concurrent setup saves for this site; no other site is touched.
  perform 1 from public.project_registry where project_name = p_project for update;
  if not found then raise exception '등록된 현장이 아닙니다.'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then raise exception '저장할 동 목록을 확인해주세요.'; end if;
  if jsonb_array_length(p_changes) > 500 then raise exception '동 개수가 너무 많습니다.'; end if;

  for item in select value from jsonb_array_elements(p_changes) loop
    v_building := btrim(coalesce(item->>'building_name', ''));
    cfg := item->'config_json';
    expected := nullif(item->'expected_config', 'null'::jsonb);
    if char_length(v_building) not between 1 and 80 or v_building = any(seen) then raise exception '동명과 중복 여부를 확인해주세요.'; end if;
    seen := array_append(seen, v_building);
    if cfg is null or jsonb_typeof(cfg) <> 'object'
      or coalesce(cfg->>'floors', '') !~ '^[0-9]+$' or coalesce(cfg->>'unitsPerFloor', '') !~ '^[0-9]+$' then
      raise exception '%의 층수와 라인을 확인해주세요.', v_building;
    end if;
    if (cfg->>'floors')::integer not between 1 and 100 or (cfg->>'unitsPerFloor')::integer not between 1 and 30 then
      raise exception '%의 층수 또는 라인 수가 범위를 벗어났습니다.', v_building;
    end if;
    if jsonb_typeof(cfg->'exceptions') is distinct from 'object'
      or jsonb_typeof(cfg->'unitTypes') is distinct from 'object'
      or jsonb_typeof(cfg->'floorUnitTypes') is distinct from 'object'
      or jsonb_typeof(cfg->'linePilotiFloors') is distinct from 'object'
      or jsonb_typeof(cfg->'initialSetupDraft'->'lines') is distinct from 'array' then
      raise exception '%의 골구도 설정 형식이 올바르지 않습니다.', v_building;
    end if;
    select config_json into old_cfg from public.building_settings
      where project_name = p_project and building_name = v_building for update;
    row_exists := found;
    if row_exists and (expected is null or old_cfg is distinct from expected) then
      raise exception '%의 설정이 다른 곳에서 변경되었습니다. 창을 다시 열어 최신 설정을 불러와주세요.', v_building;
    elsif not row_exists and expected is not null then
      raise exception '%의 설정이 삭제되거나 변경되었습니다. 새로고침해주세요.', v_building;
    end if;
    if exists (select 1 from public.building_settings where project_name = p_project and building_name <> v_building
      and regexp_replace(btrim(building_name), '동$', '') = regexp_replace(v_building, '동$', '')) then
      raise exception '같은 동명이 이미 등록되어 있습니다: %', v_building;
    end if;

    if row_exists then
      select array_agg(unit_code) into removed from (
        select unit_code from public.building_setup_unit_codes_v199(old_cfg)
        except select unit_code from public.building_setup_unit_codes_v199(cfg)
      ) removed_units;
      if removed is not null and (
        exists (select 1 from public.unit_progress p where p.project_name = p_project and p.building = v_building and p.unit::text = any(removed))
        or exists (select 1 from public.project_unit_types t where t.project_name = p_project and t.building = v_building and t.unit::text = any(removed))
        or exists (select 1 from public.option_status_documents d cross join unnest(removed) u
          where d.project_name = p_project and d.unit_values ? (v_building || '-' || u))
      ) then
        raise exception '%에 실적·타입·옵션 자료가 있는 세대는 삭제하거나 병합할 수 없습니다. 기존 세대번호를 유지해주세요.', v_building;
      end if;
      update public.building_settings set config_json = cfg where project_name = p_project and building_name = v_building;
    else
      insert into public.building_settings(project_name, building_name, config_json) values(p_project, v_building, cfg);
    end if;
  end loop;
  return (select coalesce(jsonb_agg(jsonb_build_object('building_name', b.building_name, 'config_json', b.config_json) order by b.building_name), '[]'::jsonb)
    from public.building_settings b where b.project_name = p_project);
end;
$$;
revoke all on function public.save_building_setup_v199(text,jsonb) from public, anon;
grant execute on function public.save_building_setup_v199(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
