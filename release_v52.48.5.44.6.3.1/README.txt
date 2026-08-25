v52.48.5.44.6.3.1
필로티 X 모서리 정합 보정

변경 파일
- src/BuildingGrid.jsx

문제
- 골구도 셀을 34x18 -> 41x22px로 확대한 뒤
  필로티 X가 CSS의 고정 길이 선 + rotate 방식이라
  X 끝점이 셀의 네 모서리와 정확히 맞지 않았음.

수정
- 고정 길이/회전 방식 제거
- 셀 내부에 SVG를 100% 크기로 배치
- 대각선 1: 좌상단 -> 우하단
- 대각선 2: 우상단 -> 좌하단
- preserveAspectRatio="none" 사용
- span이 1보다 큰 필로티 셀도 실제 박스 비율에 맞춰 자동으로 대각선이 늘어남
- vectorEffect="non-scaling-stroke"로 선 두께는 1px 유지

유지
- 골구도 셀 41x22px
- 타입 윤곽선
- 타입 글자색 연동
- 1층 수평 정렬
- 예외타입 압축
- SQL 변경 없음

적용:
node release_v52.48.5.44.6.3.1/apply-v52.48.5.44.6.3.1-piloti-x-corners.cjs
