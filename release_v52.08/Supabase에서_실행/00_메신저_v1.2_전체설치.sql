-- ============================================================
-- 사내시스템 v52.08 / 메신저 v1.2 전체 설치 SQL
-- 기준: v52.07 적용 프로젝트
-- 기능: 1:1 / 그룹 / 실시간 / 읽지않음 / 사진·파일 / 그룹관리 / 내 메시지 삭제
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 메신저 기본 테이블
-- ------------------------------------------------------------
create table if not exists public.messenger_rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('direct', 'group')),
  room_name text,
  direct_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messenger_rooms_group_name_check check (
    room_type <> 'group'
    or (room_name is not null and length(btrim(room_name)) between 1 and 80)
  ),
  constraint messenger_rooms_direct_key_check check (
    (room_type = 'direct' and direct_key is not null)
    or (room_type = 'group' and direct_key is null)
  )
);

create unique index if not exists messenger_rooms_direct_key_uq
  on public.messenger_rooms (direct_key)
  where room_type = 'direct' and direct_key is not null;

create index if not exists messenger_rooms_updated_at_idx
  on public.messenger_rooms (updated_at desc);

create table if not exists public.messenger_room_members (
  room_id uuid not null references public.messenger_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists messenger_room_members_user_idx
  on public.messenger_room_members (user_id, joined_at desc);

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.messenger_rooms(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_position text,
  sender_project_name text,
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file')),
  body text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messenger_messages_body_check check (
    deleted_at is not null
    or (message_type = 'text' and body is not null and length(btrim(body)) between 1 and 4000)
    or (message_type in ('image', 'file'))
  )
);

create index if not exists messenger_messages_room_created_idx
  on public.messenger_messages (room_id, created_at desc, id desc);

create index if not exists messenger_messages_sender_idx
  on public.messenger_messages (sender_id, created_at desc);

-- 재실행 또는 이전 시험판이 있어도 삭제 메시지의 body=null을 허용하도록 제약조건을 최신화한다.
alter table public.messenger_messages
  drop constraint if exists messenger_messages_body_check;
alter table public.messenger_messages
  add constraint messenger_messages_body_check check (
    deleted_at is not null
    or (message_type = 'text' and body is not null and length(btrim(body)) between 1 and 4000)
    or (message_type in ('image', 'file'))
  );

create table if not exists public.messenger_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messenger_messages(id) on delete cascade,
  room_id uuid not null references public.messenger_rooms(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  image_width integer,
  image_height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messenger_attachments_room_idx
  on public.messenger_attachments (room_id, created_at desc);

-- ------------------------------------------------------------
-- 2. 공통 헬퍼 함수
-- ------------------------------------------------------------
create or replace function public.messenger_is_active_user(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = p_user_id
      and lower(coalesce(profile.account_status, 'active')) = 'active'
  );
$$;

revoke all on function public.messenger_is_active_user(uuid) from public;
grant execute on function public.messenger_is_active_user(uuid) to authenticated;

create or replace function public.messenger_is_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.messenger_room_members member_row
    where member_row.room_id = p_room_id
      and member_row.user_id = p_user_id
  );
$$;

revoke all on function public.messenger_is_room_member(uuid, uuid) from public;
grant execute on function public.messenger_is_room_member(uuid, uuid) to authenticated;

create or replace function public.messenger_storage_room_id(
  p_object_name text
)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_first_part text;
begin
  v_first_part := split_part(coalesce(p_object_name, ''), '/', 1);
  if v_first_part = '' then
    return null;
  end if;

  return v_first_part::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.messenger_storage_room_id(text) from public;
grant execute on function public.messenger_storage_room_id(text) to authenticated;

create or replace function public.messenger_touch_room_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists messenger_rooms_touch_updated_at on public.messenger_rooms;
create trigger messenger_rooms_touch_updated_at
before update on public.messenger_rooms
for each row
execute function public.messenger_touch_room_updated_at();

-- ------------------------------------------------------------
-- 3. RLS 및 테이블 권한
-- 직접 쓰기는 RPC만 허용하고 조회만 RLS로 열어둔다.
-- ------------------------------------------------------------
alter table public.messenger_rooms enable row level security;
alter table public.messenger_room_members enable row level security;
alter table public.messenger_messages enable row level security;
alter table public.messenger_attachments enable row level security;

revoke all on public.messenger_rooms from anon;
revoke all on public.messenger_room_members from anon;
revoke all on public.messenger_messages from anon;
revoke all on public.messenger_attachments from anon;

revoke insert, update, delete on public.messenger_rooms from authenticated;
revoke insert, update, delete on public.messenger_room_members from authenticated;
revoke insert, update, delete on public.messenger_messages from authenticated;
revoke insert, update, delete on public.messenger_attachments from authenticated;

grant select on public.messenger_rooms to authenticated;
grant select on public.messenger_room_members to authenticated;
grant select on public.messenger_messages to authenticated;
grant select on public.messenger_attachments to authenticated;

drop policy if exists messenger_rooms_select_member on public.messenger_rooms;
create policy messenger_rooms_select_member
on public.messenger_rooms
for select
to authenticated
using (
  public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(id, auth.uid())
);

drop policy if exists messenger_room_members_select_member on public.messenger_room_members;
create policy messenger_room_members_select_member
on public.messenger_room_members
for select
to authenticated
using (
  public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(room_id, auth.uid())
);

drop policy if exists messenger_messages_select_member on public.messenger_messages;
create policy messenger_messages_select_member
on public.messenger_messages
for select
to authenticated
using (
  public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(room_id, auth.uid())
);

drop policy if exists messenger_attachments_select_member on public.messenger_attachments;
create policy messenger_attachments_select_member
on public.messenger_attachments
for select
to authenticated
using (
  deleted_at is null
  and public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(room_id, auth.uid())
);

-- ------------------------------------------------------------
-- 4. 사용자 목록 RPC
-- 활성 계정만 메신저 상대방으로 노출한다.
-- ------------------------------------------------------------
create or replace function public.messenger_list_users()
returns table (
  user_id uuid,
  manager_name text,
  position_title text,
  role text,
  project_name text,
  company text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (profile.auth_user_id)
    profile.auth_user_id as user_id,
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록')::text as manager_name,
    coalesce(nullif(btrim(profile.position_title), ''), '-')::text as position_title,
    coalesce(nullif(btrim(profile.role), ''), '-')::text as role,
    coalesce(nullif(btrim(profile.project_name), ''), '-')::text as project_name,
    coalesce(nullif(btrim(profile.company), ''), '-')::text as company
  from public.user_profiles profile
  where auth.uid() is not null
    and public.messenger_is_active_user(auth.uid())
    and profile.auth_user_id is not null
    and profile.auth_user_id <> auth.uid()
    and lower(coalesce(profile.account_status, 'active')) = 'active'
  order by
    profile.auth_user_id,
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록'),
    profile.project_name;
$$;

revoke all on function public.messenger_list_users() from public;
grant execute on function public.messenger_list_users() to authenticated;

-- ------------------------------------------------------------
-- 5. 1:1 대화방 생성 또는 기존방 반환
-- ------------------------------------------------------------
create or replace function public.messenger_create_direct_room(
  p_peer_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_direct_key text;
  v_room_id uuid;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if p_peer_user_id is null or p_peer_user_id = v_current_user then
    raise exception '올바른 대화 상대를 선택해주세요.';
  end if;

  if not public.messenger_is_active_user(p_peer_user_id) then
    raise exception '선택한 사용자는 현재 메신저를 사용할 수 없습니다.';
  end if;

  v_direct_key := case
    when v_current_user::text < p_peer_user_id::text
      then v_current_user::text || ':' || p_peer_user_id::text
    else p_peer_user_id::text || ':' || v_current_user::text
  end;

  select room.id
    into v_room_id
  from public.messenger_rooms room
  where room.room_type = 'direct'
    and room.direct_key = v_direct_key
  limit 1;

  if v_room_id is null then
    begin
      insert into public.messenger_rooms (
        room_type,
        room_name,
        direct_key,
        created_by
      ) values (
        'direct',
        null,
        v_direct_key,
        v_current_user
      )
      returning id into v_room_id;
    exception
      when unique_violation then
        select room.id
          into v_room_id
        from public.messenger_rooms room
        where room.room_type = 'direct'
          and room.direct_key = v_direct_key
        limit 1;
    end;
  end if;

  insert into public.messenger_room_members (room_id, user_id, last_read_at)
  values
    (v_room_id, v_current_user, now()),
    (v_room_id, p_peer_user_id, now())
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$$;

revoke all on function public.messenger_create_direct_room(uuid) from public;
grant execute on function public.messenger_create_direct_room(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. 그룹방 생성 / 이름 / 참여자 관리
-- ------------------------------------------------------------
create or replace function public.messenger_create_group_room(
  p_room_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_name text := btrim(coalesce(p_room_name, ''));
  v_room_id uuid;
  v_valid_peer_count integer;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if length(v_room_name) < 1 or length(v_room_name) > 80 then
    raise exception '그룹방 이름은 1~80자로 입력해주세요.';
  end if;

  select count(distinct candidate.user_id)::integer
    into v_valid_peer_count
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as candidate(user_id)
  where candidate.user_id <> v_current_user
    and public.messenger_is_active_user(candidate.user_id);

  if coalesce(v_valid_peer_count, 0) < 1 then
    raise exception '그룹대화에는 본인 외 최소 1명의 참여자가 필요합니다.';
  end if;

  insert into public.messenger_rooms (
    room_type,
    room_name,
    direct_key,
    created_by
  ) values (
    'group',
    v_room_name,
    null,
    v_current_user
  )
  returning id into v_room_id;

  insert into public.messenger_room_members (room_id, user_id, last_read_at)
  values (v_room_id, v_current_user, now());

  insert into public.messenger_room_members (room_id, user_id, last_read_at)
  select
    v_room_id,
    candidate.user_id,
    now()
  from (
    select distinct item.user_id
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as item(user_id)
  ) candidate
  where candidate.user_id <> v_current_user
    and public.messenger_is_active_user(candidate.user_id)
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$$;

revoke all on function public.messenger_create_group_room(text, uuid[]) from public;
grant execute on function public.messenger_create_group_room(text, uuid[]) to authenticated;

create or replace function public.messenger_rename_group_room(
  p_room_id uuid,
  p_room_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_name text := btrim(coalesce(p_room_name, ''));
  v_updated_count integer;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    return false;
  end if;

  if length(v_room_name) < 1 or length(v_room_name) > 80 then
    raise exception '그룹방 이름은 1~80자로 입력해주세요.';
  end if;

  update public.messenger_rooms room
  set room_name = v_room_name
  where room.id = p_room_id
    and room.room_type = 'group'
    and room.created_by = v_current_user;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.messenger_rename_group_room(uuid, text) from public;
grant execute on function public.messenger_rename_group_room(uuid, text) to authenticated;

create or replace function public.messenger_add_group_members(
  p_room_id uuid,
  p_member_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_inserted_count integer := 0;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if not exists (
    select 1
    from public.messenger_rooms room
    where room.id = p_room_id
      and room.room_type = 'group'
      and room.created_by = v_current_user
  ) then
    raise exception '그룹방 생성자만 참여자를 추가할 수 있습니다.';
  end if;

  insert into public.messenger_room_members (room_id, user_id, last_read_at)
  select
    p_room_id,
    candidate.user_id,
    now()
  from (
    select distinct item.user_id
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as item(user_id)
  ) candidate
  where candidate.user_id is not null
    and public.messenger_is_active_user(candidate.user_id)
  on conflict (room_id, user_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  update public.messenger_rooms
  set updated_at = now()
  where id = p_room_id;

  return v_inserted_count;
end;
$$;

revoke all on function public.messenger_add_group_members(uuid, uuid[]) from public;
grant execute on function public.messenger_add_group_members(uuid, uuid[]) to authenticated;

create or replace function public.messenger_remove_group_member(
  p_room_id uuid,
  p_member_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_owner_id uuid;
  v_deleted_count integer;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    return false;
  end if;

  select room.created_by
    into v_owner_id
  from public.messenger_rooms room
  where room.id = p_room_id
    and room.room_type = 'group';

  if v_owner_id is null or v_owner_id <> v_current_user then
    raise exception '그룹방 생성자만 참여자를 제외할 수 있습니다.';
  end if;

  if p_member_user_id is null or p_member_user_id = v_owner_id then
    raise exception '그룹방 생성자는 참여자에서 제외할 수 없습니다.';
  end if;

  delete from public.messenger_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.user_id = p_member_user_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count > 0 then
    update public.messenger_rooms
    set updated_at = now()
    where id = p_room_id;
  end if;

  return v_deleted_count > 0;
end;
$$;

revoke all on function public.messenger_remove_group_member(uuid, uuid) from public;
grant execute on function public.messenger_remove_group_member(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. 메시지 작성
-- ------------------------------------------------------------
create or replace function public.messenger_send_text_message(
  p_room_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_sender_name text;
  v_sender_position text;
  v_sender_project_name text;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if not public.messenger_is_room_member(p_room_id, v_current_user) then
    raise exception '참여 중인 대화방이 아닙니다.';
  end if;

  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception '메시지는 1~4000자로 입력해주세요.';
  end if;

  select
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록'),
    coalesce(nullif(btrim(profile.position_title), ''), '-'),
    coalesce(nullif(btrim(profile.project_name), ''), '-')
  into
    v_sender_name,
    v_sender_position,
    v_sender_project_name
  from public.user_profiles profile
  where profile.auth_user_id = v_current_user
    and lower(coalesce(profile.account_status, 'active')) = 'active'
  limit 1;

  insert into public.messenger_messages (
    room_id,
    sender_id,
    sender_name,
    sender_position,
    sender_project_name,
    message_type,
    body
  ) values (
    p_room_id,
    v_current_user,
    coalesce(v_sender_name, '이름 미등록'),
    coalesce(v_sender_position, '-'),
    coalesce(v_sender_project_name, '-'),
    'text',
    v_body
  )
  returning id into v_message_id;

  update public.messenger_rooms
  set updated_at = now()
  where id = p_room_id;

  update public.messenger_room_members
  set last_read_at = now()
  where room_id = p_room_id
    and user_id = v_current_user;

  return v_message_id;
end;
$$;

revoke all on function public.messenger_send_text_message(uuid, text) from public;
grant execute on function public.messenger_send_text_message(uuid, text) to authenticated;

create or replace function public.messenger_send_attachment_message(
  p_room_id uuid,
  p_message_type text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_image_width integer default null,
  p_image_height integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_message_id uuid;
  v_sender_name text;
  v_sender_position text;
  v_sender_project_name text;
  v_message_type text := lower(btrim(coalesce(p_message_type, '')));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
  v_file_name text := btrim(coalesce(p_file_name, ''));
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if not public.messenger_is_room_member(p_room_id, v_current_user) then
    raise exception '참여 중인 대화방이 아닙니다.';
  end if;

  if v_message_type not in ('image', 'file') then
    raise exception '첨부 메시지 종류가 올바르지 않습니다.';
  end if;

  if v_storage_path = ''
     or split_part(v_storage_path, '/', 1) <> p_room_id::text
     or split_part(v_storage_path, '/', 2) <> v_current_user::text then
    raise exception '첨부파일 저장 경로가 올바르지 않습니다.';
  end if;

  if v_file_name = '' or length(v_file_name) > 240 then
    raise exception '파일명이 올바르지 않습니다.';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 10485760 then
    raise exception '첨부파일은 10MB 이하만 전송할 수 있습니다.';
  end if;

  select
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록'),
    coalesce(nullif(btrim(profile.position_title), ''), '-'),
    coalesce(nullif(btrim(profile.project_name), ''), '-')
  into
    v_sender_name,
    v_sender_position,
    v_sender_project_name
  from public.user_profiles profile
  where profile.auth_user_id = v_current_user
    and lower(coalesce(profile.account_status, 'active')) = 'active'
  limit 1;

  insert into public.messenger_messages (
    room_id,
    sender_id,
    sender_name,
    sender_position,
    sender_project_name,
    message_type,
    body
  ) values (
    p_room_id,
    v_current_user,
    coalesce(v_sender_name, '이름 미등록'),
    coalesce(v_sender_position, '-'),
    coalesce(v_sender_project_name, '-'),
    v_message_type,
    null
  )
  returning id into v_message_id;

  insert into public.messenger_attachments (
    message_id,
    room_id,
    uploaded_by,
    storage_path,
    file_name,
    mime_type,
    file_size,
    image_width,
    image_height
  ) values (
    v_message_id,
    p_room_id,
    v_current_user,
    v_storage_path,
    v_file_name,
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_file_size,
    p_image_width,
    p_image_height
  );

  update public.messenger_rooms
  set updated_at = now()
  where id = p_room_id;

  update public.messenger_room_members
  set last_read_at = now()
  where room_id = p_room_id
    and user_id = v_current_user;

  return v_message_id;
end;
$$;

revoke all on function public.messenger_send_attachment_message(uuid, text, text, text, text, bigint, integer, integer) from public;
grant execute on function public.messenger_send_attachment_message(uuid, text, text, text, text, bigint, integer, integer) to authenticated;

-- ------------------------------------------------------------
-- 8. 읽음 처리 / 내 메시지 삭제
-- ------------------------------------------------------------
create or replace function public.messenger_mark_room_read(
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_updated_count integer;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    return false;
  end if;

  update public.messenger_room_members member_row
  set last_read_at = now()
  where member_row.room_id = p_room_id
    and member_row.user_id = v_current_user;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.messenger_mark_room_read(uuid) from public;
grant execute on function public.messenger_mark_room_read(uuid) to authenticated;

create or replace function public.messenger_delete_message(
  p_message_id uuid
)
returns table (
  storage_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_id uuid;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  select message.room_id
    into v_room_id
  from public.messenger_messages message
  where message.id = p_message_id
    and message.sender_id = v_current_user
    and message.deleted_at is null
  limit 1;

  if v_room_id is null then
    raise exception '삭제할 수 있는 본인 메시지가 아닙니다.';
  end if;

  return query
  select attachment.storage_path
  from public.messenger_attachments attachment
  where attachment.message_id = p_message_id
    and attachment.deleted_at is null;

  update public.messenger_attachments attachment
  set deleted_at = now()
  where attachment.message_id = p_message_id
    and attachment.deleted_at is null;

  update public.messenger_messages message
  set body = null,
      deleted_at = now()
  where message.id = p_message_id
    and message.sender_id = v_current_user
    and message.deleted_at is null;

  update public.messenger_rooms
  set updated_at = now()
  where id = v_room_id;
end;
$$;

revoke all on function public.messenger_delete_message(uuid) from public;
grant execute on function public.messenger_delete_message(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. 대화방 목록 / 참여자 / 전체 읽지않음 RPC
-- ------------------------------------------------------------
create or replace function public.messenger_list_rooms()
returns table (
  room_id uuid,
  room_type text,
  display_name text,
  room_name text,
  created_by uuid,
  is_owner boolean,
  member_count integer,
  unread_count bigint,
  last_message_at timestamptz,
  last_message_preview text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    room.id as room_id,
    room.room_type,
    case
      when room.room_type = 'group' then
        coalesce(nullif(btrim(room.room_name), ''), '그룹 대화')
      else
        coalesce(
          (
            select coalesce(nullif(btrim(peer_profile.manager_name), ''), '이름 미등록')
            from public.messenger_room_members peer_member
            left join lateral (
              select profile.manager_name
              from public.user_profiles profile
              where profile.auth_user_id = peer_member.user_id
              order by
                (lower(coalesce(profile.account_status, 'active')) = 'active') desc,
                profile.manager_name nulls last
              limit 1
            ) peer_profile on true
            where peer_member.room_id = room.id
              and peer_member.user_id <> auth.uid()
            order by peer_member.joined_at asc
            limit 1
          ),
          '탈퇴한 사용자'
        )
    end::text as display_name,
    room.room_name,
    room.created_by,
    (room.created_by = auth.uid()) as is_owner,
    (
      select count(*)::integer
      from public.messenger_room_members member_count_row
      where member_count_row.room_id = room.id
    ) as member_count,
    (
      select count(*)::bigint
      from public.messenger_messages unread_message
      where unread_message.room_id = room.id
        and unread_message.deleted_at is null
        and unread_message.sender_id is distinct from auth.uid()
        and unread_message.created_at > coalesce(my_member.last_read_at, my_member.joined_at)
    ) as unread_count,
    last_message.created_at as last_message_at,
    case
      when last_message.id is null then '새 대화방'
      when last_message.deleted_at is not null then '삭제된 메시지입니다.'
      when last_message.message_type = 'image' then
        case when room.room_type = 'group'
          then coalesce(last_message.sender_name, '사용자') || ': 사진'
          else '사진'
        end
      when last_message.message_type = 'file' then
        case when room.room_type = 'group'
          then coalesce(last_message.sender_name, '사용자') || ': 파일'
          else '파일'
        end
      else
        case when room.room_type = 'group'
          then coalesce(last_message.sender_name, '사용자') || ': ' || left(coalesce(last_message.body, ''), 80)
          else left(coalesce(last_message.body, ''), 80)
        end
    end::text as last_message_preview,
    room.updated_at
  from public.messenger_room_members my_member
  join public.messenger_rooms room
    on room.id = my_member.room_id
  left join lateral (
    select message.*
    from public.messenger_messages message
    where message.room_id = room.id
    order by message.created_at desc, message.id desc
    limit 1
  ) last_message on true
  where my_member.user_id = auth.uid()
    and auth.uid() is not null
    and public.messenger_is_active_user(auth.uid())
  order by coalesce(last_message.created_at, room.updated_at) desc, room.created_at desc;
$$;

revoke all on function public.messenger_list_rooms() from public;
grant execute on function public.messenger_list_rooms() to authenticated;

create or replace function public.messenger_get_room_members(
  p_room_id uuid
)
returns table (
  user_id uuid,
  manager_name text,
  position_title text,
  role text,
  project_name text,
  company text,
  joined_at timestamptz,
  is_owner boolean,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    member_row.user_id,
    coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록')::text as manager_name,
    coalesce(nullif(btrim(profile.position_title), ''), '-')::text as position_title,
    coalesce(nullif(btrim(profile.role), ''), '-')::text as role,
    coalesce(nullif(btrim(profile.project_name), ''), '-')::text as project_name,
    coalesce(nullif(btrim(profile.company), ''), '-')::text as company,
    member_row.joined_at,
    (room.created_by = member_row.user_id) as is_owner,
    (member_row.user_id = auth.uid()) as is_current_user
  from public.messenger_room_members member_row
  join public.messenger_rooms room
    on room.id = member_row.room_id
  left join lateral (
    select
      source_profile.manager_name,
      source_profile.position_title,
      source_profile.role,
      source_profile.project_name,
      source_profile.company
    from public.user_profiles source_profile
    where source_profile.auth_user_id = member_row.user_id
    order by
      (lower(coalesce(source_profile.account_status, 'active')) = 'active') desc,
      source_profile.manager_name nulls last
    limit 1
  ) profile on true
  where member_row.room_id = p_room_id
    and auth.uid() is not null
    and public.messenger_is_active_user(auth.uid())
    and public.messenger_is_room_member(p_room_id, auth.uid())
  order by
    (room.created_by = member_row.user_id) desc,
    coalesce(profile.manager_name, '') asc,
    member_row.joined_at asc;
$$;

revoke all on function public.messenger_get_room_members(uuid) from public;
grant execute on function public.messenger_get_room_members(uuid) to authenticated;

create or replace function public.messenger_get_unread_total()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(room_unread.unread_count), 0)::bigint
  from (
    select count(message.id)::bigint as unread_count
    from public.messenger_room_members my_member
    join public.messenger_messages message
      on message.room_id = my_member.room_id
    where my_member.user_id = auth.uid()
      and auth.uid() is not null
      and public.messenger_is_active_user(auth.uid())
      and message.deleted_at is null
      and message.sender_id is distinct from auth.uid()
      and message.created_at > coalesce(my_member.last_read_at, my_member.joined_at)
    group by my_member.room_id
  ) room_unread;
$$;

revoke all on function public.messenger_get_unread_total() from public;
grant execute on function public.messenger_get_unread_total() to authenticated;

-- ------------------------------------------------------------
-- 10. 비공개 Storage bucket 및 접근정책
-- 파일경로 규칙: <room_id>/<user_id>/<랜덤파일명>
-- 최대 파일 크기: 10MB
-- ------------------------------------------------------------
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'messenger-files',
  'messenger-files',
  false,
  10485760,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists messenger_storage_select_room_member on storage.objects;
create policy messenger_storage_select_room_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'messenger-files'
  and public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(
    public.messenger_storage_room_id(name),
    auth.uid()
  )
);

drop policy if exists messenger_storage_insert_room_member on storage.objects;
create policy messenger_storage_insert_room_member
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'messenger-files'
  and public.messenger_is_active_user(auth.uid())
  and public.messenger_is_room_member(
    public.messenger_storage_room_id(name),
    auth.uid()
  )
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists messenger_storage_delete_owner on storage.objects;
create policy messenger_storage_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'messenger-files'
  and owner_id = auth.uid()::text
  and public.messenger_is_room_member(
    public.messenger_storage_room_id(name),
    auth.uid()
  )
);

-- ------------------------------------------------------------
-- 11. Supabase Realtime publication 등록
-- 재실행해도 중복 추가하지 않는다.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messenger_messages';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_room_members'
    ) then
      execute 'alter publication supabase_realtime add table public.messenger_room_members';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_rooms'
    ) then
      execute 'alter publication supabase_realtime add table public.messenger_rooms';
    end if;
  end if;
end;
$$;

commit;

-- ============================================================
-- 설치 확인용 조회 (실행 후 결과 확인)
-- ============================================================
select
  to_regclass('public.messenger_rooms') as messenger_rooms,
  to_regclass('public.messenger_room_members') as messenger_room_members,
  to_regclass('public.messenger_messages') as messenger_messages,
  to_regclass('public.messenger_attachments') as messenger_attachments;

select
  id,
  name,
  public,
  file_size_limit
from storage.buckets
where id = 'messenger-files';
