-- =========================================================
-- v52.30
-- 중점위험요인 관리: 공지사항 관리형 상단 바 / 선택 / 삭제 / 순서변경
-- 기존 공통/현장 전파 권한과 전파종료 기능은 유지합니다.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. 중점위험요인 표시 순서
-- ---------------------------------------------------------
alter table public.attendance_risk_broadcasts
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by scope_type, coalesce(project_name, '')
      order by created_at asc, id asc
    )::integer as rn
  from public.attendance_risk_broadcasts
)
update public.attendance_risk_broadcasts b
set sort_order = ranked.rn
from ranked
where ranked.id = b.id
  and (b.sort_order is null or b.sort_order < 1);

alter table public.attendance_risk_broadcasts
  drop constraint if exists attendance_risk_broadcasts_sort_order_check;

alter table public.attendance_risk_broadcasts
  add constraint attendance_risk_broadcasts_sort_order_check
  check (sort_order > 0);

create or replace function public.attendance_risk_assign_sort_order_v52_30()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sort_order is null or new.sort_order < 1 then
    select coalesce(max(b.sort_order), 0) + 1
    into new.sort_order
    from public.attendance_risk_broadcasts b
    where b.scope_type = new.scope_type
      and coalesce(b.project_name, '') = coalesce(new.project_name, '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_risk_assign_sort_order_v52_30
on public.attendance_risk_broadcasts;

create trigger trg_attendance_risk_assign_sort_order_v52_30
before insert on public.attendance_risk_broadcasts
for each row
execute function public.attendance_risk_assign_sort_order_v52_30();

update public.attendance_risk_broadcasts
set sort_order = 1
where sort_order is null;

alter table public.attendance_risk_broadcasts
  alter column sort_order set not null;

create index if not exists idx_attendance_risk_scope_order_v52_30
on public.attendance_risk_broadcasts(
  scope_type,
  project_name,
  sort_order,
  created_at,
  id
);

-- ---------------------------------------------------------
-- 2. 한 행을 현재 사용자가 관리할 수 있는지 공통 판정
-- ---------------------------------------------------------
create or replace function public.attendance_risk_can_manage_v52_30(
  p_user_id uuid,
  p_broadcast_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_organization_type text;
  v_broadcast public.attendance_risk_broadcasts%rowtype;
begin
  if p_user_id is null or p_broadcast_id is null then
    return false;
  end if;

  select
    coalesce(role, '담당자'),
    coalesce(account_status, 'active')
  into v_role, v_status
  from public.user_profiles
  where auth_user_id = p_user_id
  limit 1;

  if not found or v_status <> 'active' then
    return false;
  end if;

  if v_role not in (
    '담당자',
    '안전관리자',
    '관리자',
    '최고관리자'
  ) then
    return false;
  end if;

  select organization_type
  into v_organization_type
  from public.user_access_settings_v2
  where auth_user_id = p_user_id;

  select *
  into v_broadcast
  from public.attendance_risk_broadcasts
  where id = p_broadcast_id;

  if not found then
    return false;
  end if;

  if v_broadcast.scope_type = 'common' then
    return
      v_role in ('안전관리자', '관리자', '최고관리자')
      and public.attendance_permission_effective_v52_14(
        'attendance.risk.manage',
        ''
      );
  end if;

  if v_role = '담당자' and v_organization_type <> '현장' then
    return false;
  end if;

  if not public.attendance_risk_project_allowed_v52_14_9(
    p_user_id,
    v_broadcast.project_name
  ) then
    return false;
  end if;

  return public.attendance_permission_effective_v52_14(
    'attendance.risk.manage',
    v_broadcast.project_name
  );
end;
$$;

revoke all on function public.attendance_risk_can_manage_v52_30(uuid, uuid)
from public;

-- ---------------------------------------------------------
-- 3. 관리화면 조회
-- 기존 v52.14.9 권한/현장범위 응답을 그대로 사용하고
-- 순번과 관리 가능 여부만 추가합니다.
-- ---------------------------------------------------------
create or replace function public.attendance_risk_management_v52_30()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_base jsonb;
  v_records jsonb;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_base := public.attendance_risk_management_v52_14_9();

  select coalesce(
    jsonb_agg(
      e.item ||
      jsonb_build_object(
        'sort_order', coalesce(b.sort_order, 999999),
        'can_manage',
          public.attendance_risk_can_manage_v52_30(
            v_user_id,
            b.id
          )
      )
      order by
        case when b.scope_type = 'common' then 0 else 1 end,
        coalesce(b.project_name, '') asc,
        coalesce(b.sort_order, 999999) asc,
        b.created_at asc,
        b.id asc
    ),
    '[]'::jsonb
  )
  into v_records
  from jsonb_array_elements(
    coalesce(v_base -> 'records', '[]'::jsonb)
  ) as e(item)
  join public.attendance_risk_broadcasts b
    on b.id = nullif(e.item ->> 'id', '')::uuid;

  return jsonb_set(
    v_base,
    '{records}',
    coalesce(v_records, '[]'::jsonb),
    true
  );
end;
$$;

-- ---------------------------------------------------------
-- 4. 순서 변경
-- 공통은 공통끼리, 현장 전파는 같은 현장끼리 이동합니다.
-- 서로 다른 범위의 선택은 각 그룹에서 동시에 한 칸 이동합니다.
-- ---------------------------------------------------------
create or replace function public.attendance_move_risk_broadcasts_v52_30(
  p_broadcast_ids uuid[],
  p_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_selected uuid[] := coalesce(p_broadcast_ids, array[]::uuid[]);
  v_group record;
  v_ids uuid[];
  v_selected_flags boolean[];
  v_index integer;
  v_temp uuid;
  v_changed boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if cardinality(v_selected) = 0 then
    raise exception '이동할 중점위험요인을 선택해주세요.';
  end if;

  if v_direction not in ('up', 'down') then
    raise exception '이동 방향이 올바르지 않습니다.';
  end if;

  if exists (
    select 1
    from unnest(v_selected) selected_id
    where not public.attendance_risk_can_manage_v52_30(
      v_user_id,
      selected_id
    )
  ) then
    raise exception '선택한 중점위험요인 중 관리 권한이 없는 항목이 있습니다.';
  end if;

  for v_group in
    select distinct
      b.scope_type,
      b.project_name
    from public.attendance_risk_broadcasts b
    where b.id = any(v_selected)
  loop
    select
      array_agg(b.id order by b.sort_order, b.created_at, b.id),
      array_agg(
        b.id = any(v_selected)
        order by b.sort_order, b.created_at, b.id
      )
    into v_ids, v_selected_flags
    from public.attendance_risk_broadcasts b
    where b.scope_type = v_group.scope_type
      and coalesce(b.project_name, '') =
          coalesce(v_group.project_name, '');

    if v_direction = 'up' then
      if array_length(v_ids, 1) is not null then
        for v_index in 2..array_length(v_ids, 1) loop
          if v_selected_flags[v_index]
             and not v_selected_flags[v_index - 1] then
            v_temp := v_ids[v_index - 1];
            v_ids[v_index - 1] := v_ids[v_index];
            v_ids[v_index] := v_temp;

            v_selected_flags[v_index - 1] := true;
            v_selected_flags[v_index] := false;
            v_changed := true;
          end if;
        end loop;
      end if;
    else
      if array_length(v_ids, 1) is not null then
        for v_index in reverse array_length(v_ids, 1) - 1..1 loop
          if v_selected_flags[v_index]
             and not v_selected_flags[v_index + 1] then
            v_temp := v_ids[v_index + 1];
            v_ids[v_index + 1] := v_ids[v_index];
            v_ids[v_index] := v_temp;

            v_selected_flags[v_index + 1] := true;
            v_selected_flags[v_index] := false;
            v_changed := true;
          end if;
        end loop;
      end if;
    end if;

    if array_length(v_ids, 1) is not null then
      update public.attendance_risk_broadcasts b
      set sort_order = ordered.position
      from (
        select
          id,
          ordinality::integer as position
        from unnest(v_ids) with ordinality as x(id, ordinality)
      ) ordered
      where b.id = ordered.id;
    end if;
  end loop;

  return jsonb_build_object(
    'changed', v_changed
  );
end;
$$;

-- ---------------------------------------------------------
-- 5. 선택 삭제
-- 전파중 항목도 삭제 즉시 근로자 앱에서 사라집니다.
-- ---------------------------------------------------------
create or replace function public.attendance_delete_risk_broadcasts_v52_30(
  p_broadcast_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_selected uuid[] := coalesce(p_broadcast_ids, array[]::uuid[]);
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if cardinality(v_selected) = 0 then
    raise exception '삭제할 중점위험요인을 선택해주세요.';
  end if;

  if exists (
    select 1
    from unnest(v_selected) selected_id
    where not public.attendance_risk_can_manage_v52_30(
      v_user_id,
      selected_id
    )
  ) then
    raise exception '선택한 중점위험요인 중 삭제 권한이 없는 항목이 있습니다.';
  end if;

  delete from public.attendance_risk_broadcasts
  where id = any(v_selected);

  get diagnostics v_deleted_count = row_count;

  -- 삭제 후 각 범위 순번을 1부터 다시 정리
  with ranked as (
    select
      id,
      row_number() over (
        partition by scope_type, coalesce(project_name, '')
        order by sort_order asc, created_at asc, id asc
      )::integer as rn
    from public.attendance_risk_broadcasts
  )
  update public.attendance_risk_broadcasts b
  set sort_order = ranked.rn
  from ranked
  where ranked.id = b.id
    and b.sort_order <> ranked.rn;

  return jsonb_build_object(
    'deleted_count',
    v_deleted_count
  );
end;
$$;

-- ---------------------------------------------------------
-- 6. 작업자 앱
-- 현재 frontend가 호출하는 v52.21 응답을 유지하면서
-- risk_broadcasts도 순번으로 정렬합니다.
-- ---------------------------------------------------------
create or replace function public.attendance_worker_me_v52_21(
  p_session_token text,
  p_device_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_announcements jsonb;
  v_risk_broadcasts jsonb;
begin
  v_base := public.attendance_worker_me_v52_14(
    p_session_token,
    p_device_key
  );

  if v_base is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      e.item ||
      jsonb_build_object(
        'sort_order',
        coalesce(n.sort_order, 999999)
      )
      order by
        coalesce(n.sort_order, 999999) asc,
        n.created_at asc,
        n.id asc
    ),
    '[]'::jsonb
  )
  into v_announcements
  from jsonb_array_elements(
    coalesce(v_base -> 'announcements', '[]'::jsonb)
  ) as e(item)
  left join public.attendance_notices n
    on n.id = nullif(e.item ->> 'id', '')::uuid;

  select coalesce(
    jsonb_agg(
      e.item ||
      jsonb_build_object(
        'sort_order',
        coalesce(b.sort_order, 999999)
      )
      order by
        case when b.scope_type = 'common' then 0 else 1 end,
        coalesce(b.sort_order, 999999) asc,
        b.created_at asc,
        b.id asc
    ),
    '[]'::jsonb
  )
  into v_risk_broadcasts
  from jsonb_array_elements(
    coalesce(v_base -> 'risk_broadcasts', '[]'::jsonb)
  ) as e(item)
  left join public.attendance_risk_broadcasts b
    on b.id = nullif(e.item ->> 'id', '')::uuid;

  v_base := jsonb_set(
    v_base,
    '{announcements}',
    coalesce(v_announcements, '[]'::jsonb),
    true
  );

  return jsonb_set(
    v_base,
    '{risk_broadcasts}',
    coalesce(v_risk_broadcasts, '[]'::jsonb),
    true
  );
end;
$$;

-- ---------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------
revoke all on function public.attendance_risk_assign_sort_order_v52_30()
from public;

revoke all on function public.attendance_risk_management_v52_30()
from public;

revoke all on function public.attendance_move_risk_broadcasts_v52_30(uuid[], text)
from public;

revoke all on function public.attendance_delete_risk_broadcasts_v52_30(uuid[])
from public;

revoke all on function public.attendance_worker_me_v52_21(text, text)
from public;

grant execute on function public.attendance_risk_management_v52_30()
to authenticated;

grant execute on function public.attendance_move_risk_broadcasts_v52_30(uuid[], text)
to authenticated;

grant execute on function public.attendance_delete_risk_broadcasts_v52_30(uuid[])
to authenticated;

grant execute on function public.attendance_worker_me_v52_21(text, text)
to anon, authenticated;

comment on column public.attendance_risk_broadcasts.sort_order
is 'v52.30: 중점위험요인 공통/현장별 표시 순번';

commit;

-- =========================================================
-- 검증용
-- =========================================================
-- select
--   scope_type,
--   project_name,
--   sort_order,
--   status,
--   content,
--   created_at
-- from public.attendance_risk_broadcasts
-- order by
--   case when scope_type = 'common' then 0 else 1 end,
--   project_name nulls first,
--   sort_order,
--   created_at;
