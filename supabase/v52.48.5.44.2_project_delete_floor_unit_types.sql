-- v52.48.5.44.2 현장 삭제 RPC
-- 최고관리자 본인 비밀번호 확인은 클라이언트에서 Supabase Auth signInWithPassword로 먼저 검증합니다.
-- 이 RPC는 서버에서도 현재 사용자가 최고관리자인지 다시 확인합니다.
-- 안전을 위해 기존 업무이력 테이블은 자동 삭제하지 않고 building_settings의 현장등록만 제거합니다.

create or replace function public.admin_delete_project_v1(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project text := btrim(coalesce(p_project_name, ''));
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 현장을 삭제할 수 있습니다.';
  end if;

  if v_project = '' then
    raise exception '삭제할 현장명이 없습니다.';
  end if;

  if v_project in ('본사', '전체현장') then
    raise exception '본사/전체현장은 삭제할 수 없습니다.';
  end if;

  if not exists (
    select 1
      from public.building_settings
     where btrim(project_name) = v_project
  ) then
    raise exception '이미 삭제되었거나 존재하지 않는 현장입니다.';
  end if;

  delete from public.building_settings
   where btrim(project_name) = v_project;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'project_name', v_project,
    'deleted_building_rows', v_deleted,
    'historical_data_preserved', true
  );
end;
$$;

revoke all on function public.admin_delete_project_v1(text) from public;
grant execute on function public.admin_delete_project_v1(text) to authenticated;
