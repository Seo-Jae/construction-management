begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.labor_monthly_rosters') is null
     or to_regclass('public.labor_monthly_roster_items') is null then
    raise exception
      'v52.35 월별 노임 명단 DB가 없습니다. v52.35 SQL을 먼저 실행해주세요.';
  end if;

  if to_regprocedure(
    'public.labor_monthly_roster_get_v52_36(text,text)'
  ) is null then
    raise exception
      'v52.36 출역/노임 RPC가 없습니다. v52.36 SQL을 먼저 실행해주세요.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'labor_worker_master'
      and column_name = 'has_private_data'
  ) then
    raise exception
      'v52.34 근로자 보호정보 구조가 없습니다. v52.34 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

create or replace function public.labor_monthly_export_readiness_v52_37(
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
  v_user_id uuid := auth.uid();
  v_project_name text := trim(coalesce(p_project_name, ''));
  v_month_key text := trim(coalesce(p_month_key, ''));
  v_roster_id uuid;
  v_worker_count integer := 0;
  v_issue_worker_count integer := 0;
  v_ready_worker_count integer := 0;
  v_issue_count integer := 0;
  v_workers jsonb := '[]'::jsonb;
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

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_project_name
  ) then
    raise exception '해당 현장의 노임 Excel 준비상태를 확인할 권한이 없습니다.';
  end if;

  select r.id
  into v_roster_id
  from public.labor_monthly_rosters r
  where r.project_name = v_project_name
    and r.month_key = v_month_key
  limit 1;

  if not found then
    return jsonb_build_object(
      'ready', false,
      'project_name', v_project_name,
      'month_key', v_month_key,
      'worker_count', 0,
      'ready_worker_count', 0,
      'issue_worker_count', 0,
      'issue_count', 0,
      'message', '저장된 월별 노임 명단이 없습니다.',
      'workers', '[]'::jsonb
    );
  end if;

  with worker_check as (
    select
      i.sort_order,
      w.id as worker_master_id,
      w.name_ko,
      w.birth_date,
      case
        when nullif(w.phone_last4, '') is null then null
        else '****' || w.phone_last4
      end as phone_masked,
      array_remove(
        array[
          case
            when not (
              coalesce(w.has_resident_no, false)
              or coalesce(w.has_foreign_no, false)
            )
            then 'identity'
          end,
          case
            when not coalesce(w.has_private_phone, false)
            then 'phone'
          end,
          case
            when not coalesce(w.has_address, false)
            then 'address'
          end,
          case
            when not coalesce(w.has_account, false)
            then 'account'
          end,
          case
            when coalesce(w.has_account, false)
                 and nullif(trim(coalesce(w.bank_name_hint, '')), '') is null
            then 'bank'
          end,
          case
            when nullif(trim(coalesce(i.monthly_trade, '')), '') is null
            then 'trade'
          end,
          case
            when coalesce(i.daily_wage, 0) <= 0
            then 'daily_wage'
          end,
          case
            when coalesce(
              (
                select sum(entry.value::numeric)
                from jsonb_each_text(
                  coalesce(i.work_entries, '{}'::jsonb)
                ) entry
              ),
              0
            ) <= 0
            then 'work_entries'
          end
        ],
        null
      ) as missing_fields
    from public.labor_monthly_roster_items i
    join public.labor_worker_master w
      on w.id = i.worker_master_id
    where i.roster_id = v_roster_id
  ),
  aggregate_check as (
    select
      count(*)::integer as worker_count,
      count(*) filter (
        where cardinality(missing_fields) = 0
      )::integer as ready_worker_count,
      count(*) filter (
        where cardinality(missing_fields) > 0
      )::integer as issue_worker_count,
      coalesce(
        sum(cardinality(missing_fields)),
        0
      )::integer as issue_count
    from worker_check
  )
  select
    a.worker_count,
    a.ready_worker_count,
    a.issue_worker_count,
    a.issue_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sort_order', c.sort_order,
            'worker_master_id', c.worker_master_id,
            'name_ko', c.name_ko,
            'birth_date', c.birth_date,
            'phone_masked', c.phone_masked,
            'missing_fields', to_jsonb(c.missing_fields)
          )
          order by c.sort_order
        )
        from worker_check c
        where cardinality(c.missing_fields) > 0
      ),
      '[]'::jsonb
    )
  into
    v_worker_count,
    v_ready_worker_count,
    v_issue_worker_count,
    v_issue_count,
    v_workers
  from aggregate_check a;

  return jsonb_build_object(
    'ready',
      v_worker_count > 0
      and v_issue_worker_count = 0,
    'project_name', v_project_name,
    'month_key', v_month_key,
    'worker_count', v_worker_count,
    'ready_worker_count', v_ready_worker_count,
    'issue_worker_count', v_issue_worker_count,
    'issue_count', v_issue_count,
    'message',
      case
        when v_worker_count = 0
          then '명단에 근로자가 없습니다.'
        when v_issue_worker_count = 0
          then '기본 Excel 생성 데이터가 준비되었습니다.'
        else 'Excel 생성 전 보완이 필요한 근로자가 있습니다.'
      end,
    'workers', v_workers
  );
