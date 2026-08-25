v52.48.5.43 - 일위대가 중분류 최고관리자 관리

적용 내용
1. 일위대가작성 > 중분류 우측에 최고관리자 전용 관리 버튼 추가
2. 최고관리자는 중분류명을 변경할 수 있음
3. 이미 존재하는 중분류명을 입력하면, 동일 세부규격 충돌이 없는 경우 하나로 통합
4. 동일 세부규격이 양쪽에 동시에 있으면 데이터 손실 방지를 위해 자동 통합 중단
5. unit_price_specs의 기준규격은 그대로 유지하고 middle_category만 변경
6. 기존 unit_price_documents의 현재 중분류명도 함께 변경
7. 기존 document revision snapshot은 변경하지 않아 과거 버전 이력 보존
8. 일반 사용자/관리자에게는 중분류 관리 버튼이 보이지 않음

SQL
- supabase/v52.48.5.43_unit_price_middle_category_manage.sql
- Supabase SQL Editor에서 전체를 1회 실행해야 합니다.

수정 파일
- src/page/UnitPriceAnalysis.jsx
- src/Dashboard.jsx
- supabase/v52.48.5.43_unit_price_middle_category_manage.sql
