v52.48.5.44.3 - 신규 현장 호별 타입 공정진척 표시 연동

원인
- 기존 공정진척 화면은 project_unit_types 테이블만 읽어서 하단 타입(84A, 68A 등)을 표시함.
- 새 현장관리에서 입력한 타입은 building_settings.config_json.unitTypes / floorUnitTypes에 저장됨.
- 따라서 새 현장은 타입을 입력해도 공정진척 하단에 표시되지 않았음.

수정
- BuildingGrid가 config_json의 unitTypes/floorUnitTypes를 직접 읽음.
- 신규 현장 타입정보가 있으면 새 현장관리 데이터를 우선 사용.
- 기존 현장처럼 config_json 타입정보가 없는 현장은 project_unit_types를 그대로 사용.
- 층별 타입 예외(펜트하우스 등)도 타입 집계에 반영.
- 하단에는 해당 호 라인에서 가장 많이 사용되는 기본 타입이 표시됨.
  예: 2호가 대부분 68A이고 최상층만 120T이면 하단 표시는 68A 유지.
- SQL 변경 없음.

적용
node release_v52.48.5.44.3/apply-v52.48.5.44.3-building-grid-unit-types.cjs
