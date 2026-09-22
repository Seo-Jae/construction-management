-- Site identity and dates are independent of building geometry.
create table public.project_registry (
 project_name text primary key check (btrim(project_name) <> '' and project_name = btrim(project_name)),
 start_date date,
 end_date date,
 created_at timestamptz not null default now(),
 check (start_date is null or end_date is null or start_date <= end_date)
);
alter table public.project_registry enable row level security;
revoke all on public.project_registry from anon, authenticated;
grant select on public.project_registry to authenticated;
create policy project_registry_read on public.project_registry for select to authenticated using (true);
insert into public.project_registry(project_name,start_date,end_date)
select btrim(project_name),
 max(nullif(coalesce(config_json->>'projectStartDate',config_json->>'project_start_date',config_json->>'startDate',config_json->>'start_date'),'')::date),
 max(nullif(coalesce(config_json->>'projectEndDate',config_json->>'project_end_date',config_json->>'endDate',config_json->>'end_date'),'')::date)
from public.building_settings where nullif(btrim(project_name),'') is not null group by btrim(project_name);

create or replace function public.admin_list_projects_v1()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_project_super_admin_v1() then
  raise exception '최고관리자만 현장관리를 사용할 수 있습니다.';
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'project_name',p.project_name,'start_date',p.start_date,'end_date',p.end_date,
  'buildings',coalesce((select jsonb_agg(jsonb_build_object('building_name',b.building_name,'config_json',b.config_json) order by b.building_name)
  from public.building_settings b where b.project_name=p.project_name),'[]'::jsonb)
 ) order by p.project_name),'[]'::jsonb) from public.project_registry p);
end; $$;

