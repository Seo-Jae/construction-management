begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- =========================================================
-- v52.39
-- 노임 민감 Excel 다운로드 OTP 챌린지/감사로그 기반
--
-- 현재 SENS는 아직 연결하지 않는다.
-- 따라서 sms_provider_ready는 false이며,
-- 실제 OTP 요청 버튼은 서버 기준으로 차단된다.
--
-- 향후 SENS 연동 단계에서
-- labor_download_otp_request_v52_39 함수에
-- 실제 SMS 전송만 결합하면 되도록
-- challenge/verify 구조를 미리 완성한다.
-- =========================================================

do $$
begin
  if to_regprocedure(
    'public.labor_monthly_export_readiness_v52_37(text,text)'
  ) is null then
    raise exception
      'v52.37 Excel 생성 사전검증이 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_security_phone_status_v52_38()'
  ) is null
     or to_regclass(
       'public.user_security_phone_private'
     ) is null then
    raise exception
      'v52.38 보안 휴대폰 기반이 없습니다.';
  end if;

  if to_regclass(
    'public.labor_worker_private'
  ) is null then
    raise exception
      'v52.34 근로자 보호정보 구조가 없습니다.';
  end if;
end;
$$;

create extension if not exists pgcrypto
  with schema extensions;
create extension if not exists supabase_vault
  with schema vault;

-- OTP HMAC 및 휴대폰 fingerprint용 서버 비밀키
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from vault.secrets
    where name =
      'labor_download_otp_hmac_key_v52_39'
  )
  into v_exists;

  if not v_exists then
    perform vault.create_secret(
      encode(
        extensions.gen_random_bytes(32),
        'hex'
      ),
      'labor_download_otp_hmac_key_v52_39',
      '욱림건설 노임 다운로드 OTP HMAC 키 v52.39'
    );
  end if;
end;
$$;

revoke all on vault.secrets
  from public, anon, authenticated;
revoke all on vault.decrypted_secrets
  from public, anon, authenticated;

create table if not exists public.labor_download_otp_challenges (
  id uuid primary key,
  auth_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  project_name text not null,
  month_key text not null,
  roster_id uuid not null
    references public.labor_monthly_rosters(id)
    on delete cascade,
  request_snapshot_hash text not null,
  phone_fingerprint text not null,
  verified_phone_last4 text not null,
  security_phone_verified_at timestamptz not null,
  otp_digest text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'pending',
  expires_at timestamptz not null,
  verified_at timestamptz,
  authorized_until timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null
    default clock_timestamp(),
  updated_at timestamptz not null
    default clock_timestamp(),
  constraint labor_download_otp_month_v52_39
    check (
      month_key ~
      '^[0-9]{4}-(0[1-9]|1[0-2])$'
    ),
  constraint labor_download_otp_snapshot_v52_39
    check (
      request_snapshot_hash ~
      '^[0-9a-f]{64}$'
    ),
  constraint labor_download_otp_phone_fp_v52_39
    check (
      phone_fingerprint ~
      '^[0-9a-f]{64}$'
    ),
  constraint labor_download_otp_last4_v52_39
    check (
      verified_phone_last4 ~
      '^[0-9]{4}$'
    ),
  constraint labor_download_otp_digest_v52_39
    check (
      otp_digest ~
      '^[0-9a-f]{64}$'
    ),
  constraint labor_download_otp_attempts_v52_39
    check (
      attempts >= 0
      and max_attempts between 1 and 10
    ),
  constraint labor_download_otp_status_v52_39
    check (
      status in (
        'pending',
        'verified',
        'consumed',
        'expired',
        'locked',
        'cancelled'
      )
    )
);

create index if not exists idx_labor_download_otp_user_created_v52_39
  on public.labor_download_otp_challenges(
    auth_user_id,
    created_at desc
  );

create index if not exists idx_labor_download_otp_phone_created_v52_39
  on public.labor_download_otp_challenges(
    phone_fingerprint,
    created_at desc
  );

create index if not exists idx_labor_download_otp_scope_v52_39
  on public.labor_download_otp_challenges(
    auth_user_id,
    project_name,
    month_key,
    created_at desc
  );

