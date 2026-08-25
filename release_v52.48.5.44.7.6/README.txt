v52.48.5.44.7.6
기성내역서작성 삭제 <-> 계약품목 공정연결 완전 초기화

확인된 원인
1. 기존 삭제 RPC는 삭제한 회차의 contract_version_id '한 개'만 검사했습니다.
2. progress_contract_versions에는 같은 현장 + 같은 version_label(예: 최초계약)이
   과거 저장과정에서 중복으로 남을 수 있습니다.
3. 따라서 회차가 삭제돼도 다른 id의 '최초계약' 버전과 progress_contract_items가 남았습니다.
4. 기성 양식 다운로드는 version_label 조건 뒤 limit(1)만 사용하여
   남아 있는 과거 버전을 다시 가져올 수 있었습니다.
5. 계약품목 공정연결 역시 progress_contract_items를 직접 읽으므로
   남은 품목/공정연결이 화면에 그대로 표시됐습니다.

v7.6 수정 규칙
- 삭제 기준: contract_version_id 1개 -> 현장 + 계약버전명 전체
- 같은 계약버전명을 사용하는 등록 기성 회차가 0건이 되면
  그 현장/계약버전명의 progress_contract_items 전체 삭제
- progress_contract_items.process_type도 같이 없어지므로
  계약품목 공정연결도 완전 초기화
- progress_contract_versions 중 사용되지 않는 같은 이름 버전도 함께 삭제

현재 이미 남아 있는 자료
- SQL 실행 시 1회 repair 수행
- 등록된 기성 회차가 0건인 현장+계약버전명의 orphan 계약자료를 정리
- matching work draft가 있으면 해당 계약버전은 보존

추가 보정
- 기성 양식 다운로드: 같은 계약버전명이 여러 개여도 최신 created_at 우선
- 전회차가 같은 계약버전을 실제 사용했다면 그 contract_version_id를 우선
- 계약품목 공정연결: 같은 version_label 중복 표시 제거, 최신 1개만 표시

적용 파일
- src/page/ProgressClaimManagement.jsx
- src/page/ContractItemProcessMapping.jsx
- supabase/v52.48.5.44.7.6_claim_contract_delete_linkage.sql

적용 후 테스트
1. SQL 실행
2. F5
3. 등록된 기성 회차가 이미 0건이라면
   - 계약품목 공정연결에 잔여 품목이 없어야 함
   - 기성 양식 다운로드 시 빈 최초계약 양식이 내려와야 함
4. 다시 양식 업로드 -> 계약품목 공정연결 즉시 생성
5. 회차 저장
6. 그 회차 삭제
7. 마지막 회차였다면 계약품목 공정연결도 같이 0건
8. 다시 다운로드 -> 빈 최초계약 양식
