v52.48.5.44.15 적용 패키지입니다.

1. 이 release_v52.48.5.44.15 폴더를 프로젝트 최상위 폴더에 복사합니다.
2. PowerShell에서 프로젝트 최상위 폴더로 이동합니다.
3. 아래 명령을 실행합니다.

   node .\release_v52.48.5.44.15\apply-v52.48.5.44.15-insulation-option-summary.cjs

4. npm run build로 확인한 뒤 커밋·푸시합니다.

이 적용기는 v52.48.5.44.14 원본 해시를 먼저 확인하고, 기존 파일을
backup_v52.48.5.44.15_날짜 폴더에 백업한 다음 변경 파일을 적용합니다.
새 파일 optionTypeSummary.js가 이미 다른 내용으로 존재하면 안전을 위해 중단합니다.

이번 버전에서 새로 실행할 Supabase SQL은 없습니다.

