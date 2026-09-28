-- Temporary progress screens: share site geometry, never write original progress tables.
begin;

create table public.project_processes_trial (
  id bigint generated always as identity primary key,
  project_name text not null,
  process_type text not null check (process_type = btrim(process_type) and char_length(process_type) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (project_name, process_type)
);

create table public.unit_progress_trial (
  project_name text not null,
  process_type text not null,
  building text not null,
  unit text not null,
  status text not null check (status in ('작업중', '작업완료')),
  completion_date date not null,
  updated_at timestamptz not null default now(),
  primary key (project_name, process_type, building, unit),
  foreign key (project_name, process_type) references public.project_processes_trial(project_name, process_type)
);

create table public.progress_targets_trial (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  process_type text not null,
  sequence integer not null check (sequence > 0),
  target_name text not null,
  target_date date not null,
  building_floor_targets jsonb not null default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_name, process_type, sequence),
  foreign key (project_name, process_type) references public.project_processes_trial(project_name, process_type)
);

-- Same site and menu permissions as the existing input/comparison screens.
do $$
declare t text;
begin
  foreach t in array array['project_processes_trial','unit_progress_trial','progress_targets_trial'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($policy$
      create policy trial_read on public.%I for select to authenticated using (
        public.progress_user_can_access_project(project_name) and (
          public.dashboard_permission_effective_v52_13('construction.progress.view',project_name) or
          public.dashboard_permission_effective_v52_13('construction.progress_multi.view',project_name)
        )
      )$policy$, t);
    execute format($policy$
      create policy trial_insert on public.%I for insert to authenticated with check (
        public.progress_user_can_access_project(project_name) and
        public.dashboard_permission_effective_v52_13('construction.progress.view',project_name)
      )$policy$, t);
    execute format($policy$
      create policy trial_update on public.%I for update to authenticated using (
        public.progress_user_can_access_project(project_name) and
        public.dashboard_permission_effective_v52_13('construction.progress.view',project_name)
      ) with check (
        public.progress_user_can_access_project(project_name) and
        public.dashboard_permission_effective_v52_13('construction.progress.view',project_name)
      )$policy$, t);
    execute format($policy$
      create policy trial_delete on public.%I for delete to authenticated using (
        public.progress_user_can_access_project(project_name) and
        public.dashboard_permission_effective_v52_13('construction.progress.view',project_name)
      )$policy$, t);
  end loop;
end $$;

grant usage, select on sequence public.project_processes_trial_id_seq to authenticated;

create function public.trial_progress_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger trial_target_updated before update on public.progress_targets_trial
for each row execute function public.trial_progress_updated_at();

-- One transaction for a selection, including reverting rows to not-started.
-- SECURITY INVOKER keeps RLS in force; permission check also rejects silent RLS deletes.
create function public.save_trial_progress(
  p_project text, p_process text, p_status text, p_date date, p_cells jsonb
) returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(public.progress_user_can_access_project(p_project), false)
    or not coalesce(public.dashboard_permission_effective_v52_13('construction.progress.view',p_project), false) then
    raise exception '이 현장의 공종별 현황을 수정할 권한이 없습니다.';
  end if;
  if p_status is null or p_status not in ('작업전','작업중','작업완료') or p_date is null
    or p_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception '작업 상태 또는 날짜를 확인해주세요.';
  end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then
    raise exception '선택된 세대를 확인해주세요.';
  end if;
  if jsonb_array_length(p_cells) = 0 or exists (
    select 1 from jsonb_to_recordset(p_cells) as c(building text, unit text)
    where coalesce(btrim(c.building),'') = '' or coalesce(btrim(c.unit),'') = ''
  ) then raise exception '선택된 세대를 확인해주세요.'; end if;
  if not exists (select 1 from public.project_processes_trial where project_name=p_project and process_type=p_process) then
    raise exception '등록된 공종을 선택해주세요.';
  end if;

  if p_status = '작업전' then
    delete from public.unit_progress_trial p using jsonb_to_recordset(p_cells) as c(building text, unit text)
    where p.project_name=p_project and p.process_type=p_process and p.building=c.building and p.unit=c.unit;
  else
    insert into public.unit_progress_trial (project_name,process_type,building,unit,status,completion_date)
    select distinct p_project,p_process,c.building,c.unit,p_status,p_date
    from jsonb_to_recordset(p_cells) as c(building text,unit text)
    on conflict (project_name,process_type,building,unit) do update
    set status=excluded.status, completion_date=excluded.completion_date, updated_at=now()
    where p_status <> '작업완료' or unit_progress_trial.status <> '작업완료';
  end if;
end $$;
revoke all on function public.save_trial_progress(text,text,text,date,jsonb) from public, anon;
grant execute on function public.save_trial_progress(text,text,text,date,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
