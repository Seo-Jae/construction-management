begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =========================================================
-- v52.33
-- 노임관리 2단계 · 회사 공통 근로자 마스터 기반
--
-- 이번 단계에서 저장하는 정보
-- - 성명
-- - 생년월일
-- - 휴대폰 뒤 4자리
-- - 최근 공종
-- - 비고 / 활성상태
--
-- 주민등록번호, 전체 휴대폰번호, 주소, 계좌정보 등은
-- 암호화 저장 구조 확정 전까지 절대 평문 컬럼으로 추가하지 않는다.
-- =========================================================

-- 1. 근로자 마스터
create table if not exists public.labor_worker_master (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null,
  birth_date date,
  phone_last4 text,
  recent_trade text,
  note text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.labor_worker_master
  add column if not exists name_ko text,
  add column if not exists birth_date date,
  add column if not exists phone_last4 text,
  add column if not exists recent_trade text,
  add column if not exists note text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default clock_timestamp(),
  add column if not exists updated_at timestamptz not null default clock_timestamp();

alter table public.labor_worker_master
  drop constraint if exists labor_worker_master_name_length_v52_33;

alter table public.labor_worker_master
  add constraint labor_worker_master_name_length_v52_33
  check (char_length(trim(name_ko)) between 2 and 50);

alter table public.labor_worker_master
  drop constraint if exists labor_worker_master_phone_last4_v52_33;

alter table public.labor_worker_master
  add constraint labor_worker_master_phone_last4_v52_33
  check (
    phone_last4 is null
    or phone_last4 = ''
    or phone_last4 ~ '^[0-9]{4}$'
  );

create index if not exists idx_labor_worker_master_name_v52_33
  on public.labor_worker_master (name_ko);

create index if not exists idx_labor_worker_master_active_name_v52_33
  on public.labor_worker_master (is_active, name_ko);

-- 2. 변경 감사로그
create table if not exists public.labor_worker_master_audit (
  id bigserial primary key,
  worker_master_id uuid references public.labor_worker_master(id) on delete set null,
  action_type text not null check (action_type in ('create', 'update')),
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_labor_worker_master_audit_worker_v52_33
  on public.labor_worker_master_audit(worker_master_id, created_at desc);

-- 3. 특수권한
-- 근로자 정보관리 메뉴 자체는 최고관리자와
-- 회원관리 > 특수권한에서 명시적으로 허용한 사용자만 접근.
insert into public.permission_definitions
  (
    permission_key,
    area_code,
    area_label,
    menu_code,
    menu_label,
    action_code,
    action_label,
    action_rank,
    is_sensitive,
    is_preparing
  )
values
  (
    'labor.worker_master.manage',
    'labor',
    '노임관리',
    'labor_worker_master',
    '근로자 정보관리',
    'manage',
    '근로자 정보관리',
    90,
    true,
    false
  )
on conflict (permission_key) do update
set area_code = excluded.area_code,
    area_label = excluded.area_label,
    menu_code = excluded.menu_code,
    menu_label = excluded.menu_label,
    action_code = excluded.action_code,
    action_label = excluded.action_label,
    action_rank = excluded.action_rank,
    is_sensitive = excluded.is_sensitive,
    is_preparing = excluded.is_preparing;

insert into public.template_permissions
  (template_code, permission_key, is_granted)
values
  (
    'super_admin',
    'labor.worker_master.manage',
    true
  )
on conflict (template_code, permission_key) do update
set is_granted = true;

-- 다른 템플릿에는 자동 부여하지 않는다.
delete from public.template_permissions
where permission_key = 'labor.worker_master.manage'
  and template_code <> 'super_admin';

-- 4. 권한 판정 헬퍼
create or replace function public.labor_permission_allowed_v52_33(
  p_user_id uuid,
  p_permission_key text,
  p_project_name text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_account_status text;
  v_organization_type text;
  v_legacy_project_name text;
  v_template_code text;
  v_access_scope text;
  v_has_access_setting boolean := false;
  v_granted boolean := false;
  v_effect text;
  v_project_allowed boolean := true;
begin
  if p_user_id is null then
    return false;
  end if;

  select
    coalesce(up.role, '담당자'),
    coalesce(up.account_status, 'active'),
    coalesce(up.organization_type, '현장'),
    trim(coalesce(up.project_name, ''))
  into
    v_role,
    v_account_status,
    v_organization_type,
    v_legacy_project_name
  from public.user_profiles up
  where up.auth_user_id = p_user_id
  limit 1;

  if not found or v_account_status <> 'active' then
    return false;
  end if;

  if v_role = '최고관리자' then
    return true;
  end if;

  select
    s.permission_template_code,
    s.access_scope
  into
    v_template_code,
    v_access_scope
  from public.user_access_settings_v2 s
  where s.auth_user_id = p_user_id;

  if found then
    v_has_access_setting := true;
  else
    v_template_code := case
      when v_organization_type = '본사' then 'hq_construction'
      when v_organization_type = '외부업체' then 'external_partner'
      when v_role = '관리자' then 'site_manager'
      else 'site_construction'
    end;

    v_access_scope := case
      when v_legacy_project_name = '전체현장' then 'all'
      else 'home_project'
    end;
  end if;

  v_granted :=
    exists (
      select 1
      from public.template_permissions tp
      where tp.template_code = v_template_code
        and tp.permission_key = p_permission_key
        and tp.is_granted = true
    );

  if v_has_access_setting then
    if exists (
      select 1
      from public.user_special_permissions_v2 sp
      where sp.auth_user_id = p_user_id
        and sp.permission_key = p_permission_key
    ) then
      v_granted := true;
    end if;

    select o.effect
    into v_effect
    from public.user_permission_overrides_v2 o
    where o.auth_user_id = p_user_id
      and o.scope_key = '*'
      and o.permission_key = p_permission_key
    limit 1;

    if found then
      v_granted := v_effect = 'allow';
    end if;
  end if;

  if nullif(trim(coalesce(p_project_name, '')), '') is not null then
    if v_has_access_setting then
      if v_access_scope = 'all' then
        v_project_allowed := true;
      else
        v_project_allowed := exists (
          select 1
          from public.user_project_access_v2 pa
          where pa.auth_user_id = p_user_id
            and pa.project_name = trim(p_project_name)
            and pa.is_active = true
            and (
              pa.access_start_date is null
              or pa.access_start_date <= current_date
            )
            and (
              pa.access_end_date is null
              or pa.access_end_date >= current_date
            )
        );
      end if;
    else
      v_project_allowed :=
        v_legacy_project_name = '전체현장'
        or v_legacy_project_name = trim(p_project_name);
    end if;

    if not v_project_allowed then
      return false;
    end if;

    if v_has_access_setting then
      select o.effect
      into v_effect
      from public.user_permission_overrides_v2 o
      where o.auth_user_id = p_user_id
        and o.scope_key = trim(p_project_name)
        and o.permission_key = p_permission_key
      limit 1;

      if found then
        v_granted := v_effect = 'allow';
      end if;
    end if;
  end if;

  return v_granted;
end;
$$;

-- 5. 담당자/일반관리자용 마스킹 검색
-- labor.cost.view + 해당 현장 접근권한이 있어야만 검색 가능.
create or replace function public.labor_worker_master_search_v52_33(
  p_query text,
  p_project_name text
)
returns table (
  worker_master_id uuid,
  name_ko text,
  birth_date date,
  phone_last4 text,
  phone_masked text,
  recent_trade text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_project_name text := trim(coalesce(p_project_name, ''));
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if char_length(v_query) < 2 then
    raise exception '성명을 2자 이상 입력해주세요.';
  end if;

  if v_project_name = '' then
    raise exception '현장정보가 필요합니다.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    auth.uid(),
    'labor.cost.view',
    v_project_name
  ) then
    raise exception '해당 현장의 노임 근로자 조회 권한이 없습니다.';
  end if;

  return query
  select
    w.id,
    w.name_ko,
    w.birth_date,
    nullif(w.phone_last4, ''),
    case
      when nullif(w.phone_last4, '') is null then null
      else '****' || w.phone_last4
    end,
    nullif(w.recent_trade, '')
  from public.labor_worker_master w
  where w.is_active = true
    and w.name_ko ilike '%' || v_query || '%'
  order by
    case
      when w.name_ko = v_query then 0
      when w.name_ko ilike v_query || '%' then 1
      else 2
    end,
    w.name_ko,
    w.birth_date nulls last
  limit 30;
end;
$$;

-- 6. 근로자 정보관리 전용 목록
create or replace function public.labor_worker_master_list_v52_33(
  p_query text default '',
  p_limit integer default 300
)
returns table (
  worker_master_id uuid,
  name_ko text,
  birth_date date,
  phone_last4 text,
  phone_masked text,
  recent_trade text,
  note text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 300), 500));
begin
  if not public.labor_permission_allowed_v52_33(
    auth.uid(),
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 정보관리 권한이 없습니다.';
  end if;

  return query
  select
    w.id,
    w.name_ko,
    w.birth_date,
    nullif(w.phone_last4, ''),
    case
      when nullif(w.phone_last4, '') is null then null
      else '****' || w.phone_last4
    end,
    nullif(w.recent_trade, ''),
    nullif(w.note, ''),
    w.is_active,
    w.created_at,
    w.updated_at
  from public.labor_worker_master w
  where
    v_query = ''
    or w.name_ko ilike '%' || v_query || '%'
  order by
    w.is_active desc,
    w.name_ko,
    w.birth_date nulls last
  limit v_limit;
end;
$$;

-- 7. 근로자 등록/수정
create or replace function public.labor_worker_master_upsert_v52_33(
  p_worker_id uuid,
  p_name_ko text,
  p_birth_date date,
  p_phone_last4 text,
  p_recent_trade text,
  p_note text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name_ko text := trim(coalesce(p_name_ko, ''));
  v_phone_last4 text := regexp_replace(
    coalesce(p_phone_last4, ''),
    '[^0-9]',
    '',
    'g'
  );
  v_recent_trade text := nullif(trim(coalesce(p_recent_trade, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_before public.labor_worker_master%rowtype;
  v_after public.labor_worker_master%rowtype;
  v_created boolean := false;
begin
  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 정보관리 권한이 없습니다.';
  end if;

  if char_length(v_name_ko) < 2 or char_length(v_name_ko) > 50 then
    raise exception '성명은 2자 이상 50자 이하로 입력해주세요.';
  end if;

  if v_phone_last4 <> '' and v_phone_last4 !~ '^[0-9]{4}$' then
    raise exception '휴대폰 뒤 4자리는 숫자 4자리여야 합니다.';
  end if;

  if p_worker_id is null then
    insert into public.labor_worker_master (
      name_ko,
      birth_date,
      phone_last4,
      recent_trade,
      note,
      is_active,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_name_ko,
      p_birth_date,
      nullif(v_phone_last4, ''),
      v_recent_trade,
      v_note,
      coalesce(p_is_active, true),
      v_user_id,
      v_user_id,
      clock_timestamp(),
      clock_timestamp()
    )
    returning * into v_after;

    v_created := true;

    insert into public.labor_worker_master_audit (
      worker_master_id,
      action_type,
      before_data,
      after_data,
      actor_user_id
    )
    values (
      v_after.id,
      'create',
      null,
      to_jsonb(v_after),
      v_user_id
    );
  else
    select *
    into v_before
    from public.labor_worker_master
    where id = p_worker_id
    for update;

    if not found then
      raise exception '수정할 근로자를 찾을 수 없습니다.';
    end if;

    update public.labor_worker_master
    set
      name_ko = v_name_ko,
      birth_date = p_birth_date,
      phone_last4 = nullif(v_phone_last4, ''),
      recent_trade = v_recent_trade,
      note = v_note,
      is_active = coalesce(p_is_active, true),
      updated_by = v_user_id,
      updated_at = clock_timestamp()
    where id = p_worker_id
    returning * into v_after;

    insert into public.labor_worker_master_audit (
      worker_master_id,
      action_type,
      before_data,
      after_data,
      actor_user_id
    )
    values (
      v_after.id,
      'update',
      to_jsonb(v_before),
      to_jsonb(v_after),
      v_user_id
    );
  end if;

  return jsonb_build_object(
    'worker_master_id', v_after.id,
    'created', v_created,
    'name_ko', v_after.name_ko
  );
end;
$$;

-- 8. 직접 테이블 접근 차단
alter table public.labor_worker_master enable row level security;
alter table public.labor_worker_master_audit enable row level security;

revoke all on public.labor_worker_master from anon, authenticated;
revoke all on public.labor_worker_master_audit from anon, authenticated;

revoke all on function public.labor_permission_allowed_v52_33(uuid, text, text) from public;
revoke all on function public.labor_worker_master_search_v52_33(text, text) from public;
revoke all on function public.labor_worker_master_list_v52_33(text, integer) from public;
revoke all on function public.labor_worker_master_upsert_v52_33(uuid, text, date, text, text, text, boolean) from public;

grant execute on function public.labor_worker_master_search_v52_33(text, text) to authenticated;
grant execute on function public.labor_worker_master_list_v52_33(text, integer) to authenticated;
grant execute on function public.labor_worker_master_upsert_v52_33(uuid, text, date, text, text, text, boolean) to authenticated;

comment on table public.labor_worker_master is
  'v52.33 노임관리 회사 공통 근로자 마스터. 민감 원문은 아직 저장하지 않는다.';

comment on function public.labor_worker_master_search_v52_33(text, text) is
  'v52.33 월별 노임작성용 마스킹 근로자 검색. labor.cost.view + 현장 접근권한 필요.';

comment on function public.labor_worker_master_list_v52_33(text, integer) is
  'v52.33 특수권한 labor.worker_master.manage 보유자 전용 근로자 마스터 목록.';

comment on function public.labor_worker_master_upsert_v52_33(uuid, text, date, text, text, text, boolean) is
  'v52.33 특수권한 labor.worker_master.manage 보유자 전용 근로자 등록/수정.';

commit;

-- =========================================================
-- 실행 후 확인용
-- =========================================================
-- select permission_key, menu_label, action_label, is_sensitive
-- from public.permission_definitions
-- where permission_key = 'labor.worker_master.manage';
--
-- 최고관리자 로그인 후:
-- select * from public.labor_worker_master_list_v52_33('', 20);
