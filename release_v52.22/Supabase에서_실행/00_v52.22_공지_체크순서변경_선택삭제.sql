-- =========================================================
-- v52.22 근태 공지사항 목록형 순서변경 + 삭제
--
-- 전제:
-- v52.21 SQL이 먼저 적용되어 있어야 합니다.
--
-- 기능:
-- 1. 관리자 공지 전체 순서를 배열 순서대로 저장
-- 2. 선택 공지 삭제
-- 3. 삭제 후 현장별 순번 1,2,3... 자동 재정렬
--
-- 보안:
-- 실제 쓰기 전에 기존 v52.17 공지 저장 RPC를 동일 값으로 호출하여
-- 기존 근태관리 수정 권한/현장 권한 검사를 그대로 통과해야만 처리됩니다.
-- =========================================================

do $$
begin
  if to_regclass('public.attendance_notices') is null then
    raise exception 'attendance_notices 테이블이 없습니다.';
  end if;

  if to_regprocedure(
    'public.attendance_manager_save_notice_v52_17(uuid,text,text,date,date,boolean)'
  ) is null then
    raise exception 'attendance_manager_save_notice_v52_17 함수가 없습니다.';
  end if;

  if to_regprocedure(
    'public.attendance_manager_list_notices_v52_21(text)'
  ) is null then
    raise exception 'v52.21 공지사항 SQL이 먼저 필요합니다.';
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 내부: 해당 현장의 순번을 현재 sort_order 기준으로 1,2,3... 재정렬
-- ---------------------------------------------------------

create or replace function public.attendance_normalize_notice_order_v52_22(
  p_project_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select
      id,
      row_number() over (
        order by sort_order asc, created_at asc, id asc
      )::integer as next_order
    from public.attendance_notices
    where project_name = p_project_name
  )
  update public.attendance_notices n
  set sort_order = ranked.next_order
  from ranked
  where ranked.id = n.id;
end;
$$;

revoke all on function public.attendance_normalize_notice_order_v52_22(text)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 관리자 순서 저장
--
-- p_notice_ids는 "선택된 공지만"이 아니라
-- 화면에 표시된 해당 현장 전체 공지 ID를 최종 순서대로 전달합니다.
-- ---------------------------------------------------------

create or replace function public.attendance_manager_reorder_notices_v52_22(
  p_project_name text,
  p_notice_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_total integer := 0;
  v_passed_total integer := 0;
  v_distinct_total integer := 0;
  v_matching_total integer := 0;
  v_guard public.attendance_notices%rowtype;
  v_item record;
begin
  if v_project_name = '' then
    raise exception '현장 정보가 필요합니다.';
  end if;

  v_passed_total := coalesce(cardinality(p_notice_ids), 0);

  select count(*)
  into v_total
  from public.attendance_notices
  where project_name = v_project_name;

  if v_total = 0 then
    return jsonb_build_object(
      'success', true,
      'count', 0
    );
  end if;

  if v_passed_total <> v_total then
    raise exception '공지 목록이 변경되었습니다. 새로고침 후 다시 시도해주세요.';
  end if;

  select count(distinct notice_id)
  into v_distinct_total
  from unnest(p_notice_ids) as notice_id;

  if v_distinct_total <> v_total then
    raise exception '공지 순서 데이터에 중복 항목이 있습니다.';
  end if;

  select count(*)
  into v_matching_total
  from public.attendance_notices n
  where n.project_name = v_project_name
    and n.id = any(p_notice_ids);

  if v_matching_total <> v_total then
    raise exception '다른 현장의 공지가 포함되어 있거나 목록이 변경되었습니다.';
  end if;

  -- 기존 v52.17 저장 RPC를 동일 값으로 호출해서
  -- 기존 "수정 가능 권한"을 그대로 검증합니다.
  select *
  into v_guard
  from public.attendance_notices
  where project_name = v_project_name
  order by sort_order asc, created_at asc, id asc
  limit 1;

  perform public.attendance_manager_save_notice_v52_17(
    v_guard.id,
    v_guard.project_name,
    v_guard.content,
    v_guard.starts_on,
    v_guard.ends_on,
    v_guard.is_active
  );

  for v_item in
    select
      notice_id,
      ordinality::integer as next_order
    from unnest(p_notice_ids)
      with ordinality as ordered(notice_id, ordinality)
  loop
    update public.attendance_notices
    set sort_order = v_item.next_order
    where id = v_item.notice_id
      and project_name = v_project_name;
  end loop;

  return jsonb_build_object(
    'success', true,
    'count', v_total
  );
end;
$$;

revoke all on function public.attendance_manager_reorder_notices_v52_22(
  text, uuid[]
)
from public, anon, authenticated;

grant execute on function public.attendance_manager_reorder_notices_v52_22(
  text, uuid[]
)
to authenticated;

-- ---------------------------------------------------------
-- 관리자 선택 공지 삭제
-- ---------------------------------------------------------

create or replace function public.attendance_manager_delete_notices_v52_22(
  p_project_name text,
  p_notice_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_requested integer := coalesce(cardinality(p_notice_ids), 0);
  v_matching integer := 0;
  v_deleted integer := 0;
  v_guard public.attendance_notices%rowtype;
begin
  if v_project_name = '' then
    raise exception '현장 정보가 필요합니다.';
  end if;

  if v_requested <= 0 then
    raise exception '삭제할 공지사항을 선택해주세요.';
  end if;

  select count(*)
  into v_matching
  from public.attendance_notices n
  where n.project_name = v_project_name
    and n.id = any(p_notice_ids);

  if v_matching <> (
    select count(distinct notice_id)
    from unnest(p_notice_ids) as notice_id
  ) then
    raise exception '다른 현장의 공지가 포함되어 있거나 이미 삭제된 공지가 있습니다.';
  end if;

  select *
  into v_guard
  from public.attendance_notices
  where project_name = v_project_name
    and id = any(p_notice_ids)
  order by sort_order asc, created_at asc, id asc
  limit 1;

  if v_guard.id is null then
    raise exception '삭제할 공지사항을 찾지 못했습니다.';
  end if;

  -- 기존 v52.17의 쓰기 권한/현장 권한 검증을 그대로 사용합니다.
  perform public.attendance_manager_save_notice_v52_17(
    v_guard.id,
    v_guard.project_name,
    v_guard.content,
    v_guard.starts_on,
    v_guard.ends_on,
    v_guard.is_active
  );

  delete from public.attendance_notices
  where project_name = v_project_name
    and id = any(p_notice_ids);

  get diagnostics v_deleted = row_count;

  perform public.attendance_normalize_notice_order_v52_22(
    v_project_name
  );

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted
  );
end;
$$;

revoke all on function public.attendance_manager_delete_notices_v52_22(
  text, uuid[]
)
from public, anon, authenticated;

grant execute on function public.attendance_manager_delete_notices_v52_22(
  text, uuid[]
)
to authenticated;

-- ---------------------------------------------------------
-- 적용 확인 예시
-- ---------------------------------------------------------

-- select
--   project_name,
--   sort_order,
--   content,
--   is_active
-- from public.attendance_notices
-- order by project_name, sort_order, created_at, id;
