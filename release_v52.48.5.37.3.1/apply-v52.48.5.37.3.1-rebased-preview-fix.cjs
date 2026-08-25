const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.37.3.1';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const REPLACEMENT = path.join(
  __dirname,
  'files',
  'src',
  'utils',
  'technicalImageSheetEditor.js',
);

const ALLOWED_BASELINES = new Set([
  'dcc8b3e3e2c167cb9694e06fd9edefbe80757e21', // v52.48.5.37.1 - 현재 GitHub main 확인 기준
  '38ba5c0c149ceae84a646b4ef1c256501fbd417a', // v52.48.5.37.2 - 이미 로컬 적용된 경우도 허용
]);

const TARGET_BLOB_SHA = '02e9c06895bc4ff05e9204a9cf9b89375fc9dbde';

function gitBlobSha(buffer) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length}\0`, 'utf8'))
    .update(buffer)
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
  const currentBuffer = fs.readFileSync(TARGET);
  const currentSha = gitBlobSha(currentBuffer);

  if (currentSha === TARGET_BLOB_SHA) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
    console.log(`- 현재 파일 해시: ${currentSha}`);
  } else if (!ALLOWED_BASELINES.has(currentSha)) {
    fail(
      '현재 technicalImageSheetEditor.js가 확인된 v52.48.5.37.1 또는 '
      + 'v52.48.5.37.2 기준과 다릅니다.\n'
      + `현재 파일 해시: ${currentSha}\n`
      + '기존 변경 보호를 위해 자동 교체하지 않았습니다.'
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

    const appliedSha = gitBlobSha(fs.readFileSync(TARGET));
    if (appliedSha !== TARGET_BLOB_SHA) {
      fail(
        '교체 후 파일 검증에 실패했습니다. 백업 파일은 유지되어 있습니다.'
      );
    } else {
      console.log(`[${VERSION}] 적용 완료`);
      console.log(`- 적용 전 기준 해시: ${currentSha}`);
      console.log(`- 적용 후 해시: ${appliedSha}`);
      console.log('- 포함: v52.48.5.37.2 번호/명칭 클릭 안정화');
      console.log('- 포함: v52.48.5.37.3 상세 부속자재 미리보기 확대');
      console.log('- 선택항목 상세이미지 250px 제한 제거');
      console.log('- 가능한 경우 외곽 흰 여백 VIEW 자동 최소화');
      console.log('- 전체보기의 compact 미리보기 유지');
      console.log('- SQL 실행 없음');
      console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
    }
  }
}
