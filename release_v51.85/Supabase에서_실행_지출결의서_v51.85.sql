-- ============================================================
-- 사내 현장관리 시스템 v51.85
-- 지출결의서 날짜·도착시간 개선 설치 SQL
--
-- 기능
-- 1. 월별 지출결의서 기본정보 저장
-- 2. 날짜별 지출 항목 저장
-- 3. 현장별 조회 권한 분리
-- 4. 저장/수정/삭제 RPC 제공
--
-- 주의
-- - Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- - 기존 업무보고/품의보고 테이블은 수정하지 않습니다.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.expense_resolutions (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  expense_month date not null,
  claim_date date not null,
  claimant_name text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  total_amount numeric(14, 0) not null default 0
    check (total_amount >= 0),
  created_by uuid not null default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_resolutions_month_first_day_check
    check (expense_month = date_trunc('month', expense_month)::date)
);

create table if not exists public.expense_resolution_items (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null
    references public.expense_resolutions(id) on delete cascade,
  expense_date date not null,
  category text not null
    check (category in (
      'fuel',
      'toll',
      'entertainment',
      'lodging',
      'materials',
      'shipping',
      'other'
    )),
  origin text not null default '',
  destination text not null default '',
  destination_time time without time zone,
  description text not null default '',
  amount numeric(14, 0) not null default 0
    check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- v51.84가 이미 적용된 DB에도 도착시간 칼럼을 추가합니다.
alter table public.expense_resolution_items
  add column if not exists destination_time time without time zone;

create index if not exists expense_resolutions_project_month_idx
  on public.expense_resolutions(project_name, expense_month desc);

create index if not exists expense_resolutions_updated_at_idx
  on public.expense_resolutions(updated_at desc);

create index if not exists expense_resolution_items_resolution_idx
  on public.expense_resolution_items(resolution_id, expense_date, sort_order);

-- 현재 로그인 사용자가 해당 현장 자료에 접근할 수 있는지 확인합니다.
-- 관리자/최고관리자는 현장 선택 기능을 사용하므로 전체 현장 접근을 허용하고,
-- 담당자는 본인 프로필의 project_name과 같은 현장만 허용합니다.
create or replace function public.expense_resolution_can_access_project(
  p_project_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and coalesce(lower(trim(up.account_status)), 'active')
          not in ('disabled', 'rejected', 'pending')
      and (
        lower(regexp_replace(coalesce(up.role, ''), '[[:space:]_-]+', '', 'g'))
          in (
            '최고관리자',
            '관리자',
            'admin',
            'administrator',
            'superadmin',
            'masteradmin'
          )
        or trim(coalesce(up.project_name, '')) = trim(coalesce(p_project_name, ''))
      )
  );
$$;

revoke all on function public.expense_resolution_can_access_project(text) from public;
grant execute on function public.expense_resolution_can_access_project(text) to authenticated;

create or replace function public.set_expense_resolution_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_expense_resolutions_updated_at
  on public.expense_resolutions;

create trigger trg_expense_resolutions_updated_at
before update on public.expense_resolutions
for each row
execute function public.set_expense_resolution_updated_at();

alter table public.expense_resolutions enable row level security;
alter table public.expense_resolution_items enable row level security;

drop policy if exists expense_resolutions_select_policy
  on public.expense_resolutions;
create policy expense_resolutions_select_policy
on public.expense_resolutions
for select
to authenticated
using (public.expense_resolution_can_access_project(project_name));

drop policy if exists expense_resolutions_insert_policy
  on public.expense_resolutions;
create policy expense_resolutions_insert_policy
on public.expense_resolutions
for insert
to authenticated
with check (
  public.expense_resolution_can_access_project(project_name)
  and created_by = auth.uid()
);

drop policy if exists expense_resolutions_update_policy
  on public.expense_resolutions;
create policy expense_resolutions_update_policy
on public.expense_resolutions
for update
to authenticated
using (public.expense_resolution_can_access_project(project_name))
with check (public.expense_resolution_can_access_project(project_name));

drop policy if exists expense_resolutions_delete_policy
  on public.expense_resolutions;
create policy expense_resolutions_delete_policy
on public.expense_resolutions
for delete
to authenticated
using (public.expense_resolution_can_access_project(project_name));

drop policy if exists expense_resolution_items_select_policy
  on public.expense_resolution_items;
create policy expense_resolution_items_select_policy
on public.expense_resolution_items
for select
to authenticated
using (
  exists (
    select 1
    from public.expense_resolutions er
    where er.id = expense_resolution_items.resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  )
);

drop policy if exists expense_resolution_items_insert_policy
  on public.expense_resolution_items;
create policy expense_resolution_items_insert_policy
on public.expense_resolution_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.expense_resolutions er
    where er.id = expense_resolution_items.resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  )
);

drop policy if exists expense_resolution_items_update_policy
  on public.expense_resolution_items;
create policy expense_resolution_items_update_policy
on public.expense_resolution_items
for update
to authenticated
using (
  exists (
    select 1
    from public.expense_resolutions er
    where er.id = expense_resolution_items.resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  )
)
with check (
  exists (
    select 1
    from public.expense_resolutions er
    where er.id = expense_resolution_items.resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  )
);

