-- ============================================================
-- 사내시스템 v52.15
-- 메신저 전체 메시지 전송 RPC
-- 기준: v52.14.9 Production
--
-- 동작
-- 1) 로그인한 활성 사용자라면 역할과 무관하게 사용 가능
-- 2) 선택한 활성 사용자 각각과 기존 1:1 방을 재사용하거나 새로 생성
-- 3) 동일한 텍스트 메시지를 각 1:1 방에 전송
-- 4) 수신자는 기존 메신저 읽지않음/Realtime/Windows 알림 흐름을 그대로 사용
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.messenger_broadcast_text_message(
  p_recipient_user_ids uuid[],
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_recipient_user_id uuid;
  v_room_id uuid;
  v_sent_count integer := 0;
begin
  if v_current_user is null
     or not public.messenger_is_active_user(v_current_user) then
    raise exception '활성 사용자만 메신저를 사용할 수 있습니다.';
  end if;

  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception '메시지는 1~4000자로 입력해주세요.';
  end if;

  if coalesce(cardinality(p_recipient_user_ids), 0) < 1 then
    raise exception '메시지를 받을 사용자를 한 명 이상 선택해주세요.';
  end if;

  for v_recipient_user_id in
    select distinct recipient_id
    from unnest(p_recipient_user_ids) as recipient_id
    where recipient_id is not null
      and recipient_id <> v_current_user
      and public.messenger_is_active_user(recipient_id)
    order by recipient_id
  loop
    v_room_id := public.messenger_create_direct_room(v_recipient_user_id);

    perform public.messenger_send_text_message(
      v_room_id,
      v_body
    );

    v_sent_count := v_sent_count + 1;
  end loop;

  if v_sent_count < 1 then
    raise exception '전송 가능한 활성 사용자가 없습니다.';
  end if;

  return v_sent_count;
end;
$$;

revoke all on function public.messenger_broadcast_text_message(uuid[], text) from public;
grant execute on function public.messenger_broadcast_text_message(uuid[], text) to authenticated;

commit;

-- 설치 확인
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'messenger_broadcast_text_message';
