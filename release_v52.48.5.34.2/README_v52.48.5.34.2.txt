v52.48.5.34.2 - 기술자료 이미지 업로드 Invalid key 수정

오류
Invalid key: Clip_Bar천정/technical-image

원인
- 기존 코드가 Supabase Storage 저장 경로에 image_key의 한글을 그대로 사용함.
- DB의 image_key는 한글을 포함해도 문제없지만 Storage object key에는 안전한 ASCII 경로를 사용해야 함.

수정 방식
- DB image_key: 기존 'Clip_Bar천정' 그대로 유지
- Storage 경로만 UTF-8 HEX 기반 ASCII 문자열로 변환
- 예: Clip_Bar천정 -> key-<UTF8 HEX>/technical-image
- 영문/숫자/_/- 로만 구성된 기존 키는 기존 Storage 경로를 그대로 사용
- 기술자료 지시선/하단설명/VIEW/권한/일위대가 기능 변경 없음
- SQL 실행 없음

적용:
node release_v52.48.5.34.2/apply-v52.48.5.34.2-storage-key-fix.cjs

배포 대상:
src/page/UnitPriceAnalysis.jsx
