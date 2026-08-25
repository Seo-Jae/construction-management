v52.48.5.35 - 기술자료 상세 부속자재 + 편집기 목록 높이 개선

기준
- v52.48.5.34.2 적용/배포 상태
- 기존 일위대가, 기술자료 이미지, 지시선, 하단 설명, 권한을 유지

1. 기술자료 VIEW
- 좌측: 기존 기술자료/지시선/하단명칭
- 우측: 현재 공법에 연결된 상세 부속자재 이미지
- 부속자재가 여러 개면 우측 패널만 독립 스크롤
- 부속자재 이미지 클릭 시 원본 이미지 새 탭 확인

2. 공통 부속자재 라이브러리
- 기술자료 카드의 '부속자재 관리' 버튼은 기술자료 이미지 관리 권한자에게만 표시
- 새 공통 부속자재명 입력 -> 이미지 업로드
- 새 업로드는 현재 기술자료에 자동 연결
- 기존 공통 부속자재는 체크/해제로 현재 공법에 재사용
- 이미지 교체 가능
- 공통 라이브러리 삭제 가능 (다른 공법 연결에서도 함께 제거되므로 확인창 표시)
- 일반 사용자는 관리 UI 없이 VIEW에서 연결된 부속자재만 조회

3. 편집기 '등록 항목'
- 기존 max-height:260px 제거
- 오른쪽 패널에 남는 세로 공간을 등록항목 목록이 끝까지 사용
- 실제 목록이 남는 공간보다 많을 때만 등록항목 영역에 스크롤 생성

4. DB
- unit_price_technical_accessory_library
- unit_price_technical_accessory_links
- 기존 can_manage_unit_price_technical_annotations() 권한 재사용
- Storage는 기존 unit-price-technical-images bucket의 accessories/<UUID>/image 사용

적용:
node release_v52.48.5.35/apply-v52.48.5.35-accessory-panel-and-list-scroll.cjs

그 다음 Supabase SQL Editor:
supabase/v52.48.5.35_unit_price_technical_accessories.sql
전체 실행

배포 대상:
src/page/UnitPriceAnalysis.jsx
src/utils/technicalImageSheetEditor.js
supabase/v52.48.5.35_unit_price_technical_accessories.sql
