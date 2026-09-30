begin;
alter table public.organization_chart_nodes add column if not exists profile_user_id uuid references auth.users(id) on delete set null;

-- Administrators explicitly choose an account when a person's name is ambiguous.
create or replace function public.organization_profile_accounts_v197()
returns table(user_id uuid, person_name text, email text, has_photo boolean)
language sql stable security definer set search_path = public, storage as $$
  select distinct p.auth_user_id, p.manager_name, p.email,
    exists(select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = p.auth_user_id::text || '/avatar')
  from public.user_profiles p
  where p.auth_user_id is not null and coalesce(p.account_status, 'active') = 'active'
    and exists(select 1 from public.user_profiles viewer where viewer.auth_user_id = auth.uid()
      and viewer.role = '최고관리자' and coalesce(viewer.account_status, 'active') = 'active')
  order by 2, 3, 1;
$$;
revoke all on function public.organization_profile_accounts_v197() from public, anon;
grant execute on function public.organization_profile_accounts_v197() to authenticated;

create or replace function public.organization_profile_photos_v196()
returns table(node_id text, photo_path text)
language sql stable security definer set search_path = public, storage as $$
  with matches as (
    select distinct n.id::text as node_id, p.auth_user_id
    from public.organization_chart_nodes n
    join public.user_profiles p on (
      (n.profile_user_id is not null and p.auth_user_id = n.profile_user_id)
      or (n.profile_user_id is null and nullif(btrim(n.person_name), '') is not null
        and regexp_replace(btrim(p.manager_name), '\s+', '', 'g') = regexp_replace(btrim(n.person_name), '\s+', '', 'g'))
    )
    where n.is_active = true and n.node_type = 'person'
      and p.auth_user_id is not null and coalesce(p.account_status, 'active') = 'active'
      and auth.uid() is not null
      and coalesce(public.dashboard_permission_effective_v52_13('common.organization.view', ''), false)
  ), unique_matches as (
    select *, count(*) over (partition by node_id) as match_count from matches
  )
  select m.node_id, m.auth_user_id::text || '/avatar'
  from unique_matches m where m.match_count = 1
    and exists(select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = m.auth_user_id::text || '/avatar');
$$;
notify pgrst, 'reload schema';
commit;
