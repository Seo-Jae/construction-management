-- Supabase SQL Editor에서 직접 실행하세요. 선행: v131, v152, v177.
-- 미등록 자재 요청 / 관리자 연결 / 미등록 품목 확정 차단. 기존 자료를 삭제하지 않습니다.
begin;

-- 프론트의 런타임 권한과 동일하게 기본권한 → 공통 예외 → 현장 예외 순서로 판정합니다.
create or replace function public.material_request_access_v180(p_project text, p_manage boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_access jsonb;
  v_profile public.user_profiles%rowtype;
  v_key text := case when p_manage then 'material.input.manage' else 'material.order.view' end;
  v_granted boolean;
  v_effect text;
begin
  if auth.uid() is null or nullif(btrim(p_project), '') is null then return false; end if;
  select * into v_profile from public.user_profiles
  where auth_user_id = auth.uid() limit 1;
  if not found or coalesce(v_profile.account_status, 'active') <> 'active' then return false; end if;
  if v_profile.role = '최고관리자' then return true; end if;
  select to_jsonb(public.get_my_runtime_access_v2()) into v_access;
  if coalesce(v_access->>'access_scope', '') <> 'all'
     and not (coalesce(v_access->'project_names', '[]'::jsonb) ? p_project) then return false; end if;
  v_granted := coalesce(v_access->'template_permissions', '[]'::jsonb) ? v_key
    or coalesce(v_access->'special_permissions', '[]'::jsonb) ? v_key;
  select e->>'effect' into v_effect
  from jsonb_array_elements(coalesce(v_access->'permission_overrides', '[]'::jsonb)) e
  where e->>'permission_key' = v_key and e->>'scope_key' = '*' limit 1;
  if v_effect is not null then v_granted := v_effect = 'allow'; end if;
  select e->>'effect' into v_effect
  from jsonb_array_elements(coalesce(v_access->'permission_overrides', '[]'::jsonb)) e
  where e->>'permission_key' = v_key and e->>'scope_key' = p_project limit 1;
  if v_effect is not null then v_granted := v_effect = 'allow'; end if;
  return coalesce(v_granted, false);
end;
$$;
revoke all on function public.material_request_access_v180(text, boolean) from public;
grant execute on function public.material_request_access_v180(text, boolean) to authenticated;

create table if not exists public.material_registration_requests (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  category_id uuid not null references public.material_supply_categories(id),
  process_name text not null default '',
  standard_name text not null check (length(btrim(standard_name)) between 1 and 300),
  specification text not null default '',
  unit text not null check (length(btrim(unit)) between 1 and 30),
  requested_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  material_id uuid references public.material_master_items(id),
  resolved_by uuid,
  resolved_at timestamptz
);
create index if not exists idx_material_registration_requests_pending
  on public.material_registration_requests(project_name, created_at) where material_id is null;
alter table public.material_registration_requests enable row level security;
revoke all on public.material_registration_requests from anon, authenticated;
grant select, insert, update on public.material_registration_requests to authenticated;
drop policy if exists material_requests_read_v180 on public.material_registration_requests;
create policy material_requests_read_v180 on public.material_registration_requests for select to authenticated
using (public.material_request_access_v180(project_name, false) or public.material_request_access_v180(project_name, true));
drop policy if exists material_requests_insert_v180 on public.material_registration_requests;
create policy material_requests_insert_v180 on public.material_registration_requests for insert to authenticated
with check (public.material_request_access_v180(project_name, false) and requested_by = auth.uid() and material_id is null);
drop policy if exists material_requests_resolve_v180 on public.material_registration_requests;
create policy material_requests_resolve_v180 on public.material_registration_requests for update to authenticated
using (public.material_request_access_v180(project_name, true))
with check (public.material_request_access_v180(project_name, true));

create or replace function public.guard_material_registration_request_v180()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid(); new.created_at := now();
    new.material_id := null; new.resolved_by := null; new.resolved_at := null;
  else
    if old.material_id is not null then raise exception '이미 연결한 요청은 변경할 수 없습니다.'; end if;
    if (to_jsonb(new) - array['material_id', 'resolved_by', 'resolved_at']) is distinct from
       (to_jsonb(old) - array['material_id', 'resolved_by', 'resolved_at']) then
      raise exception '원래 요청 내용은 변경할 수 없습니다.';
    end if;
    if not exists (select 1 from public.material_master_items m where m.id = new.material_id
      and m.is_active and m.category_id = old.category_id
      and coalesce(btrim(m.process_name), '') = btrim(old.process_name)) then
      raise exception '같은 분류·공정의 사용중인 자재에 연결해주세요.';
    end if;
    new.resolved_by := auth.uid(); new.resolved_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_material_registration_request_v180 on public.material_registration_requests;
create trigger trg_material_registration_request_v180 before insert or update on public.material_registration_requests
for each row execute function public.guard_material_registration_request_v180();

create or replace function public.resolve_material_registration_request_v180(p_request_id uuid, p_project_name text, p_material_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.material_request_access_v180(p_project_name, true) then
    raise exception '이 현장의 자재관리 권한이 없습니다.';
  end if;
  update public.material_registration_requests set material_id = p_material_id
  where id = p_request_id and project_name = p_project_name and material_id is null returning id into v_id;
  if v_id is null then raise exception '요청이 없거나 이미 처리되었습니다. 목록을 새로고침해주세요.'; end if;
  return v_id;
end;
$$;
revoke all on function public.resolve_material_registration_request_v180(uuid, text, uuid) from public;
grant execute on function public.resolve_material_registration_request_v180(uuid, text, uuid) to authenticated;

alter table public.material_supply_order_items add column if not exists material_request_id uuid
  references public.material_registration_requests(id);

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
    new.specification := v_master.specification; new.unit := v_master.unit;
  end if;
  new.category_id := v_request.category_id; new.process_name := v_request.process_name;
  return new;
end;
$$;
drop trigger if exists trg_material_request_item_v180 on public.material_supply_order_items;
create trigger trg_material_request_item_v180 before insert or update on public.material_supply_order_items
for each row execute function public.guard_material_request_item_v180();

create or replace function public.guard_material_request_confirmation_v180()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status in ('ordered', 'confirmed') and old.status = 'draft' then
    if exists (select 1 from public.material_supply_order_items i
      left join public.material_master_items m on m.id = i.material_id
      where i.order_id = new.id and (i.material_id is null or m.id is null or not m.is_active
        or (i.material_request_id is not null and i.project_material_id is null))) then
      raise exception '미등록 또는 사용중지 자재가 있습니다. 마스터 연결 후 확정해주세요.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_material_request_confirmation_v180 on public.material_supply_orders;
create trigger trg_material_request_confirmation_v180 before update of status on public.material_supply_orders
for each row execute function public.guard_material_request_confirmation_v180();
commit;
