-- =========================================================
-- v52.21 근태 작업자앱 공지 순번 관리
--
-- 기능
-- 1. attendance_notices.sort_order 추가
-- 2. 기존 공지 순번 1,2,3... 초기화
-- 3. 신규 공지는 기본적으로 마지막 순번 부여
-- 4. 관리자 저장 시 지정 위치로 이동 후 전체 순번 재정렬
-- 5. 관리자 공지 목록을 순번 기준으로 반환
-- 6. 작업자 me 응답의 announcements를 순번 기준으로 반환
--
-- 기존 v52.17 권한/저장 RPC를 내부에서 그대로 호출하므로
-- 기존 권한검사와 공지 작성 규칙을 우회하지 않습니다.
-- =========================================================

do $$
begin
  if to_regclass('public.attendance_notices') is null then
    raise exception 'attendance_notices 테이블이 없습니다. v52.17 공지사항 SQL 적용 여부를 확인해주세요.';
  end if;

  if to_regprocedure('public.attendance_manager_list_notices_v52_17(text)') is null then
    raise exception 'attendance_manager_list_notices_v52_17(text) 함수가 없습니다.';
  end if;

  if to_regprocedure('public.attendance_manager_save_notice_v52_17(uuid,text,text,date,date,boolean)') is null then
    raise exception 'attendance_manager_save_notice_v52_17(uuid,text,text,date,date,boolean) 함수가 없습니다.';
  end if;

  if to_regprocedure('public.attendance_worker_me_v52_14(text,text)') is null then
    raise exception 'attendance_worker_me_v52_14(text,text) 함수가 없습니다.';
  end if;
end;
$$;

alter table public.attendance_notices
  add column if not exists sort_order integer;

-- 기존 공지는 현장별 작성일 순서로 1,2,3... 초기화합니다.
with ranked as (
  select
    id,
    row_number() over (
      partition by project_name
      order by created_at asc, id asc
    )::integer as rn
  from public.attendance_notices
)
update public.attendance_notices n
set sort_order = ranked.rn
from ranked
where ranked.id = n.id
  and (
    n.sort_order is null
    or n.sort_order < 1
  );

alter table public.attendance_notices
  drop constraint if exists attendance_notices_sort_order_check;

alter table public.attendance_notices
  add constraint attendance_notices_sort_order_check
  check (sort_order > 0);

-- 신규 공지를 기존 v52.17 저장 RPC가 INSERT할 때
-- sort_order를 전달하지 않아도 자동으로 마지막 번호를 부여합니다.
create or replace function public.attendance_notice_assign_sort_order_v52_21()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sort_order is null or new.sort_order < 1 then
    select coalesce(max(n.sort_order), 0) + 1
    into new.sort_order
    from public.attendance_notices n
    where n.project_name = new.project_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_notice_assign_sort_order_v52_21
on public.attendance_notices;

create trigger trg_attendance_notice_assign_sort_order_v52_21
before insert
on public.attendance_notices
for each row
execute function public.attendance_notice_assign_sort_order_v52_21();

-- 트리거가 준비된 뒤 NOT NULL로 고정합니다.
update public.attendance_notices
set sort_order = 1
where sort_order is null;

alter table public.attendance_notices
  alter column sort_order set not null;

create index if not exists idx_attendance_notices_project_sort_v52_21
on public.attendance_notices(project_name, sort_order, created_at, id);

-- ---------------------------------------------------------
-- 내부 순번 재정렬
-- target 공지를 requested_order 위치에 넣고
-- 같은 현장의 모든 공지를 1,2,3...으로 다시 번호매깁니다.
-- ---------------------------------------------------------

