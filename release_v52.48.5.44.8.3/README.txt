v52.48.5.44.8.3
계약품목 공정연결 182건 -> 91건 의미상 완전중복 정리

원인
- 동일한 91개가 서로 다른 source_key로 두 번 저장됨
- semantic-occurrence 91개: 기존 공정연결 보유
- new-contract 91개: 새 표준양식에서 생성
- 기존 sync_progress_contract_master_v1에 기존행 교체와 동시실행 잠금이 없음

처리
- new-contract 91개를 유지
- 기존 공정연결을 유지행으로 병합
- 삭제 91개를 JSON 백업
- 다른 현장/계약버전은 변경하지 않음
- 이후 업로드는 기존 계약품목을 현재 파일로 교체
- source_key 변경 시에도 동일 품목 기준 공정연결 승계
- 동시 업로드 잠금 및 UNIQUE INDEX 유지

적용 순서
1. node release_v52.48.5.44.8.3/apply-v52.48.5.44.8.3-contract-item-semantic-dedupe.cjs
2. npm run build
3. git add . / commit / push
4. Supabase에서 supabase/v52.48.5.44.8.3_contract_item_semantic_dedupe.sql 전체 실행
5. 마지막 결과가 91 / 91 / 91 / 0인지 확인
6. F5 후 계약품목 공정연결 전체 91개 확인
