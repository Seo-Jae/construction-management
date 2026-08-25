v52.48.5.33.1 적용 스크립트 오류 수정

원인:
- v52.48.5.33 적용 스크립트가 백업 폴더를
  backup_v52.48.5.33_.../src 까지만 생성하고
  실제 복사 대상인 /src/utils 폴더는 만들지 않아 ENOENT가 발생했습니다.

수정:
- backup_v52.48.5.33_.../src/utils 폴더까지 생성한 뒤
  technicalImageAnnotations.js를 백업하도록 수정했습니다.

중요:
- 이전 v52.48.5.33 실행은 백업 단계에서 중단되어
  src/utils/technicalImageAnnotations.js 수정 전 상태입니다.
- SQL 변경 없음.
- 기존 일위대가/권한/기술자료 데이터는 건드리지 않습니다.

실행:
node release_v52.48.5.33.1/apply-v52.48.5.33.1-annotation-angle-and-anchor-fix.cjs
