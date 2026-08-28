v52.48.5.44.71 - 지출결의서 서버 권한 v2 수정

원인:
- .70 SQL/검증에서 존재하지 않는 get_my_runtime_access()를 참조했습니다.
- 현재 프론트엔드는 get_my_runtime_access_v2 RPC를 실제 사용 중입니다.

수정:
- can_access_expense_project가 get_my_runtime_access_v2를 사용하도록 수정
- .69와 동일하게 담당자/관리자는 자기 소속현장 지출결의서 기본 접근 허용
- .70을 이미 실행했거나 아직 실행하지 않은 경우 모두 처리
- SQL Editor 검증에서 runtime RPC를 직접 호출하지 않고 함수 존재/참조만 확인

적용:
1) node .\release_v52.48.5.44.71\apply-v52.48.5.44.71-expense-runtime-access-v2.cjs
2) Supabase SQL Editor에서 supabase/v52.48.5.44.71_expense_runtime_access_v2.sql 전체 실행
3) Test 담당자 계정에서 지출결의서 저장 재확인
4) npm run build
5) git add .
6) git commit -m "v52.48.5.44.71 expense runtime access v2"
7) git push origin main
