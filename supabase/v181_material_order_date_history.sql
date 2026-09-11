-- Supabase SQL Editor에서 직접 실행하세요. 선행 SQL: v175, v177, v180.
-- 기존 데이터 삭제 없음. v177의 확정/취소/품목 보호를 유지하며 날짜 변경만 추가합니다.
-- 입고/정산 상태는 현재 발주서에 연결되어 있지 않아 이 SQL의 판정 대상이 아닙니다.
-- 최초 등록 정보 보호 및 발주일 변경 이력은 적용 이후부터 유효합니다.
begin;

do $$
begin
  if to_regprocedure('public.material_request_access_v180(text,boolean)') is null
     or to_regprocedure('public.reserve_material_supply_order_no_v175(text,date)') is null
     or not exists (select 1 from pg_trigger
       where tgrelid = 'public.material_supply_orders'::regclass
         and tgname = 'trg_material_order_confirmation_v177' and tgenabled <> 'D') then
    raise exception '선행 SQL v175, v177, v180을 먼저 적용해주세요.';
  end if;
end;
$$;

alter table public.material_supply_orders
  add column if not exists order_date_history jsonb not null default '[]'::jsonb,
  add column if not exists order_date_change_reason text;

create or replace function public.guard_material_order_confirmation_v177()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_items jsonb;
  v_reason text;
  v_protected boolean;
  v_actor_name text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or jsonb_array_length(old.confirmation_history) > 0 or jsonb_array_length(old.order_date_history) > 0 then
      raise exception '확정 문서와 확정 취소·발주일 변경 이력이 있는 문서는 삭제할 수 없습니다.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception '품목 저장 후 발주확정해주세요. 화면을 새로고침해주세요.';
    end if;
    if not public.material_request_access_v180(new.project_name, false) then
      raise exception '이 현장의 발주 권한이 없습니다.';
    end if;
    new.created_at := now();
    new.created_by := auth.uid()::text;
    new.order_date_history := '[]'::jsonb;
    new.order_date_change_reason := null;
    new.confirmation_history := '[]'::jsonb;
    new.confirmation_cancel_reason := null;
    return new;
  end if;

  if new.confirmation_history is distinct from old.confirmation_history then
    raise exception '확정 취소 이력은 직접 변경할 수 없습니다.';
  end if;

  if new.project_name is distinct from old.project_name then
    raise exception '저장된 발주서의 현장은 변경할 수 없습니다.';
  end if;
  if not public.material_request_access_v180(old.project_name, false) then
    raise exception '이 현장의 발주 권한이 없습니다.';
  end if;

  if new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception '최초 등록시각과 등록자는 변경할 수 없습니다.';
  end if;
  if new.order_date_history is distinct from old.order_date_history then
    raise exception '발주일 변경 이력은 직접 변경할 수 없습니다.';
  end if;
  if new.order_date is distinct from old.order_date then
    if new.order_date is null or not isfinite(new.order_date) then
      raise exception '유효한 발주일을 입력해주세요.';
    end if;
    if old.status not in ('draft', 'ordered', 'confirmed') then
      raise exception '이 상태의 발주일은 수정할 수 없습니다.';
    end if;
    v_protected := old.status <> 'draft' or jsonb_array_length(old.confirmation_history) > 0;
    if not public.material_request_access_v180(old.project_name, false)
       or (v_protected and not public.material_request_access_v180(old.project_name, true)) then
      raise exception '이 현장의 발주일 수정 권한이 없습니다.';
    end if;
    v_reason := btrim(coalesce(new.order_date_change_reason, ''));
    if length(v_reason) > 1000 or (v_protected and length(v_reason) = 0) then
      raise exception '확정 이력이 있는 문서는 수정 사유를 1~1000자로 입력해주세요.';
    end if;
    if (to_jsonb(new) - array['order_date', 'order_no', 'order_date_change_reason', 'updated_at', 'updated_by'])
      is distinct from
       (to_jsonb(old) - array['order_date', 'order_no', 'order_date_change_reason', 'updated_at', 'updated_by']) then
      raise exception '발주일과 다른 문서 정보를 동시에 변경할 수 없습니다.';
    end if;
    -- 확정 이력이 있는 문서번호는 거래처와의 문서 식별을 위해 유지합니다.
    new.order_no := case when v_protected then old.order_no
      else public.reserve_material_supply_order_no_v175(old.project_name, new.order_date) end;
    select coalesce(to_jsonb(p)->>'name', to_jsonb(p)->>'full_name', auth.uid()::text)
      into v_actor_name from public.user_profiles p where p.auth_user_id = auth.uid() limit 1;
    new.order_date_history := old.order_date_history || jsonb_build_array(jsonb_build_object(
      'old_date', old.order_date, 'new_date', new.order_date,
      'old_order_no', old.order_no, 'new_order_no', new.order_no,
      'changed_at', now(), 'changed_by', auth.uid(), 'changed_by_name', v_actor_name,
      'reason', v_reason, 'status', old.status
    ));
    new.order_date_change_reason := null;
    new.updated_at := now();
    new.updated_by := auth.uid()::text;
    return new;
  end if;
  new.order_date_change_reason := null;

  if old.status = 'ordered' and new.status = 'draft' then
    if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
    v_reason := btrim(coalesce(new.confirmation_cancel_reason, ''));
    if length(v_reason) < 1 or length(v_reason) > 1000 then
      raise exception '확정 취소 사유를 1~1000자로 입력해주세요.';
    end if;
    if (to_jsonb(new) - array['status', 'confirmation_cancel_reason', 'updated_at', 'updated_by', 'ordered_at'])
      is distinct from
       (to_jsonb(old) - array['status', 'confirmation_cancel_reason', 'updated_at', 'updated_by', 'ordered_at']) then
      raise exception '확정 취소와 문서 수정을 동시에 처리할 수 없습니다.';
    end if;

    select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order, i.id), '[]'::jsonb)
    into v_items from public.material_supply_order_items i where i.order_id = old.id;

    new.confirmation_history := old.confirmation_history || jsonb_build_array(jsonb_build_object(
      'cancelled_at', now(),
      'cancelled_by', auth.uid(),
      'cancelled_by_email', auth.jwt()->>'email',
      'reason', v_reason,
      'order_snapshot', to_jsonb(old) - array['confirmation_history', 'confirmation_cancel_reason'],
      'item_snapshot', v_items
    ));
    new.ordered_at := null;
    new.updated_at := now();
    new.updated_by := auth.uid()::text;
  elsif old.status <> 'draft' then
    raise exception '확정 문서는 직접 수정할 수 없습니다. 결재 미요청 문서는 먼저 확정 취소해주세요.';
  elsif new.status not in ('draft', 'ordered') then
    raise exception '현재는 임시저장과 발주확정만 지원합니다.';
  elsif new.status = 'ordered' then
    if not exists (select 1 from public.material_supply_order_items i
      where i.order_id = old.id and i.current_order_quantity > 0) then
      raise exception '발주 수량이 있는 품목을 저장한 후 확정해주세요.';
    end if;
    new.ordered_at := now();
  end if;
  new.confirmation_cancel_reason := null;
  return new;
