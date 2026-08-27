const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.60';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/components/GuideAnnotatedImage.jsx',
    expected: ['17e794fd0c51106ff4ae6ff833371c0af8ace38bb01443aa2d165dd382b29404'],
    updated: '5241be196a9ff3fc9db8fe369cc46b22a8f32c0b8bc56f752f6b0c132095ed3c',
  },
  {
    rel: 'src/utils/systemGuidePopup.js',
    expected: ['2b1c15701981d1edf298adf446a6a217227c5e80cb7220622f7ce6433cbf9e68'],
    updated: '2e7084c961b8539ba78e6c63b9a209ea3b4a7cd24137a63fbd197a9a5a75da6d',
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
console.log('- 주석 레이어의 기준 박스를 실제 렌더링된 이미지와 정확히 같은 크기로 맞췄습니다.');
console.log('- maxHeight/컨테이너 폭 때문에 이미지가 축소되어도 번호/설명박스 좌표와 크기가 이미지 기준으로 동일하게 유지됩니다.');
console.log('- 가이드 설정 미리보기와 공개 가이드 팝업에 동일한 계산을 적용했습니다.');
console.log('- 기존 가이드 데이터 및 Supabase SQL 변경은 없습니다.');
console.log('다음: npm run build');
