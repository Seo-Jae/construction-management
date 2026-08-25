v52.48.5.44.2
현장관리 - 비밀번호 확인 삭제 + 층별 타입 예외

1) 현장 삭제
- 기존 현장을 선택하면 [현장 삭제] 버튼 표시
- 현재 로그인한 최고관리자 계정의 비밀번호를 다시 입력
- Supabase Auth signInWithPassword 성공 후에만 삭제 RPC 실행
- 서버 RPC도 최고관리자 여부를 다시 검증
- building_settings의 현장/동 기본등록을 삭제하여 현장목록에서 제거
- 출력일보/공정/노임 등 과거 업무이력 데이터는 안전상 자동 삭제하지 않음

2) 층별 타입 예외
기존:
101동 1호=84A / 2호=68A / 3호=68B / 4호=84B

예외:
최상층 29층 2호=120T
최상층 29층 3호=120T

저장 예:
floorUnitTypes = {
  "29": {
    "2": "120T",
    "3": "120T"
  }
}

타입 판정 우선순위:
층별 타입 예외(floorUnitTypes) > 기본 호별 타입(unitTypes)

3) SQL
supabase/v52.48.5.44.2_project_delete_floor_unit_types.sql
전체를 Supabase SQL Editor에서 1회 실행

적용:
node release_v52.48.5.44.2/apply-v52.48.5.44.2-project-delete-floor-types.cjs
