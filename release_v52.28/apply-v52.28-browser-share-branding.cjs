const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = path.join(ROOT, 'release_v52.28');

const FILES = [
  {
    target: path.join(ROOT, 'index.html'),
    source: path.join(RELEASE, 'index.html'),
    expected: '37abbb29a040139bdf1076e7783fead8021a58d2',
  },
  {
    target: path.join(ROOT, 'package.json'),
    source: path.join(RELEASE, 'package.json'),
    expected: 'd3077ef817d58662742d2f7ab520a6fa52688269',
  },
  {
    target: path.join(ROOT, 'package-lock.json'),
    source: path.join(RELEASE, 'package-lock.json'),
    expected: '92928396d63547dafcda4d2deceac53ec8e1db15',
  },
];

const ASSETS = [
  {
    target: path.join(ROOT, 'public', 'wooklim-favicon.png'),
    source: path.join(RELEASE, 'public', 'wooklim-favicon.png'),
  },
  {
    target: path.join(ROOT, 'public', 'wooklim-social-preview.png'),
    source: path.join(RELEASE, 'public', 'wooklim-social-preview.png'),
  },
];

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

function fail(message) {
  console.error('\n[v52.28 적용 중단]');
  console.error(message);
  process.exit(1);
}

for (const item of FILES) {
  if (!fs.existsSync(item.target)) {
    fail(`대상 파일을 찾을 수 없습니다: ${item.target}`);
  }
  if (!fs.existsSync(item.source)) {
    fail(`배포 파일을 찾을 수 없습니다: ${item.source}`);
  }
}

for (const item of ASSETS) {
  if (!fs.existsSync(item.source)) {
    fail(`배포 이미지 파일을 찾을 수 없습니다: ${item.source}`);
  }
}

const already =
  fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .includes('property="og:title" content="욱림건설 통합관리시스템"') &&
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    .includes('"name": "wooklim-construction-management"') &&
  fs.existsSync(path.join(ROOT, 'public', 'wooklim-favicon.png')) &&
  fs.existsSync(path.join(ROOT, 'public', 'wooklim-social-preview.png'));

if (already) {
  console.log('[v52.28] 이미 브라우저/공유 브랜딩이 적용된 상태입니다.');
  process.exit(0);
}

// Existing source protection
for (const item of FILES) {
  const actual = blobSha(fs.readFileSync(item.target));
  if (actual !== item.expected) {
    fail(
      `기존 기능 보호를 위해 적용하지 않았습니다.\n` +
      `${path.relative(ROOT, item.target)}\n` +
      `예상 Git blob SHA: ${item.expected}\n` +
      `현재 Git blob SHA: ${actual}`
    );
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.28_${stamp}`);

for (const item of FILES) {
  const backupTarget = path.join(
    backupDir,
    path.relative(ROOT, item.target)
  );
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.copyFileSync(item.target, backupTarget);
}

// Copy changed files
for (const item of FILES) {
  fs.copyFileSync(item.source, item.target);
}

for (const item of ASSETS) {
  fs.mkdirSync(path.dirname(item.target), { recursive: true });
  fs.copyFileSync(item.source, item.target);
}

// Post validation
const nextIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const nextPackage = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const nextLock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');

const required = [
  'href="/wooklim-favicon.png"',
  'property="og:title" content="욱림건설 통합관리시스템"',
  'property="og:site_name" content="욱림건설 통합관리시스템"',
  'wooklim-social-preview.png',
  '<title>욱림건설 통합관리시스템</title>',
];

for (const marker of required) {
  if (!nextIndex.includes(marker)) {
    fail(`index.html 적용 후 검증 실패: ${marker}`);
  }
}

if (!nextPackage.includes('"name": "wooklim-construction-management"')) {
  fail('package.json 프로젝트명 변경 검증 실패');
}

if (
  (nextLock.match(/"name": "wooklim-construction-management"/g) || []).length < 2
) {
  fail('package-lock.json 프로젝트명 변경 검증 실패');
}

console.log('\n[v52.28 적용 완료]');
console.log('- 브라우저 탭 보라색 번개 파비콘 제거');
console.log('- 욱림 빨간 로고 파비콘 적용');
console.log('- 페이지 제목: 욱림건설 통합관리시스템');
console.log('- URL 공유 Open Graph 제목/사이트명 적용');
console.log('- URL 공유 설명 및 대표 이미지 적용');
console.log('- package.json / package-lock.json의 프로젝트명 new 제거');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