create unique index if not exists uq_labor_download_otp_pending_scope_v52_39
  on public.labor_download_otp_challenges(
    auth_user_id,
    project_name,
    month_key
  )
  where status = 'pending';

create table if not exists public.labor_sensitive_download_audit (
  id bigserial primary key,
  challenge_id uuid
    references public.labor_download_otp_challenges(id)
    on delete set null,
  auth_user_id uuid
    references auth.users(id)
    on delete set null,
  project_name text,
  month_key text,
  event_type text not null,
  request_snapshot_hash text,
  verified_phone_last4 text,
  detail jsonb,
  created_at timestamptz not null
    default clock_timestamp(),
  constraint labor_sensitive_download_audit_event_v52_39
    check (
      event_type in (
        'challenge_created',
        'challenge_blocked',
        'otp_failed',
        'otp_verified',
        'challenge_expired',
        'challenge_locked',
        'challenge_cancelled',
        'download_consumed',
        'download_generated'
      )
    )
);

create index if not exists idx_labor_sensitive_download_audit_user_v52_39
  on public.labor_sensitive_download_audit(
    auth_user_id,
    created_at desc
  );

create index if not exists idx_labor_sensitive_download_audit_scope_v52_39
  on public.labor_sensitive_download_audit(
    project_name,
    month_key,
    created_at desc
  );

alter table public.labor_download_otp_challenges
  enable row level security;
alter table public.labor_sensitive_download_audit
  enable row level security;

revoke all on public.labor_download_otp_challenges
  from public, anon, authenticated;
revoke all on public.labor_sensitive_download_audit
  from public, anon, authenticated;

-- =========================================================
-- 내부 HMAC 키
-- =========================================================
create or replace function public.labor_download_hmac_key_v52_39()
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
    'labor_download_otp_hmac_key_v52_39'
  limit 1;

  if nullif(v_key, '') is null then
    raise exception
      '노임 다운로드 OTP HMAC 키를 불러오지 못했습니다.';
  end if;

  return v_key;
end;
$$;

revoke all on function public.labor_download_hmac_key_v52_39()
  from public, anon, authenticated;

-- 현재는 의도적으로 false.
-- SENS 연동 버전에서 이 함수와 요청함수를 함께 교체한다.
create or replace function public.labor_download_sms_provider_ready_v52_39()
returns boolean
language sql
immutable
as $$
  select false;
$$;

revoke all on function public.labor_download_sms_provider_ready_v52_39()
  from public, anon, authenticated;

