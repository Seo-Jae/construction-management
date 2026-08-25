const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.34.2';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
} else {
  let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');

  const OLD = `const normalizeTechnicalImageStorageKey = (value) => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');
  return normalized || 'technical-image';
};`;

  const NEW = `// v52.48.5.34.2 Supabase Storage object key는 ASCII 안전 문자열만 사용합니다.
// image_key 자체(DB 연결키)는 기존 한글 값을 그대로 유지하고,
// Storage에 파일을 저장할 때의 경로만 UTF-8 HEX로 변환합니다.
const normalizeTechnicalImageStorageKey = (value) => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim();

  if (!normalized) return 'technical-image';

  // 기존 영문/숫자/_/- 키는 경로를 바꾸지 않아 기존 Storage 파일과 호환합니다.
  if (/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    return normalized;
  }

  // 한글 등 Storage key에서 허용되지 않는 문자가 하나라도 있으면
  // UTF-8 바이트를 HEX로 변환해 완전한 ASCII 경로로 만듭니다.
  const bytes = new TextEncoder().encode(normalized);
  const hex = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

  return \`key-\${hex}\`;
};`;

  if (source.includes('// v52.48.5.34.2 Supabase Storage object key는 ASCII 안전 문자열만 사용합니다.')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else if (!source.includes(OLD)) {
    fail(
      '현재 src/page/UnitPriceAnalysis.jsx의 Storage key 코드가 예상 기준과 다릅니다. '
      + '기존 변경을 보호하기 위해 자동 교체하지 않았습니다.',
    );
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(
      ROOT,
      `backup_${VERSION}_${stamp}`,
      'src',
      'page',
    );

    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(
      TARGET,
      path.join(backupDir, 'UnitPriceAnalysis.jsx'),
    );

    source = source.replace(OLD, NEW);
    fs.writeFileSync(TARGET, source, 'utf8');

    console.log(`[${VERSION}] 적용 완료`);
    console.log('- 교체: src/page/UnitPriceAnalysis.jsx');
    console.log('- DB image_key는 기존 값 유지');
    console.log('- Supabase Storage 경로만 ASCII 안전 키로 변환');
    console.log('- 한글 포함 예: Clip_Bar천정 -> key-<UTF8 HEX>/technical-image');
    console.log('- 기존 영문/숫자/_/- Storage 경로는 그대로 유지');
    console.log('- SQL 변경 없음');
    console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
  }
}
