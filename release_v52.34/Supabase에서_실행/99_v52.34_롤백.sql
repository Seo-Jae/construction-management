begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.labor_worker_private') is not null
     and exists (
       select 1
       from public.labor_worker_private
       limit 1
     ) then
    raise exception
      '암호화된 근로자 보호정보가 존재합니다. 데이터/암호화키 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop function if exists public.labor_worker_master_secure_upsert_v52_34(
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
);

drop function if exists public.labor_worker_master_list_v52_34(
  text,
  integer
);

drop function if exists public.labor_worker_private_key_v52_34();

drop table if exists public.labor_worker_private_audit;
drop table if exists public.labor_worker_private;

alter table public.labor_worker_master
  drop constraint if exists labor_worker_master_account_last4_v52_34;

alter table public.labor_worker_master
  drop column if exists account_last4,
  drop column if exists bank_name_hint,
  drop column if exists has_private_data,
  drop column if exists has_resident_no,
  drop column if exists has_foreign_no,
  drop column if exists has_private_phone,
  drop column if exists has_address,
  drop column if exists has_account,
  drop column if exists has_nationality;

commit;

-- 중요:
-- Vault의 labor_pii_data_key_v52_34 secret은 자동 삭제하지 않습니다.
-- 암호화 데이터가 없다는 것을 별도로 확인한 뒤에만 수동 삭제를 검토하세요.