CREATE OR REPLACE FUNCTION public.admin_save_project_v1(p_original_project_name text, p_project_name text, p_buildings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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


  v_is_new := v_original = '';

  if not v_is_new and v_original <> v_project then
    raise exception '과거 데이터 연결 보호를 위해 기존 현장명은 변경할 수 없습니다.';
  end if;

  if v_is_new and exists (
    select 1
      from public.project_registry
     where project_name = v_project
  ) then
    raise exception '이미 등록된 현장명입니다.';
  end if;

  if not v_is_new and not exists (select 1 from public.project_registry where project_name = v_project) then
    raise exception '존재하지 않는 현장입니다.';
  end if;
  insert into public.project_registry(project_name) values(v_project)
  on conflict(project_name) do nothing;

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

  update public.project_registry
  set start_date = coalesce(nullif(p_buildings->0->'config_json'->>'projectStartDate','')::date, start_date),
      end_date = coalesce(nullif(p_buildings->0->'config_json'->>'projectEndDate','')::date, end_date)
  where project_name = v_project;

  return jsonb_build_object(
    'project_name', v_project,
    'building_count', jsonb_array_length(p_buildings),
    'created', v_is_new
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_project_v1(p_project_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project text := btrim(coalesce(p_project_name, ''));
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 현장을 삭제할 수 있습니다.';
  end if;

  if v_project = '' then
    raise exception '삭제할 현장명이 없습니다.';
  end if;

  if v_project in ('본사', '전체현장') then
    raise exception '본사/전체현장은 삭제할 수 없습니다.';
  end if;

  if not exists (
    select 1
    from public.project_registry
    where project_name = v_project
  ) then
    raise exception '이미 삭제되었거나 존재하지 않는 현장입니다.';
  end if;

  delete from public.building_settings
  where btrim(project_name) = v_project;

  get diagnostics v_deleted = row_count;
  delete from public.project_registry where project_name = v_project;

  return jsonb_build_object(
    'project_name', v_project,
    'deleted_building_rows', v_deleted,
    'historical_data_preserved', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_registration_projects()
 RETURNS TABLE(project_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct btrim(bs.project_name)::text as project_name
    from public.project_registry bs
   where bs.project_name is not null
     and btrim(bs.project_name) <> ''
     and btrim(bs.project_name) not in ('본사', '전체현장')
   order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_account(p_user_id uuid, p_role text, p_organization_type text, p_project_name text, p_account_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  previous_profile public.user_profiles%rowtype;
  target_email text;
  labor_role text;
begin
  if not public.current_user_is_super_admin() then
    raise exception '최고관리자만 회원 상태를 변경할 수 있습니다.';
  end if;

  if p_role not in ('담당자', '관리자', '최고관리자') then
    raise exception '올바르지 않은 시스템 역할입니다.';
  end if;

  if p_organization_type not in ('본사', '현장') then
    raise exception '올바르지 않은 근무 구분입니다.';
  end if;

  if p_account_status not in ('pending', 'active', 'disabled', 'rejected') then
    raise exception '올바르지 않은 계정 상태입니다.';
  end if;

  if nullif(trim(p_project_name), '') is null then
    raise exception '접근 현장을 선택해주세요.';
  end if;

  if p_account_status = 'disabled' and p_user_id = auth.uid() then
    raise exception '현재 로그인한 본인 계정은 사용중지할 수 없습니다.';
  end if;

  select *
  into previous_profile
  from public.user_profiles as profile
  where profile.auth_user_id = p_user_id
  for update;

  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.';
  end if;

  target_email := lower(previous_profile.email);

  update public.user_profiles
  set
    role = p_role,
    organization_type = p_organization_type,
    project_name = case
      when p_organization_type = '본사' then '본사'
      else trim(p_project_name)
    end,
    account_status = p_account_status,
    approved_at = case
      when p_account_status = 'active' then now()
      else approved_at
    end,
    approved_by = case
      when p_account_status = 'active' then auth.uid()
      else approved_by
    end,
    disabled_at = case
      when p_account_status in ('disabled', 'rejected') then now()
      else null
    end,
    disabled_by = case
      when p_account_status in ('disabled', 'rejected') then auth.uid()
      else null
    end,
    updated_at = now()
  where auth_user_id = p_user_id;

  -- 사용중지·거절 계정은 Supabase Auth 재로그인도 차단합니다.
  update auth.users
  set banned_until = case
    when p_account_status in ('disabled', 'rejected')
      then '9999-12-31 23:59:59+00'::timestamptz
    else null
  end
  where id = p_user_id;

  -- 노임관리 현장 권한도 계정 승인 상태와 함께 갱신합니다.
  if to_regclass('public.labor_project_access') is not null then
    execute
      'update public.labor_project_access
       set active = false, updated_at = now()
       where lower(user_email) = $1'
    using target_email;

    if p_account_status = 'active' then
      labor_role := case p_role
        when '최고관리자' then 'admin'
        when '관리자' then 'labor_manager'
        else 'site_manager'
      end;

      if p_organization_type = '본사'
         and p_role in ('관리자', '최고관리자') then
        execute
          'insert into public.labor_project_access (
             project_name, user_email, access_role, active, created_by
           )
           select distinct
             trim(settings.project_name), $1, $2, true, $3
           from public.project_registry as settings
           where nullif(trim(settings.project_name), '''') is not null
             and trim(settings.project_name) <> ''본사''
           on conflict (project_name, user_email) do update
           set access_role = excluded.access_role,
               active = true,
               updated_at = now()'
        using target_email, labor_role, auth.uid();
      elsif p_organization_type = '현장' then
        execute
          'insert into public.labor_project_access (
             project_name, user_email, access_role, active, created_by
           )
           values ($1, $2, $3, true, $4)
           on conflict (project_name, user_email) do update
           set access_role = excluded.access_role,
               active = true,
               updated_at = now()'
        using trim(p_project_name), target_email, labor_role, auth.uid();
      end if;
    end if;
  end if;

  insert into public.user_account_events (
    target_user_id,
    target_email,
    event_type,
    previous_status,
    next_status,
    role,
    project_name,
    performed_by
  )
  values (
    p_user_id,
    target_email,
    case
      when p_account_status = 'active'
           and coalesce(previous_profile.account_status, 'active') = 'pending'
        then 'approved'
      when p_account_status = 'disabled' then 'disabled'
      when p_account_status = 'rejected' then 'rejected'
      when p_account_status = 'active'
           and previous_profile.account_status in ('disabled', 'rejected')
        then 'reactivated'
      else 'permission_updated'
    end,
    coalesce(previous_profile.account_status, 'active'),
    p_account_status,
    p_role,
    case when p_organization_type = '본사' then '본사' else trim(p_project_name) end,
    auth.uid()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_account_projects(p_user_id uuid, p_role text, p_organization_type text, p_project_names text[], p_account_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  previous_profile public.user_profiles%rowtype;
  target_email text;
  labor_role text;
  normalized_project_names text[];
  representative_project_name text;
  has_all_projects boolean := false;
begin
  if not public.current_user_is_super_admin() then
    raise exception '최고관리자만 회원 상태를 변경할 수 있습니다.';
  end if;

  if p_role not in ('담당자', '관리자', '최고관리자') then
    raise exception '올바르지 않은 시스템 역할입니다.';
  end if;

  if p_organization_type not in ('본사', '현장') then
    raise exception '올바르지 않은 구분입니다.';
  end if;

  if p_account_status not in ('pending', 'active', 'disabled', 'rejected') then
    raise exception '올바르지 않은 계정 상태입니다.';
  end if;

  has_all_projects :=
    '전체현장' = any(coalesce(p_project_names, '{}'::text[]));

  if has_all_projects then
    if p_organization_type <> '본사'
       or p_role not in ('관리자', '최고관리자') then
      raise exception '전체현장은 본사 관리자·최고관리자에게만 지정할 수 있습니다.';
    end if;

    normalized_project_names := array['전체현장']::text[];
  else
    select coalesce(
      array_agg(project_name order by first_position),
      '{}'::text[]
    )
    into normalized_project_names
    from (
      select
        trim(item.project_name) as project_name,
        min(item.position) as first_position
      from unnest(coalesce(p_project_names, '{}'::text[]))
        with ordinality as item(project_name, position)
      where nullif(trim(item.project_name), '') is not null
        and trim(item.project_name) not in ('본사', '전체현장')
      group by trim(item.project_name)
    ) as normalized;

    if coalesce(cardinality(normalized_project_names), 0) = 0 then
      raise exception '접근 현장을 하나 이상 선택해주세요.';
    end if;

    if exists (
      select 1
      from unnest(normalized_project_names) as selected(project_name)
      where not exists (
        select 1
        from public.project_registry as settings
        where trim(settings.project_name) = selected.project_name
      )
    ) then
      raise exception '등록되지 않은 현장이 포함되어 있습니다. 현장목록을 새로고침해주세요.';
    end if;
  end if;

  representative_project_name := case
    when p_organization_type = '본사' then '본사'
    else normalized_project_names[1]
  end;

  if p_account_status = 'disabled' and p_user_id = auth.uid() then
    raise exception '현재 로그인한 본인 계정은 사용중지할 수 없습니다.';
  end if;

  select *
  into previous_profile
  from public.user_profiles as profile
  where profile.auth_user_id = p_user_id
  for update;

  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.';
  end if;

  target_email := lower(previous_profile.email);

  update public.user_profiles
  set
    role = p_role,
    organization_type = p_organization_type,
    project_name = representative_project_name,
    project_names = normalized_project_names,
    account_status = p_account_status,
    approved_at = case
      when p_account_status = 'active' then now()
      else approved_at
    end,
    approved_by = case
      when p_account_status = 'active' then auth.uid()
      else approved_by
    end,
    disabled_at = case
      when p_account_status in ('disabled', 'rejected') then now()
      else null
    end,
    disabled_by = case
      when p_account_status in ('disabled', 'rejected') then auth.uid()
      else null
    end,
    updated_at = now()
  where auth_user_id = p_user_id;

  update auth.users
  set banned_until = case
    when p_account_status in ('disabled', 'rejected')
      then '9999-12-31 23:59:59+00'::timestamptz
    else null
  end
  where id = p_user_id;

  -- 기존 노임관리 개별 권한은 먼저 끄고 새 설정과 동일하게 다시 맞춥니다.
  if to_regclass('public.labor_project_access') is not null then
    execute
      'update public.labor_project_access
       set active = false, updated_at = now()
       where lower(user_email) = $1'
    using target_email;

    if p_account_status = 'active' then
      labor_role := case p_role
        when '최고관리자' then 'admin'
        when '관리자' then 'labor_manager'
        else 'site_manager'
      end;

      if has_all_projects then
        execute
          'insert into public.labor_project_access (
             project_name, user_email, access_role, active, created_by
           )
           select distinct
             trim(settings.project_name), $1, $2, true, $3
           from public.project_registry as settings
           where nullif(trim(settings.project_name), '''') is not null
             and trim(settings.project_name) not in (''본사'', ''전체현장'')
           on conflict (project_name, user_email) do update
           set access_role = excluded.access_role,
               active = true,
               updated_at = now()'
        using target_email, labor_role, auth.uid();
      else
        execute
          'insert into public.labor_project_access (
             project_name, user_email, access_role, active, created_by
           )
           select selected.project_name, $1, $2, true, $3
           from unnest($4::text[]) as selected(project_name)
           on conflict (project_name, user_email) do update
           set access_role = excluded.access_role,
               active = true,
               updated_at = now()'
        using target_email, labor_role, auth.uid(), normalized_project_names;
      end if;
    end if;
  end if;

  insert into public.user_account_events (
    target_user_id,
    target_email,
    event_type,
    previous_status,
    next_status,
    role,
    project_name,
    performed_by
  )
  values (
    p_user_id,
    target_email,
    case
      when p_account_status = 'active'
           and coalesce(previous_profile.account_status, 'active') = 'pending'
        then 'approved'
      when p_account_status = 'disabled' then 'disabled'
      when p_account_status = 'rejected' then 'rejected'
      when p_account_status = 'active'
           and previous_profile.account_status in ('disabled', 'rejected')
        then 'reactivated'
      else 'permission_updated'
    end,
    coalesce(previous_profile.account_status, 'active'),
    p_account_status,
    p_role,
    case
      when has_all_projects then '전체현장'
      else array_to_string(normalized_project_names, ', ')
    end,
    auth.uid()
  );
end;
$function$;


create or replace function public.admin_save_project_registration_v190(
 p_original_project_name text,p_project_name text,p_buildings jsonb,p_start_date date,p_end_date date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_project_super_admin_v1() then
  raise exception '최고관리자만 현장을 개설하거나 수정할 수 있습니다.';
 end if;
 if p_start_date is null or p_end_date is null or p_start_date>p_end_date then
  raise exception '현장 시작일과 종료일을 확인해주세요.';
 end if;
 result := public.admin_save_project_v1(p_original_project_name,p_project_name,p_buildings);
 update public.project_registry set start_date=p_start_date,end_date=p_end_date
 where project_name=btrim(p_project_name);
 return result;
end; $$;
revoke all on function public.admin_save_project_registration_v190(text,text,jsonb,date,date) from public;
grant execute on function public.admin_save_project_registration_v190(text,text,jsonb,date,date) to authenticated;
