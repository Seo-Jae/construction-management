begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- =========================================================
-- v52.34
-- 노임관리 3단계 · 근로자 보호정보 암호화 저장
--
-- 설계 원칙
-- 1) 주민번호/외국인번호/전체연락처/주소/국적/계좌정보는
--    labor_worker_master 본문 컬럼에 평문 저장하지 않는다.
-- 2) 암호문은 labor_worker_private.encrypted_payload(bytea)에 저장한다.
-- 3) 암호화용 데이터 키는 Supabase Vault에 저장한다.
-- 4) 일반 목록 RPC는 원문을 복호화하지 않고 안전한 힌트/등록여부만 반환한다.
-- 5) 보호정보 수정 RPC도 원문을 응답으로 반환하지 않는다.
-- =========================================================

do $$
begin
  if to_regclass('public.labor_worker_master') is null then
    raise exception
      'v52.33 labor_worker_master가 없습니다. v52.33 SQL을 먼저 실행해주세요.';
  end if;

  if to_regprocedure(
    'public.labor_worker_master_upsert_v52_33(uuid,text,date,text,text,text,boolean)'
  ) is null then
    raise exception
      'v52.33 근로자 마스터 RPC가 없습니다. v52.33 SQL을 먼저 실행해주세요.';
  end if;
end;
$$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Vault에 v52.34 데이터 암호화 키를 1회만 생성한다.
do $$
declare
  v_secret_exists boolean;
begin
  select exists (
    select 1
    from vault.secrets
    where name = 'labor_pii_data_key_v52_34'
  )
  into v_secret_exists;

  if not v_secret_exists then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'labor_pii_data_key_v52_34',
      '욱림건설 노임 근로자 보호정보 암호화 데이터키 v52.34'
    );
  end if;
end;
$$;

-- 데이터 API 역할이 Vault 원문 복호화 view를 직접 읽지 못하도록 명시적으로 차단.
revoke all on vault.secrets from public, anon, authenticated;
revoke all on vault.decrypted_secrets from public, anon, authenticated;

-- 안전한 검색/목록용 파생값.
alter table public.labor_worker_master
  add column if not exists account_last4 text,
  add column if not exists bank_name_hint text,
  add column if not exists has_private_data boolean not null default false,
  add column if not exists has_resident_no boolean not null default false,
  add column if not exists has_foreign_no boolean not null default false,
  add column if not exists has_private_phone boolean not null default false,
  add column if not exists has_address boolean not null default false,
  add column if not exists has_account boolean not null default false,
  add column if not exists has_nationality boolean not null default false;

alter table public.labor_worker_master
  drop constraint if exists labor_worker_master_account_last4_v52_34;

alter table public.labor_worker_master
  add constraint labor_worker_master_account_last4_v52_34
  check (
    account_last4 is null
    or account_last4 = ''
    or account_last4 ~ '^[0-9]{4}$'
  );

