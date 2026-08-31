-- v52.48.5.44.84
-- 건의·오류 제보 V1
-- 1) 사용자: 제보 등록 + 내 제보 조회
-- 2) 최고관리자: 전체 제보 조회 + 상태/답변/반영버전 관리
-- 3) 비공개 첨부파일 버킷

begin;

create extension if not exists pgcrypto;

create table if not exists public.system_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'bug'
    check (category in ('bug', 'improvement', 'question', 'other')),
  title text not null,
  content text not null,
  project_name text not null default '',
  source_view text not null default '',
  source_label text not null default '',
  created_by uuid not null default auth.uid(),
  created_by_name text not null default '',
  created_by_role text not null default '',
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'planned', 'completed', 'held')),
  admin_reply text not null default '',
  target_version text not null default '',
  completed_version text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  client_meta jsonb not null default '{}'::jsonb,
  handled_by uuid,
  handled_by_name text not null default '',
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_feedback_created_by_idx
  on public.system_feedback (created_by, created_at desc);

create index if not exists system_feedback_status_idx
  on public.system_feedback (status, created_at desc);

create index if not exists system_feedback_project_idx
  on public.system_feedback (project_name, created_at desc);

create or replace function public.system_feedback_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and btrim(coalesce(up.role, '')) = '최고관리자'
      and lower(btrim(coalesce(up.account_status, 'active')))
        not in ('disabled', 'rejected')
  );
$function$;

revoke all on function public.system_feedback_is_admin() from public;
grant execute on function public.system_feedback_is_admin() to authenticated;

alter table public.system_feedback enable row level security;

drop policy if exists "system_feedback_select_own_or_admin"
  on public.system_feedback;
create policy "system_feedback_select_own_or_admin"
  on public.system_feedback
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.system_feedback_is_admin()
  );

drop policy if exists "system_feedback_insert_own"
  on public.system_feedback;
create policy "system_feedback_insert_own"
  on public.system_feedback
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
  );

drop policy if exists "system_feedback_admin_update"
  on public.system_feedback;
create policy "system_feedback_admin_update"
  on public.system_feedback
  for update
  to authenticated
  using (
    public.system_feedback_is_admin()
  )
  with check (
    public.system_feedback_is_admin()
  );

drop policy if exists "system_feedback_admin_delete"
  on public.system_feedback;
create policy "system_feedback_admin_delete"
  on public.system_feedback
  for delete
  to authenticated
  using (
    public.system_feedback_is_admin()
  );

grant select, insert, update, delete
  on public.system_feedback
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  10485760
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "feedback_attachments_insert_own"
  on storage.objects;
create policy "feedback_attachments_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "feedback_attachments_select_own_or_admin"
  on storage.objects;
create policy "feedback_attachments_select_own_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.system_feedback_is_admin()
    )
  );

drop policy if exists "feedback_attachments_delete_own_or_admin"
  on storage.objects;
create policy "feedback_attachments_delete_own_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.system_feedback_is_admin()
    )
  );

commit;

select
  to_regclass('public.system_feedback') is not null as feedback_table_exists,
  to_regprocedure('public.system_feedback_is_admin()') is not null as admin_helper_exists,
  exists (
    select 1
    from storage.buckets
    where id = 'feedback-attachments'
  ) as attachment_bucket_exists;
