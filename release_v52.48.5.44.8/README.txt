v52.48.5.44.8
현장관리 시작일/종료일 -> Dashboard/Main 연동

변경 파일
- src/page/ProjectManagement.jsx
- src/page/MainDashboard.jsx
- src/page/AdminDashboard.jsx

핵심
- 현장관리에서 시작일 / 종료일 지정
- 기존 현장은 [현장정보·구조 수정] 버튼에서 수정
- 새 현장은 시작일/종료일 필수
- 종료일이 시작일보다 빠르면 저장 차단
- 날짜는 기존 building_settings.config_json에 저장
  projectStartDate = YYYY-MM-DD
  projectEndDate   = YYYY-MM-DD

Main
- 기존 PROJECT_SCHEDULES 고정값만 쓰던 구조를 변경
- building_settings에서 현재 현장 공사기간 직접 조회
- 현장관리 저장 이벤트 수신 시 즉시 다시 조회
- 진행률 카드의 시작일 / 종료일에 적용
- 기존 3개 현장은 현장관리에서 아직 저장하지 않았어도 기존 날짜를 fallback으로 유지

전체 현장 Dashboard
- 이미 조회 중인 building_settings.config_json에서 각 현장 시작일/종료일 확인
- 카드의 시작일 / 종료일에 반영
- 종료일 기준 D-Day 계산
- 시작일 기준 현장 정렬에 반영
- 저장된 일정이 없으면 '일정 미등록'

SQL
- 없음
- 별도 테이블/컬럼을 만들지 않고 기존 현장마스터인 building_settings.config_json 사용
- 기존 현장/회원가입/회원관리 연동 구조를 건드리지 않음

테스트
1. 현장관리 > 기존 현장 선택
2. [현장정보·구조 수정]
3. 시작일 / 종료일 입력 후 [변경 저장]
4. Main 진입 -> 진행률 카드 시작일/종료일 확인
5. 전체 현장 Dashboard -> 시작일/종료일/D-Day 확인
