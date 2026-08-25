begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1
    from public.labor_worker_master
    limit 1
  ) then
    raise exception
      'labor_worker_master에 데이터가 존재합니다. 데이터 유실 방지를 위해 자동 롤백을 중단합니다.';
  end if;
end;
$$;

drop function if exists public.labor_worker_master_upsert_v52_33(
  uuid, text, date, text, text, text, boolean
);
drop function if exists public.labor_worker_master_list_v52_33(
  text, integer
);
drop function if exists public.labor_worker_master_search_v52_33(
  text, text
);
drop function if exists public.labor_permission_allowed_v52_33(
  uuid, text, text
);

delete from public.user_special_permissions_v2
where permission_key = 'labor.worker_master.manage';

delete from public.user_permission_overrides_v2
where permission_key = 'labor.worker_master.manage';

delete from public.template_permissions
where permission_key = 'labor.worker_master.manage';

delete from public.permission_definitions
where permission_key = 'labor.worker_master.manage';

drop table if exists public.labor_worker_master_audit;
drop table if exists public.labor_worker_master;

commit;
