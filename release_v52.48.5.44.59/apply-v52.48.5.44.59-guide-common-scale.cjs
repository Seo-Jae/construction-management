const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.59';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['1e6ccee31f679386d0f759cac51fa38b89d7074eb64a0090adf2302a4b89b5cb'],
    updated: '17e794fd0c51106ff4ae6ff833371c0af8ace38bb01443aa2d165dd382b29404',
  },
  {
    rel: 'src/utils/guideAnnotationEditor.js',
    expected: ['83ef2f0430e45dbf712ff637b8f3465b2677aecf430e5564651c3ccdf5573ffe'],
    updated: '44ffec3013cbc818103c43cffaa74d12b7b1a09cf38ce9ecfe509d8dce2fe19d',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['7cdcf16ced6282ed419c5302f9b64a10bafbc941fb88ccb55bf40f4577e56be6'],
    updated: '2b1c15701981d1edf298adf446a6a217227c5e80cb7220622f7ce6433cbf9e68',
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
console.log('- 편집기/가이드 설정 미리보기/공개 가이드의 번호 원·설명박스 비율을 동일한 1000px 기준으로 통일했습니다.');
console.log('- 실제 공개 가이드의 기존 가독성은 유지하면서 창 크기 차이에 따른 비율 오차를 제거합니다.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
