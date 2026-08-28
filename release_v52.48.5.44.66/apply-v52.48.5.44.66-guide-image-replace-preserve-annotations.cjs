const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.66';
const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const filesDir = path.join(releaseDir, 'files');

const targets = [
  {
    rel: 'src/page/Guide.jsx',
    expected: ['84d048331e84a06ecd628057279280d5cf073b04d26ccae8f2552e603e17aede'],
    updated: 'f6854af0151b8809224c68c892408c27f857079960da7f5cccab488d61c65d5a',
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
console.log('- 화면 이미지 교체 시 기존 번호·동그라미·점선박스·화살표·설명박스 표시를 유지합니다.');
console.log('- 이미지 경로와 미리보기 이미지만 새 파일로 교체합니다.');
console.log('- 기존 표시 좌표/크기/번호 숨김/설명 내용은 수정하지 않습니다.');
console.log('- “초안에서 이미지 제거”는 기존처럼 이미지와 표시를 함께 제거합니다.');
console.log('- 추가 Supabase SQL은 없습니다.');
console.log('다음: npm run build');
