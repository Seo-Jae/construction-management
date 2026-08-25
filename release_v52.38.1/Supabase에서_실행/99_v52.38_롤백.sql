begin;

drop function if exists public.labor_security_phone_register_pending_v52_38(
  text
);
drop function if exists public.labor_security_phone_status_v52_38();
drop function if exists public.labor_security_phone_key_v52_38();

do $$
begin
  if to_regclass('public.user_security_phone_private') is not null
     and exists (
       select 1
       from public.user_security_phone_private
       limit 1
     ) then
    raise exception
      '등록된 보안 휴대폰 암호문이 존재합니다. 데이터 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop table if exists public.user_security_phone_audit;
drop table if exists public.user_security_phone_private;
drop table if exists public.user_security_phone;

drop function if exists public.labor_monthly_export_readiness_v52_37(
  text,
  text
);

commit;

-- Vault의 labor_security_phone_key_v52_38 secret은
-- 자동 삭제하지 않습니다.
