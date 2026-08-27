const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.61';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/page/ProgressInput.jsx',
    expected: ['78e8977657c357fe675bfb659c0ca8cca3bb61d45228e20c9238391e21a9e824'],
    updated: 'c7679a30f2d77ae5d0d8f63feaf817485ef1811ea3c83191dab8688c90db967f',
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
console.log('- 타입별 세대 현황 패널의 오래된 저장 위치(v3)를 끊고 v4 기본 위치로 초기화합니다.');
console.log('- 기본 위치는 우측 목표설정의 펼치기/최소화 버튼 오른쪽 끝에 맞춰 그 하단으로 도킹합니다.');
console.log('- 사용자가 패널을 직접 드래그하면 자동 도킹을 해제하고 해당 위치를 저장합니다.');
console.log('- 드래그 가능 우측 한계를 화면 끝 4px까지 확장해 오른쪽 이동이 막히는 문제를 보정합니다.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