-- =========================================================
-- 내부: 현재 명단 스냅샷 해시
-- 민감 원문 자체는 해시에 넣지 않고
-- private.updated_at을 포함하여 개인정보가 수정되면
-- 기존 OTP가 자동 무효화되도록 한다.
-- =========================================================
create or replace function public.labor_monthly_snapshot_v52_39(
  p_project_name text,
  p_month_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_project_name text :=
    trim(coalesce(p_project_name, ''));
  v_month_key text :=
    trim(coalesce(p_month_key, ''));
  v_roster public.labor_monthly_rosters%rowtype;
  v_material text;
  v_hash text;
begin
  select *
  into v_roster
  from public.labor_monthly_rosters r
  where r.project_name = v_project_name
    and r.month_key = v_month_key
  limit 1;

  if not found then
    return jsonb_build_object(
      'exists', false,
      'roster_id', null,
      'snapshot_hash', null
    );
  end if;

  select concat_ws(
    '||',
    v_project_name,
    v_month_key,
    v_roster.id::text,
    v_roster.updated_at::text,
    coalesce(
      string_agg(
        concat_ws(
          '|',
          i.sort_order::text,
          i.worker_master_id::text,
          coalesce(i.monthly_trade, ''),
          coalesce(i.note, ''),
          coalesce(i.work_entries, '{}'::jsonb)::text,
          coalesce(i.daily_wage, 0)::text,
          coalesce(i.additional_pay, 0)::text,
          coalesce(i.manual_deduction, 0)::text,
          coalesce(i.pay_note, ''),
          coalesce(w.updated_at::text, ''),
          coalesce(p.updated_at::text, '')
        ),
        ';;'
        order by i.sort_order
      ),
      ''
    )
  )
  into v_material
  from public.labor_monthly_roster_items i
  join public.labor_worker_master w
    on w.id = i.worker_master_id
  left join public.labor_worker_private p
    on p.worker_master_id = i.worker_master_id
  where i.roster_id = v_roster.id;

  v_hash :=
    encode(
      extensions.digest(
        convert_to(
          coalesce(v_material, ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  return jsonb_build_object(
    'exists', true,
    'roster_id', v_roster.id,
    'snapshot_hash', v_hash,
    'updated_at', v_roster.updated_at
  );
end;
$$;

revoke all on function public.labor_monthly_snapshot_v52_39(text, text)
  from public, anon, authenticated;

-- =========================================================
-- 내부: verified 보안 휴대폰 context
-- 전체 번호는 함수 밖으로 반환하지 않는다.
-- fingerprint는 keyed HMAC.
-- =========================================================
create or replace function public.labor_verified_phone_context_v52_39(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_status public.user_security_phone%rowtype;
  v_private public.user_security_phone_private%rowtype;
  v_phone_key text;
  v_hmac_key text;
  v_phone text;
  v_fingerprint text;
begin
  select *
  into v_status
  from public.user_security_phone s
  where s.auth_user_id = p_user_id
  limit 1;

  if not found
     or v_status.verified_at is null
     or v_status.verified_phone_last4 is null then
    return jsonb_build_object(
      'verified', false
    );
  end if;

  select *
  into v_private
  from public.user_security_phone_private p
  where p.auth_user_id = p_user_id
  limit 1;

  if not found
     or v_private.verified_phone_encrypted is null then
    return jsonb_build_object(
      'verified', false
    );
  end if;

  v_phone_key :=
    public.labor_security_phone_key_v52_38();

  begin
    v_phone :=
      extensions.pgp_sym_decrypt(
        v_private.verified_phone_encrypted,
        v_phone_key
      );
  exception
    when others then
      raise exception
        '인증된 보안 휴대폰 정보를 확인하지 못했습니다.';
  end;

  if v_phone !~ '^01(0|1|6|7|8|9)[0-9]{7,8}$' then
    raise exception
      '인증된 보안 휴대폰 형식이 올바르지 않습니다.';
  end if;

  if right(v_phone, 4) <>
     v_status.verified_phone_last4 then
    raise exception
      '보안 휴대폰 상태가 일치하지 않습니다.';
  end if;

  v_hmac_key :=
    public.labor_download_hmac_key_v52_39();

  v_fingerprint :=
    encode(
      extensions.hmac(
        convert_to(
          'phone:' || v_phone,
          'UTF8'
        ),
        decode(v_hmac_key, 'hex'),
        'sha256'
      ),
      'hex'
    );

  return jsonb_build_object(
    'verified', true,
    'last4',
      v_status.verified_phone_last4,
    'masked',
      '010-****-' ||
      v_status.verified_phone_last4,
    'verified_at',
      v_status.verified_at,
    'fingerprint',
      v_fingerprint
  );
end;
$$;

revoke all on function public.labor_verified_phone_context_v52_39(uuid)
  from public, anon, authenticated;

-- =========================================================
-- 프론트 공개: 다운로드 인증 사전점검
-- =========================================================
create or replace function public.labor_download_auth_preflight_v52_39(
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
  v_project_name text :=
    trim(coalesce(p_project_name, ''));
  v_month_key text :=
    trim(coalesce(p_month_key, ''));
  v_readiness jsonb;
  v_snapshot jsonb;
  v_phone jsonb;
  v_provider_ready boolean;
  v_blockers text[] := '{}';
  v_excel_ready boolean := false;
  v_phone_ready boolean := false;
  v_roster_exists boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_project_name = ''
     or v_month_key !~
        '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception
      '현장 또는 작성월을 확인해주세요.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_project_name
  ) then
    raise exception
      '해당 현장의 노임 다운로드 인증 권한이 없습니다.';
  end if;

  v_readiness :=
    public.labor_monthly_export_readiness_v52_37(
      v_project_name,
      v_month_key
    );

  v_snapshot :=
    public.labor_monthly_snapshot_v52_39(
      v_project_name,
      v_month_key
    );

  v_phone :=
    public.labor_verified_phone_context_v52_39(
      v_user_id
    );

  v_provider_ready :=
    public.labor_download_sms_provider_ready_v52_39();

  v_excel_ready :=
    coalesce(
      (v_readiness ->> 'ready')::boolean,
      false
    );

  v_phone_ready :=
    coalesce(
      (v_phone ->> 'verified')::boolean,
      false
    );

  v_roster_exists :=
    coalesce(
      (v_snapshot ->> 'exists')::boolean,
      false
    );

  if not v_roster_exists then
    v_blockers :=
      array_append(
        v_blockers,
        'roster_missing'
      );
  end if;

  if not v_excel_ready then
    v_blockers :=
      array_append(
        v_blockers,
        'excel_not_ready'
      );
  end if;

  if not v_phone_ready then
    v_blockers :=
      array_append(
        v_blockers,
        'security_phone_unverified'
      );
  end if;

  if not v_provider_ready then
    v_blockers :=
      array_append(
        v_blockers,
        'sms_provider_not_connected'
      );
  end if;

  return jsonb_build_object(
    'can_request',
      cardinality(v_blockers) = 0,
    'excel_ready',
      v_excel_ready,
    'has_verified_phone',
      v_phone_ready,
    'verified_phone_masked',
      v_phone ->> 'masked',
    'sms_provider_ready',
      v_provider_ready,
    'worker_count',
      coalesce(
        (v_readiness ->> 'worker_count')::integer,
        0
      ),
    'ready_worker_count',
      coalesce(
        (v_readiness ->> 'ready_worker_count')::integer,
        0
      ),
    'issue_worker_count',
      coalesce(
        (v_readiness ->> 'issue_worker_count')::integer,
        0
      ),
    'issue_count',
      coalesce(
        (v_readiness ->> 'issue_count')::integer,
        0
      ),
    'roster_id',
      v_snapshot ->> 'roster_id',
    'snapshot_hash',
      v_snapshot ->> 'snapshot_hash',
    'blockers',
      to_jsonb(v_blockers)
  );
end;
$$;

-- =========================================================
-- 내부: 암호학적 6자리 OTP
-- 24-bit 난수 중 16,000,000 미만만 사용하여
-- modulo bias 없이 000000~999999 생성.
-- =========================================================
create or replace function public.labor_generate_otp_v52_39()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_bytes bytea;
  v_number integer;
begin
  loop
    v_bytes :=
      extensions.gen_random_bytes(3);

    v_number :=
      get_byte(v_bytes, 0) * 65536
      + get_byte(v_bytes, 1) * 256
      + get_byte(v_bytes, 2);

    exit when v_number < 16000000;
  end loop;

  return lpad(
    (v_number % 1000000)::text,
    6,
    '0'
  );
end;
$$;

revoke all on function public.labor_generate_otp_v52_39()
  from public, anon, authenticated;

-- =========================================================
-- SMS 인증 요청
-- 현재 provider_ready=false이므로 실제 생성 전 차단.
-- 다음 SENS 단계에서 이 함수에 문자 전송을 결합한다.
-- OTP 자체는 절대 반환하지 않는다.
-- =========================================================
create or replace function public.labor_download_otp_request_v52_39(
  p_project_name text,
  p_month_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text :=
    trim(coalesce(p_project_name, ''));
  v_month_key text :=
    trim(coalesce(p_month_key, ''));
  v_preflight jsonb;
  v_phone jsonb;
  v_snapshot jsonb;
  v_challenge_id uuid :=
    extensions.gen_random_uuid();
  v_otp text;
  v_key text;
  v_digest text;
  v_expires_at timestamptz :=
    clock_timestamp() +
    interval '5 minutes';
  v_recent_count integer;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_preflight :=
    public.labor_download_auth_preflight_v52_39(
      v_project_name,
      v_month_key
    );

  if not coalesce(
    (v_preflight ->> 'can_request')::boolean,
    false
  ) then
    insert into public.labor_sensitive_download_audit (
      challenge_id,
      auth_user_id,
      project_name,
      month_key,
      event_type,
      request_snapshot_hash,
      detail
    )
    values (
      null,
      v_user_id,
      v_project_name,
      v_month_key,
      'challenge_blocked',
      v_preflight ->> 'snapshot_hash',
      jsonb_build_object(
        'blockers',
        v_preflight -> 'blockers'
      )
    );

    raise exception
      '현재는 SMS 인증요청을 시작할 수 없습니다.';
  end if;

  -- 방어적 재검증.
  if not public.labor_download_sms_provider_ready_v52_39() then
    raise exception
      'SENS SMS 발송 연동이 아직 준비되지 않았습니다.';
  end if;

  v_phone :=
    public.labor_verified_phone_context_v52_39(
      v_user_id
    );

  v_snapshot :=
    public.labor_monthly_snapshot_v52_39(
      v_project_name,
      v_month_key
    );

  -- 사용자: 60초 내 재요청 금지
  if exists (
    select 1
    from public.labor_download_otp_challenges c
    where c.auth_user_id = v_user_id
      and c.created_at >
        clock_timestamp() -
        interval '60 seconds'
  ) then
    raise exception
      '인증번호는 60초 후 다시 요청할 수 있습니다.';
  end if;

  -- 사용자: 10분에 최대 5회
  select count(*)
  into v_recent_count
  from public.labor_download_otp_challenges c
  where c.auth_user_id = v_user_id
    and c.created_at >
      clock_timestamp() -
      interval '10 minutes';

  if v_recent_count >= 5 then
    raise exception
      '인증요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  end if;

  -- 같은 번호 fingerprint: 1시간에 최대 10회
  select count(*)
  into v_recent_count
  from public.labor_download_otp_challenges c
  where c.phone_fingerprint =
      v_phone ->> 'fingerprint'
    and c.created_at >
      clock_timestamp() -
      interval '1 hour';

  if v_recent_count >= 10 then
    raise exception
      '해당 보안 휴대폰으로 인증요청이 너무 많습니다.';
  end if;

  -- 기존 pending challenge 취소
  update public.labor_download_otp_challenges
  set
    status = 'cancelled',
    updated_at = clock_timestamp()
  where auth_user_id = v_user_id
    and project_name = v_project_name
    and month_key = v_month_key
    and status = 'pending';

  v_otp :=
    public.labor_generate_otp_v52_39();

  v_key :=
    public.labor_download_hmac_key_v52_39();

  v_digest :=
    encode(
      extensions.hmac(
        convert_to(
          concat_ws(
            ':',
            v_challenge_id::text,
            v_otp,
            v_snapshot ->> 'snapshot_hash',
            v_phone ->> 'fingerprint'
          ),
          'UTF8'
        ),
        decode(v_key, 'hex'),
        'sha256'
      ),
      'hex'
    );

  insert into public.labor_download_otp_challenges (
    id,
    auth_user_id,
    project_name,
    month_key,
    roster_id,
    request_snapshot_hash,
    phone_fingerprint,
    verified_phone_last4,
    security_phone_verified_at,
    otp_digest,
    attempts,
    max_attempts,
    status,
    expires_at,
    created_at,
    updated_at
  )
  values (
    v_challenge_id,
    v_user_id,
    v_project_name,
    v_month_key,
    (v_snapshot ->> 'roster_id')::uuid,
    v_snapshot ->> 'snapshot_hash',
    v_phone ->> 'fingerprint',
    v_phone ->> 'last4',
    (v_phone ->> 'verified_at')::timestamptz,
    v_digest,
    0,
    5,
    'pending',
    v_expires_at,
    clock_timestamp(),
    clock_timestamp()
  );

  -- 중요:
  -- 현재 버전에는 실제 SMS 전송 코드가 없다.
  -- provider_ready가 false이므로 여기까지 도달하지 않는다.
  -- 다음 SENS 버전에서 v_otp를 서버 내부에서만 SMS API에 전달한다.

  insert into public.labor_sensitive_download_audit (
    challenge_id,
    auth_user_id,
    project_name,
    month_key,
    event_type,
    request_snapshot_hash,
    verified_phone_last4
  )
  values (
    v_challenge_id,
    v_user_id,
    v_project_name,
    v_month_key,
    'challenge_created',
    v_snapshot ->> 'snapshot_hash',
    v_phone ->> 'last4'
  );

  return jsonb_build_object(
    'challenge_id',
      v_challenge_id,
    'expires_at',
      v_expires_at,
    'phone_masked',
      v_phone ->> 'masked'
  );
end;
$$;

-- =========================================================
-- OTP 검증
-- keyed HMAC / 5회 / 5분 / snapshot+phone binding
-- =========================================================
create or replace function public.labor_download_otp_verify_v52_39(
  p_challenge_id uuid,
  p_otp text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_otp text :=
    regexp_replace(
      coalesce(p_otp, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_challenge public.labor_download_otp_challenges%rowtype;
  v_snapshot jsonb;
  v_phone jsonb;
  v_key text;
  v_digest text;
  v_attempts integer;
  v_authorized_until timestamptz;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_otp !~ '^[0-9]{6}$' then
    raise exception
      '인증번호는 숫자 6자리여야 합니다.';
  end if;

  select *
  into v_challenge
  from public.labor_download_otp_challenges c
  where c.id = p_challenge_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    raise exception
      '인증요청을 찾을 수 없습니다.';
  end if;

  if v_challenge.status <> 'pending' then
    raise exception
      '사용할 수 없는 인증요청입니다.';
  end if;

  if v_challenge.expires_at <=
     clock_timestamp() then
    update public.labor_download_otp_challenges
    set
      status = 'expired',
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    insert into public.labor_sensitive_download_audit (
      challenge_id,
      auth_user_id,
      project_name,
      month_key,
      event_type,
      request_snapshot_hash,
      verified_phone_last4
    )
    values (
      v_challenge.id,
      v_user_id,
      v_challenge.project_name,
      v_challenge.month_key,
      'challenge_expired',
      v_challenge.request_snapshot_hash,
      v_challenge.verified_phone_last4
    );

    raise exception
      '인증번호가 만료되었습니다.';
  end if;

  if v_challenge.attempts >=
     v_challenge.max_attempts then
    update public.labor_download_otp_challenges
    set
      status = 'locked',
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    raise exception
      '인증번호 입력 가능 횟수를 초과했습니다.';
  end if;

  -- 권한 재검증
  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_challenge.project_name
  ) then
    update public.labor_download_otp_challenges
    set
      status = 'cancelled',
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    raise exception
      '현장 접근권한이 변경되어 인증요청을 취소했습니다.';
  end if;

  -- 현재 명단이 challenge 생성 당시와 같은지 재검증
  v_snapshot :=
    public.labor_monthly_snapshot_v52_39(
      v_challenge.project_name,
      v_challenge.month_key
    );

  if v_snapshot ->> 'snapshot_hash'
     is distinct from
     v_challenge.request_snapshot_hash then
    update public.labor_download_otp_challenges
    set
      status = 'cancelled',
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    insert into public.labor_sensitive_download_audit (
      challenge_id,
      auth_user_id,
      project_name,
      month_key,
      event_type,
      request_snapshot_hash,
      verified_phone_last4,
      detail
    )
    values (
      v_challenge.id,
      v_user_id,
      v_challenge.project_name,
      v_challenge.month_key,
      'challenge_cancelled',
      v_challenge.request_snapshot_hash,
      v_challenge.verified_phone_last4,
      jsonb_build_object(
        'reason',
        'snapshot_changed'
      )
    );

    raise exception
      '명단 또는 개인정보가 변경되어 새 인증이 필요합니다.';
  end if;

  -- verified phone도 생성 당시와 동일해야 함
  v_phone :=
    public.labor_verified_phone_context_v52_39(
      v_user_id
    );

  if not coalesce(
       (v_phone ->> 'verified')::boolean,
       false
     )
     or v_phone ->> 'fingerprint'
        is distinct from
        v_challenge.phone_fingerprint
     or (v_phone ->> 'verified_at')::timestamptz
        is distinct from
        v_challenge.security_phone_verified_at then
    update public.labor_download_otp_challenges
    set
      status = 'cancelled',
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    raise exception
      '보안 휴대폰이 변경되어 새 인증이 필요합니다.';
  end if;

  v_key :=
    public.labor_download_hmac_key_v52_39();

  v_digest :=
    encode(
      extensions.hmac(
        convert_to(
          concat_ws(
            ':',
            v_challenge.id::text,
            v_otp,
            v_challenge.request_snapshot_hash,
            v_challenge.phone_fingerprint
          ),
          'UTF8'
        ),
        decode(v_key, 'hex'),
        'sha256'
      ),
      'hex'
    );

  if v_digest <>
     v_challenge.otp_digest then
    v_attempts :=
      v_challenge.attempts + 1;

    update public.labor_download_otp_challenges
    set
      attempts = v_attempts,
      status =
        case
          when v_attempts >=
               v_challenge.max_attempts
            then 'locked'
          else 'pending'
        end,
      updated_at = clock_timestamp()
    where id = v_challenge.id;

    insert into public.labor_sensitive_download_audit (
      challenge_id,
      auth_user_id,
      project_name,
      month_key,
      event_type,
      request_snapshot_hash,
      verified_phone_last4,
      detail
    )
    values (
      v_challenge.id,
      v_user_id,
      v_challenge.project_name,
      v_challenge.month_key,
      case
        when v_attempts >=
             v_challenge.max_attempts
          then 'challenge_locked'
        else 'otp_failed'
      end,
      v_challenge.request_snapshot_hash,
      v_challenge.verified_phone_last4,
      jsonb_build_object(
        'attempts',
        v_attempts,
        'max_attempts',
        v_challenge.max_attempts
      )
    );

    return jsonb_build_object(
      'verified', false,
      'attempts',
        v_attempts,
      'remaining_attempts',
        greatest(
          0,
          v_challenge.max_attempts -
          v_attempts
        )
    );
  end if;

  v_authorized_until :=
    clock_timestamp() +
    interval '5 minutes';

  update public.labor_download_otp_challenges
  set
    status = 'verified',
    verified_at = clock_timestamp(),
    authorized_until =
      v_authorized_until,
    updated_at = clock_timestamp()
  where id = v_challenge.id;

  insert into public.labor_sensitive_download_audit (
    challenge_id,
    auth_user_id,
    project_name,
    month_key,
    event_type,
    request_snapshot_hash,
    verified_phone_last4
  )
  values (
    v_challenge.id,
    v_user_id,
    v_challenge.project_name,
    v_challenge.month_key,
    'otp_verified',
    v_challenge.request_snapshot_hash,
    v_challenge.verified_phone_last4
  );

  return jsonb_build_object(
    'verified', true,
    'challenge_id',
      v_challenge.id,
    'authorized_until',
      v_authorized_until
  );
end;
$$;

revoke all on function public.labor_download_auth_preflight_v52_39(
  text,
  text
)
from public, anon, authenticated;

revoke all on function public.labor_download_otp_request_v52_39(
  text,
  text
)
from public, anon, authenticated;

revoke all on function public.labor_download_otp_verify_v52_39(
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function public.labor_download_auth_preflight_v52_39(
  text,
  text
)
to authenticated;

grant execute on function public.labor_download_otp_request_v52_39(
  text,
  text
)
to authenticated;

grant execute on function public.labor_download_otp_verify_v52_39(
  uuid,
  text
)
to authenticated;

comment on table public.labor_download_otp_challenges is
  'v52.39 노임 민감 Excel 2차인증 challenge. OTP 평문 저장 금지, keyed HMAC digest만 저장.';

comment on table public.labor_sensitive_download_audit is
  'v52.39 노임 민감 다운로드 인증/다운로드 감사로그. OTP/민감원문 기록 금지.';

comment on function public.labor_download_auth_preflight_v52_39(text, text) is
  'v52.39 Excel 사전검증 + verified 보안휴대폰 + SMS provider 상태 통합 점검.';

comment on function public.labor_download_otp_verify_v52_39(uuid, text) is
  'v52.39 6자리 OTP keyed HMAC 검증. 5회/5분/snapshot/phone binding.';

commit;
