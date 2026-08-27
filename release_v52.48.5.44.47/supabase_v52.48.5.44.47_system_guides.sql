-- v52.48.5.44.47 시스템 가이드 저장소
-- 목적: 최고관리자만 가이드 초안을 작성/수정하고, 일반 사용자는 공개본만 RPC로 조회

begin;

create table if not exists public.system_guides (
  menu_key text primary key,
  menu_label text not null,
  menu_group text not null default '',
  draft_title text not null default '',
  draft_summary text not null default '',
  draft_content jsonb not null default '[]'::jsonb,
  published_title text not null default '',
  published_summary text not null default '',
  published_content jsonb not null default '[]'::jsonb,
  status text not null default 'preparing',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint system_guides_status_check check (status in ('preparing','draft','published')),
  constraint system_guides_draft_content_array_check check (jsonb_typeof(draft_content) = 'array'),
  constraint system_guides_published_content_array_check check (jsonb_typeof(published_content) = 'array')
);

alter table public.system_guides enable row level security;

-- 직접 테이블 조회/수정은 최고관리자만 허용합니다.
drop policy if exists system_guides_super_admin_select on public.system_guides;
create policy system_guides_super_admin_select
on public.system_guides
for select
to authenticated
using (public.current_user_is_super_admin());

drop policy if exists system_guides_super_admin_insert on public.system_guides;
create policy system_guides_super_admin_insert
on public.system_guides
for insert
to authenticated
with check (public.current_user_is_super_admin());

drop policy if exists system_guides_super_admin_update on public.system_guides;
create policy system_guides_super_admin_update
on public.system_guides
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists system_guides_super_admin_delete on public.system_guides;
create policy system_guides_super_admin_delete
on public.system_guides
for delete
to authenticated
using (public.current_user_is_super_admin());

revoke all on table public.system_guides from anon;
grant select, insert, update, delete on table public.system_guides to authenticated;
grant all on table public.system_guides to service_role;

-- 일반 사용자는 공개된 컬럼만 이 RPC로 조회합니다. 초안 컬럼은 노출하지 않습니다.
create or replace function public.get_system_guide(p_menu_key text)
returns table (
  menu_key text,
  title text,
  summary text,
  content jsonb,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.menu_key,
    g.published_title as title,
    g.published_summary as summary,
    g.published_content as content,
    g.published_at
  from public.system_guides g
  where auth.uid() is not null
    and g.menu_key = trim(coalesce(p_menu_key, ''))
    and g.status = 'published'
  limit 1;
$$;

revoke all on function public.get_system_guide(text) from public;
revoke all on function public.get_system_guide(text) from anon;
grant execute on function public.get_system_guide(text) to authenticated;
grant execute on function public.get_system_guide(text) to service_role;

-- 가이드 이미지는 비공개 버킷으로 저장하고 인증 사용자에게만 조회 권한을 줍니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'system-guide-images',
  'system-guide-images',
  false,
  12582912,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists system_guide_images_authenticated_read on storage.objects;
create policy system_guide_images_authenticated_read
on storage.objects
for select
to authenticated
using (bucket_id = 'system-guide-images');

drop policy if exists system_guide_images_super_admin_insert on storage.objects;
create policy system_guide_images_super_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'system-guide-images'
  and public.current_user_is_super_admin()
);

drop policy if exists system_guide_images_super_admin_update on storage.objects;
create policy system_guide_images_super_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'system-guide-images'
  and public.current_user_is_super_admin()
)
with check (
  bucket_id = 'system-guide-images'
  and public.current_user_is_super_admin()
);

drop policy if exists system_guide_images_super_admin_delete on storage.objects;
create policy system_guide_images_super_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'system-guide-images'
  and public.current_user_is_super_admin()
);

commit;
