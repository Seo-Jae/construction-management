v52.48.5.44.1 - 현장관리 동별 호별 타입

변경 파일
- src/page/ProjectManagement.jsx

주요 변경
- 현장관리의 각 동 카드에 '호별 타입' 입력 영역 추가
- 기준 호수/층 수에 따라 1호 ~ N호 타입 입력칸 자동 생성
- 예: 1호=84A, 2호=84B, 3호=59A
- 저장 위치: building_settings.config_json.unitTypes
  예: {"1":"84A","2":"84B","3":"59A"}
- 기존 현장도 '구조 수정' 후 타입 입력/수정 가능
- 기존 aliasUnits, exceptions 등 config_json의 다른 고급설정은 그대로 보존
- SQL 변경 없음: 기존 admin_save_project_v1 RPC가 config_json 전체를 저장하므로 그대로 사용

적용
node release_v52.48.5.44.1/apply-v52.48.5.44.1-project-unit-types.cjs

주의
- 타입은 '동별 호 라인' 기준입니다.
- 층마다 같은 호의 타입이 달라지는 특수현장은 이번 버전 범위가 아닙니다.
