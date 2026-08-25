-- v52.48.5.44.13 옵션현황(단열) 저장 테이블
-- Supabase SQL Editor에서 전체 실행합니다.

create table if not exists public.option_status_documents (
  project_name text not null,
  option_category text not null,
  unit_values jsonb not null default '{}'::jsonb,
  source_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint option_status_documents_pkey
    primary key (project_name, option_category),
  constraint option_status_documents_category_check
    check (option_category in ('insulation', 'selection')),
  constraint option_status_documents_values_object_check
    check (jsonb_typeof(unit_values) = 'object')
);

comment on table public.option_status_documents is
  '현장·옵션구분별 세대 옵션 골구도 문서';
comment on column public.option_status_documents.unit_values is
  '세대키를 기준으로 {value, color}를 저장하는 JSON 객체';

alter table public.option_status_documents enable row level security;

drop policy if exists option_status_documents_select_authenticated
  on public.option_status_documents;
create policy option_status_documents_select_authenticated
  on public.option_status_documents
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists option_status_documents_insert_authenticated
  on public.option_status_documents;
create policy option_status_documents_insert_authenticated
  on public.option_status_documents
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists option_status_documents_update_authenticated
  on public.option_status_documents;
create policy option_status_documents_update_authenticated
  on public.option_status_documents
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select, insert, update on table public.option_status_documents
  to authenticated;

