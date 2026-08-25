v52.48.5.34 기술자료 편집기 v2

목표
- 앞으로 업로드하는 원본 기술자료 이미지는 '지시선 없음 / 하단 설명 없음'의 깨끗한 이미지로 사용
- 시스템에서 번호, 지시선, 하단 부재명 전체를 구성
- VIEW에서는 항목별 색상 구분을 제거하고 실제 기술자료에 가까운 흑백 도면 스타일로 표시

이번 버전
1. 이미지 위
   - 번호 원형 마커
   - 흑백 지시선
   - 30/60/90도 및 지시선 시작 위치 유지
   - 이미지 위 명칭 라벨은 제거
2. 하단 설명
   - '1. HANGER BOLT' 형태
   - 1/2/3/4열 선택
   - 열 배치는 세로 우선 (8개 + 2열이면 1~4 / 5~8)
   - Arial Narrow 계열의 도면형 글꼴
3. 하단 박스 설정
   - 영역 높이
   - 글자 크기
   - 줄 간격
   - 열 간격
   - 왼쪽 위치 %
   - 위쪽 위치 %
   - 박스 너비 %
   - 추가 설명 표시 여부
4. 편집 모드
   - 선택 항목만 단일 파란색 강조 (항목별 색상 구분 아님)
   - VIEW에서는 모두 흑백

DB
- 기존 annotations 배열은 그대로 유지
- layout_settings JSON 컬럼만 추가
- 기존 데이터는 자동 기본 레이아웃 적용
- 기존 v52.48.5.32 save RPC는 유지
- 신규 save_unit_price_technical_sheet RPC 추가

적용
node release_v52.48.5.34/apply-v52.48.5.34-technical-sheet-v2.cjs

그 다음 Supabase SQL Editor에서:
supabase/v52.48.5.34_unit_price_technical_sheet_v2.sql
전체 실행

빌드:
npm.cmd run build

배포 대상:
src/page/UnitPriceAnalysis.jsx
src/utils/technicalImageSheetEditor.js
supabase/v52.48.5.34_unit_price_technical_sheet_v2.sql