end;
$$;

revoke all on function public.labor_monthly_export_readiness_v52_37(
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.labor_monthly_export_readiness_v52_37(
  text,
  text
)
to authenticated;

comment on function public.labor_monthly_export_readiness_v52_37(text, text) is
  'v52.37 노임 Excel 생성 사전검증. 민감 원문을 복호화/반환하지 않고 등록여부 및 출역/일급 상태만 검사.';

commit;



begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- =========================================================
-- v52.38
-- 보안 휴대폰 기반
--
-- 현재 단계:
-- - 로그인 사용자가 자기 인증용 휴대폰번호를 등록
-- - 전체 번호는 암호문으로만 저장
-- - 인증 상태는 pending
-- - SENS 실제 SMS 전송/OTP 검증은 아직 하지 않음
--
-- 향후:
-- pending -> SMS OTP 검증 -> verified 로 승격
-- verified 번호만 노임 민감 Excel 다운로드 인증에 사용
-- =========================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from vault.secrets
    where name = 'labor_security_phone_key_v52_38'
  )
  into v_exists;

  if not v_exists then
    perform vault.create_secret(
      encode(
        extensions.gen_random_bytes(32),
        'hex'
      ),
      'labor_security_phone_key_v52_38',
      '욱림건설 계정 보안 휴대폰 암호화 키 v52.38'
    );
  end if;
end;
$$;

revoke all on vault.secrets
  from public, anon, authenticated;

revoke all on vault.decrypted_secrets
  from public, anon, authenticated;

create table if not exists public.user_security_phone (
  auth_user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  verified_phone_last4 text,
  pending_phone_last4 text,
  verified_at timestamptz,
  pending_requested_at timestamptz,
  created_at timestamptz not null
    default clock_timestamp(),
  updated_at timestamptz not null
    default clock_timestamp(),
  constraint user_security_phone_verified_last4_v52_38
    check (
      verified_phone_last4 is null
      or verified_phone_last4 ~ '^[0-9]{4}$'
    ),
  constraint user_security_phone_pending_last4_v52_38
    check (
      pending_phone_last4 is null
      or pending_phone_last4 ~ '^[0-9]{4}$'
    )
);

create table if not exists public.user_security_phone_private (
  auth_user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  verified_phone_encrypted bytea,
  pending_phone_encrypted bytea,
  crypto_version integer not null default 1,
  created_at timestamptz not null
    default clock_timestamp(),
  updated_at timestamptz not null
    default clock_timestamp()
);

create table if not exists public.user_security_phone_audit (
  id bigserial primary key,
  auth_user_id uuid
    references auth.users(id)
    on delete set null,
  action_type text not null,
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null
    default clock_timestamp(),
  constraint user_security_phone_audit_action_v52_38
    check (
      action_type in (
        'pending_registered',
        'pending_replaced'
      )
    )
);

alter table public.user_security_phone
  enable row level security;

alter table public.user_security_phone_private
  enable row level security;

alter table public.user_security_phone_audit
  enable row level security;

revoke all on public.user_security_phone
  from public, anon, authenticated;

revoke all on public.user_security_phone_private
  from public, anon, authenticated;

