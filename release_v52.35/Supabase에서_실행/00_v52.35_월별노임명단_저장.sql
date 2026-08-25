begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- =========================================================
-- v52.35
-- 노임관리 4단계 · 현장/월별 노임 명단 저장
--
-- 핵심 원칙
-- - 개인정보를 월별 명단에 복제하지 않는다.
-- - labor_worker_master.id만 연결한다.
-- - 월별로 저장하는 값은 공종/비고/순서 등 업무 스냅샷.
-- - 담당자도 자기 현장 labor.cost.view 권한 범위에서
--   조회/신규 최소등록/명단저장이 가능하다.
-- =========================================================

do $$
begin
  if to_regclass('public.labor_worker_master') is null then
    raise exception
      'v52.33 labor_worker_master가 없습니다. v52.33 SQL을 먼저 실행해주세요.';
  end if;

  if to_regprocedure(
    'public.labor_permission_allowed_v52_33(uuid,text,text)'
  ) is null then
    raise exception
      'v52.33 권한 함수가 없습니다. v52.33 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

create table if not exists public.labor_monthly_rosters (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  month_key text not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint labor_monthly_rosters_month_key_v52_35
    check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint labor_monthly_rosters_status_v52_35
    check (status in ('draft', 'confirmed')),
  constraint labor_monthly_rosters_project_month_v52_35
    unique (project_name, month_key)
);

create table if not exists public.labor_monthly_roster_items (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null
    references public.labor_monthly_rosters(id)
    on delete cascade,
  worker_master_id uuid not null
    references public.labor_worker_master(id)
    on delete restrict,
  sort_order integer not null,
  monthly_trade text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint labor_monthly_roster_items_order_v52_35
    check (sort_order >= 1),
  constraint labor_monthly_roster_items_worker_unique_v52_35
    unique (roster_id, worker_master_id),
  constraint labor_monthly_roster_items_order_unique_v52_35
    unique (roster_id, sort_order)
);

create index if not exists idx_labor_monthly_rosters_project_month_v52_35
  on public.labor_monthly_rosters(project_name, month_key);

create index if not exists idx_labor_monthly_roster_items_roster_v52_35
  on public.labor_monthly_roster_items(roster_id, sort_order);

create table if not exists public.labor_monthly_roster_audit (
  id bigserial primary key,
  roster_id uuid
    references public.labor_monthly_rosters(id)
    on delete set null,
  project_name text not null,
  month_key text not null,
  action_type text not null,
  before_count integer not null default 0,
  after_count integer not null default 0,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint labor_monthly_roster_audit_action_v52_35
    check (action_type in ('save'))
);

alter table public.labor_monthly_rosters enable row level security;
alter table public.labor_monthly_roster_items enable row level security;
alter table public.labor_monthly_roster_audit enable row level security;

revoke all on public.labor_monthly_rosters
  from public, anon, authenticated;
revoke all on public.labor_monthly_roster_items
  from public, anon, authenticated;
revoke all on public.labor_monthly_roster_audit
  from public, anon, authenticated;

-- =========================================================
-- 월별 노임 명단 조회
-- =========================================================
create or replace function public.labor_monthly_roster_get_v52_35(
  p_project_name text,
  p_month_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_month_key text := trim(coalesce(p_month_key, ''));
  v_roster public.labor_monthly_rosters%rowtype;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = '' then
    raise exception '현장정보가 필요합니다.';
  end if;

  if v_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '작성월 형식이 올바르지 않습니다.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    auth.uid(),
    'labor.cost.view',
    v_project_name
  ) then
    raise exception '해당 현장의 월별 노임작성 권한이 없습니다.';
  end if;

  select *
  into v_roster
  from public.labor_monthly_rosters r
  where r.project_name = v_project_name
    and r.month_key = v_month_key
  limit 1;

  if not found then
    return jsonb_build_object(
      'roster_id', null,
      'project_name', v_project_name,
      'month_key', v_month_key,
      'status', 'draft',
      'updated_at', null,
      'items', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roster_item_id', i.id,
        'worker_master_id', w.id,
        'name_ko', w.name_ko,
        'birth_date', w.birth_date,
        'phone_last4', w.phone_last4,
        'phone_masked',
          case
            when nullif(w.phone_last4, '') is null then null
            else '****' || w.phone_last4
          end,
        'recent_trade', w.recent_trade,
        'monthly_trade', i.monthly_trade,
        'note', i.note,
        'sort_order', i.sort_order
      )
      order by i.sort_order
    ),
    '[]'::jsonb
  )
  into v_items
  from public.labor_monthly_roster_items i
  join public.labor_worker_master w
    on w.id = i.worker_master_id
  where i.roster_id = v_roster.id;

  return jsonb_build_object(
    'roster_id', v_roster.id,
    'project_name', v_roster.project_name,
    'month_key', v_roster.month_key,
    'status', v_roster.status,
    'updated_at', v_roster.updated_at,
    'items', v_items
  );
