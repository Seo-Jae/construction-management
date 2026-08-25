-- ============================================================
-- 사내시스템 v52.08.2 / 메신저 읽음표시 + 대화방 나가기
-- 선행조건: v52.08 메신저 v1.2 전체설치 SQL 실행 완료
-- 변경사항:
--   1) 참여자 조회에 last_read_at 추가 (보낸 메시지 읽음/안읽음 계산)
--   2) 1:1 / 그룹 대화방 나가기 RPC 추가
--   3) 그룹 방장이 나가면 남은 참여자에게 방장 권한 자동 이전
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 참여자 조회에 last_read_at 추가
-- 기존 함수의 TABLE 반환형이 바뀌므로 DROP 후 재생성한다.
-- ------------------------------------------------------------
drop function if exists public.messenger_get_room_members(uuid);

create function public.messenger_get_room_members(
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
  last_read_at timestamptz,
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
    member_row.last_read_at,
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

-- ------------------------------------------------------------
-- 2. 대화방 나가기
-- - 1:1: 현재 사용자 membership만 제거한다.
-- - 그룹 일반 참여자: 현재 사용자 membership만 제거한다.
-- - 그룹 방장: 남은 참여자 중 가장 먼저 참여한 사람에게 방장 이전 후 나간다.
-- - 방장 혼자 남은 그룹은 방장 이전 대상이 없으므로 나가기를 막는다.
-- ------------------------------------------------------------
create or replace function public.messenger_leave_room(
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_type text;
  v_owner_id uuid;
  v_next_owner uuid;
  v_deleted_count integer := 0;
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  select room.room_type, room.created_by
    into v_room_type, v_owner_id
  from public.messenger_rooms room
  where room.id = p_room_id
  for update;

  if v_room_type is null then
    raise exception '대화방을 찾을 수 없습니다.';
  end if;

  if not public.messenger_is_room_member(p_room_id, v_current_user) then
    raise exception '현재 참여 중인 대화방이 아닙니다.';
  end if;

  if v_room_type = 'group' and v_owner_id = v_current_user then
    select member_row.user_id
      into v_next_owner
    from public.messenger_room_members member_row
    where member_row.room_id = p_room_id
      and member_row.user_id <> v_current_user
    order by
      public.messenger_is_active_user(member_row.user_id) desc,
      member_row.joined_at asc,
      member_row.user_id asc
    limit 1;

    if v_next_owner is null then
      raise exception '다른 참여자가 없는 그룹방은 방장 권한을 이전할 수 없어 나갈 수 없습니다.';
    end if;
  end if;

  delete from public.messenger_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.user_id = v_current_user;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    return false;
  end if;

  if v_room_type = 'group' and v_owner_id = v_current_user then
    update public.messenger_rooms
    set created_by = v_next_owner,
        updated_at = now()
    where id = p_room_id;
  else
    update public.messenger_rooms
    set updated_at = now()
    where id = p_room_id;
  end if;

  return true;
end;
$$;

revoke all on function public.messenger_leave_room(uuid) from public;
grant execute on function public.messenger_leave_room(uuid) to authenticated;

commit;

-- 확인용(선택): 함수 존재 여부만 확인
select
  to_regprocedure('public.messenger_get_room_members(uuid)') as messenger_get_room_members,
  to_regprocedure('public.messenger_leave_room(uuid)') as messenger_leave_room;
