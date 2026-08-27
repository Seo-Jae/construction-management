const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.64';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/config/guideCatalog.js',
    expected: ['38ce8bcc307b4e4e46f0fc5aaa691afeaf9f296736e42b50afed51d1e0b5aa8b'],
    updated: 'c72321ad1d83f43f680e3986888cd387e335274d142eba67d1624ff7a2c00809',
  },
  {
    rel: 'src/utils/guideAnnotationEditor.js',
    expected: ['4b81107a4e444fbec743c6c4e7d4b87fd8e7e7bfc393ef6eff05a65e528805a1'],
    updated: '6278884076045d2d260503a516f9fee549234519fc87445433ca8b4f92d561ab',
  },
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['59146e0cae1e2339461bbbd420cc2f323907285b188bfaa6b90bc353a8d356ad'],
    updated: '134320bf21b9a43583f10f9296cff94275ccc303bdf315ef54960b4742ebde0c',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['85fd50e1311cf78353d2b0a62b6828768f977e4a04c599cd66f91bd0107966c0'],
    updated: '7ae43cf25d9c991e2daaf11ea2f362110864906afe9c3b6e97158e68a3277a5a',
  },
  {
    rel: 'src/page/Guide.jsx',
    expected: ['2098938233f860e07dd6fead3f8a193a4e8348b2fc69649d8c5dbca33970ca4b'],
    updated: '2bb1236af99135deb7751e5042780601099c0c1c7f668634095049aea551e1e7',
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
console.log('- 동그라미/점선박스/설명 화살표에 “번호 원 표시” 선택 기능을 추가했습니다.');
console.log('- 체크를 해제하면 도형/화살표는 유지하고 번호 원만 숨깁니다.');
console.log('- 번호를 숨긴 표시는 번호 재정렬과 번호 연결 화살표 대상에서 제외합니다.');
console.log('- 숨겨진 번호를 다시 켜면 현재 번호들의 다음 번호를 자동 부여합니다.');
console.log('- 기존 번호 표시 데이터는 기본적으로 그대로 표시됩니다.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
