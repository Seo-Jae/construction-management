-- ============================================================
-- 사내시스템 v52.09 / 메신저 사용성·알림·방장권한 개선
-- 선행조건: v52.08.4까지 적용 완료
--
-- 변경사항
--   1) 사용자별 메신저 글자크기 환경설정 저장
--   2) 그룹 방장 권한 직접 위임 RPC 추가
--   3) 방장이 나갈 때 위임 대상자를 명시적으로 선택하도록 나가기 RPC 변경
--   4) 혼자 남은 그룹방 / 일반 참여자 / 1:1 나가기는 기존대로 허용
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 사용자별 메신저 환경설정
-- ------------------------------------------------------------
create table if not exists public.messenger_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  font_scale numeric(4,2) not null default 1.00
    check (font_scale between 0.85 and 1.30),
  updated_at timestamptz not null default now()
);

alter table public.messenger_user_preferences enable row level security;

grant select, insert, update on public.messenger_user_preferences to authenticated;

drop policy if exists messenger_user_preferences_select_own
  on public.messenger_user_preferences;
create policy messenger_user_preferences_select_own
  on public.messenger_user_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists messenger_user_preferences_insert_own
  on public.messenger_user_preferences;
create policy messenger_user_preferences_insert_own
  on public.messenger_user_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists messenger_user_preferences_update_own
  on public.messenger_user_preferences;
create policy messenger_user_preferences_update_own
  on public.messenger_user_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.messenger_get_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_scale numeric(4,2);
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  select preference.font_scale
    into v_scale
  from public.messenger_user_preferences preference
  where preference.user_id = v_current_user;

  return jsonb_build_object(
    'font_scale', coalesce(v_scale, 1.00)
  );
end;
$$;

revoke all on function public.messenger_get_preferences() from public;
grant execute on function public.messenger_get_preferences() to authenticated;

create or replace function public.messenger_set_font_scale(
  p_font_scale numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_scale numeric(4,2);
begin
  if v_current_user is null or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  v_scale := greatest(0.85, least(1.30, round(coalesce(p_font_scale, 1.00)::numeric, 2)));

  insert into public.messenger_user_preferences (
    user_id,
    font_scale,
    updated_at
  )
  values (
    v_current_user,
    v_scale,
    now()
  )
  on conflict (user_id) do update
  set font_scale = excluded.font_scale,
      updated_at = now();

  return v_scale;
end;
$$;

revoke all on function public.messenger_set_font_scale(numeric) from public;
grant execute on function public.messenger_set_font_scale(numeric) to authenticated;

-- ------------------------------------------------------------
-- 2. 그룹 방장 권한 직접 위임
-- ------------------------------------------------------------
create or replace function public.messenger_transfer_owner(
  p_room_id uuid,
  p_new_owner_id uuid
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

  if v_room_type <> 'group' then
    raise exception '그룹 대화방에서만 방장 권한을 넘길 수 있습니다.';
  end if;

  if v_owner_id is distinct from v_current_user then
    raise exception '현재 방장만 방장 권한을 넘길 수 있습니다.';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_current_user then
    raise exception '방장 권한을 넘길 다른 참여자를 선택해주세요.';
  end if;

  if not public.messenger_is_room_member(p_room_id, p_new_owner_id) then
    raise exception '선택한 사용자는 현재 대화방 참여자가 아닙니다.';
  end if;

  if not public.messenger_is_active_user(p_new_owner_id) then
    raise exception '활성 사용자에게만 방장 권한을 넘길 수 있습니다.';
  end if;

  update public.messenger_rooms
  set created_by = p_new_owner_id,
      updated_at = now()
  where id = p_room_id;

  return true;
end;
$$;

revoke all on function public.messenger_transfer_owner(uuid, uuid) from public;
grant execute on function public.messenger_transfer_owner(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. 대화방 나가기: 방장은 위임 대상자를 명시적으로 선택
-- ------------------------------------------------------------
drop function if exists public.messenger_leave_room(uuid);
drop function if exists public.messenger_leave_room(uuid, uuid);

create function public.messenger_leave_room(
  p_room_id uuid,
  p_transfer_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_room_type text;
  v_owner_id uuid;
  v_other_member_count integer := 0;
  v_transfer_name text := null;
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
    select count(*)::integer
      into v_other_member_count
    from public.messenger_room_members member_row
    where member_row.room_id = p_room_id
      and member_row.user_id <> v_current_user;

    if v_other_member_count > 0 then
      if p_transfer_owner_id is null then
        raise exception '방장 권한을 넘길 참여자를 선택해주세요.';
      end if;

      if p_transfer_owner_id = v_current_user
         or not public.messenger_is_room_member(p_room_id, p_transfer_owner_id) then
        raise exception '방장 권한을 넘길 참여자를 다시 선택해주세요.';
      end if;

      if not public.messenger_is_active_user(p_transfer_owner_id) then
        raise exception '활성 사용자에게만 방장 권한을 넘길 수 있습니다.';
      end if;

      select coalesce(nullif(btrim(profile.manager_name), ''), '이름 미등록')
        into v_transfer_name
      from public.user_profiles profile
      where profile.auth_user_id = p_transfer_owner_id
      order by
        (lower(coalesce(profile.account_status, 'active')) = 'active') desc,
        profile.manager_name nulls last
      limit 1;

      update public.messenger_rooms
      set created_by = p_transfer_owner_id,
          updated_at = now()
      where id = p_room_id;
    end if;
  end if;

  delete from public.messenger_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.user_id = v_current_user;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    return jsonb_build_object('left', false);
  end if;

  update public.messenger_rooms
  set updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'left', true,
    'transferred_to_user_id', p_transfer_owner_id,
    'transferred_to_name', v_transfer_name
  );
end;
$$;

revoke all on function public.messenger_leave_room(uuid, uuid) from public;
grant execute on function public.messenger_leave_room(uuid, uuid) to authenticated;

commit;

-- 확인용(선택)
select
  to_regclass('public.messenger_user_preferences') as messenger_user_preferences,
  to_regprocedure('public.messenger_get_preferences()') as messenger_get_preferences,
  to_regprocedure('public.messenger_set_font_scale(numeric)') as messenger_set_font_scale,
  to_regprocedure('public.messenger_transfer_owner(uuid,uuid)') as messenger_transfer_owner,
  to_regprocedure('public.messenger_leave_room(uuid,uuid)') as messenger_leave_room;
