-- ============================================================
-- 사내시스템 v52.08.4 / 메신저 1인 그룹방 나가기 수정
-- 선행조건: v52.08.2 메신저 읽음표시 + 대화방 나가기 SQL 실행 완료
--
-- 변경사항
--   1) 그룹방에 현재 사용자 혼자만 남아 있는 경우에도 나가기 허용
--   2) 그룹방에 다른 참여자가 있을 때 방장이 나가면 기존처럼 방장 자동 이전
--   3) 1:1 대화방 나가기 동작은 기존과 동일
--
-- 주의
--   - 마지막 참여자가 나간 그룹방은 참여자 0명 상태로 남는다.
--   - 화면에서는 더 이상 해당 방이 조회되지 않는다.
--   - 기존 메시지/첨부 데이터는 임의 삭제하지 않는다.
-- ============================================================

begin;

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

  -- 그룹 방장이 나가는 경우:
  -- 다른 참여자가 있으면 그중 한 명에게 방장 권한을 이전한다.
  -- 다른 참여자가 없으면 권한 이전 없이 현재 사용자만 탈퇴시킨다.
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
  end if;

  delete from public.messenger_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.user_id = v_current_user;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    return false;
  end if;

  if v_room_type = 'group' and v_owner_id = v_current_user and v_next_owner is not null then
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

-- 확인용(선택)
select to_regprocedure('public.messenger_leave_room(uuid)') as messenger_leave_room;
