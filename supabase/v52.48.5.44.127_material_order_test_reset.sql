-- v52.48.5.44.127
-- 자재발주 테스트 초기화
-- 현재 현장의 발주서와 발주 기본설정만 초기화하며 자재 마스터·자재분류는 유지합니다.

begin;

create or replace function public.admin_reset_material_order_test_v1(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text := btrim(coalesce(p_project_name, ''));
  v_role text := '';
  v_deleted_orders integer := 0;
  v_deleted_order_items integer := 0;
  v_deleted_sequences integer := 0;
  v_deleted_project_settings integer := 0;
  v_deleted_project_materials integer := 0;
  v_deleted_setting_history integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(role, '')
    into v_role
    from public.user_profiles
   where auth_user_id = auth.uid()
     and coalesce(account_status, '') <> 'disabled'
   limit 1;

  if v_role <> '최고관리자' then
    raise exception '자재발주 테스트 초기화는 최고관리자만 가능합니다.';
  end if;

  if v_project_name = '' then
    raise exception '초기화할 현장명이 없습니다.';
  end if;

  select count(*)::integer
    into v_deleted_orders
    from public.material_supply_orders
   where project_name = v_project_name;

  select count(*)::integer
    into v_deleted_order_items
    from public.material_supply_order_items i
    join public.material_supply_orders o
      on o.id = i.order_id
   where o.project_name = v_project_name;

  delete from public.material_supply_orders
   where project_name = v_project_name;

  delete from public.material_supply_order_sequence
   where project_name = v_project_name;
  get diagnostics v_deleted_sequences = row_count;

  delete from public.material_order_setting_history
   where project_name = v_project_name;
  get diagnostics v_deleted_setting_history = row_count;

  delete from public.material_order_project_settings
   where project_name = v_project_name;
  get diagnostics v_deleted_project_settings = row_count;

  delete from public.material_project_materials
   where project_name = v_project_name;
  get diagnostics v_deleted_project_materials = row_count;

  return jsonb_build_object(
    'project_name', v_project_name,
    'deleted_orders', v_deleted_orders,
    'deleted_order_items', v_deleted_order_items,
    'deleted_sequences', v_deleted_sequences,
    'deleted_project_settings', v_deleted_project_settings,
    'deleted_project_materials', v_deleted_project_materials,
    'deleted_setting_history', v_deleted_setting_history,
    'kept_material_master', true,
    'kept_material_categories', true
  );
end;
$$;

revoke all on function public.admin_reset_material_order_test_v1(text)
  from public;
grant execute on function public.admin_reset_material_order_test_v1(text)
  to authenticated;

commit;
