v52.48.5.44 최고관리자 현장관리

적용 내용
- 최고관리자 전용 좌측 메뉴 "현장관리" 추가
- 시스템 내부에서 신규 현장 + 동별 구조 등록
- 동별 최고층 / 기준 호수/층 / 필로티층 / 예외층 입력
- 기존 현장은 조회 기본, 구조수정 버튼을 눌러야 편집 가능
- 기존 현장명/기존 동명/기존 동 삭제는 과거 데이터 보호를 위해 차단
- 기존 config_json의 aliasUnits 등 고급설정은 구조 수정 후에도 보존
- 저장 즉시 상단 현장목록 재조회 이벤트 발생
- 일반 사용자는 기존 회원관리에서 새 현장을 배정

필수
1) 패키지 적용
2) npm.cmd run build
3) supabase/v52.48.5.44_project_management.sql 을 Supabase SQL Editor에서 전체 1회 실행
4) Git commit/push

변경 파일
- src/Dashboard.jsx
- src/components/Sidebar.jsx
- src/page/ProjectManagement.jsx (신규)
- supabase/v52.48.5.44_project_management.sql (신규)
