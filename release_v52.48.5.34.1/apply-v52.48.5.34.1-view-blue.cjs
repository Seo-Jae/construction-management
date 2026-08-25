const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.34.1';
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
  const current = fs.readFileSync(TARGET, 'utf8');

  if (!current.includes('기술자료 편집기 v2')) {
    fail('현재 technicalImageSheetEditor.js가 v52.48.5.34 기준과 다릅니다. 기존 변경 보호를 위해 교체하지 않았습니다.');
  } else if (current.includes('stroke: #2563eb; stroke-width: .78')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(ROOT, `backup_${VERSION}_${stamp}`, 'src', 'utils');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(
      TARGET,
      path.join(backupDir, 'technicalImageSheetEditor.js'),
    );

    fs.copyFileSync(REPLACEMENT, TARGET);

    console.log(`[${VERSION}] 적용 완료`);
    console.log('- 교체: src/utils/technicalImageSheetEditor.js');
    console.log('- VIEW 지시선: 통일 파란색 #2563eb');
    console.log('- VIEW 번호 원/번호 글자: 통일 파란색 #2563eb');
    console.log('- VIEW 부재 위치 점: 통일 파란색 #2563eb');
    console.log('- 하단 명칭/레이아웃/편집기/DB 기능은 변경하지 않음');
    console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
  }
}
