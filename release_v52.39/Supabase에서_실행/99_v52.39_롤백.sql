begin;

do $$
begin
  if to_regclass(
    'public.labor_download_otp_challenges'
  ) is not null
     and exists (
       select 1
       from public.labor_download_otp_challenges
       limit 1
     ) then
    raise exception
      'OTP challenge 데이터가 존재합니다. 감사기록 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;

  if to_regclass(
    'public.labor_sensitive_download_audit'
  ) is not null
     and exists (
       select 1
       from public.labor_sensitive_download_audit
       limit 1
     ) then
    raise exception
      '민감 다운로드 감사로그가 존재합니다. 감사기록 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop function if exists public.labor_download_otp_verify_v52_39(
  uuid,
  text
);
drop function if exists public.labor_download_otp_request_v52_39(
  text,
  text
);
drop function if exists public.labor_generate_otp_v52_39();
drop function if exists public.labor_download_auth_preflight_v52_39(
  text,
  text
);
drop function if exists public.labor_verified_phone_context_v52_39(
  uuid
);
drop function if exists public.labor_monthly_snapshot_v52_39(
  text,
  text
);
drop function if exists public.labor_download_sms_provider_ready_v52_39();
drop function if exists public.labor_download_hmac_key_v52_39();

drop table if exists public.labor_sensitive_download_audit;
drop table if exists public.labor_download_otp_challenges;

commit;

-- Vault의 labor_download_otp_hmac_key_v52_39 secret은
-- 자동 삭제하지 않습니다.
