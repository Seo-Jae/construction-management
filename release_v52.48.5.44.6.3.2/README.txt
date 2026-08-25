v52.48.5.44.6.3.2
필로티 X 모서리 정합 - 안전 적용 수정판

이 버전을 사용하는 이유
- v52.48.5.44.6.3.1 적용 스크립트가 PilotiCell 전체 문자열을 완전일치 방식으로 찾았습니다.
- 실제 BuildingGrid.jsx의 CSS content 따옴표 표현과 적용 스크립트의 예상 문자열이 달라
  "적용 기준을 찾지 못했습니다: PilotiCell X 표시"로 안전 중단되었습니다.
- 소스 파일은 저장 전에 중단되었기 때문에 기존 코드가 훼손된 것은 아닙니다.

v52.48.5.44.6.3.2 변경
- 전체 문자열 완전일치 방식 제거
- "function PilotiCell({ span = 1 }) {" 시작점과
  "export default function BuildingGrid({" 사이만 정확히 찾아 함수 교체
- 다른 BuildingGrid 기능은 건드리지 않음

필로티 X
- CSS 고정 길이 + rotate 방식 제거
- SVG 대각선 사용
- 좌상 -> 우하
- 우상 -> 좌하
- 셀 크기/span과 무관하게 실제 네 모서리에 자동 정합
- 선 두께 1px 유지

SQL 변경 없음

적용:
node release_v52.48.5.44.6.3.2/apply-v52.48.5.44.6.3.2-piloti-x-safe.cjs
