v52.48.5.44.7.4
기성 회차 삭제 후 계약품목 잔여데이터까지 정리

원인
- v52.48.5.44.7.3은 progress_claims 회차/하위자료만 삭제
- progress_contract_versions / progress_contract_items는 보존
- 기성 양식 다운로드는 progress_contract_items를 읽으므로 삭제한 내역이 다시 따라옴
- 그 상태에서 재업로드하면 중복 누적 가능

수정
- 삭제한 회차가 사용하던 계약버전을 다른 등록회차가 더 이상 사용하지 않을 때만 검사
- 그 계약품목 전체 source_key가 new-contract:% 형식이면
  우리 표준 최초계약 양식에서 생성된 데이터로 판단하여
  progress_contract_items + progress_contract_versions까지 함께 삭제
- 다른 회차가 쓰는 계약원본은 유지
- 기존 외부 계약원본은 유지

이미 v7.3으로 회차만 지운 현재 상태
- 이 SQL을 실행하는 순간
  등록회차에서 참조하지 않는 new-contract:% 전용 orphan 계약원본을 1회 자동 정리
- 따라서 다시 회차를 만들었다가 삭제할 필요 없음

적용 후 확인
1. Supabase SQL Editor에서
   supabase/v52.48.5.44.7.4_progress_claim_delete_cleanup.sql 전체 실행
2. 시스템 F5
3. 기성 양식 다운로드
4. 현재 잔여 orphan 데이터가 정리되었다면 빈 최초계약 양식이 내려오면 정상