end;
$$;


-- SECURITY INVOKER: 기존 RLS에 추가하여 트리거에서 현장/런타임 권한을 검증합니다.
create or replace function public.change_material_order_date_v181(
  p_order_id uuid, p_project_name text, p_expected_date date, p_order_date date, p_reason text
)
returns setof public.material_supply_orders
language plpgsql security invoker set search_path = public as $$
declare v_order public.material_supply_orders%rowtype;
begin
  if not public.material_request_access_v180(p_project_name, false) then
    raise exception '이 현장의 발주 권한이 없습니다.';
  end if;
  select * into v_order from public.material_supply_orders
    where id = p_order_id and project_name = p_project_name for update;
  if not found then raise exception '발주서를 찾을 수 없거나 권한이 없습니다.'; end if;
  if v_order.order_date is distinct from p_expected_date then
    raise exception '다른 사용자가 발주일을 변경했습니다. 문서를 다시 열어주세요.';
  end if;
  if p_order_date is null or not isfinite(p_order_date) then
    raise exception '유효한 발주일을 입력해주세요.';
  end if;
  if p_order_date = v_order.order_date then raise exception '변경할 날짜를 선택해주세요.'; end if;
  return query update public.material_supply_orders
    set order_date = p_order_date, order_date_change_reason = p_reason
    where id = p_order_id and project_name = p_project_name returning *;
  if not found then raise exception '발주일을 수정할 권한이 없습니다.'; end if;
end;
$$;
revoke all on function public.change_material_order_date_v181(uuid, text, date, date, text) from public;
grant execute on function public.change_material_order_date_v181(uuid, text, date, date, text) to authenticated;

commit;
