begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- =========================================================
-- v52.47
-- 회사 노무비명세서 A:H -> 근로자 마스터 이관
--
-- A:H 매핑
-- A: 순서(이관 식별용, DB 핵심값 아님)
-- B: 직종 -> recent_trade
-- C 첫행: 성명 / 둘째행: 영문 성명
-- D 첫행: 내/외국인 / 둘째행: 체류자격
-- E 첫행: 주민등록번호 / 둘째행: 연락처
-- F 첫행: 은행명
-- G 첫행: 예금주 / 둘째행: 영문 예금주
-- H 첫행: 계좌번호
--
-- I:AV는 시스템 이관 범위가 아니다.
-- =========================================================

do $$
begin
  if to_regclass('public.labor_worker_master') is null
     or to_regclass('public.labor_worker_private') is null then
    raise exception '근로자 보호정보 구조가 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_worker_master_secure_upsert_v52_41(uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text)'
  ) is null then
    raise exception 'v52.41 근로자 보안저장 RPC가 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_normalize_nationality_v52_41(text)'
  ) is null then
    raise exception 'v52.41 국적 표준화 함수가 없습니다.';
  end if;
end;
$$;

alter table public.labor_worker_master
  add column if not exists is_foreign boolean not null default false,
  add column if not exists has_english_name boolean not null default false,
  add column if not exists has_stay_status boolean not null default false,
  add column if not exists has_english_account_holder boolean not null default false,
  add column if not exists identity_fingerprint text;

create index if not exists idx_labor_worker_master_identity_fingerprint
  on public.labor_worker_master(identity_fingerprint)
  where identity_fingerprint is not null;

-- 주민번호 원문을 저장하지 않고 기존 근로자 매칭용 keyed fingerprint만 생성.
create or replace function public.labor_identity_fingerprint_v52_47(
  p_identity text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, extensions, vault, public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_identity, ''), '[^0-9]', '', 'g');
  v_key text;
