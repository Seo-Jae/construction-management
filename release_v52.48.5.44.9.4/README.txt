v52.48.5.44.9.4 계약 노무비 우측정렬 수정

- 링크 아이콘과 계약 노무비를 하나의 inline-flex 묶음으로 변경
- 묶음 전체가 셀의 기존 우측정렬을 직접 적용받도록 수정
- 계약 노무비 금액 끝자리를 실행 노임총액처럼 셀 우측에 정렬
- 아이콘은 금액 바로 앞에서 동일 높이 유지

적용 명령
node release_v52.48.5.44.9.4/apply-v52.48.5.44.9.4-contract-amount-right.cjs
npm run build

새로 실행할 Supabase SQL은 없습니다.