revoke all on public.user_security_phone_audit
  from public, anon, authenticated;

create or replace function public.labor_security_phone_key_v52_38()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, vault, public
as $$
declare
  v_key text;
begin
  select decrypted_secret
  into v_key
  from vault.decrypted_secrets
  where name =
    'labor_security_phone_key_v52_38'
  limit 1;

  if nullif(v_key, '') is null then
    raise exception
      '보안 휴대폰 암호화 키를 불러오지 못했습니다.';
  end if;

  return v_key;
end;
$$;

revoke all on function public.labor_security_phone_key_v52_38()
  from public, anon, authenticated;

create or replace function public.labor_security_phone_status_v52_38()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_security_phone%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_row
  from public.user_security_phone s
  where s.auth_user_id = v_user_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'has_verified_phone', false,
      'has_pending_phone', false,
      'verified_phone_masked', null,
      'pending_phone_masked', null,
      'verified_at', null,
      'pending_requested_at', null
    );
  end if;

  return jsonb_build_object(
    'has_verified_phone',
      v_row.verified_phone_last4 is not null
      and v_row.verified_at is not null,
    'has_pending_phone',
      v_row.pending_phone_last4 is not null,
    'verified_phone_masked',
      case
        when v_row.verified_phone_last4 is null
          then null
        else '010-****-' ||
          v_row.verified_phone_last4
      end,
    'pending_phone_masked',
      case
        when v_row.pending_phone_last4 is null
          then null
        else '010-****-' ||
          v_row.pending_phone_last4
      end,
    'verified_at',
      v_row.verified_at,
    'pending_requested_at',
      v_row.pending_requested_at
  );
end;
$$;

create or replace function public.labor_security_phone_register_pending_v52_38(
  p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, vault, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text :=
    regexp_replace(
      coalesce(p_phone_number, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_last4 text;
  v_key text;
  v_had_pending boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_phone !~ '^01(0|1|6|7|8|9)[0-9]{7,8}$' then
    raise exception '휴대폰번호 형식을 확인해주세요.';
  end if;

  v_last4 := right(v_phone, 4);
  v_key :=
    public.labor_security_phone_key_v52_38();

  select
    pending_phone_last4 is not null
  into v_had_pending
  from public.user_security_phone
  where auth_user_id = v_user_id;

  insert into public.user_security_phone (
    auth_user_id,
    pending_phone_last4,
    pending_requested_at,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_last4,
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (auth_user_id) do update
  set
    pending_phone_last4 =
      excluded.pending_phone_last4,
    pending_requested_at =
      excluded.pending_requested_at,
    updated_at =
      excluded.updated_at;

  insert into public.user_security_phone_private (
    auth_user_id,
    pending_phone_encrypted,
    crypto_version,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    extensions.pgp_sym_encrypt(
      v_phone,
      v_key,
      'cipher-algo=aes256,compress-algo=1'
    ),
    1,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (auth_user_id) do update
  set
    pending_phone_encrypted =
      excluded.pending_phone_encrypted,
    crypto_version =
      excluded.crypto_version,
    updated_at =
      excluded.updated_at;

  insert into public.user_security_phone_audit (
    auth_user_id,
    action_type,
    actor_user_id
  )
  values (
    v_user_id,
    case
      when v_had_pending
        then 'pending_replaced'
      else 'pending_registered'
    end,
    v_user_id
  );

  return public.labor_security_phone_status_v52_38();
end;
$$;

revoke all on function public.labor_security_phone_status_v52_38()
  from public, anon, authenticated;

revoke all on function public.labor_security_phone_register_pending_v52_38(text)
  from public, anon, authenticated;

grant execute on function public.labor_security_phone_status_v52_38()
  to authenticated;

grant execute on function public.labor_security_phone_register_pending_v52_38(text)
  to authenticated;

comment on table public.user_security_phone_private is
  'v52.38 계정 보안 휴대폰 암호문. SMS 인증 전에는 pending_phone_encrypted만 저장.';

comment on function public.labor_security_phone_register_pending_v52_38(text) is
  'v52.38 현재 로그인 사용자의 SMS 인증 예정 번호를 암호화 저장. 인증 완료 처리하지 않음.';

commit;
