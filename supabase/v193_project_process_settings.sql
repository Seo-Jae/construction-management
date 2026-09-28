-- Original progress catalog only. No trial tables or existing progress values are modified.
begin;
create table if not exists public.project_processes (
  id bigint generated always as identity primary key,
  project_name text not null,
  process_type text not null check (process_type = btrim(process_type) and char_length(process_type) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (project_name, process_type)
);

alter table public.project_processes add column if not exists is_enabled boolean not null default true;
alter table public.project_processes add column if not exists is_archived boolean not null default false;
alter table public.project_processes add column if not exists sort_order integer;

-- Preserve every process already used by the original progress and phase settings.
insert into public.project_processes(project_name, process_type)
select project_name, process_type from (
  select project_name, btrim(process_type) as process_type from public.unit_progress
  union
  select project_name, btrim(process_type) as process_type from public.progress_targets
) used
where project_name is not null and char_length(process_type) between 1 and 60
order by project_name, process_type
on conflict (project_name, process_type) do nothing;

alter table public.project_processes enable row level security;
revoke all on public.project_processes from anon, authenticated;
grant select, insert on public.project_processes to authenticated;
grant usage, select on sequence public.project_processes_id_seq to authenticated;

drop policy if exists project_processes_read on public.project_processes;
create policy project_processes_read on public.project_processes for select to authenticated using (
  public.progress_user_can_access_project(project_name) and (
    public.dashboard_permission_effective_v52_13('construction.progress.view', project_name) or
    public.dashboard_permission_effective_v52_13('construction.progress_multi.view', project_name) or
    public.dashboard_permission_effective_v52_13('construction.progress_daily.view', project_name) or
    public.dashboard_permission_effective_v52_13('construction.progress_weekly.view', project_name) or
    public.dashboard_permission_effective_v52_13('construction.progress_monthly.view', project_name) or
    public.dashboard_permission_effective_v52_13('construction.dashboard.view', project_name) or
    public.dashboard_permission_effective_v52_13('report.weekly.view', project_name)
  )
);
drop policy if exists project_processes_add on public.project_processes;
create policy project_processes_add on public.project_processes for insert to authenticated with check (
  public.progress_user_can_access_project(project_name) and
  public.dashboard_permission_effective_v52_13('construction.progress.view', project_name)
);
-- No update/delete grants or policies: names remain stable for existing historical records.

-- Only this permission-checked function may update selection/order/archive flags.
create or replace function public.save_project_process_settings_v193(p_project text, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(public.progress_user_can_access_project(p_project), false)
    or not coalesce(public.dashboard_permission_effective_v52_13('construction.progress.view', p_project), false) then
    raise exception '이 현장의 공종 설정을 변경할 권한이 없습니다.';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'array' then
    raise exception '공종 설정을 확인해주세요.';
  end if;
  if jsonb_array_length(p_settings) > 2000 then raise exception '공종 설정 개수가 너무 많습니다.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_settings) as x(process_type text,is_enabled boolean,is_archived boolean,sort_order integer)
    where process_type is null or char_length(btrim(process_type)) not between 1 and 60
      or process_type <> btrim(process_type) or is_enabled is null or is_archived is null
      or sort_order is null or sort_order < 0
  ) or (select count(*) <> count(distinct x.process_type) from jsonb_to_recordset(p_settings) as x(process_type text)) then
    raise exception '공종 이름과 순서를 확인해주세요.';
  end if;
  -- No rows in unit_progress, progress_targets, or any trial table are touched.
  insert into public.project_processes(project_name,process_type,is_enabled,is_archived,sort_order)
  select p_project,process_type,is_enabled and not is_archived,is_archived,sort_order
  from jsonb_to_recordset(p_settings) as x(process_type text,is_enabled boolean,is_archived boolean,sort_order integer)
  on conflict (project_name,process_type) do update set
    is_enabled=excluded.is_enabled, is_archived=excluded.is_archived, sort_order=excluded.sort_order;
end $$;
revoke all on function public.save_project_process_settings_v193(text,jsonb) from public, anon;
grant execute on function public.save_project_process_settings_v193(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
