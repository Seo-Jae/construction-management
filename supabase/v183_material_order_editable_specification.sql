-- Supabase SQL Editor에서 직접 실행하세요. 선행: v180 자재 등록 요청 SQL.
-- 일반 마스터 선택 품목은 프론트 수정만으로 적용됩니다.
-- 이 SQL은 등록 요청을 통해 마스터에 연결된 품목의 규격(1)이 저장 시 덮어써지는 것을 방지합니다.
-- 미연결 요청의 원본 보호 및 현장/분류/공정 검증은 유지합니다. 기존 데이터 변경 없음.
begin;

create or replace function public.guard_material_request_item_v180()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_request public.material_registration_requests%rowtype;
  v_order public.material_supply_orders%rowtype;
  v_master public.material_master_items%rowtype;
begin
  if new.material_request_id is null then return new; end if;
  select * into v_order from public.material_supply_orders where id = new.order_id;
  select * into v_request from public.material_registration_requests where id = new.material_request_id;
  if not found or v_request.project_name is distinct from v_order.project_name
     or v_request.category_id is distinct from v_order.category_id
     or btrim(v_request.process_name) <> coalesce(btrim(v_order.process_name), '') then
    raise exception '현재 현장·분류·공정의 등록 요청만 사용할 수 있습니다.';
  end if;
  if v_request.material_id is null then
    if new.material_id is not null then raise exception '자재관리자의 연결이 필요합니다.'; end if;
    new.project_material_id := null;
    new.standard_name := v_request.standard_name; new.specification := v_request.specification;
    new.unit := v_request.unit;
  else
    select * into v_master from public.material_master_items where id = v_request.material_id and is_active;
    if not found then raise exception '연결된 자재가 사용중지되었습니다.'; end if;
    if new.material_id is distinct from v_master.id then new.project_material_id := null; end if;
    new.material_id := v_master.id; new.standard_name := v_master.standard_name;
    -- 연결된 자재의 규격(1)은 발주 담당자가 입력한 값을 보존합니다.
    new.unit := v_master.unit;
  end if;
  new.category_id := v_request.category_id; new.process_name := v_request.process_name;
  return new;
end;
$$;

commit;
