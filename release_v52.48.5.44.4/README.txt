v52.48.5.44.4 - 현장마스터 연동 보완

확인된 문제
1. 근태 근로자 회원가입
   - 기존 ATTENDANCE_PROJECTS 상수에 3개 현장이 고정되어 있었음.
   - 새로 만든 현장이 building_settings에 있어도 회원가입 선택목록에 나타나지 않음.
   - QR/설치 링크로 새 현장을 전달해도 기존 상수에 없으면 초기 현장이 제거됨.

2. 일반 계정 회원가입 / 회원관리
   - 둘 다 list_registration_projects RPC를 사용함.
   - 이 RPC가 building_settings를 단일 원본으로 읽도록 다시 정의함.
   - 앞으로 현장관리에서 현장 추가 시 별도 등록작업 없이 자동 노출됨.

변경 파일
- src/page/AttendanceWorkerPortal.jsx
- supabase/v52.48.5.44.4_project_registry_linkage.sql

SQL 실행 필요
Supabase SQL Editor에서 아래 파일 전체를 1회 실행:
supabase/v52.48.5.44.4_project_registry_linkage.sql

SQL 적용 후 자동 연동되는 곳
- 로그인 화면 일반 회원가입 현장 선택
- 회원관리의 소속/접근 현장 선택
- 근태 근로자 회원가입 현장 선택

확인 결과 별도 개선이 필요한 부분
- Main Dashboard / 전체 현장 Dashboard의 공사 시작일·종료일은 아직 기존 3개 현장 하드코딩.
  새 현장은 기능상 정상 노출되지만 '일정 미등록'으로 표시됨.
  이는 현장개설 화면에 공사기간 필드를 추가해 프로젝트 메타데이터로 관리하는 후속 개선 대상.

적용:
node release_v52.48.5.44.4/apply-v52.48.5.44.4-project-registry-linkage.cjs