end;
$$;

-- =========================================================
-- 월별 노임작성 안에서 신규 근로자 최소 등록
-- 담당자에게 근로자 마스터 관리권한을 주는 것이 아니라
-- 자기 현장 labor.cost.view 업무흐름 안에서만 실행된다.
-- =========================================================
create or replace function public.labor_monthly_worker_create_v52_35(
  p_project_name text,
  p_name_ko text,
  p_birth_date date,
  p_phone_last4 text,
  p_recent_trade text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_name text := trim(coalesce(p_name_ko, ''));
  v_phone_last4 text :=
    regexp_replace(
      coalesce(p_phone_last4, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_trade text := trim(coalesce(p_recent_trade, ''));
  v_worker public.labor_worker_master%rowtype;
  v_reused boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = '' then
    raise exception '현장정보가 필요합니다.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_project_name
  ) then
    raise exception '해당 현장의 신규 근로자 등록 권한이 없습니다.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 50 then
    raise exception '성명은 2자 이상 50자 이하로 입력해주세요.';
  end if;

  if p_birth_date is null then
    raise exception '생년월일을 입력해주세요.';
  end if;

  if v_phone_last4 !~ '^[0-9]{4}$' then
    raise exception '휴대폰 뒤 4자리는 숫자 4자리여야 합니다.';
  end if;

  if v_trade = '' then
    raise exception '공종을 입력해주세요.';
  end if;

  select *
  into v_worker
  from public.labor_worker_master w
  where w.name_ko = v_name
    and w.birth_date = p_birth_date
    and w.phone_last4 = v_phone_last4
  order by w.is_active desc, w.created_at
  limit 1;

  if found then
    v_reused := true;

    if v_worker.is_active = false then
      update public.labor_worker_master
      set
        is_active = true,
        updated_by = v_user_id,
        updated_at = clock_timestamp()
      where id = v_worker.id
      returning * into v_worker;
    end if;
  else
    insert into public.labor_worker_master (
      name_ko,
      birth_date,
      phone_last4,
      recent_trade,
      is_active,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_name,
      p_birth_date,
      v_phone_last4,
      v_trade,
      true,
      v_user_id,
      v_user_id,
      clock_timestamp(),
      clock_timestamp()
    )
    returning * into v_worker;

    insert into public.labor_worker_master_audit (
      worker_master_id,
      action_type,
      before_data,
      after_data,
      actor_user_id
    )
    values (
      v_worker.id,
      'create',
      null,
      to_jsonb(v_worker),
      v_user_id
    );
  end if;

  return jsonb_build_object(
    'worker_master_id', v_worker.id,
    'name_ko', v_worker.name_ko,
    'birth_date', v_worker.birth_date,
    'phone_last4', v_worker.phone_last4,
    'phone_masked',
      case
        when nullif(v_worker.phone_last4, '') is null then null
        else '****' || v_worker.phone_last4
      end,
    'recent_trade',
      coalesce(nullif(v_worker.recent_trade, ''), v_trade),
    'reused', v_reused
  );
end;
$$;

-- =========================================================
-- 월별 명단 전체 저장
-- 프론트의 현재 순서를 서버에서 1..N으로 재부여한다.
-- 이름/생년월일/전화번호는 전달받지 않고 worker_master_id만 받는다.
-- =========================================================
create or replace function public.labor_monthly_roster_save_v52_35(
  p_project_name text,
  p_month_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_month_key text := trim(coalesce(p_month_key, ''));
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_roster_id uuid;
  v_before_count integer := 0;
  v_after_count integer := 0;
  v_input_count integer := 0;
  v_distinct_count integer := 0;
  v_invalid_count integer := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = '' then
    raise exception '현장정보가 필요합니다.';
  end if;

  if v_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '작성월 형식이 올바르지 않습니다.';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception '근로자 명단 형식이 올바르지 않습니다.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_project_name
  ) then
    raise exception '해당 현장의 월별 노임작성 권한이 없습니다.';
  end if;

  v_input_count := jsonb_array_length(v_items);

  if v_input_count > 500 then
    raise exception '한 달 명단은 최대 500명까지 저장할 수 있습니다.';
  end if;

  select count(distinct (item ->> 'worker_master_id'))
  into v_distinct_count
  from jsonb_array_elements(v_items) item;

  if v_input_count <> v_distinct_count then
    raise exception '같은 근로자가 명단에 중복되어 있습니다.';
  end if;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(v_items) item
  left join public.labor_worker_master w
    on w.id = nullif(item ->> 'worker_master_id', '')::uuid
  where w.id is null
    or trim(coalesce(item ->> 'trade', '')) = '';

  if v_invalid_count > 0 then
    raise exception '근로자 연결정보 또는 공종이 올바르지 않은 행이 있습니다.';
  end if;

  insert into public.labor_monthly_rosters (
    project_name,
    month_key,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    v_project_name,
    v_month_key,
    'draft',
    v_user_id,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (project_name, month_key) do update
  set
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning id into v_roster_id;

  select count(*)
  into v_before_count
  from public.labor_monthly_roster_items
  where roster_id = v_roster_id;

  delete from public.labor_monthly_roster_items
  where roster_id = v_roster_id;

  insert into public.labor_monthly_roster_items (
    roster_id,
    worker_master_id,
    sort_order,
    monthly_trade,
    note,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  select
    v_roster_id,
    (item ->> 'worker_master_id')::uuid,
    ordinal::integer,
    trim(item ->> 'trade'),
    nullif(trim(coalesce(item ->> 'note', '')), ''),
    v_user_id,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  from jsonb_array_elements(v_items)
    with ordinality as source(item, ordinal)
  order by ordinal;

  get diagnostics v_after_count = row_count;

  update public.labor_monthly_rosters
  set
    updated_by = v_user_id,
    updated_at = clock_timestamp()
  where id = v_roster_id;

  insert into public.labor_monthly_roster_audit (
    roster_id,
    project_name,
    month_key,
    action_type,
    before_count,
    after_count,
    actor_user_id
  )
  values (
    v_roster_id,
    v_project_name,
    v_month_key,
    'save',
    v_before_count,
    v_after_count,
    v_user_id
  );

  return jsonb_build_object(
    'roster_id', v_roster_id,
    'project_name', v_project_name,
    'month_key', v_month_key,
    'item_count', v_after_count,
    'updated_at', clock_timestamp()
  );
exception
  when invalid_text_representation then
    raise exception '근로자 연결정보 형식이 올바르지 않습니다.';
end;
$$;

revoke all on function public.labor_monthly_roster_get_v52_35(text, text)
  from public, anon, authenticated;
revoke all on function public.labor_monthly_worker_create_v52_35(
  text, text, date, text, text
)
  from public, anon, authenticated;
revoke all on function public.labor_monthly_roster_save_v52_35(
  text, text, jsonb
)
  from public, anon, authenticated;

grant execute on function public.labor_monthly_roster_get_v52_35(text, text)
  to authenticated;
grant execute on function public.labor_monthly_worker_create_v52_35(
  text, text, date, text, text
)
  to authenticated;
grant execute on function public.labor_monthly_roster_save_v52_35(
  text, text, jsonb
)
  to authenticated;

comment on table public.labor_monthly_rosters is
  'v52.35 현장/월별 노임 명단 헤더. 개인정보를 복제하지 않는다.';

comment on table public.labor_monthly_roster_items is
  'v52.35 월별 노임 근로자 연결 및 월별 공종/비고/순서 스냅샷.';

comment on function public.labor_monthly_roster_save_v52_35(text, text, jsonb) is
  'v52.35 자기 권한 현장의 월별 노임 명단을 전체 저장. worker_master_id만 연결.';

commit;
