const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.38';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const REPLACEMENT = path.join(
  __dirname,
  'files',
  'src',
  'utils',
  'technicalImageSheetEditor.js',
);

const BASELINE_SHA256 = '3907b268916bc2fe6eb78fd10a3fe0463d7d63195d6981709c1b0e3d65d0c0a4';
const TARGET_SHA256 = '0c6432a2398761247477409e38eee50e0da4a62eb83374b112fbe616e6a98878';

function normalizedSha256(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || '').replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');
}

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
  const currentHash = normalizedSha256(current);
  const replacement = fs.readFileSync(REPLACEMENT, 'utf8');
  const replacementHash = normalizedSha256(replacement);

  if (currentHash === TARGET_SHA256) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else if (
    currentHash !== BASELINE_SHA256
    && !(
      current.includes('v52.48.5.37.4')
      && current.includes('fitTechnicalImageCanvas')
      && current.includes('selectAnnotation(id)')
      && current.includes('openTechnicalSheetViewerWindow')
    )
  ) {
    fail(
      '현재 technicalImageSheetEditor.js가 v52.48.5.37.4 기준과 다릅니다. '
      + '기존 변경을 보호하기 위해 자동 교체하지 않았습니다.'
    );
  } else if (replacementHash !== TARGET_SHA256) {
    fail('패키지 교체파일 검증에 실패했습니다. ZIP을 다시 받아주세요.');
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

    const appliedHash = normalizedSha256(fs.readFileSync(TARGET, 'utf8'));
    if (appliedHash !== TARGET_SHA256) {
      fail('교체 후 파일 검증에 실패했습니다. 백업 파일은 유지되어 있습니다.');
    } else {
      console.log(`[${VERSION}] 적용 완료`);
      console.log('- 기술자료 상세보기: 마우스 휠 확대/축소');
      console.log('- 기술자료 상세보기: 좌클릭 드래그 이동');
      console.log('- 마우스 포인터 위치 중심 확대/축소');
      console.log('- 더블클릭 또는 화면 맞춤: 위치/배율 초기화');
      console.log('- 확대 범위: 50% ~ 500%');
      console.log('- 우측 상세 부속자재 패널은 고정');
      console.log('- 기존 번호/명칭 클릭, 부속자재 연결, 편집기 기능 유지');
      console.log('- SQL 실행 없음');
      console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
    }
  }
}
