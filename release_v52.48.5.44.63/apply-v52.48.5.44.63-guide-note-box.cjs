const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.63';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/config/guideCatalog.js',
    expected: ['47c64cba127af29fe18d69e950e53cf335d0b3a785fd63e0d58e24d3465a1ca0'],
    updated: '38ce8bcc307b4e4e46f0fc5aaa691afeaf9f296736e42b50afed51d1e0b5aa8b',
  },
  {
    rel: 'src/utils/guideAnnotationEditor.js',
    expected: ['44ffec3013cbc818103c43cffaa74d12b7b1a09cf38ce9ecfe509d8dce2fe19d'],
    updated: '4b81107a4e444fbec743c6c4e7d4b87fd8e7e7bfc393ef6eff05a65e528805a1',
  },
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['5241be196a9ff3fc9db8fe369cc46b22a8f32c0b8bc56f752f6b0c132095ed3c'],
    updated: '59146e0cae1e2339461bbbd420cc2f323907285b188bfaa6b90bc353a8d356ad',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['2e7084c961b8539ba78e6c63b9a209ea3b4a7cd24137a63fbd197a9a5a75da6d'],
    updated: '85fd50e1311cf78353d2b0a62b6828768f977e4a04c599cd66f91bd0107966c0',
  },
  {
    rel: 'src/page/Guide.jsx',
    expected: ['b007fae4c548eb6a563b1d9252f1b0066e6d9d31032a25a36d9dd63e2f7f52b2'],
    updated: '2098938233f860e07dd6fead3f8a193a4e8348b2fc69649d8c5dbca33970ca4b',
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
console.log('- 가이드 표시 편집 상단에 번호가 붙지 않는 “설명박스” 도구를 추가했습니다.');
console.log('- 설명박스는 원하는 위치를 한 번 클릭해 생성하고, 박스를 직접 끌어 이동할 수 있습니다.');
console.log('- 우측에서 설명 제목/상세 설명/색상/X·Y 위치를 편집할 수 있습니다.');
console.log('- 번호 재정렬 및 번호 연결 화살표 대상에서는 설명박스를 제외합니다.');
console.log('- 가이드 설정 미리보기와 실제 공개 가이드에도 번호 없이 동일하게 표시됩니다.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
