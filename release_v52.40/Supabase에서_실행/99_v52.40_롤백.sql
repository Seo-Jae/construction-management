begin;

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
    raise exception '해당 현장의 노임 Excel 준비상태를 확인할 권한이 없습니다.';
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
      'message', '저장된 월별 노임 명단이 없습니다.',
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
          end,
          case
            when coalesce(i.daily_wage, 0) <= 0
            then 'daily_wage'
          end,
          case
            when coalesce(
              (
                select sum(entry.value::numeric)
                from jsonb_each_text(
                  coalesce(i.work_entries, '{}'::jsonb)
                ) entry
              ),
              0
            ) <= 0
            then 'work_entries'
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
      coalesce(
        sum(cardinality(missing_fields)),
        0
      )::integer as issue_count
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
          then '기본 Excel 생성 데이터가 준비되었습니다.'
        else 'Excel 생성 전 보완이 필요한 근로자가 있습니다.'
      end,
    'workers', v_workers
  );
end;
$$;

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

commit;
