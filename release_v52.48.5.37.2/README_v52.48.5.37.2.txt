v52.48.5.37.2 - VIEW 번호/명칭 클릭 부속자재 표시 수정

원인
- VIEW에서 번호나 하단 명칭에 마우스를 올릴 때 setHover()가
  renderOverlay()/renderCaption()을 호출해 해당 DOM을 즉시 새로 생성하고 있었음.
- mouseenter 직후 클릭 대상 요소 자체가 교체되면서 click 이벤트가 유실될 수 있었음.
- 그 결과 번호는 파란색으로 강조되어 '선택된 것처럼' 보이지만
  실제 selectAnnotation()이 실행되지 않아 우측 상세 부속자재가 표시되지 않았음.
- 전체보기는 별도 버튼 이벤트라 정상 동작하고 있었음.

수정
- hover 시 DOM을 재생성하지 않고 class만 갱신
- 번호 클릭 / 하단 명칭 클릭 이벤트를 안정적으로 유지
- 클릭 시 전체보기 모드를 해제하고 해당 항목의 연결자료만 표시
- 연결된 첫 부속자재를 작은 상세 미리보기로 즉시 표시
- 과거 연결자료는 annotation_id/번호 외에 명칭 일치로도 보조 매칭
- 기존 전체보기 리스트/작은 미리보기/편집기 기능 유지

SQL 변경 없음.

적용:
node release_v52.48.5.37.2/apply-v52.48.5.37.2-view-click-accessory-fix.cjs

배포 대상:
src/utils/technicalImageSheetEditor.js
