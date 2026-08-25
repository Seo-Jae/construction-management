begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- =========================================================
-- v52.41
-- 근로자 정보관리 UI/입력규칙 정리
--
-- 필수 보호정보:
-- 주민등록번호 / 전체 휴대폰번호 / 국적 /
-- 은행 / 계좌번호 / 예금주
--
-- 외국인등록번호는 신규 UI에서 제거하지만
-- 기존 암호화 데이터/컬럼은 호환성을 위해 즉시 삭제하지 않는다.
-- =========================================================

do $$
begin
  if to_regclass('public.labor_worker_master') is null
     or to_regclass('public.labor_worker_private') is null then
    raise exception 'v52.34 근로자 보호정보 구조가 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_worker_master_secure_upsert_v52_34(uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text,text)'
  ) is null then
    raise exception 'v52.34 근로자 보호정보 저장 RPC가 없습니다.';
  end if;
end;
$$;

alter table public.labor_worker_master
  add column if not exists has_account_holder boolean
  not null default false;

-- 국적 표준화: 자유입력 별칭을 한글 표준명으로 변환한다.
create or replace function public.labor_normalize_nationality_v52_41(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text := lower(
    regexp_replace(
      trim(coalesce(p_value, '')),
      '[[:space:]_.-]+',
      '',
      'g'
    )
  );
begin
  if v_value = '' then
    return null;
  end if;

  return case
    when v_value in ('대한민국','한국','남한','korea','southkorea','republicofkorea','rok','kor') then '대한민국'
    when v_value in ('중국','china','peoplesrepublicofchina','prc','cn') then '중국'
    when v_value in ('베트남','vietnam','vn') then '베트남'
    when v_value in ('필리핀','philippines','philippine','ph') then '필리핀'
    when v_value in ('태국','thailand','thai','th') then '태국'
    when v_value in ('인도네시아','indonesia','id') then '인도네시아'
    when v_value in ('몽골','mongolia','mn') then '몽골'
    when v_value in ('우즈베키스탄','uzbekistan','uz') then '우즈베키스탄'
    when v_value in ('캄보디아','cambodia','kh') then '캄보디아'
    when v_value in ('네팔','nepal','np') then '네팔'
    when v_value in ('미얀마','myanmar','burma','mm') then '미얀마'
    when v_value in ('스리랑카','srilanka','lk') then '스리랑카'
    when v_value in ('방글라데시','bangladesh','bd') then '방글라데시'
    when v_value in ('파키스탄','pakistan','pk') then '파키스탄'
    when v_value in ('인도','india','in') then '인도'
    when v_value in ('러시아','russia','russianfederation','ru') then '러시아'
    when v_value in ('카자흐스탄','kazakhstan','kz') then '카자흐스탄'
    when v_value in ('키르기스스탄','kyrgyzstan','kg') then '키르기스스탄'
    when v_value in ('라오스','laos','lao','la') then '라오스'
    when v_value in ('동티모르','timorleste','easttimor','tl') then '동티모르'
    when v_value in ('기타','other','others') then '기타'
    else null
  end;
end;
$$;

revoke all on function public.labor_normalize_nationality_v52_41(text)
  from public, anon, authenticated;

-- 기존 암호문에서 예금주 보유 여부만 backfill하고,
-- 알려진 국적 별칭은 원문을 외부로 노출하지 않은 채 표준화한다.
do $$
declare
  v_key text;
  v_row record;
  v_payload jsonb;
  v_current_nationality text;
  v_normalized_nationality text;
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
          '기존 근로자 보호정보 정리 중 복호화에 실패했습니다. worker=%',
          v_row.worker_master_id;
    end;

    update public.labor_worker_master
    set has_account_holder =
      nullif(trim(coalesce(v_payload ->> 'account_holder', '')), '') is not null
    where id = v_row.worker_master_id;

    v_current_nationality :=
      nullif(trim(coalesce(v_payload ->> 'nationality', '')), '');
    v_normalized_nationality :=
      public.labor_normalize_nationality_v52_41(v_current_nationality);

    if v_normalized_nationality is not null
       and v_current_nationality is distinct from v_normalized_nationality then
      v_payload := jsonb_set(
        v_payload,
        '{nationality}',
        to_jsonb(v_normalized_nationality),
        true
      );

      update public.labor_worker_private
      set encrypted_payload = extensions.pgp_sym_encrypt(
            v_payload::text,
            v_key,
            'cipher-algo=aes256,compress-algo=1'
          ),
          updated_at = clock_timestamp()
      where worker_master_id = v_row.worker_master_id;

      insert into public.labor_worker_private_audit(
        worker_master_id,
        changed_fields,
        actor_user_id
      ) values (
        v_row.worker_master_id,
        array['nationality_normalized'],
        auth.uid()
      );
    end if;
  end loop;
end;
$$;

-- 관리화면 목록. 보호정보 원문은 반환하지 않는다.
create or replace function public.labor_worker_master_list_v52_41(
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
  has_private_phone boolean,
  has_address boolean,
  has_account boolean,
  has_account_holder boolean,
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
    w.updated_at,
    coalesce(w.has_private_data, false),
    coalesce(w.has_resident_no, false),
    coalesce(w.has_private_phone, false),
    coalesce(w.has_address, false),
    coalesce(w.has_account, false),
    coalesce(w.has_account_holder, false),
    coalesce(w.has_nationality, false),
    nullif(w.bank_name_hint, ''),
    nullif(w.account_last4, '')
  from public.labor_worker_master w
  where v_query = ''
     or w.name_ko ilike '%' || v_query || '%'
  order by w.is_active desc, w.name_ko, w.birth_date nulls last
  limit v_limit;
end;
$$;

-- 필수 보호정보를 최종 merged payload 기준으로 검증한다.
-- 빈 파라미터는 기존 암호화 값 유지 의미다.
create or replace function public.labor_worker_master_secure_upsert_v52_41(
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
  v_private_changed boolean := false;
  v_private_updated boolean := false;
  v_changed_fields text[] := '{}';

  v_resident_no text := regexp_replace(
    coalesce(p_resident_registration_number, ''), '[^0-9]', '', 'g'
  );
  v_phone_number text := regexp_replace(
    coalesce(p_phone_number, ''), '[^0-9]', '', 'g'
  );
  v_account_number text := regexp_replace(
    coalesce(p_account_number, ''), '[^0-9]', '', 'g'
  );
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_input_nationality text := nullif(trim(coalesce(p_nationality, '')), '');
  v_nationality text;
  v_bank_name text := nullif(trim(coalesce(p_bank_name, '')), '');
  v_account_holder text := nullif(trim(coalesce(p_account_holder, '')), '');

  v_existing_nationality text;
  v_normalized_existing_nationality text;
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

  if v_phone_number <> '' and v_phone_number !~ '^[0-9]{10,11}$' then
    raise exception '전체 휴대폰번호 형식을 확인해주세요.';
  end if;

  if v_account_number <> '' and char_length(v_account_number) < 5 then
    raise exception '계좌번호 형식을 확인해주세요.';
  end if;

  if v_input_nationality is not null then
    v_nationality := public.labor_normalize_nationality_v52_41(
      v_input_nationality
    );
    if v_nationality is null then
      raise exception '국적은 표준 목록에서 선택해주세요.';
    end if;
  end if;

  if p_worker_id is not null then
    select encrypted_payload
    into v_existing_cipher
    from public.labor_worker_private
    where worker_master_id = p_worker_id
    for update;

    if found then
      v_key := public.labor_worker_private_key_v52_34();
      begin
        v_payload := extensions.pgp_sym_decrypt(
          v_existing_cipher,
          v_key
        )::jsonb;
      exception
        when others then
          raise exception
            '기존 근로자 보호정보 복호화에 실패했습니다. 저장을 중단했습니다.';
      end;
    end if;
  end if;

  if v_resident_no <> '' then
    v_payload := jsonb_set(
      v_payload, '{resident_registration_number}', to_jsonb(v_resident_no), true
    );
    v_changed_fields := array_append(v_changed_fields, 'resident_registration_number');
    v_private_changed := true;
  end if;

  if v_phone_number <> '' then
    v_payload := jsonb_set(
      v_payload, '{phone_number}', to_jsonb(v_phone_number), true
    );
    v_changed_fields := array_append(v_changed_fields, 'phone_number');
    v_private_changed := true;
  end if;

  if v_address is not null then
    v_payload := jsonb_set(v_payload, '{address}', to_jsonb(v_address), true);
    v_changed_fields := array_append(v_changed_fields, 'address');
    v_private_changed := true;
  end if;

  if v_nationality is not null then
    v_payload := jsonb_set(
      v_payload, '{nationality}', to_jsonb(v_nationality), true
    );
    v_changed_fields := array_append(v_changed_fields, 'nationality');
    v_private_changed := true;
  else
    v_existing_nationality :=
      nullif(trim(coalesce(v_payload ->> 'nationality', '')), '');
    v_normalized_existing_nationality :=
      public.labor_normalize_nationality_v52_41(v_existing_nationality);

    if v_normalized_existing_nationality is not null
       and v_existing_nationality is distinct from v_normalized_existing_nationality then
      v_payload := jsonb_set(
        v_payload,
        '{nationality}',
        to_jsonb(v_normalized_existing_nationality),
        true
      );
      v_changed_fields := array_append(v_changed_fields, 'nationality_normalized');
      v_private_changed := true;
    end if;
  end if;

  if v_bank_name is not null then
    v_payload := jsonb_set(v_payload, '{bank_name}', to_jsonb(v_bank_name), true);
    v_changed_fields := array_append(v_changed_fields, 'bank_name');
    v_private_changed := true;
  end if;

  if v_account_number <> '' then
    v_payload := jsonb_set(
      v_payload, '{account_number}', to_jsonb(v_account_number), true
    );
    v_changed_fields := array_append(v_changed_fields, 'account_number');
    v_private_changed := true;
  end if;

  if v_account_holder is not null then
    v_payload := jsonb_set(
      v_payload, '{account_holder}', to_jsonb(v_account_holder), true
    );
    v_changed_fields := array_append(v_changed_fields, 'account_holder');
    v_private_changed := true;
  end if;

  -- 주민등록번호가 존재하는 레코드는 과거 외국인등록번호 payload를 정리한다.
  if nullif(v_payload ->> 'resident_registration_number', '') is not null
     and v_payload ? 'foreign_registration_number' then
    v_payload := v_payload - 'foreign_registration_number';
    v_changed_fields := array_append(
      v_changed_fields, 'foreign_registration_number_removed'
    );
    v_private_changed := true;
  end if;

  -- 최종 payload 필수검증.
  if nullif(v_payload ->> 'resident_registration_number', '') is null then
    raise exception '주민등록번호는 필수정보입니다.';
  end if;
  if nullif(v_payload ->> 'phone_number', '') is null then
    raise exception '전체 휴대폰번호는 필수정보입니다.';
  end if;
  if nullif(v_payload ->> 'nationality', '') is null then
    raise exception '국적은 필수정보입니다.';
  end if;
  if public.labor_normalize_nationality_v52_41(v_payload ->> 'nationality') is null then
    raise exception
      '기존 국적값이 표준 목록과 일치하지 않습니다. 국적을 다시 선택해주세요.';
  end if;
  if nullif(trim(coalesce(v_payload ->> 'bank_name', '')), '') is null then
    raise exception '은행은 필수정보입니다.';
  end if;
  if nullif(v_payload ->> 'account_number', '') is null then
    raise exception '계좌번호는 필수정보입니다.';
  end if;
  if nullif(trim(coalesce(v_payload ->> 'account_holder', '')), '') is null then
    raise exception '예금주는 필수정보입니다.';
  end if;

  v_basic_result := public.labor_worker_master_upsert_v52_33(
    p_worker_id,
    p_name_ko,
    p_birth_date,
    case
      when nullif(v_payload ->> 'phone_number', '') is null then p_phone_last4
      else right(
        regexp_replace(v_payload ->> 'phone_number', '[^0-9]', '', 'g'),
        4
      )
    end,
    p_recent_trade,
    p_note,
    p_is_active
  );

  v_worker_id := (v_basic_result ->> 'worker_master_id')::uuid;
  v_created := coalesce((v_basic_result ->> 'created')::boolean, false);
  if v_created then
    v_private_changed := true;
  end if;

  if v_private_changed then
    v_key := coalesce(v_key, public.labor_worker_private_key_v52_34());

    insert into public.labor_worker_private(
      worker_master_id,
      encrypted_payload,
      crypto_version,
      updated_by,
      created_at,
      updated_at
    ) values (
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
    set encrypted_payload = excluded.encrypted_payload,
        crypto_version = excluded.crypto_version,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

    v_private_updated := true;

    insert into public.labor_worker_private_audit(
      worker_master_id,
      changed_fields,
      actor_user_id
    ) values (
      v_worker_id,
      v_changed_fields,
      v_user_id
    );
  end if;

  v_final_phone_last4 := right(
    regexp_replace(v_payload ->> 'phone_number', '[^0-9]', '', 'g'),
    4
  );
  v_final_account_last4 := right(
    regexp_replace(v_payload ->> 'account_number', '[^0-9]', '', 'g'),
    4
  );
  v_final_bank_name :=
    nullif(trim(coalesce(v_payload ->> 'bank_name', '')), '');

  update public.labor_worker_master
  set phone_last4 = v_final_phone_last4,
      account_last4 = v_final_account_last4,
      bank_name_hint = v_final_bank_name,
      has_private_data = jsonb_object_length(v_payload) > 0,
      has_resident_no = true,
      has_foreign_no =
        nullif(v_payload ->> 'foreign_registration_number', '') is not null,
      has_private_phone = true,
      has_address = nullif(v_payload ->> 'address', '') is not null,
      has_account = true,
      has_account_holder =
        nullif(trim(coalesce(v_payload ->> 'account_holder', '')), '') is not null,
      has_nationality = true,
      updated_by = v_user_id,
      updated_at = clock_timestamp()
  where id = v_worker_id;

  return jsonb_build_object(
    'worker_master_id', v_worker_id,
    'created', v_created,
    'private_updated', v_private_updated,
    'has_private_data', true
  );
end;
$$;

revoke all on function public.labor_worker_master_list_v52_41(text, integer)
  from public, anon, authenticated;
revoke all on function public.labor_worker_master_secure_upsert_v52_41(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.labor_worker_master_list_v52_41(text, integer)
  to authenticated;
grant execute on function public.labor_worker_master_secure_upsert_v52_41(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text
) to authenticated;

-- Excel 준비검사도 동일한 필수정보 기준으로 맞춘다.
-- 주소는 선택정보, 외국인등록번호는 더 이상 조건이 아니다.
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
    v_user_id, 'labor.cost.view', v_project_name
  ) then
    raise exception '해당 현장의 Excel 준비상태를 확인할 권한이 없습니다.';
  end if;

  select r.id into v_roster_id
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
      'message', '저장된 월별 근로자 명단이 없습니다.',
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
          case when not coalesce(w.has_resident_no, false)
            then 'resident_no' end,
          case when not coalesce(w.has_private_phone, false)
            then 'phone' end,
          case when not coalesce(w.has_nationality, false)
            then 'nationality' end,
          case when nullif(trim(coalesce(w.bank_name_hint, '')), '') is null
            then 'bank' end,
          case when not coalesce(w.has_account, false)
            then 'account' end,
          case when not coalesce(w.has_account_holder, false)
            then 'account_holder' end,
          case when nullif(trim(coalesce(i.monthly_trade, '')), '') is null
            then 'trade' end
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
      count(*) filter (where cardinality(missing_fields) = 0)::integer
        as ready_worker_count,
      count(*) filter (where cardinality(missing_fields) > 0)::integer
        as issue_worker_count,
      coalesce(sum(cardinality(missing_fields)), 0)::integer as issue_count
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
          ) order by c.sort_order
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
    'ready', v_worker_count > 0 and v_issue_worker_count = 0,
    'project_name', v_project_name,
    'month_key', v_month_key,
    'worker_count', v_worker_count,
    'ready_worker_count', v_ready_worker_count,
    'issue_worker_count', v_issue_worker_count,
    'issue_count', v_issue_count,
    'message',
      case
        when v_worker_count = 0 then '명단에 근로자가 없습니다.'
        when v_issue_worker_count = 0 then
          '근로자 개인정보 Excel 생성 데이터가 준비되었습니다.'
        else 'Excel 다운로드 전 보완이 필요한 필수 근로자 정보가 있습니다.'
      end,
    'workers', v_workers
  );
end;
$$;

comment on function public.labor_worker_master_secure_upsert_v52_41(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text
) is
  'v52.41 보호정보 필수검증/국적표준화 저장. 외국인등록번호 신규입력 미사용.';
comment on function public.labor_worker_master_list_v52_41(text, integer) is
  'v52.41 관리목록. 예금주 보유여부 포함, 보호정보 원문 미반환.';
comment on function public.labor_monthly_export_readiness_v52_37(text, text) is
  'v52.41 주민번호/연락처/국적/은행/계좌/예금주 + 월 공종 기준 Excel 준비검사.';

commit;
