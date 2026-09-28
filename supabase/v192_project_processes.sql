-- Original progress catalog only. No trial tables or existing progress values are modified.
begin;
create table public.project_processes (
  id bigint generated always as identity primary key,
  project_name text not null,
  process_type text not null check (process_type = btrim(process_type) and char_length(process_type) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (project_name, process_type)
);

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
create policy project_processes_add on public.project_processes for insert to authenticated with check (
  public.progress_user_can_access_project(project_name) and
  public.dashboard_permission_effective_v52_13('construction.progress.view', project_name)
);
-- No update/delete grants or policies: names remain stable for existing historical records.
notify pgrst, 'reload schema';
commit;
