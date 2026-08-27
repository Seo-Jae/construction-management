const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.57';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['53952c8dc95e1e0683dd580d37cdcdf17bdd27485c4fdfbf448828fcdb75970d'],
    updated: '2a232d9b036bfdb4cfa2674c284d67d9d6e2e9de62b3d84983d26f150ed137fb',
  },
  {
    rel: 'src/utils/guideAnnotationEditor.js',
    expected: ['797aab4f58d832c9d67527a773ad0504f505fa4269f88741db0bd67f9eca9d43'],
    updated: 'aa710112724f4fda37ebf274eac0b854efbce13cf4e18d6ae77ce9a1d6b465c9',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['7cdcf16ced6282ed419c5302f9b64a10bafbc941fb88ccb55bf40f4577e56be6'],
    updated: '99d357fa63f60e261f31d994e10e3a999ce5aefd8b1d95424a311477e0834bfa',
  },
];

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const backupDir = path.join(root, `backup_${VERSION}_${new Date().toISOString().replace(/[:.]/g, '-')}`);
let backedUp = false;

for (const item of targets) {
  const target = path.join(root, item.rel);
  const source = path.join(filesDir, item.rel);
  if (!fs.existsSync(source)) throw new Error(`패치 파일 누락: ${item.rel}`);
  if (!fs.existsSync(target)) throw new Error(`대상 파일 누락: ${item.rel}`);
  const current = hash(target);
  if (current === item.updated) continue;
  if (!item.expected.includes(current)) {
    console.error(`\n[적용 중단] ${item.rel} 내용이 예상 기준 버전과 다릅니다.`);
    console.error(`현재 SHA256: ${current}`);
    console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
    process.exit(1);
  }
}

for (const item of targets) {
  const target = path.join(root, item.rel);
  const source = path.join(filesDir, item.rel);
  if (hash(target) === item.updated) {
    console.log(`[이미 적용됨] ${item.rel}`);
    continue;
  }
  if (!backedUp) {
    fs.mkdirSync(backupDir, { recursive: true });
    backedUp = true;
  }
  const backup = path.join(backupDir, item.rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (hash(target) !== item.updated) throw new Error(`적용 후 검증 실패: ${item.rel}`);
  console.log(`[적용 완료] ${item.rel}`);
}

console.log(`\n${VERSION} 적용 완료.`);
if (backedUp) console.log(`원본 백업: ${path.relative(root, backupDir)}`);
console.log('추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
