const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');
const relativePath = path.join('src', 'page', 'Messenger.jsx');
const sourcePath = path.join(releaseDir, relativePath);
const targetPath = path.join(projectRoot, relativePath);

const acceptedHashes = [
  '4cc7dcba1f2f3fc11a94255de331a868dc7204b219d4a72912aa5b52520c5610', // v52.10 ~ v52.11
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error(
    '[v52.12] package.json을 찾을 수 없습니다. release_v52.12 폴더를 프로젝트 최상위에 두고 실행해주세요.',
  );
  process.exit(1);
}

if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
  console.error(`[v52.12] 파일을 찾을 수 없습니다: ${relativePath}`);
  process.exit(1);
}

const currentHash = sha256(targetPath);
if (!acceptedHashes.includes(currentHash)) {
  console.error('[v52.12] 현재 src/page/Messenger.jsx가 검증된 v52.11 기준과 다릅니다.');
  console.error(`- 현재 SHA256: ${currentHash}`);
  console.error('기존 메신저 기능 보호를 위해 자동 덮어쓰기를 중단합니다.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.12_${stamp}`);
const backupPath = path.join(backupRoot, relativePath);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.copyFileSync(sourcePath, targetPath);

console.log('[v52.12] 메신저 채팅방 공지사항 적용 완료');
console.log(`- 변경: ${relativePath}`);
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- SQL: release_v52.12\\Supabase에서_실행\\00_v52.12_메신저_채팅방공지사항.sql');
console.log('- 다음 단계: npm run build');
