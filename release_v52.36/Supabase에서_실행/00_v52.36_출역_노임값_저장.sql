begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- =========================================================
-- v52.36
-- 노임관리 5단계 · 일자별 출역 + 월별 노임값 저장
--
-- 이번 단계에서 저장하는 값
-- - 일자별 출역(work_entries)
-- - 일급
-- - 추가지급
-- - 수동공제
-- - 노임메모
--
-- 법정 세금/4대보험 자동계산은 이번 단계에서 하지 않는다.
-- 실제 회사 노임 Excel 양식/수식 확인 후 연결한다.
-- =========================================================

do $$
begin
  if to_regclass('public.labor_monthly_roster_items') is null then
    raise exception
      'v52.35 labor_monthly_roster_items가 없습니다. v52.35 SQL을 먼저 실행해주세요.';
  end if;

  if to_regprocedure(
    'public.labor_monthly_roster_get_v52_35(text,text)'
  ) is null then
    raise exception
      'v52.35 월별 노임 명단 RPC가 없습니다. v52.35 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

alter table public.labor_monthly_roster_items
  add column if not exists work_entries jsonb not null default '{}'::jsonb,
  add column if not exists daily_wage numeric(14,2) not null default 0,
  add column if not exists additional_pay numeric(14,2) not null default 0,
  add column if not exists manual_deduction numeric(14,2) not null default 0,
  add column if not exists pay_note text;

alter table public.labor_monthly_roster_items
  drop constraint if exists labor_monthly_roster_items_daily_wage_v52_36;

alter table public.labor_monthly_roster_items
  add constraint labor_monthly_roster_items_daily_wage_v52_36
  check (daily_wage >= 0);

alter table public.labor_monthly_roster_items
  drop constraint if exists labor_monthly_roster_items_additional_pay_v52_36;

alter table public.labor_monthly_roster_items
  add constraint labor_monthly_roster_items_additional_pay_v52_36
  check (additional_pay >= 0);

alter table public.labor_monthly_roster_items
  drop constraint if exists labor_monthly_roster_items_manual_deduction_v52_36;

alter table public.labor_monthly_roster_items
  add constraint labor_monthly_roster_items_manual_deduction_v52_36
  check (manual_deduction >= 0);

alter table public.labor_monthly_roster_items
  drop constraint if exists labor_monthly_roster_items_work_entries_object_v52_36;

alter table public.labor_monthly_roster_items
  add constraint labor_monthly_roster_items_work_entries_object_v52_36
  check (jsonb_typeof(work_entries) = 'object');

