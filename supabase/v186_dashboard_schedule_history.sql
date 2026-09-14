-- 현장설명·입찰 현황에서 제거된 저장 행을 별도 이력으로 보존합니다.
-- 기존 저장 RPC와 회의 일정은 변경하지 않습니다. 기존 삭제 자료를 복구하지는 않습니다.
begin;
create table if not exists public.admin_dashboard_site_history (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  schedule_id text,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  archived_at timestamptz not null default now(),
  archived_by uuid
);
create index if not exists idx_dashboard_site_history_board_date
  on public.admin_dashboard_site_history(board_id, archived_at desc, id);
alter table public.admin_dashboard_site_history enable row level security;
revoke all on public.admin_dashboard_site_history from public, anon, authenticated;
grant select on public.admin_dashboard_site_history to authenticated;
drop policy if exists dashboard_site_history_read on public.admin_dashboard_site_history;
create policy dashboard_site_history_read on public.admin_dashboard_site_history
for select to authenticated using (
  exists(select 1 from public.admin_dashboard_planning p where p.id::text = board_id)
);

-- 원본 보드의 기존 RLS/저장 RPC가 쓰기 권한을 검증합니다.
-- 호출자가 이력 테이블에 직접 쓰지 못하도록 트리거만 이력을 기록합니다.
create or replace function public.archive_dashboard_site_schedule_v186()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next jsonb;
begin
  if tg_op = 'DELETE' then v_next := '[]'::jsonb;
  else v_next := coalesce(new.site_schedules, '[]'::jsonb); end if;
  if jsonb_typeof(v_next) <> 'array' then raise exception '현장설명·입찰 일정 형식이 올바르지 않습니다.'; end if;
  insert into public.admin_dashboard_site_history(board_id, schedule_id, snapshot, archived_by)
  select old.id::text, item->>'id', item, auth.uid()
  from jsonb_array_elements(coalesce(old.site_schedules, '[]'::jsonb)) item
  where jsonb_typeof(item) = 'object'
    and exists(select 1 from jsonb_each_text(item) f
      where f.key in ('constructionCompany','siteName','projectName','trade','briefingAt','bidAt','attendees','note')
      and nullif(btrim(f.value), '') is not null)
    and not exists(select 1 from jsonb_array_elements(v_next) current_item
      where (nullif(item->>'id', '') is not null and current_item->>'id' = item->>'id')
        or (nullif(item->>'id', '') is null and current_item = item));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.archive_dashboard_site_schedule_v186() from public, anon, authenticated;
drop trigger if exists trg_archive_dashboard_site_schedule_v186 on public.admin_dashboard_planning;
create trigger trg_archive_dashboard_site_schedule_v186
after update of site_schedules or delete on public.admin_dashboard_planning
for each row execute function public.archive_dashboard_site_schedule_v186();
notify pgrst, 'reload schema';
commit;
