-- v52.48.5.44.4
-- 현장마스터(building_settings)를 회원가입/회원관리/근태 회원가입의 단일 현장목록으로 사용합니다.
--
-- 사용처
-- 1) 일반 계정 회원가입 Login.jsx
-- 2) 회원관리 UserManagement.jsx
-- 3) 근태 근로자 회원가입 AttendanceWorkerPortal.jsx
--
-- 새 현장을 현장관리에서 저장하면 building_settings에 등록되므로
-- 별도 코드/상수 수정 없이 위 3곳에 자동 반영됩니다.

create or replace function public.list_registration_projects()
returns table (
  project_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct btrim(bs.project_name)::text as project_name
    from public.building_settings bs
   where bs.project_name is not null
     and btrim(bs.project_name) <> ''
     and btrim(bs.project_name) not in ('본사', '전체현장')
   order by 1;
$$;

revoke all on function public.list_registration_projects() from public;
grant execute on function public.list_registration_projects() to anon;
grant execute on function public.list_registration_projects() to authenticated;

notify pgrst, 'reload schema';