-- ---------------------------------------------------------
-- 내부 전용 출역 JSON 검증
-- key = 1~말일
-- value = 0~2
-- ---------------------------------------------------------
create or replace function public.labor_work_entries_valid_v52_36(
  p_entries jsonb,
  p_days_in_month integer
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value text;
  v_day integer;
  v_units numeric;
begin
  if p_entries is null then
    return true;
  end if;

  if jsonb_typeof(p_entries) <> 'object' then
    return false;
  end if;

  for v_key, v_value
  in
    select key, value
    from jsonb_each_text(p_entries)
  loop
    if v_key !~ '^[0-9]{1,2}$' then
      return false;
    end if;

    v_day := v_key::integer;

    if v_day < 1
       or v_day > p_days_in_month then
      return false;
    end if;

    begin
      v_units := v_value::numeric;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range then
        return false;
    end;

    if v_units < 0
       or v_units > 2 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.labor_work_entries_valid_v52_36(jsonb, integer)
  from public, anon, authenticated;

-- =========================================================
-- v52.36 월별 명단 조회
-- =========================================================
create or replace function public.labor_monthly_roster_get_v52_36(
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
        'sort_order', i.sort_order,
        'work_entries', coalesce(i.work_entries, '{}'::jsonb),
        'daily_wage', coalesce(i.daily_wage, 0),
        'additional_pay', coalesce(i.additional_pay, 0),
        'manual_deduction', coalesce(i.manual_deduction, 0),
        'pay_note', i.pay_note
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
-- v52.36 월별 명단 + 노임값 전체 저장
--
-- 계산값(총출역, 총지급, 실지급)은 저장하지 않는다.
-- 원천값만 저장하여 향후 회사 Excel/세금 규칙 변경 시
-- 다시 계산할 수 있게 한다.
-- =========================================================
create or replace function public.labor_monthly_roster_save_v52_36(
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
  v_days_in_month integer;
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

  v_days_in_month :=
    extract(
      day from (
        to_date(v_month_key || '-01', 'YYYY-MM-DD')
        + interval '1 month'
        - interval '1 day'
      )
    )::integer;

  v_input_count := jsonb_array_length(v_items);

  if v_input_count > 500 then
    raise exception '한 달 명단은 최대 500명까지 저장할 수 있습니다.';
  end if;

  select count(
    distinct (item ->> 'worker_master_id')
  )
  into v_distinct_count
  from jsonb_array_elements(v_items) item;

  if v_input_count <> v_distinct_count then
    raise exception '같은 근로자가 명단에 중복되어 있습니다.';
  end if;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(v_items) item
  left join public.labor_worker_master w
    on w.id = nullif(
      item ->> 'worker_master_id',
      ''
    )::uuid
  where w.id is null
    or trim(
      coalesce(item ->> 'trade', '')
    ) = ''
    or not public.labor_work_entries_valid_v52_36(
      coalesce(
        item -> 'work_entries',
        '{}'::jsonb
      ),
      v_days_in_month
    )
    or coalesce(
      nullif(item ->> 'daily_wage', ''),
      '0'
    )::numeric < 0
    or coalesce(
      nullif(item ->> 'additional_pay', ''),
      '0'
    )::numeric < 0
    or coalesce(
      nullif(item ->> 'manual_deduction', ''),
      '0'
    )::numeric < 0;

  if v_invalid_count > 0 then
    raise exception
      '근로자 연결정보, 공종, 출역 또는 노임 금액이 올바르지 않은 행이 있습니다.';
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
    work_entries,
    daily_wage,
    additional_pay,
    manual_deduction,
    pay_note,
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
    nullif(
      trim(
        coalesce(item ->> 'note', '')
      ),
      ''
    ),
    coalesce(
      item -> 'work_entries',
      '{}'::jsonb
    ),
    coalesce(
      nullif(item ->> 'daily_wage', ''),
      '0'
    )::numeric,
    coalesce(
      nullif(item ->> 'additional_pay', ''),
      '0'
    )::numeric,
    coalesce(
      nullif(item ->> 'manual_deduction', ''),
      '0'
    )::numeric,
    nullif(
      trim(
        coalesce(item ->> 'pay_note', '')
      ),
      ''
    ),
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
  when invalid_text_representation
    or numeric_value_out_of_range then
    raise exception
      '근로자 연결정보 또는 노임 숫자 형식이 올바르지 않습니다.';
end;
$$;

revoke all on function public.labor_monthly_roster_get_v52_36(text, text)
  from public, anon, authenticated;

revoke all on function public.labor_monthly_roster_save_v52_36(
  text, text, jsonb
)
  from public, anon, authenticated;

grant execute on function public.labor_monthly_roster_get_v52_36(text, text)
  to authenticated;

grant execute on function public.labor_monthly_roster_save_v52_36(
  text, text, jsonb
)
  to authenticated;

comment on function public.labor_monthly_roster_get_v52_36(text, text) is
  'v52.36 월별 노임 명단 + 출역/노임 원천값 조회. 민감 개인정보 원문 미포함.';

comment on function public.labor_monthly_roster_save_v52_36(text, text, jsonb) is
  'v52.36 월별 명단/출역/일급/추가지급/수동공제 전체 저장. 법정공제 자동계산 미포함.';

commit;
