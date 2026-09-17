-- Independent household quantity menu access; preserve existing access on introduction.
insert into public.permission_definitions
(permission_key,area_code,menu_code,action_code,action_label,action_rank,is_sensitive,area_label,menu_label,is_preparing)
values ('construction.household_quantity.view','construction','household_quantity','view','조회',10,false,'공사일보·공정','세대물량관리',false)
on conflict (permission_key) do nothing;

insert into public.template_permissions (template_code,permission_key,is_granted)
select template_code,'construction.household_quantity.view',is_granted from public.template_permissions
where permission_key='construction.progress.view'
on conflict (template_code,permission_key) do nothing;

insert into public.user_permission_overrides_v2 (auth_user_id,scope_key,permission_key,effect,updated_by)
select auth_user_id,scope_key,'construction.household_quantity.view',effect,updated_by
from public.user_permission_overrides_v2 where permission_key='construction.progress.view'
on conflict (auth_user_id,scope_key,permission_key) do nothing;

-- Restrictive policies constrain the existing authenticated policies only for this category.
create policy household_quantity_menu_select on public.option_status_documents as restrictive
for select to authenticated using (
option_category <> 'household_quantity' or
(public.progress_user_can_access_project(project_name) and public.dashboard_permission_effective_v52_13('construction.household_quantity.view',project_name))
);
create policy household_quantity_menu_insert on public.option_status_documents as restrictive
for insert to authenticated with check (
option_category <> 'household_quantity' or
(public.progress_user_can_access_project(project_name) and public.dashboard_permission_effective_v52_13('construction.household_quantity.view',project_name))
);
create policy household_quantity_menu_update on public.option_status_documents as restrictive
for update to authenticated using (
option_category <> 'household_quantity' or
(public.progress_user_can_access_project(project_name) and public.dashboard_permission_effective_v52_13('construction.household_quantity.view',project_name))
) with check (
option_category <> 'household_quantity' or
(public.progress_user_can_access_project(project_name) and public.dashboard_permission_effective_v52_13('construction.household_quantity.view',project_name))
);
