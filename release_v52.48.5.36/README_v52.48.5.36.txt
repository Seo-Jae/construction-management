v52.48.5.36 - 기술자료 VIEW/부속자재 연결 구조 개선

기준
- v52.48.5.35까지 적용된 현재 상태에서 다음 개발만 추가합니다.
- 기존 일위대가 계산/저장/버전/기술자료 이미지/지시선/권한은 유지합니다.

반영 내용

1. 일위대가 본 화면
- '부속 00' Chip 제거
- '부속자재 관리' 버튼 제거
- 부속자재 관련 업로드/연결/교체/삭제 작업은 전부 '지시선 편집' 새창 안으로 이동

2. 지시선 편집기
- 우측에 '지시선 · 명칭 / 부속자재 연결' 탭 추가
- 지시선 항목을 선택한 상태에서 공통 부속자재를 체크하여 해당 명칭과 연결
- 공통 부속자재 새 이미지 업로드 가능
- 기존 공통 부속자재 이미지 교체 가능
- 공통 부속자재 삭제 가능
- 동일 이미지를 여러 명칭/여러 천정 공법에서 재사용
- 등록 항목 목록은 남는 세로 공간을 끝까지 사용하고, 실제로 부족할 때만 스크롤

3. 기술자료 VIEW
- 기본 새창 크기 약 1125 x 1021
- 좌측 기술자료 + 우측 상세 부속자재
- 처음부터 부속자재 전체를 계속 표시하지 않음
- 도면의 번호 또는 하단 명칭 클릭 시 그 항목에 연결한 상세 부속자재만 표시
- '상세 부속자재' 우측에 '전체보기' 버튼 추가
- 전체보기는 현재 기술자료에 연결된 부속자재를 중복 제거하여 모두 표시
- 우측 상세이미지는 150px 썸네일로 자르지 않고 업로드 이미지의 전체 세로 비율을 그대로 표시
- 부속자재 이미지를 클릭해 다른 창으로 이동하는 동작 제거
- VIEW 지시선/번호는 기존 파란색 스타일 유지

4. DB
- 기존 unit_price_technical_accessory_library 유지
- 신규 unit_price_technical_annotation_accessories 추가
- image_key + annotation_id + accessory_id 단위로 연결 저장
- save_unit_price_technical_sheet_v36()으로 지시선/하단레이아웃/명칭별 부속자재 연결을 함께 저장
- 기존 v35 image_key 전체 연결 테이블은 삭제하지 않아 과거 데이터를 훼손하지 않음
- 기존 v35에서 올린 공통 부속자재 이미지는 라이브러리에 그대로 남아 편집기에서 다시 연결 가능

적용
node release_v52.48.5.36/apply-v52.48.5.36-annotation-accessories.cjs

Supabase SQL Editor
supabase/v52.48.5.36_unit_price_annotation_accessories.sql
전체 실행

배포 대상
src/page/UnitPriceAnalysis.jsx
src/utils/technicalImageSheetEditor.js
supabase/v52.48.5.36_unit_price_annotation_accessories.sql
