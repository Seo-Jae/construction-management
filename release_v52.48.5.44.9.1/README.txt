v52.48.5.44.9.1 긴급 수정

증상
- 공정별 노임작성 진입 시 normalizeText is not defined 오류로 사이트 화면 중단

원인
- v52.48.5.44.9에서 추가한 계약품목 검색이 현재 파일에 존재하지 않는 normalizeText 함수를 호출

수정
- 계약품목 검색 전용 normalizeContractSearchText 함수 추가
- 잘못된 normalizeText 호출 2곳 교체
- index.html이 있는 실제 프로젝트에서는 mobile-web-app-capable 권장 메타를 자동 추가

적용
node release_v52.48.5.44.9.1/apply-v52.48.5.44.9.1-normalize-hotfix.cjs
npm run build

새로 실행할 Supabase SQL은 없습니다.

