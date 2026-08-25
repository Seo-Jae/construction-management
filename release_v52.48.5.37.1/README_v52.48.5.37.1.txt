v52.48.5.37.1 - 기술자료 편집기 전체 먹통 긴급복구

원인
- v52.48.5.37의 기술자료 편집기 내부 <script>에서
  부속자재 삭제 확인문구의 줄바꿈이 실제 JavaScript 문자열 내부의 생줄바꿈으로 생성됨.
- 브라우저가 해당 <script> 전체를 SyntaxError로 중단하여
  화면 HTML은 열리지만 render()와 모든 이벤트 등록이 실행되지 않았음.
- 그래서 등록 항목은 기본값 0으로 보이고 지시선/번호/버튼/탭이 전부 먹통처럼 보였음.

수정
- 팝업 내부 스크립트에서 줄바꿈이 안전한 \n escape로 생성되도록 이중 이스케이프 적용.
- 다른 v52.48.5.37 기능은 그대로 유지.
- SQL/DB 변경 없음.

적용
node release_v52.48.5.37.1/apply-v52.48.5.37.1-editor-script-hotfix.cjs

배포 대상
src/utils/technicalImageSheetEditor.js
