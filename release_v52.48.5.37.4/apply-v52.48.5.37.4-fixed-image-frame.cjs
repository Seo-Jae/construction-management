const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.37.4';
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

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
} else if (!fs.existsSync(REPLACEMENT)) {
  fail('교체파일을 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
} else {
  const current = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');

  if (current.includes('v52.48.5.37.4 기술자료 이미지 고정 프레임')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else if (
    !current.includes('v52.48.5.37 VIEW 선택연동 + 직관적 부속자재 연결 UI')
    || !current.includes('v52.48.5.37.3')
    || !current.includes("function selectAnnotation(id)")
    || !current.includes("const editorHtml =")
  ) {
    fail(
      '현재 technicalImageSheetEditor.js가 확인된 v52.48.5.37 계열 기준과 다릅니다. '
      + '기존 변경을 보호하기 위해 자동 교체하지 않았습니다.'
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

    const beforeHash = sha256(TARGET);
    fs.copyFileSync(REPLACEMENT, TARGET);
    const afterHash = sha256(TARGET);
    const expectedHash = sha256(REPLACEMENT);

    if (afterHash !== expectedHash) {
      fail('교체 후 파일 검증에 실패했습니다. 백업 파일은 유지되어 있습니다.');
    } else {
      console.log(`[${VERSION}] 적용 완료`);
      console.log(`- 적용 전 SHA256: ${beforeHash}`);
      console.log(`- 적용 후 SHA256: ${afterHash}`);
      console.log('- VIEW 도면 영역을 3:2 고정 박스로 통일');
      console.log('- 세로/가로 이미지 모두 원본비율 유지하며 자동 축척 맞춤');
      console.log('- 이미지가 박스를 넘지 않고 중앙 정렬');
      console.log('- 지시선/번호 좌표는 실제 이미지 영역 기준으로 유지');
      console.log('- 지시선 편집기도 동일한 고정 박스/자동 축척 적용');
      console.log('- 기존 부속자재/VIEW/지시선/하단 설명/DB 기능 유지');
      console.log('- SQL 실행 없음');
      console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
    }
  }
}
