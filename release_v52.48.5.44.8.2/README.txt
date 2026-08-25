v52.48.5.44.8.2
기성내역서작성 91건 / 계약품목 공정연결 182건 중복 정리

핵심
- 계약품목 공정연결은 progress_contract_items를 그대로 조회
- 동일 contract_version_id + 동일 source_key는 확정 중복으로 정리
- 삭제 전 JSON 백업
- process_type 공정연결값은 합쳐서 보존
- UNIQUE INDEX 생성으로 같은 계약버전/source_key 재중복 방지
- 화면에서도 동일 source_key 중복은 즉시 1건으로 표시

SQL 실행 후 마지막 결과:
duplicate_group_count = 0
remaining_duplicate_rows = 0

그 후 F5하여
기성내역서작성 91건 / 계약품목 공정연결 91건인지 확인

만약 SQL 실행 후에도 계약품목 공정연결이 91건보다 많으면
source_key가 서로 다른 '의미상 중복'이 남은 것이므로
그때는 2단계 의미상 중복 진단/정리로 진행.
