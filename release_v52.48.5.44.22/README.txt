v52.48.5.44.22 옵션별 비교 기본 UI 업데이트

1. 이 폴더를 프로젝트 최상위 폴더에 둡니다.
2. PowerShell에서 프로젝트 폴더로 이동합니다.
3. 아래 명령을 순서대로 실행합니다.

node .\release_v52.48.5.44.22\apply-v52.48.5.44.22-option-comparison-layout.cjs
npm run build
git add src/page/OptionManagementOverview.jsx
git commit -m "feat: add option comparison layout v52.48.5.44.22"
git push origin main

Supabase SQL 실행은 필요하지 않습니다.
