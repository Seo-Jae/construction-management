const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.65';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/config/guideCatalog.js',
    expected: ['c72321ad1d83f43f680e3986888cd387e335274d142eba67d1624ff7a2c00809'],
    updated: '8bfac934029d17c5e2e0c2bf895f697c68f0abac8a7be3efe805627f6d51dda8',
  },
  {
    rel: 'src/utils/guideAnnotationEditor.js',
    expected: ['6278884076045d2d260503a516f9fee549234519fc87445433ca8b4f92d561ab'],
    updated: '8399008fa82e8c9c12104735fd870741e6cc9f0f7d12faa7d3caa26842a49f52',
  },
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['134320bf21b9a43583f10f9296cff94275ccc303bdf315ef54960b4742ebde0c'],
    updated: 'b0fd5e6d5408fb9db716a6fa4e8e1ba1a1298e63a9f4b71756e0a2352f88ea9e',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['7ae43cf25d9c991e2daaf11ea2f362110864906afe9c3b6e97158e68a3277a5a'],
    updated: 'a63a84a9caa953e007265c6e3049f9d414ba2253d7eacc4acc6969251f558192',
  },
  {
    rel: 'src/page/Guide.jsx',
    expected: ['2bb1236af99135deb7751e5042780601099c0c1c7f668634095049aea551e1e7'],
    updated: '84d048331e84a06ecd628057279280d5cf073b04d26ccae8f2552e603e17aede',
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
  if (hash(target) === item.updated) { console.log(`[이미 적용됨] ${item.rel}`); continue; }
  if (!backedUp) { fs.mkdirSync(backupDir, { recursive: true }); backedUp = true; }
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
console.log('- 번호 숨김 상태를 showNumber=false + hideNumber=true + number=0으로 중복 보존합니다.');
console.log('- 편집 화면, 가이드 설정 미리보기, 실제 공개 가이드가 동일한 번호 표시 판정을 사용합니다.');
console.log('- 기존 번호 숨김 데이터도 다시 정규화하면 number=0 상태로 보강됩니다.');
console.log('- 적용 후 해당 가이드에서 “공개”를 한 번 다시 눌러 공개본을 갱신해주세요.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
