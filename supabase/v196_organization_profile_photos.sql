begin;
-- Read only the photos of unambiguously identified active organization members.
-- Names must match exactly (apart from whitespace); duplicate names are not guessed.
create or replace function public.organization_profile_photos_v196()
returns table(node_id text, photo_path text)
language sql stable security definer set search_path = public, storage as $$
  with matches as (
    select n.id::text as node_id, p.auth_user_id,
      count(*) over (partition by n.id) as match_count
    from public.organization_chart_nodes n
    join public.user_profiles p
      on regexp_replace(btrim(p.manager_name), '\s+', '', 'g') = regexp_replace(btrim(n.person_name), '\s+', '', 'g')
    where n.is_active = true and n.node_type = 'person'
      and nullif(btrim(n.person_name), '') is not null
      and p.auth_user_id is not null and coalesce(p.account_status, 'active') = 'active'
      and auth.uid() is not null
      and coalesce(public.dashboard_permission_effective_v52_13('common.organization.view', ''), false)
  )
  select m.node_id, m.auth_user_id::text || '/avatar'
  from matches m where m.match_count = 1
    and exists(select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = m.auth_user_id::text || '/avatar');
$$;
revoke all on function public.organization_profile_photos_v196() from public, anon;
grant execute on function public.organization_profile_photos_v196() to authenticated;

create or replace function public.organization_can_read_photo_v196(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists(
    select 1 from public.organization_profile_photos_v196() photo where photo.photo_path = p_path
  );
$$;
revoke all on function public.organization_can_read_photo_v196(text) from public, anon;
grant execute on function public.organization_can_read_photo_v196(text) to authenticated;

-- Keep the bucket private. Only SELECT is expanded; uploads and deletion remain owner-only.
drop policy if exists profile_photos_owner_guard on storage.objects;
create policy profile_photos_read_guard on storage.objects as restrictive for select to public using (
  bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar'
  or (auth.role() = 'authenticated' and public.organization_can_read_photo_v196(name))
);
create policy profile_photos_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar');
create policy profile_photos_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar')
with check (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar');
create policy profile_photos_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar');
create policy profile_photos_organization_read on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and public.organization_can_read_photo_v196(name));
notify pgrst, 'reload schema';
commit;