create or replace function public.attendance_resequence_notices_v52_21(
  p_project_name text,
  p_target_id uuid,
  p_requested_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_position integer := 1;
  v_total integer := 0;
  v_requested integer := 1;
  v_inserted boolean := false;
begin
  select count(*)
  into v_total
  from public.attendance_notices
  where project_name = p_project_name;

  if v_total <= 0 then
    return;
  end if;

  v_requested := greatest(
    1,
    least(coalesce(p_requested_order, v_total), v_total)
  );

  for v_row in
    select id
    from public.attendance_notices
    where project_name = p_project_name
      and id <> p_target_id
    order by sort_order asc, created_at asc, id asc
  loop
    if not v_inserted and v_position = v_requested then
      update public.attendance_notices
      set sort_order = v_position
      where id = p_target_id
        and project_name = p_project_name;

      v_position := v_position + 1;
      v_inserted := true;
    end if;

    update public.attendance_notices
    set sort_order = v_position
    where id = v_row.id;

    v_position := v_position + 1;
  end loop;

  if not v_inserted then
    update public.attendance_notices
    set sort_order = v_position
    where id = p_target_id
      and project_name = p_project_name;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 관리자 목록 v52.21
-- 기존 v52.17 목록 RPC의 권한검사를 그대로 사용하고
-- sort_order만 추가해 순번 기준으로 재정렬합니다.
-- ---------------------------------------------------------

create or replace function public.attendance_manager_list_notices_v52_21(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_result jsonb;
begin
  v_base := public.attendance_manager_list_notices_v52_17(
    p_project_name
  );

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
  into v_result
  from jsonb_array_elements(
    coalesce(v_base, '[]'::jsonb)
  ) as e(item)
  left join public.attendance_notices n
    on n.id = nullif(e.item ->> 'id', '')::uuid;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------
-- 관리자 저장 v52.21
-- 기존 v52.17 저장 RPC를 먼저 실행하여 기존 권한검사/감사를 보존하고
-- 그 다음에 순번만 재정렬합니다.
-- ---------------------------------------------------------

create or replace function public.attendance_manager_save_notice_v52_21(
  p_notice_id uuid,
  p_project_name text,
  p_content text,
  p_starts_on date,
  p_ends_on date,
  p_is_active boolean,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
  v_final_order integer;
begin
  if coalesce(p_sort_order, 0) < 1 then
    raise exception '표시 순번은 1 이상이어야 합니다.';
  end if;

  -- 기존 함수에서 사용자 권한, 현장범위, 내용/날짜 검증을 그대로 수행합니다.
  perform public.attendance_manager_save_notice_v52_17(
    p_notice_id,
    p_project_name,
    p_content,
    p_starts_on,
    p_ends_on,
    p_is_active
  );

  if p_notice_id is not null then
    v_target_id := p_notice_id;
  else
    -- 방금 v52.17 RPC가 생성한 행을 찾습니다.
    select n.id
    into v_target_id
    from public.attendance_notices n
    where n.project_name = p_project_name
      and n.content = p_content
      and n.starts_on = p_starts_on
      and n.ends_on = p_ends_on
      and n.is_active = p_is_active
    order by n.created_at desc, n.id desc
    limit 1;
  end if;

  if v_target_id is null then
    raise exception '저장된 공지사항을 찾지 못했습니다.';
  end if;

  perform public.attendance_resequence_notices_v52_21(
    p_project_name,
    v_target_id,
    p_sort_order
  );

  select sort_order
  into v_final_order
  from public.attendance_notices
  where id = v_target_id;

  return jsonb_build_object(
    'id', v_target_id,
    'sort_order', v_final_order
  );
end;
$$;

-- ---------------------------------------------------------
-- 작업자 me v52.21
-- 기존 v52.14 응답 구조는 전부 그대로 유지하고
-- announcements 배열에 sort_order를 추가한 뒤 순번대로 정렬합니다.
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

  return jsonb_set(
    v_base,
    '{announcements}',
    coalesce(v_announcements, '[]'::jsonb),
    true
  );
end;
$$;

-- ---------------------------------------------------------
-- 권한
-- ---------------------------------------------------------

revoke all on function public.attendance_notice_assign_sort_order_v52_21()
from public, anon, authenticated;

revoke all on function public.attendance_resequence_notices_v52_21(text, uuid, integer)
from public, anon, authenticated;

revoke all on function public.attendance_manager_list_notices_v52_21(text)
from public, anon, authenticated;

grant execute on function public.attendance_manager_list_notices_v52_21(text)
to authenticated;

revoke all on function public.attendance_manager_save_notice_v52_21(
  uuid, text, text, date, date, boolean, integer
)
from public, anon, authenticated;

grant execute on function public.attendance_manager_save_notice_v52_21(
  uuid, text, text, date, date, boolean, integer
)
to authenticated;

revoke all on function public.attendance_worker_me_v52_21(text, text)
from public, anon, authenticated;

grant execute on function public.attendance_worker_me_v52_21(text, text)
to anon, authenticated;

-- ---------------------------------------------------------
-- 적용 확인용 조회
-- ---------------------------------------------------------

-- 현장별 공지 순번 확인:
-- select project_name, sort_order, content, is_active, starts_on, ends_on
-- from public.attendance_notices
-- order by project_name, sort_order, created_at, id;