-- 실제 보호정보는 암호문 1개로 보관한다.
create table if not exists public.labor_worker_private (
  worker_master_id uuid primary key
    references public.labor_worker_master(id)
    on delete cascade,
  encrypted_payload bytea not null,
  crypto_version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.labor_worker_private_audit (
  id bigserial primary key,
  worker_master_id uuid
    references public.labor_worker_master(id)
    on delete set null,
  changed_fields text[] not null default '{}',
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_labor_worker_private_audit_worker_v52_34
  on public.labor_worker_private_audit(
    worker_master_id,
    created_at desc
  );

alter table public.labor_worker_private enable row level security;
alter table public.labor_worker_private_audit enable row level security;

revoke all on public.labor_worker_private
  from public, anon, authenticated;

revoke all on public.labor_worker_private_audit
  from public, anon, authenticated;

-- 내부 전용: Vault에서 데이터 키를 읽는다.
create or replace function public.labor_worker_private_key_v52_34()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, vault, public
as $$
declare
  v_key text;
begin
  select decrypted_secret
  into v_key
  from vault.decrypted_secrets
  where name = 'labor_pii_data_key_v52_34'
  limit 1;

  if nullif(v_key, '') is null then
    raise exception
      '근로자 보호정보 암호화 키를 불러오지 못했습니다.';
  end if;

  return v_key;
end;
$$;

revoke all on function public.labor_worker_private_key_v52_34()
  from public, anon, authenticated;

-- 관리화면용 목록. 보호정보 원문 복호화 없음.
create or replace function public.labor_worker_master_list_v52_34(
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
  updated_at timestamptz,
  has_private_data boolean,
  has_resident_no boolean,
  has_foreign_no boolean,
  has_private_phone boolean,
  has_address boolean,
  has_account boolean,
  has_nationality boolean,
  bank_name_hint text,
  account_last4 text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit, 300), 500)
  );
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
    w.updated_at,
    coalesce(w.has_private_data, false),
    coalesce(w.has_resident_no, false),
    coalesce(w.has_foreign_no, false),
    coalesce(w.has_private_phone, false),
    coalesce(w.has_address, false),
    coalesce(w.has_account, false),
    coalesce(w.has_nationality, false),
    nullif(w.bank_name_hint, ''),
    nullif(w.account_last4, '')
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