begin
  if v_digits !~ '^[0-9]{13}$' then
    return null;
  end if;

  v_key := public.labor_worker_private_key_v52_34();

  return encode(
    extensions.digest(
      convert_to(v_key || ':' || v_digits, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
end;
$$;

revoke all on function public.labor_identity_fingerprint_v52_47(text)
  from public, anon, authenticated;

create or replace function public.labor_birth_date_from_identity_v52_47(
  p_identity text
)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_digits text := regexp_replace(coalesce(p_identity, ''), '[^0-9]', '', 'g');
  v_code text;
  v_century integer;
  v_year integer;
  v_month integer;
  v_day integer;
begin
  if v_digits !~ '^[0-9]{13}$' then
    return null;
  end if;

  v_code := substr(v_digits, 7, 1);
  v_century := case
    when v_code in ('1', '2', '5', '6') then 1900
    when v_code in ('3', '4', '7', '8') then 2000
    when v_code in ('9', '0') then 1800
    else null
  end;

  if v_century is null then
    return null;
  end if;

  v_year := v_century + substr(v_digits, 1, 2)::integer;
  v_month := substr(v_digits, 3, 2)::integer;
  v_day := substr(v_digits, 5, 2)::integer;

  begin
    return make_date(v_year, v_month, v_day);
  exception
    when others then
      return null;
  end;
end;
$$;

revoke all on function public.labor_birth_date_from_identity_v52_47(text)
  from public, anon, authenticated;

-- 기존 암호화 데이터에서 신규 파생상태를 1회 backfill.
do $$
declare
  v_key text;
  v_row record;
  v_payload jsonb;
  v_resident text;
  v_nationality text;
begin
  v_key := public.labor_worker_private_key_v52_34();

  for v_row in
    select p.worker_master_id, p.encrypted_payload
    from public.labor_worker_private p
  loop
    begin
      v_payload := extensions.pgp_sym_decrypt(
        v_row.encrypted_payload,
        v_key
      )::jsonb;
    exception
      when others then
        raise exception
          'v52.47 기존 보호정보 backfill 중 복호화 실패. worker=%',
          v_row.worker_master_id;
    end;

    v_resident := nullif(
      regexp_replace(
        coalesce(v_payload ->> 'resident_registration_number', ''),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    );

    v_nationality := public.labor_normalize_nationality_v52_41(
      v_payload ->> 'nationality'
    );

    update public.labor_worker_master
    set
      identity_fingerprint = public.labor_identity_fingerprint_v52_47(v_resident),
      is_foreign = coalesce(v_nationality <> '대한민국', false),
      has_english_name = nullif(trim(coalesce(v_payload ->> 'english_name', '')), '') is not null,
      has_stay_status = nullif(trim(coalesce(v_payload ->> 'stay_status', '')), '') is not null,
      has_english_account_holder = nullif(trim(coalesce(v_payload ->> 'english_account_holder', '')), '') is not null
    where id = v_row.worker_master_id;
  end loop;
end;
$$;

create or replace function public.labor_worker_master_list_v52_47(
  p_query text default '',
  p_limit integer default 1000
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
  has_private_phone boolean,
  has_address boolean,
  has_account boolean,
  has_account_holder boolean,
  has_nationality boolean,
  bank_name_hint text,
  account_last4 text,
  is_foreign boolean,
  has_english_name boolean,
  has_stay_status boolean,
  has_english_account_holder boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 2000));
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
    coalesce(w.has_private_phone, false),
    coalesce(w.has_address, false),
    coalesce(w.has_account, false),
    coalesce(w.has_account_holder, false),
    coalesce(w.has_nationality, false),
    nullif(w.bank_name_hint, ''),
    nullif(w.account_last4, ''),
    coalesce(w.is_foreign, false),
    coalesce(w.has_english_name, false),
    coalesce(w.has_stay_status, false),
    coalesce(w.has_english_account_holder, false)
  from public.labor_worker_master w
  where
    v_query = ''
    or w.name_ko ilike '%' || v_query || '%'
  order by w.name_ko, w.birth_date nulls last
  limit v_limit;
end;
$$;

revoke all on function public.labor_worker_master_list_v52_47(text, integer)
  from public, anon, authenticated;
grant execute on function public.labor_worker_master_list_v52_47(text, integer)
  to authenticated;

create or replace function public.labor_worker_master_secure_upsert_v52_47(
  p_worker_id uuid,
  p_name_ko text,
  p_birth_date date,
  p_phone_last4 text,
  p_recent_trade text,
  p_note text,
  p_is_active boolean,
  p_resident_registration_number text,
  p_phone_number text,
  p_address text,
  p_nationality text,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_english_name text,
  p_stay_status text,
  p_english_account_holder text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, vault, public
as $$
declare
  v_result jsonb;
  v_worker_id uuid;
  v_key text;
  v_payload jsonb;
  v_cipher bytea;
  v_changed_fields text[] := '{}';
  v_extended_changed boolean := false;
  v_english_name text := nullif(trim(coalesce(p_english_name, '')), '');
  v_stay_status text := nullif(trim(coalesce(p_stay_status, '')), '');
  v_english_account_holder text := nullif(trim(coalesce(p_english_account_holder, '')), '');
  v_nationality text;
  v_resident text;
  v_is_foreign boolean := false;
  v_target_worker_id uuid := p_worker_id;
  v_input_resident text := regexp_replace(coalesce(p_resident_registration_number, ''), '[^0-9]', '', 'g');
  v_input_fingerprint text;
  v_existing_name text;
  v_existing_count integer := 0;
begin
  v_input_fingerprint := public.labor_identity_fingerprint_v52_47(v_input_resident);

  if v_target_worker_id is null and v_input_fingerprint is not null then
    select count(*)::integer
    into v_existing_count
    from public.labor_worker_master w
    where w.identity_fingerprint = v_input_fingerprint;

    if v_existing_count > 1 then
      raise exception '동일 주민번호/등록번호로 등록된 기존 근로자가 2명 이상입니다. 중복 데이터를 먼저 정리해주세요.';
    end if;

    if v_existing_count = 1 then
      select w.id, w.name_ko
      into v_target_worker_id, v_existing_name
      from public.labor_worker_master w
      where w.identity_fingerprint = v_input_fingerprint
      limit 1;

      if trim(coalesce(v_existing_name, '')) <> trim(coalesce(p_name_ko, '')) then
        raise exception '동일 주민번호/등록번호가 기존 % 근로자에게 등록되어 있습니다.', v_existing_name;
      end if;
    end if;
  end if;

  v_result := public.labor_worker_master_secure_upsert_v52_41(
    v_target_worker_id,
    p_name_ko,
    p_birth_date,
    p_phone_last4,
    p_recent_trade,
    p_note,
    p_is_active,
    p_resident_registration_number,
    p_phone_number,
    p_address,
    p_nationality,
    p_bank_name,
    p_account_number,
    p_account_holder
  );

  v_worker_id := (v_result ->> 'worker_master_id')::uuid;
  v_key := public.labor_worker_private_key_v52_34();

  select p.encrypted_payload
  into v_cipher
  from public.labor_worker_private p
  where p.worker_master_id = v_worker_id
  for update;

  if not found then
    raise exception '근로자 보호정보를 찾을 수 없습니다.';
  end if;

  v_payload := extensions.pgp_sym_decrypt(v_cipher, v_key)::jsonb;

  if v_english_name is not null then
    v_payload := jsonb_set(v_payload, '{english_name}', to_jsonb(v_english_name), true);
    v_changed_fields := array_append(v_changed_fields, 'english_name');
    v_extended_changed := true;
  end if;

  if v_stay_status is not null then
    v_payload := jsonb_set(v_payload, '{stay_status}', to_jsonb(v_stay_status), true);
    v_changed_fields := array_append(v_changed_fields, 'stay_status');
    v_extended_changed := true;
  end if;

  if v_english_account_holder is not null then
    v_payload := jsonb_set(v_payload, '{english_account_holder}', to_jsonb(v_english_account_holder), true);
    v_changed_fields := array_append(v_changed_fields, 'english_account_holder');
    v_extended_changed := true;
  end if;

  v_nationality := public.labor_normalize_nationality_v52_41(
    v_payload ->> 'nationality'
  );
  v_is_foreign := coalesce(v_nationality <> '대한민국', false);

  if v_is_foreign then
    if nullif(trim(coalesce(v_payload ->> 'english_name', '')), '') is null then
      raise exception '외국인 근로자는 영문 성명이 필요합니다.';
    end if;

    if nullif(trim(coalesce(v_payload ->> 'stay_status', '')), '') is null then
      raise exception '외국인 근로자는 체류자격이 필요합니다.';
    end if;
  end if;

  if v_extended_changed then
    update public.labor_worker_private
    set
      encrypted_payload = extensions.pgp_sym_encrypt(
        v_payload::text,
        v_key,
        'cipher-algo=aes256,compress-algo=1'
      ),
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    where worker_master_id = v_worker_id;

    insert into public.labor_worker_private_audit (
      worker_master_id,
      changed_fields,
      actor_user_id
    )
    values (
      v_worker_id,
      v_changed_fields,
      auth.uid()
    );
  end if;

  v_resident := regexp_replace(
    coalesce(v_payload ->> 'resident_registration_number', ''),
    '[^0-9]',
    '',
    'g'
  );

  update public.labor_worker_master
  set
    identity_fingerprint = public.labor_identity_fingerprint_v52_47(v_resident),
    is_foreign = v_is_foreign,
    has_english_name = nullif(trim(coalesce(v_payload ->> 'english_name', '')), '') is not null,
    has_stay_status = nullif(trim(coalesce(v_payload ->> 'stay_status', '')), '') is not null,
    has_english_account_holder = nullif(trim(coalesce(v_payload ->> 'english_account_holder', '')), '') is not null,
    updated_at = clock_timestamp()
  where id = v_worker_id;

  return v_result || jsonb_build_object(
    'extended_private_updated', v_extended_changed,
    'is_foreign', v_is_foreign
  );
end;
$$;

revoke all on function public.labor_worker_master_secure_upsert_v52_47(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.labor_worker_master_secure_upsert_v52_47(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text,text,text,text
) to authenticated;

create or replace function public.labor_worker_excel_preview_v52_47(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_source_row integer;
  v_name text;
  v_resident text;
  v_phone text;
  v_bank text;
  v_account text;
  v_account_holder text;
  v_domestic_foreign text;
  v_nationality text;
  v_english_name text;
  v_stay_status text;
  v_fingerprint text;
  v_birth_date date;
  v_existing_id uuid;
  v_existing_name text;
  v_existing_private_phone boolean;
  v_existing_bank boolean;
  v_existing_account boolean;
  v_existing_account_holder boolean;
  v_existing_nationality boolean;
  v_existing_english_name boolean;
  v_existing_stay_status boolean;
  v_existing_is_foreign boolean;
  v_missing text[];
  v_status text;
  v_duplicate_count integer;
  v_existing_count integer;
begin
  if not public.labor_permission_allowed_v52_33(
    auth.uid(),
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 Excel 업로드 권한이 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception '업로드 데이터 형식이 올바르지 않습니다.';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_source_row := coalesce((v_item ->> 'source_row')::integer, 0);
    v_name := trim(coalesce(v_item ->> 'name_ko', ''));
    v_resident := regexp_replace(coalesce(v_item ->> 'resident_no', ''), '[^0-9]', '', 'g');
    v_phone := regexp_replace(coalesce(v_item ->> 'phone_number', ''), '[^0-9]', '', 'g');
    v_bank := trim(coalesce(v_item ->> 'bank_name', ''));
    v_account := regexp_replace(coalesce(v_item ->> 'account_number', ''), '[^0-9]', '', 'g');
    v_account_holder := trim(coalesce(v_item ->> 'account_holder', ''));
    v_domestic_foreign := trim(coalesce(v_item ->> 'domestic_foreign', ''));
    v_nationality := public.labor_normalize_nationality_v52_41(v_item ->> 'nationality');
    v_english_name := trim(coalesce(v_item ->> 'english_name', ''));
    v_stay_status := trim(coalesce(v_item ->> 'stay_status', ''));
    v_birth_date := public.labor_birth_date_from_identity_v52_47(v_resident);
    v_fingerprint := public.labor_identity_fingerprint_v52_47(v_resident);
    v_missing := '{}';

    v_existing_id := null;
    v_existing_name := null;
    v_existing_private_phone := false;
    v_existing_bank := false;
    v_existing_account := false;
    v_existing_account_holder := false;
    v_existing_nationality := false;
    v_existing_english_name := false;
    v_existing_stay_status := false;
    v_existing_is_foreign := false;

    v_existing_count := 0;

    if v_fingerprint is not null then
      select count(*)::integer
      into v_existing_count
      from public.labor_worker_master w
      where w.identity_fingerprint = v_fingerprint;

      if v_existing_count = 1 then
        select
          w.id,
          w.name_ko,
          coalesce(w.has_private_phone, false),
          nullif(trim(coalesce(w.bank_name_hint, '')), '') is not null,
          coalesce(w.has_account, false),
          coalesce(w.has_account_holder, false),
          coalesce(w.has_nationality, false),
          coalesce(w.has_english_name, false),
          coalesce(w.has_stay_status, false),
          coalesce(w.is_foreign, false)
        into
          v_existing_id,
          v_existing_name,
          v_existing_private_phone,
          v_existing_bank,
          v_existing_account,
          v_existing_account_holder,
          v_existing_nationality,
          v_existing_english_name,
          v_existing_stay_status,
          v_existing_is_foreign
        from public.labor_worker_master w
        where w.identity_fingerprint = v_fingerprint
        limit 1;
      end if;
    end if;

    if char_length(v_name) < 2 then
      v_missing := array_append(v_missing, 'name');
    end if;

    if v_resident !~ '^[0-9]{13}$' or v_birth_date is null then
      v_missing := array_append(v_missing, 'resident_no');
    end if;

    if v_phone !~ '^[0-9]{10,11}$' and not v_existing_private_phone then
      v_missing := array_append(v_missing, 'phone');
    end if;

    if v_bank = '' and not v_existing_bank then
      v_missing := array_append(v_missing, 'bank');
    end if;

    if char_length(v_account) < 5 and not v_existing_account then
      v_missing := array_append(v_missing, 'account');
    end if;

    if v_account_holder = '' and not v_existing_account_holder then
      v_missing := array_append(v_missing, 'account_holder');
    end if;

    if v_domestic_foreign not in ('내국인', '외국인') then
      v_missing := array_append(v_missing, 'domestic_foreign');
    end if;

    if v_domestic_foreign = '내국인' then
      v_nationality := '대한민국';
    end if;

    if v_domestic_foreign = '외국인' then
      if v_nationality is null and not v_existing_nationality then
        v_missing := array_append(v_missing, 'nationality');
      end if;

      if v_english_name = '' and not v_existing_english_name then
        v_missing := array_append(v_missing, 'english_name');
      end if;

      if v_stay_status = '' and not v_existing_stay_status then
        v_missing := array_append(v_missing, 'stay_status');
      end if;
    end if;

    v_duplicate_count := 0;
    if v_resident ~ '^[0-9]{13}$' then
      select count(*)::integer
      into v_duplicate_count
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x(value)
      where regexp_replace(coalesce(x.value ->> 'resident_no', ''), '[^0-9]', '', 'g') = v_resident;

      if v_duplicate_count > 1 then
        v_missing := array_append(v_missing, 'duplicate_in_file');
      end if;
    end if;

    if v_existing_count > 1 then
      v_status := 'conflict';
      v_missing := array_append(v_missing, 'duplicate_existing');
    elsif v_existing_id is not null
       and trim(coalesce(v_existing_name, '')) <> v_name then
      v_status := 'conflict';
    elsif cardinality(v_missing) > 0 then
      v_status := 'missing';
    elsif v_existing_id is not null then
      v_status := 'existing';
    else
      v_status := 'new';
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'source_row', v_source_row,
        'status', v_status,
        'worker_master_id', v_existing_id,
        'existing_name', v_existing_name,
        'birth_date', v_birth_date,
        'missing_fields', to_jsonb(v_missing)
      )
    );
  end loop;

  return jsonb_build_object('rows', v_results);
end;
$$;

revoke all on function public.labor_worker_excel_preview_v52_47(jsonb)
  from public, anon, authenticated;
grant execute on function public.labor_worker_excel_preview_v52_47(jsonb)
  to authenticated;

create or replace function public.labor_worker_excel_import_v52_47(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_name text;
  v_resident text;
  v_phone text;
  v_bank text;
  v_account text;
  v_account_holder text;
  v_domestic_foreign text;
  v_nationality text;
  v_english_name text;
  v_stay_status text;
  v_english_account_holder text;
  v_trade text;
  v_fingerprint text;
  v_birth_date date;
  v_existing_id uuid;
  v_existing_name text;
  v_existing_count integer := 0;
  v_result jsonb;
  v_seen text[] := '{}';
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if not public.labor_permission_allowed_v52_33(
    auth.uid(),
    'labor.worker_master.manage',
    null
  ) then
    raise exception '근로자 Excel 업로드 권한이 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception '업로드 데이터 형식이 올바르지 않습니다.';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if coalesce((v_item ->> 'include')::boolean, true) = false then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_name := trim(coalesce(v_item ->> 'name_ko', ''));
    v_resident := regexp_replace(coalesce(v_item ->> 'resident_no', ''), '[^0-9]', '', 'g');
    v_phone := regexp_replace(coalesce(v_item ->> 'phone_number', ''), '[^0-9]', '', 'g');
    v_bank := trim(coalesce(v_item ->> 'bank_name', ''));
    v_account := regexp_replace(coalesce(v_item ->> 'account_number', ''), '[^0-9]', '', 'g');
    v_account_holder := trim(coalesce(v_item ->> 'account_holder', ''));
    v_domestic_foreign := trim(coalesce(v_item ->> 'domestic_foreign', ''));
    v_nationality := public.labor_normalize_nationality_v52_41(v_item ->> 'nationality');
    v_english_name := trim(coalesce(v_item ->> 'english_name', ''));
    v_stay_status := trim(coalesce(v_item ->> 'stay_status', ''));
    v_english_account_holder := trim(coalesce(v_item ->> 'english_account_holder', ''));
    v_trade := trim(coalesce(v_item ->> 'recent_trade', ''));
    v_birth_date := public.labor_birth_date_from_identity_v52_47(v_resident);
    v_fingerprint := public.labor_identity_fingerprint_v52_47(v_resident);

    if char_length(v_name) < 2 then
      raise exception 'Excel 등록 중 성명이 누락된 행이 있습니다.';
    end if;

    if v_fingerprint is null or v_birth_date is null then
      raise exception '% 근로자의 주민등록번호/등록번호 형식을 확인해주세요.', v_name;
    end if;

    if v_fingerprint = any(v_seen) then
      raise exception '% 근로자의 주민등록번호/등록번호가 업로드 파일 안에서 중복되었습니다.', v_name;
    end if;
    v_seen := array_append(v_seen, v_fingerprint);

    select count(*)::integer
    into v_existing_count
    from public.labor_worker_master w
    where w.identity_fingerprint = v_fingerprint;

    if v_existing_count > 1 then
      raise exception '% 근로자의 주민번호/등록번호가 기존 마스터에 중복되어 있습니다. 중복 데이터를 먼저 정리해주세요.', v_name;
    end if;

    v_existing_id := null;
    v_existing_name := null;

    if v_existing_count = 1 then
      select w.id, w.name_ko
      into v_existing_id, v_existing_name
      from public.labor_worker_master w
      where w.identity_fingerprint = v_fingerprint
      limit 1;
    end if;

    if v_existing_id is not null
       and trim(coalesce(v_existing_name, '')) <> v_name then
      raise exception
        '동일 주민번호/등록번호가 기존 % 근로자에게 등록되어 있어 % 행을 업데이트할 수 없습니다.',
        v_existing_name,
        v_name;
    end if;

    if v_domestic_foreign = '내국인' then
      v_nationality := '대한민국';
    elsif v_domestic_foreign = '외국인' then
      if v_nationality is null and v_existing_id is null then
        raise exception '% 외국인 근로자의 국적을 선택해주세요.', v_name;
      end if;
    else
      raise exception '% 근로자의 내/외국인 구분을 확인해주세요.', v_name;
    end if;

    v_result := public.labor_worker_master_secure_upsert_v52_47(
      v_existing_id,
      v_name,
      v_birth_date,
      case when v_phone ~ '^[0-9]{10,11}$' then right(v_phone, 4) else null end,
      nullif(v_trade, ''),
      null,
      true,
      v_resident,
      case when v_phone ~ '^[0-9]{10,11}$' then v_phone else null end,
      null,
      v_nationality,
      nullif(v_bank, ''),
      case when char_length(v_account) >= 5 then v_account else null end,
      nullif(v_account_holder, ''),
      nullif(v_english_name, ''),
      nullif(v_stay_status, ''),
      nullif(v_english_account_holder, '')
    );

    if coalesce((v_result ->> 'created')::boolean, false) then
      v_created := v_created + 1;
    else
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.labor_worker_excel_import_v52_47(jsonb)
  from public, anon, authenticated;
grant execute on function public.labor_worker_excel_import_v52_47(jsonb)
  to authenticated;

comment on function public.labor_worker_excel_preview_v52_47(jsonb) is
  'v52.47 회사 노무비명세서 A:H 업로드 사전검증. 기존 보호정보 원문은 반환하지 않음.';
comment on function public.labor_worker_excel_import_v52_47(jsonb) is
  'v52.47 검증된 A:H 근로자 데이터를 기존 암호화 근로자 마스터에 신규/업데이트.';
comment on function public.labor_worker_master_secure_upsert_v52_47(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text,text,text,text
) is
  'v52.47 영문성명/체류자격/영문예금주를 암호화 보호정보에 포함한 근로자 저장.';

commit;
