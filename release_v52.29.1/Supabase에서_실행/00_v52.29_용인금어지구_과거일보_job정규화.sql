-- =============================================================
-- v52.29 용인금어지구 과거 출력일보 직종명 최소 정규화
-- 대상: 한라건설 용인금어지구 / 25.07.01 ~ 26.05.31
--
-- 변경하는 값: daily_reports.workers[].job 만 변경
-- 변경하지 않는 값: name, process, location, workContent, day, night,
--                   날짜, 작성자, 업무내용, 마감상태 등
--
-- 정규화:
--   먹메김   -> 먹매김
--   경량     -> 경량벽체
--   경량골조 -> 경량벽체
--   경량석고 -> 경량벽체
--   천정     -> 세대천정
--
-- process는 절대 수정하지 않습니다.
-- =============================================================

begin;

-- 0. 스키마 안전검사: workers가 jsonb가 아니면 아무것도 수정하지 않고 중단합니다.
do $$
declare
  v_udt_name text;
begin
  select c.udt_name
    into v_udt_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'daily_reports'
    and c.column_name = 'workers';

  if v_udt_name is null then
    raise exception 'public.daily_reports.workers 컬럼을 찾지 못했습니다.';
  end if;

  if v_udt_name <> 'jsonb' then
    raise exception 'daily_reports.workers 타입이 jsonb가 아닙니다. 현재 타입: %', v_udt_name;
  end if;
end;
$$;

-- 1. 수정 전 원본 workers 백업.
--    같은 날짜는 최초 실행 때의 원본만 보존합니다.
create table if not exists public.daily_reports_workers_backup_v52_29 (
  project_name text not null,
  report_date text not null,
  workers jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (project_name, report_date)
);

-- 백업 데이터는 운영 프론트에서 읽을 필요가 없으므로 외부 접근을 차단합니다.
alter table public.daily_reports_workers_backup_v52_29
  enable row level security;

revoke all on table public.daily_reports_workers_backup_v52_29
from anon, authenticated;

insert into public.daily_reports_workers_backup_v52_29 (
  project_name,
  report_date,
  workers
)
select
  dr.project_name,
  dr.date,
  coalesce(dr.workers, '[]'::jsonb)
from public.daily_reports dr
where dr.project_name = '한라건설 용인금어지구'
  and dr.date between '25.07.01' and '26.05.31'
on conflict (project_name, report_date) do nothing;

-- 2. workers 배열의 job만 정규화합니다.
with normalized as (
  select
    dr.project_name,
    dr.date,
    jsonb_agg(
      case
        when btrim(coalesce(item.worker ->> 'job', '')) = '먹메김'
          then jsonb_set(item.worker, '{job}', to_jsonb('먹매김'::text), true)
        when btrim(coalesce(item.worker ->> 'job', '')) in (
          '경량',
          '경량골조',
          '경량석고'
        )
          then jsonb_set(item.worker, '{job}', to_jsonb('경량벽체'::text), true)
        when btrim(coalesce(item.worker ->> 'job', '')) = '천정'
          then jsonb_set(item.worker, '{job}', to_jsonb('세대천정'::text), true)
        else item.worker
      end
      order by item.ordinality
    ) as next_workers,
    count(*) filter (
      where btrim(coalesce(item.worker ->> 'job', '')) in (
        '먹메김',
        '경량',
        '경량골조',
        '경량석고',
        '천정'
      )
    ) as changed_worker_count
  from public.daily_reports dr
  cross join lateral jsonb_array_elements(
    coalesce(dr.workers, '[]'::jsonb)
  ) with ordinality as item(worker, ordinality)
  where dr.project_name = '한라건설 용인금어지구'
    and dr.date between '25.07.01' and '26.05.31'
  group by dr.project_name, dr.date
)
update public.daily_reports dr
set workers = normalized.next_workers
from normalized
where dr.project_name = normalized.project_name
  and dr.date = normalized.date
  and normalized.changed_worker_count > 0;

commit;

-- =============================================================
-- 3. 적용 확인
-- 아래 결과에서 먹메김/경량/경량골조/경량석고/천정은 0건이어야 합니다.
-- =============================================================

select
  worker ->> 'job' as job,
  count(*) as worker_days
from public.daily_reports dr
cross join lateral jsonb_array_elements(
  coalesce(dr.workers, '[]'::jsonb)
) as worker
where dr.project_name = '한라건설 용인금어지구'
  and dr.date between '25.07.01' and '26.05.31'
  and coalesce(worker ->> 'job', '') in (
    '먹메김',
    '먹매김',
    '경량',
    '경량골조',
    '경량석고',
    '경량벽체',
    '천정',
    '세대천정'
  )
group by worker ->> 'job'
order by worker ->> 'job';

-- 원본 업로드 파일 분석 기준 참고값:
--   경량 + 경량골조 + 경량석고 = 경량벽체 계열 약 2,628 인·일
--   천정 = 세대천정 계열 약 3,232 인·일
-- 실제 DB의 업로드 선택 일자/추가수정 여부에 따라 결과는 달라질 수 있습니다.
