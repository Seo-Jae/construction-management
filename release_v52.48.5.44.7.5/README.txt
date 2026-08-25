v52.48.5.44.7.5
기성내역서작성 <-> 계약품목 공정연결 연동 보완

문제 원인
1. 지정 표준양식을 '업로드'하는 단계는 React 화면의 items 상태만 바꾸고,
   DB의 progress_contract_items는 회차 저장 과정에 의존하고 있었습니다.
   따라서 업로드 직후 계약품목 공정연결로 가면 새 품목이 바로 보이지 않았습니다.

2. 계약품목 공정연결의 구분 표시가
   housing_type || classification 순서였습니다.
   그래서 classification을 세대/공용으로 수정해도 예전 housing_type이 남아 있으면
   수정한 구분이 화면에 우선 적용되지 않을 수 있었습니다.

3. 계약품목 공정연결 자체는 별도 매핑 테이블이 아니라
   progress_contract_items.process_type을 사용합니다.
   따라서 기성 삭제 시 표준 contract items가 삭제되면 공정연결 자료도 함께 없어져야 합니다.
   v7.5에서는 화면 갱신 이벤트까지 연결합니다.

수정
- 표준양식 업로드 성공 즉시 sync_progress_contract_master_v1 RPC 호출
- 최초계약 버전이 없으면 생성
- 기존 버전이면 현재 업로드한 품목으로 완전 동기화
- 같은 source_key의 기존 process_type / mapped_by_name / mapped_at 보존
- 삭제된 Excel 행은 계약품목에서도 제거
- 다시 업로드해도 아래로 중복 쌓이지 않음
- classification / housing_type을 최신 '구분'값으로 갱신
- 계약품목 공정연결 화면은 classification 우선
- 타입 / 타입·공구 문구를 구분으로 통일
- 기성 업로드/삭제 이벤트를 받으면 계약품목 공정연결 화면 즉시 재조회
- 공정연결 저장 이벤트도 다른 연동 화면이 사용할 수 있도록 발행

적용 파일
- src/page/ProgressClaimManagement.jsx
- src/page/ContractItemProcessMapping.jsx
- supabase/v52.48.5.44.7.5_claim_contract_master_sync.sql

중요
- v52.48.5.44.7.4 SQL은 그대로 유지되어야 합니다.
- 추가로 v52.48.5.44.7.5_claim_contract_master_sync.sql을 Supabase SQL Editor에서 1회 실행합니다.

검증 순서
1. 최초계약 빈양식 다운로드
2. B열 구분에 세대/공용 입력
3. 품목 입력 후 기성 양식 업로드
4. 저장 버튼을 누르기 전 계약품목 공정연결 메뉴 확인
   -> 즉시 품목이 보여야 함
   -> 구분은 세대/공용으로 보여야 함
5. Excel B열 또는 품목을 수정해 다시 업로드
   -> 중복 추가가 아니라 기존 계약버전 내용이 갱신되어야 함
6. 등록 회차 삭제
   -> 마지막 사용회차이며 표준양식 계약원본이면 계약품목 공정연결에서도 제거
