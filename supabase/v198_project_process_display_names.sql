-- Display names only: progress/history/preset keys are preserved.
begin;
alter table public.project_processes add column if not exists display_name text
  check (display_name = btrim(display_name) and char_length(display_name) between 1 and 60);

create or replace function public.rename_project_process_v198(p_project text, p_process text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(public.progress_user_can_access_project(p_project), false)
    or not coalesce(public.dashboard_permission_effective_v52_13('construction.progress.view', p_project), false) then
    raise exception '이 현장의 공종 설정을 변경할 권한이 없습니다.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60
    or p_process is null or char_length(btrim(p_process)) not between 1 and 60 then
    raise exception '공종명은 1~60자로 입력해주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('process-label:' || p_project, 0));
  if exists (select 1 from public.project_processes where project_name = p_project
    and process_type <> p_process and (process_type = btrim(p_name) or coalesce(display_name, process_type) = btrim(p_name))) then
    raise exception '이미 등록된 공종명입니다.';
  end if;
  insert into public.project_processes(project_name, process_type, display_name)
  values (p_project, btrim(p_process), btrim(p_name))
  on conflict (project_name, process_type) do update set display_name = excluded.display_name;
end $$;
revoke all on function public.rename_project_process_v198(text,text,text) from public, anon;
grant execute on function public.rename_project_process_v198(text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
