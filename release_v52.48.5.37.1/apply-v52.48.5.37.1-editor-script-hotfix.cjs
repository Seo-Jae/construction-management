const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.37.1';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const REPLACEMENT = path.join(
  __dirname,
  'files',
  'src',
  'utils',
  'technicalImageSheetEditor.js',
);

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
} else if (!fs.existsSync(REPLACEMENT)) {
  fail('교체파일을 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
} else {
  const current = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');

  if (current.includes('v52.48.5.37.1 편집기 스크립트 복구')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else if (
    !current.includes('// v52.48.5.37 VIEW 선택연동 + 직관적 부속자재 연결 UI')
    || !current.includes('공통 부속자재를 삭제하시겠습니까?\\n다른 명칭에서 연결한 내용도 함께 제거됩니다.')
  ) {
    fail(
      '현재 technicalImageSheetEditor.js가 v52.48.5.37 배포본과 다릅니다. '
      + '기존 변경 보호를 위해 자동 교체하지 않았습니다.',
    );
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(
      ROOT,
      `backup_${VERSION}_${stamp}`,
      'src',
      'utils',
    );

    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(
      TARGET,
      path.join(backupDir, 'technicalImageSheetEditor.js'),
    );

    fs.copyFileSync(REPLACEMENT, TARGET);

    console.log(`[${VERSION}] 적용 완료`);
    console.log('- 복구: 기술자료 편집기 내부 JavaScript 구문 오류');
    console.log('- 복구: 기존 지시선/번호/명칭 8개 표시 및 편집');
    console.log('- 복구: 지시선 추가/삭제/이동/각도/하단설명/저장');
    console.log('- 복구: 부속자재 연결 탭 및 연결 UI');
    console.log('- 유지: v52.48.5.37 VIEW/DB/부속자재 연결 개선');
    console.log('- SQL 실행 없음');
    console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
  }
}
