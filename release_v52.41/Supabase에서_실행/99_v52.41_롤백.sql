begin;

drop function if exists public.labor_worker_master_secure_upsert_v52_41(
  uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text
);

drop function if exists public.labor_worker_master_list_v52_41(text, integer);
drop function if exists public.labor_normalize_nationality_v52_41(text);

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
    raise exception
      '해당 현장의 Excel 준비상태를 확인할 권한이 없습니다.';
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
          then '근로자 개인정보 Excel 생성 데이터가 준비되었습니다.'
        else
          'Excel 다운로드 전 보완이 필요한 근로자 정보가 있습니다.'
      end,
    'workers', v_workers
  );
end;
$$;

commit;

-- has_account_holder 컬럼은 기존 암호화 데이터의 파생 상태값이므로 자동 삭제하지 않습니다.
