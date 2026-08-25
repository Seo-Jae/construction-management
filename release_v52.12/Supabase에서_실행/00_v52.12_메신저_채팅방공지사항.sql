-- ============================================================
-- 사내시스템 v52.12 / 메신저 채팅방 공지사항
-- 기준: v52.11 적용 완료
--
-- 기능
--   1) 대화방 참여자 누구나 공지사항 등록
--   2) 대화방별 과거 공지사항 영구 조회
--   3) 사용자별 "다시 보지 않기" 저장
--   4) 신규 공지 실시간 반영
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '60s';

create table if not exists public.messenger_announcements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.messenger_rooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_position text,
  created_at timestamptz not null default now()
);

create index if not exists messenger_announcements_room_created_idx
  on public.messenger_announcements (room_id, created_at desc, id desc);

create table if not exists public.messenger_announcement_dismissals (
  announcement_id uuid not null
    references public.messenger_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists messenger_announcement_dismissals_user_idx
  on public.messenger_announcement_dismissals (user_id, dismissed_at desc);

alter table public.messenger_announcements enable row level security;
alter table public.messenger_announcement_dismissals enable row level security;

grant select on public.messenger_announcements to authenticated;
grant select on public.messenger_announcement_dismissals to authenticated;

revoke insert, update, delete on public.messenger_announcements from authenticated;
revoke insert, update, delete on public.messenger_announcement_dismissals from authenticated;

drop policy if exists messenger_announcements_select_room_member
  on public.messenger_announcements;
create policy messenger_announcements_select_room_member
  on public.messenger_announcements
  for select
  to authenticated
  using (public.messenger_is_room_member(room_id, auth.uid()));

drop policy if exists messenger_announcement_dismissals_select_own
  on public.messenger_announcement_dismissals;
create policy messenger_announcement_dismissals_select_own
  on public.messenger_announcement_dismissals
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.messenger_list_announcements(
  p_room_id uuid
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  body text,
  created_by uuid,
  author_name text,
  author_position text,
  created_at timestamptz,
  is_dismissed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
begin
  if v_current_user is null
     or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저 공지사항을 확인할 수 있습니다.';
  end if;

  if not public.messenger_is_room_member(p_room_id, v_current_user) then
    raise exception '참여 중인 대화방의 공지사항만 확인할 수 있습니다.';
  end if;

  return query
  select
    announcement.id,
    announcement.room_id,
    announcement.title,
    announcement.body,
    announcement.created_by,
    announcement.author_name,
    announcement.author_position,
    announcement.created_at,
    exists (
      select 1
      from public.messenger_announcement_dismissals dismissal
      where dismissal.announcement_id = announcement.id
        and dismissal.user_id = v_current_user
    ) as is_dismissed
  from public.messenger_announcements announcement
  where announcement.room_id = p_room_id
  order by announcement.created_at desc, announcement.id desc;
end;
$$;

revoke all on function public.messenger_list_announcements(uuid) from public;
grant execute on function public.messenger_list_announcements(uuid) to authenticated;

create or replace function public.messenger_create_announcement(
  p_room_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_author_name text;
  v_author_position text;
  v_announcement_id uuid;
begin
  if v_current_user is null
     or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저 공지사항을 등록할 수 있습니다.';
  end if;

  if not public.messenger_is_room_member(p_room_id, v_current_user) then
    raise exception '참여 중인 대화방에만 공지사항을 등록할 수 있습니다.';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception '공지 제목은 1자 이상 100자 이하로 입력해주세요.';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception '공지 내용은 1자 이상 4,000자 이하로 입력해주세요.';
  end if;

  select
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록'),
    nullif(btrim(profile.position_title), '')
  into v_author_name, v_author_position
  from public.user_profiles profile
  where profile.auth_user_id = v_current_user
  limit 1;

  v_author_name := coalesce(v_author_name, '이름 미등록');

  insert into public.messenger_announcements (
    room_id,
    title,
    body,
    created_by,
    author_name,
    author_position
  )
  values (
    p_room_id,
    v_title,
    v_body,
    v_current_user,
    v_author_name,
    v_author_position
  )
  returning messenger_announcements.id into v_announcement_id;

  return v_announcement_id;
end;
$$;

revoke all on function public.messenger_create_announcement(uuid, text, text)
  from public;
grant execute on function public.messenger_create_announcement(uuid, text, text)
  to authenticated;

create or replace function public.messenger_dismiss_announcement(
  p_announcement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_id uuid;
begin
  if v_current_user is null
     or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저 공지사항을 처리할 수 있습니다.';
  end if;

  select announcement.room_id
  into v_room_id
  from public.messenger_announcements announcement
  where announcement.id = p_announcement_id;

  if v_room_id is null then
    raise exception '공지사항을 찾을 수 없습니다.';
  end if;

  if not public.messenger_is_room_member(v_room_id, v_current_user) then
    raise exception '참여 중인 대화방의 공지사항만 처리할 수 있습니다.';
  end if;

  insert into public.messenger_announcement_dismissals (
    announcement_id,
    user_id,
    dismissed_at
  )
  values (
    p_announcement_id,
    v_current_user,
    now()
  )
  on conflict (announcement_id, user_id) do update
  set dismissed_at = excluded.dismissed_at;

  return true;
end;
$$;

revoke all on function public.messenger_dismiss_announcement(uuid) from public;
grant execute on function public.messenger_dismiss_announcement(uuid)
  to authenticated;

-- Supabase Realtime publication에 이미 포함된 경우에는 건너뛴다.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messenger_announcements'
  ) then
    alter publication supabase_realtime
      add table public.messenger_announcements;
  end if;
end;
$$;

select 'v52.12 메신저 채팅방 공지사항 SQL 적용 완료' as result;
