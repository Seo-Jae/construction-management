-- Supabase SQL Editor에서 직접 실행하세요. v175 적용 이후 사용합니다.
-- 기존 문서/품목을 삭제하지 않으며, 기존 RLS 권한을 유지합니다.
-- 이 SQL 적용 후에는 새 프론트 코드로 새로고침해야 발주확정할 수 있습니다.
-- 확정 취소 이력이 있는 문서는 임시저장으로 돌아가도 삭제할 수 없습니다.
begin;

alter table public.material_supply_orders
  add column if not exists confirmation_history jsonb not null default '[]'::jsonb,
  add column if not exists confirmation_cancel_reason text;

create or replace function public.guard_material_order_confirmation_v177()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_items jsonb;
  v_reason text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or jsonb_array_length(old.confirmation_history) > 0 then
      raise exception '확정 문서와 확정 취소 이력이 있는 문서는 삭제할 수 없습니다.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception '품목 저장 후 발주확정해주세요. 화면을 새로고침해주세요.';
    end if;
    new.confirmation_history := '[]'::jsonb;
    new.confirmation_cancel_reason := null;
    return new;
  end if;

  if new.confirmation_history is distinct from old.confirmation_history then
    raise exception '확정 취소 이력은 직접 변경할 수 없습니다.';
  end if;

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

drop trigger if exists trg_material_order_confirmation_v177 on public.material_supply_orders;
create trigger trg_material_order_confirmation_v177
before insert or update or delete on public.material_supply_orders
for each row execute function public.guard_material_order_confirmation_v177();

create or replace function public.guard_material_order_item_edit_v177()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op <> 'INSERT' then
    select status into v_status from public.material_supply_orders
    where id = old.order_id for update;
    if found and v_status <> 'draft' then
      raise exception '확정 문서의 품목은 변경하거나 삭제할 수 없습니다.';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select status into v_status from public.material_supply_orders
    where id = new.order_id for update;
    if not found or v_status <> 'draft' then
      raise exception '수정 가능한 임시저장 문서에만 품목을 저장할 수 있습니다.';
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_material_order_item_edit_v177 on public.material_supply_order_items;
create trigger trg_material_order_item_edit_v177
before insert or update or delete on public.material_supply_order_items
for each row execute function public.guard_material_order_item_edit_v177();

create or replace function public.cancel_material_order_confirmation_v177(
  p_order_id uuid, p_project_name text, p_reason text
)
returns setof public.material_supply_orders
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  -- 기존 UPDATE/SELECT RLS가 허용한 현장 문서만 취소 가능합니다.
  -- 조건부 UPDATE의 행 잠금으로 중복 클릭/동시 취소를 방지합니다.
  return query
  update public.material_supply_orders
  set status = 'draft', confirmation_cancel_reason = p_reason
  where id = p_order_id and project_name = p_project_name and status = 'ordered'
  returning *;
  if not found then
    raise exception '발주확정 상태의 문서가 없거나 수정 권한이 없습니다.';
  end if;
end;
$$;

revoke all on function public.cancel_material_order_confirmation_v177(uuid, text, text) from public;
grant execute on function public.cancel_material_order_confirmation_v177(uuid, text, text) to authenticated;

commit;
