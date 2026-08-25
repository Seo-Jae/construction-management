const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.37.2';
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

  if (current.includes('// v52.48.5.37.2')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else if (
    !current.includes('// v52.48.5.37 VIEW 선택연동 + 직관적 부속자재 연결 UI')
    || !current.includes('function setHover(id)')
    || !current.includes('function selectAnnotation(id)')
  ) {
    fail(
      '현재 technicalImageSheetEditor.js가 v52.48.5.37.1 기준과 다릅니다. '
      + '기존 변경을 보호하기 위해 자동 교체하지 않았습니다.',
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
    console.log('- 수정: VIEW 번호/하단 명칭 클릭 이벤트 유실 문제');
    console.log('- 수정: 1번 등 항목 클릭 시 해당 부속자재 즉시 표시');
    console.log('- 유지: hover 강조 효과');
    console.log('- 보강: 과거 연결자료의 명칭 기반 보조 매칭');
    console.log('- 유지: 전체보기 리스트 + 작은 미리보기');
    console.log('- SQL 실행 없음');
    console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
  }
}
