v52.48.5.37 - 부속자재 연결 직관화 + VIEW 선택 연동 보강

핵심
1) VIEW
- 번호 또는 하단 명칭 클릭 시 해당 항목에 연결된 부속자재를 즉시 우측에 표시
- 첫 연결 부속자재는 우측 작은 미리보기로 자동 표시
- 전체보기는 큰 이미지를 세로로 계속 나열하지 않고 컴팩트한 리스트로 표시
- 전체보기 리스트 클릭 시 우측 상단에 작은 미리보기 표시
- 부속자재 이미지를 눌러 다른 화면/탭으로 이동하지 않음
- 기존 파란 지시선/번호 스타일 유지

2) 지시선 편집 > 부속자재 연결
- 상단에 1,2,3... 각 명칭을 가로 버튼으로 표시
- 각 명칭 버튼에 현재 연결 개수 표시
- 예: [1. HANGER BOLT  1] 클릭 후 공통자재 [연결하기]
- 연결된 자재는 파란 테두리 + '연결됨 ✓'
- 검색창 추가
- 연결 변경 후 상단 [저장] 필요 문구를 명확하게 표시
- 새 공통부속자재 업로드/이미지 교체/삭제 기능 유지

3) 연결 안정성
- 기존 annotation_id 유지
- annotation_symbol / annotation_title 메타데이터 추가
- 기존 v36 연결정보 자동 backfill
- VIEW는 ID 우선, 필요 시 번호/명칭으로 보조 매칭

적용:
node release_v52.48.5.37/apply-v52.48.5.37-accessory-link-ui-view-fix.cjs

Supabase SQL Editor:
supabase/v52.48.5.37_unit_price_annotation_accessories.sql
전체 실행

배포 대상:
src/page/UnitPriceAnalysis.jsx
src/utils/technicalImageSheetEditor.js
supabase/v52.48.5.37_unit_price_annotation_accessories.sql