drop policy if exists expense_resolution_items_delete_policy
  on public.expense_resolution_items;
create policy expense_resolution_items_delete_policy
on public.expense_resolution_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.expense_resolutions er
    where er.id = expense_resolution_items.resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  )
);

-- 지출결의서 기본정보와 항목을 한 번에 저장합니다.
create or replace function public.save_expense_resolution(
  p_resolution_id uuid,
  p_project_name text,
  p_expense_month date,
  p_claim_date date,
  p_claimant_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolution_id uuid;
  v_user_name text := '';
  v_month date;
  v_total numeric(14, 0) := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_project_name, '')), '') is null then
    raise exception '현장명이 없습니다.';
  end if;

  if not public.expense_resolution_can_access_project(p_project_name) then
    raise exception '해당 현장의 지출결의서에 접근할 권한이 없습니다.';
  end if;

  if p_expense_month is null then
    raise exception '작성월을 입력해주세요.';
  end if;

  if p_claim_date is null then
    raise exception '청구일을 입력해주세요.';
  end if;

  if nullif(trim(coalesce(p_claimant_name, '')), '') is null then
    raise exception '영수자 이름을 입력해주세요.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception '지출내역을 한 건 이상 입력해주세요.';
  end if;

  v_month := date_trunc('month', p_expense_month)::date;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where nullif(item->>'expense_date', '') is null
       or date_trunc('month', (item->>'expense_date')::date)::date <> v_month
  ) then
    raise exception '모든 사용일은 선택한 작성월 안에 있어야 합니다.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce((item->>'amount')::numeric, 0) <= 0
  ) then
    raise exception '각 지출내역의 금액은 0원보다 커야 합니다.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where item->>'category' = 'fuel'
      and (
        nullif(trim(coalesce(item->>'origin', '')), '') is null
        or nullif(trim(coalesce(item->>'destination', '')), '') is null
      )
  ) then
    raise exception '유류대는 출발지와 도착지를 모두 입력해주세요.';
  end if;

  select coalesce(up.manager_name, '')
    into v_user_name
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  select coalesce(sum((item->>'amount')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_items) item;

  if p_resolution_id is null then
    insert into public.expense_resolutions (
      project_name,
      expense_month,
      claim_date,
      claimant_name,
      status,
      total_amount,
      created_by,
      created_by_name
    ) values (
      trim(p_project_name),
      v_month,
      p_claim_date,
      trim(p_claimant_name),
      'draft',
      round(v_total),
      auth.uid(),
      coalesce(v_user_name, '')
    )
    returning id into v_resolution_id;
  else
    if not exists (
      select 1
      from public.expense_resolutions er
      where er.id = p_resolution_id
        and public.expense_resolution_can_access_project(er.project_name)
    ) then
      raise exception '수정할 지출결의서를 찾을 수 없거나 권한이 없습니다.';
    end if;

    update public.expense_resolutions
       set project_name = trim(p_project_name),
           expense_month = v_month,
           claim_date = p_claim_date,
           claimant_name = trim(p_claimant_name),
           total_amount = round(v_total),
           updated_at = now()
     where id = p_resolution_id;

    v_resolution_id := p_resolution_id;

    delete from public.expense_resolution_items
     where resolution_id = v_resolution_id;
  end if;

  insert into public.expense_resolution_items (
    resolution_id,
    expense_date,
    category,
    origin,
    destination,
    destination_time,
    description,
    amount,
    sort_order
  )
  select
    v_resolution_id,
    (item.value->>'expense_date')::date,
    item.value->>'category',
    trim(coalesce(item.value->>'origin', '')),
    trim(coalesce(item.value->>'destination', '')),
    nullif(item.value->>'destination_time', '')::time,
    trim(coalesce(item.value->>'description', '')),
    round((item.value->>'amount')::numeric),
    coalesce((item.value->>'sort_order')::integer, item.ordinality::integer - 1)
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  return v_resolution_id;
end;
$$;

revoke all on function public.save_expense_resolution(
  uuid, text, date, date, text, jsonb
) from public;
grant execute on function public.save_expense_resolution(
  uuid, text, date, date, text, jsonb
) to authenticated;

create or replace function public.delete_expense_resolution(
  p_resolution_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.expense_resolutions er
    where er.id = p_resolution_id
      and public.expense_resolution_can_access_project(er.project_name)
  ) then
    raise exception '삭제할 지출결의서를 찾을 수 없거나 권한이 없습니다.';
  end if;

  delete from public.expense_resolutions
  where id = p_resolution_id;
end;
$$;

revoke all on function public.delete_expense_resolution(uuid) from public;
grant execute on function public.delete_expense_resolution(uuid) to authenticated;

grant select, insert, update, delete
  on public.expense_resolutions
  to authenticated;

grant select, insert, update, delete
  on public.expense_resolution_items
  to authenticated;

comment on table public.expense_resolutions is
  '월별 지출결의서 기본정보';
comment on table public.expense_resolution_items is
  '지출결의서 날짜별 상세 항목';
comment on column public.expense_resolution_items.origin is
  '유류대 출발지';
comment on column public.expense_resolution_items.destination is
  '유류대 도착지';
comment on column public.expense_resolution_items.destination_time is
  '유류대 도착시간(하이패스 영수증 시·분)';