-- 기본정보 + 보호정보를 한 트랜잭션에서 저장.
-- 빈 보호정보 파라미터는 "기존 암호화 값 유지" 의미이다.
create or replace function public.labor_worker_master_secure_upsert_v52_34(
  p_worker_id uuid,
  p_name_ko text,
  p_birth_date date,
  p_phone_last4 text,
  p_recent_trade text,
  p_note text,
  p_is_active boolean,
  p_resident_registration_number text,
  p_foreign_registration_number text,
  p_phone_number text,
  p_address text,
  p_nationality text,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, vault, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_basic_result jsonb;
  v_worker_id uuid;
  v_created boolean := false;

  v_key text;
  v_existing_cipher bytea;
  v_payload jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}';

  v_resident_no text :=
    regexp_replace(
      coalesce(p_resident_registration_number, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_foreign_no text :=
    regexp_replace(
      coalesce(p_foreign_registration_number, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_phone_number text :=
    regexp_replace(
      coalesce(p_phone_number, ''),
      '[^0-9]',
      '',
      'g'
    );
  v_account_number text :=
    regexp_replace(
      coalesce(p_account_number, ''),
      '[^0-9]',
      '',
      'g'
    );

  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_nationality text := nullif(trim(coalesce(p_nationality, '')), '');
  v_bank_name text := nullif(trim(coalesce(p_bank_name, '')), '');
  v_account_holder text := nullif(trim(coalesce(p_account_holder, '')), '');

  v_private_requested boolean := false;
  v_private_exists boolean := false;
  v_private_updated boolean := false;
  v_final_phone_last4 text;
  v_final_account_last4 text;
  v_final_bank_name text;
begin
  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 정보관리 권한이 없습니다.';
  end if;

  if v_resident_no <> '' and v_resident_no !~ '^[0-9]{13}$' then
    raise exception '주민등록번호는 13자리여야 합니다.';
  end if;

  if v_foreign_no <> '' and v_foreign_no !~ '^[0-9]{13}$' then
    raise exception '외국인등록번호는 13자리여야 합니다.';
  end if;

  if v_resident_no <> '' and v_foreign_no <> '' then
    raise exception '주민등록번호와 외국인등록번호를 동시에 입력할 수 없습니다.';
  end if;

  if v_phone_number <> '' and v_phone_number !~ '^[0-9]{10,11}$' then
    raise exception '전체 휴대폰번호 형식을 확인해주세요.';
  end if;

  if v_account_number <> '' and char_length(v_account_number) < 5 then
    raise exception '계좌번호 형식을 확인해주세요.';
  end if;

  -- v52.33 기본정보 저장을 같은 트랜잭션 안에서 재사용한다.
  v_basic_result :=
    public.labor_worker_master_upsert_v52_33(
      p_worker_id,
      p_name_ko,
      p_birth_date,
      p_phone_last4,
      p_recent_trade,
      p_note,
      p_is_active
    );

  v_worker_id :=
    (v_basic_result ->> 'worker_master_id')::uuid;
  v_created :=
    coalesce(
      (v_basic_result ->> 'created')::boolean,
      false
    );

  select encrypted_payload
  into v_existing_cipher
  from public.labor_worker_private
  where worker_master_id = v_worker_id
  for update;

  if found then
    v_private_exists := true;
    v_key := public.labor_worker_private_key_v52_34();

    begin
      v_payload :=
        extensions.pgp_sym_decrypt(
          v_existing_cipher,
          v_key
        )::jsonb;
    exception
      when others then
        raise exception
          '기존 근로자 보호정보 복호화에 실패했습니다. 저장을 중단했습니다.';
    end;
  end if;

  v_private_requested :=
    v_resident_no <> ''
    or v_foreign_no <> ''
    or v_phone_number <> ''
    or v_address is not null
    or v_nationality is not null
    or v_bank_name is not null
    or v_account_number <> ''
    or v_account_holder is not null;

  if v_resident_no <> '' then
    v_payload :=
      jsonb_set(
        v_payload,
        '{resident_registration_number}',
        to_jsonb(v_resident_no),
        true
      );
    v_payload := v_payload - 'foreign_registration_number';
    v_changed_fields :=
      array_append(v_changed_fields, 'resident_registration_number');
  end if;

  if v_foreign_no <> '' then
    v_payload :=
      jsonb_set(
        v_payload,
        '{foreign_registration_number}',
        to_jsonb(v_foreign_no),
        true
      );
    v_payload := v_payload - 'resident_registration_number';
    v_changed_fields :=
      array_append(v_changed_fields, 'foreign_registration_number');
  end if;

  if v_phone_number <> '' then
    v_payload :=
      jsonb_set(
        v_payload,
        '{phone_number}',
        to_jsonb(v_phone_number),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'phone_number');
  end if;

  if v_address is not null then
    v_payload :=
      jsonb_set(
        v_payload,
        '{address}',
        to_jsonb(v_address),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'address');
  end if;

  if v_nationality is not null then
    v_payload :=
      jsonb_set(
        v_payload,
        '{nationality}',
        to_jsonb(v_nationality),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'nationality');
  end if;

  if v_bank_name is not null then
    v_payload :=
      jsonb_set(
        v_payload,
        '{bank_name}',
        to_jsonb(v_bank_name),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'bank_name');
  end if;

  if v_account_number <> '' then
    v_payload :=
      jsonb_set(
        v_payload,
        '{account_number}',
        to_jsonb(v_account_number),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'account_number');
  end if;

  if v_account_holder is not null then
    v_payload :=
      jsonb_set(
        v_payload,
        '{account_holder}',
        to_jsonb(v_account_holder),
        true
      );
    v_changed_fields :=
      array_append(v_changed_fields, 'account_holder');
  end if;

  if v_private_requested then
    v_key := coalesce(
      v_key,
      public.labor_worker_private_key_v52_34()
    );

    insert into public.labor_worker_private (
      worker_master_id,
      encrypted_payload,
      crypto_version,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_worker_id,
      extensions.pgp_sym_encrypt(
        v_payload::text,
        v_key,
        'cipher-algo=aes256,compress-algo=1'
      ),
      1,
      v_user_id,
      clock_timestamp(),
      clock_timestamp()
    )
    on conflict (worker_master_id) do update
    set
      encrypted_payload = excluded.encrypted_payload,
      crypto_version = excluded.crypto_version,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

    v_private_exists := true;
    v_private_updated := true;

    insert into public.labor_worker_private_audit (
      worker_master_id,
      changed_fields,
      actor_user_id
    )
    values (
      v_worker_id,
      v_changed_fields,
      v_user_id
    );
  end if;

  -- 기존 암호문이 있었거나 이번에 입력한 경우,
  -- 검색용 파생값은 보호정보와 일치하도록 다시 계산한다.
  if v_private_exists then
    if not v_private_requested then
      v_key := coalesce(
        v_key,
        public.labor_worker_private_key_v52_34()
      );

      v_payload :=
        extensions.pgp_sym_decrypt(
          v_existing_cipher,
          v_key
        )::jsonb;
    end if;

    v_final_phone_last4 :=
      case
        when nullif(v_payload ->> 'phone_number', '') is null
          then nullif(
            regexp_replace(coalesce(p_phone_last4, ''), '[^0-9]', '', 'g'),
            ''
          )
        else right(
          regexp_replace(
            v_payload ->> 'phone_number',
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      end;

    v_final_account_last4 :=
      case
        when nullif(v_payload ->> 'account_number', '') is null
          then null
        else right(
          regexp_replace(
            v_payload ->> 'account_number',
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      end;

    v_final_bank_name :=
      nullif(
        trim(coalesce(v_payload ->> 'bank_name', '')),
        ''
      );

    update public.labor_worker_master
    set
      phone_last4 = v_final_phone_last4,
      account_last4 = v_final_account_last4,
      bank_name_hint = v_final_bank_name,
      has_private_data =
        jsonb_object_length(v_payload) > 0,
      has_resident_no =
        nullif(v_payload ->> 'resident_registration_number', '') is not null,
      has_foreign_no =
        nullif(v_payload ->> 'foreign_registration_number', '') is not null,
      has_private_phone =
        nullif(v_payload ->> 'phone_number', '') is not null,
      has_address =
        nullif(v_payload ->> 'address', '') is not null,
      has_account =
        nullif(v_payload ->> 'account_number', '') is not null,
      has_nationality =
        nullif(v_payload ->> 'nationality', '') is not null,
      updated_by = v_user_id,
      updated_at = clock_timestamp()
    where id = v_worker_id;
  end if;

  return jsonb_build_object(
    'worker_master_id', v_worker_id,
    'created', v_created,
    'private_updated', v_private_updated,
    'has_private_data', v_private_exists
  );
end;
$$;

revoke all on function public.labor_worker_master_list_v52_34(text, integer)
  from public, anon, authenticated;

revoke all on function public.labor_worker_master_secure_upsert_v52_34(
  uuid,
  text,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
  from public, anon, authenticated;

grant execute on function public.labor_worker_master_list_v52_34(text, integer)
  to authenticated;

grant execute on function public.labor_worker_master_secure_upsert_v52_34(
  uuid,
  text,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
  to authenticated;

comment on table public.labor_worker_private is
  'v52.34 근로자 보호정보 암호문 저장. 원문 컬럼 금지.';

comment on function public.labor_worker_master_secure_upsert_v52_34(
  uuid,
  text,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'v52.34 근로자 기본정보와 보호정보를 원자적으로 저장. 보호정보 원문을 응답하지 않음.';

commit;

-- =========================================================
-- 실행 후 확인용
-- 실제 보호정보 원문은 조회하지 않는다.
-- =========================================================
--
-- 1) Vault 키 존재 확인(암호화된 secrets 테이블 기준)
-- select id, name, description
-- from vault.secrets
-- where name = 'labor_pii_data_key_v52_34';
--
-- 2) 보호정보 테이블 직접 API 접근은 revoke/RLS 상태
-- select relrowsecurity
-- from pg_class
-- where oid = 'public.labor_worker_private'::regclass;
--
-- 3) 최고관리자 화면 목록 RPC
-- select *
-- from public.labor_worker_master_list_v52_34('', 20);
