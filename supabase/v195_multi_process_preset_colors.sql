alter table public.multi_process_presets add column colors jsonb not null default '{}'::jsonb;

create function public.save_multi_process_preset_v195(p_project text, p_name text, p_processes text[], p_colors jsonb)
returns public.multi_process_presets language plpgsql security definer set search_path = public as $$
declare v_result public.multi_process_presets;
begin
  if p_colors is null or jsonb_typeof(p_colors) <> 'object' then
    raise exception '색상 설정을 확인해주세요.';
  end if;
  if exists(select 1 from jsonb_each_text(p_colors) where not (key = any(p_processes)) or value is null or value !~ '^#[0-9a-fA-F]{6}$') then
    raise exception '색상 설정을 확인해주세요.';
  end if;
  -- Reuse existing authentication, site permission, naming and duplicate checks.
  select * into v_result from public.save_multi_process_preset_v194(p_project,p_name,p_processes);
  update public.multi_process_presets set colors = p_colors where id = v_result.id returning * into v_result;
  return v_result;
end $$;
revoke all on function public.save_multi_process_preset_v195(text,text,text[],jsonb) from public, anon;
grant execute on function public.save_multi_process_preset_v195(text,text,text[],jsonb) to authenticated;

grant delete on public.multi_process_presets to authenticated;
create policy multi_process_presets_delete on public.multi_process_presets for delete to authenticated using (
  user_id = auth.uid() and public.progress_user_can_access_project(project_name)
  and public.dashboard_permission_effective_v52_13('construction.progress_multi.view', project_name)
);
notify pgrst, 'reload schema';
