begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =========================================================
-- v52.44
-- 월별 노임작성 > 근로자 조회
--
-- 기능:
-- 1. 검색어가 없어도 등록 근로자 목록 표시
-- 2. 성명 / 공종 기준 전환
-- 3. 성명 검색
-- 4. 공종 검색
-- 5. 보호정보 원문은 반환하지 않음
-- =========================================================

do $$
begin
  if to_regclass(
    'public.labor_worker_master'
  ) is null then
    raise exception
      '근로자 마스터 테이블이 없습니다.';
  end if;

  if to_regprocedure(
    'public.labor_permission_allowed_v52_33(uuid,text,text)'
  ) is null then
    raise exception
      '노임 권한 함수가 없습니다.';
  end if;
end;
$$;

create or replace function public.labor_worker_master_browse_v52_44(
  p_project_name text,
  p_query text default '',
  p_filter text default 'name',
  p_limit integer default 1000
)
returns table (
  worker_master_id uuid,
  name_ko text,
  birth_date date,
  phone_last4 text,
  phone_masked text,
  recent_trade text,
  note text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid :=
    auth.uid();

  v_project_name text :=
    trim(
      coalesce(
        p_project_name,
        ''
      )
    );

  v_query text :=
    trim(
      coalesce(
        p_query,
        ''
      )
    );

  v_filter text :=
    lower(
      trim(
        coalesce(
          p_filter,
          'name'
        )
      )
    );

  v_limit integer :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          1000
        ),
        2000
      )
    );
begin
  if v_user_id is null then
    raise exception
      '로그인이 필요합니다.';
  end if;

  if v_project_name = '' then
    raise exception
      '현장을 먼저 선택해주세요.';
  end if;

  if not public.labor_permission_allowed_v52_33(
    v_user_id,
    'labor.cost.view',
    v_project_name
  ) then
    raise exception
      '해당 현장의 근로자 조회 권한이 없습니다.';
  end if;

  if v_filter not in (
    'name',
    'trade'
  ) then
    v_filter := 'name';
  end if;

  return query
  select
    w.id as worker_master_id,
    w.name_ko,
    w.birth_date,
    nullif(
      w.phone_last4,
      ''
    ) as phone_last4,
    case
      when nullif(
        w.phone_last4,
        ''
      ) is null
        then null
      else
        '****' ||
        w.phone_last4
    end as phone_masked,
    nullif(
      trim(
        coalesce(
          w.recent_trade,
          ''
        )
      ),
      ''
    ) as recent_trade,
    nullif(
      trim(
        coalesce(
          w.note,
          ''
        )
      ),
      ''
    ) as note
  from public.labor_worker_master w
  where
    v_query = ''
    or (
      v_filter = 'name'
      and w.name_ko ilike
        '%' || v_query || '%'
    )
    or (
      v_filter = 'trade'
      and coalesce(
        w.recent_trade,
        ''
      ) ilike
        '%' || v_query || '%'
    )
  order by
    case
      when v_filter = 'trade'
        then nullif(
          trim(
            coalesce(
              w.recent_trade,
              ''
            )
          ),
          ''
        )
      else null
    end asc nulls last,
    w.name_ko asc,
    w.birth_date asc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.labor_worker_master_browse_v52_44(
  text,
  text,
  text,
  integer
)
from public, anon, authenticated;

grant execute on function public.labor_worker_master_browse_v52_44(
  text,
  text,
  text,
  integer
)
to authenticated;

comment on function public.labor_worker_master_browse_v52_44(
  text,
  text,
  text,
  integer
) is
  'v52.44 월별 노임작성 근로자 조회. 빈 검색어 전체목록, 성명/공종 필터 지원, 민감원문 미반환.';

commit;
