-- Personal comparison presets, isolated by user and project. No progress data changes.
create table public.multi_process_presets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  name text not null check (char_length(name) between 1 and 80),
  processes text[] not null check (cardinality(processes) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(user_id, project_name, name)
);
alter table public.multi_process_presets enable row level security;
revoke all on public.multi_process_presets from anon, authenticated;
grant select on public.multi_process_presets to authenticated;
create policy multi_process_presets_read on public.multi_process_presets for select to authenticated using (
  user_id = auth.uid() and public.progress_user_can_access_project(project_name)
  and public.dashboard_permission_effective_v52_13('construction.progress_multi.view', project_name)
);
create function public.save_multi_process_preset_v194(p_project text, p_name text, p_processes text[])
returns public.multi_process_presets language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_number integer := 1;
  v_result public.multi_process_presets;
begin
  if auth.uid() is null or not coalesce(public.progress_user_can_access_project(p_project), false)
    or not coalesce(public.dashboard_permission_effective_v52_13('construction.progress_multi.view', p_project), false) then
    raise exception '이 현장의 공정 조합을 저장할 권한이 없습니다.';
  end if;
  if p_processes is null or cardinality(p_processes) not between 1 and 2000
    or exists(select 1 from unnest(p_processes) p where p is null or char_length(btrim(p)) not between 1 and 60)
    or (select count(*) <> count(distinct p) from unnest(p_processes) p) then
    raise exception '저장할 공종을 선택해주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_project, 194));
  if v_name = '' then
    select coalesce(max(substring(name from '^설정([0-9]{1,9})$')::integer), 0) + 1 into v_number
      from public.multi_process_presets where user_id = auth.uid() and project_name = p_project;
    v_name := '설정' || v_number;
  end if;
  if char_length(v_name) > 80 then raise exception '이름은 80자 이내로 입력해주세요.'; end if;
  if exists(select 1 from public.multi_process_presets where user_id = auth.uid() and project_name = p_project and name = v_name) then
    raise exception '같은 이름의 설정이 있습니다. 다른 이름을 입력해주세요.';
  end if;
  insert into public.multi_process_presets(user_id, project_name, name, processes)
    values(auth.uid(), p_project, v_name, p_processes) returning * into v_result;
  return v_result;
end $$;
revoke all on function public.save_multi_process_preset_v194(text,text,text[]) from public, anon;
grant execute on function public.save_multi_process_preset_v194(text,text,text[]) to authenticated;
notify pgrst, 'reload schema';
