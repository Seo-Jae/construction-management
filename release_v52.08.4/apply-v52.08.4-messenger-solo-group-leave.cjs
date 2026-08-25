const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');
const sourceFile = path.join(releaseDir, 'src', 'page', 'Messenger.jsx');
const targetFile = path.join(projectRoot, 'src', 'page', 'Messenger.jsx');

const EXPECTED_V52083_SHA256 = '8e23dcdc80de9ed8d4679c1cbec5acead44e181659501952a10421800fcd7aae';

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.08.4] package.json을 찾을 수 없습니다. release_v52.08.4 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

if (!fs.existsSync(sourceFile) || !fs.existsSync(targetFile)) {
  console.error('[v52.08.4] Messenger.jsx를 찾을 수 없습니다. v52.08.3 적용 여부를 확인해주세요.');
  process.exit(1);
}

const currentHash = sha256(targetFile);
if (currentHash !== EXPECTED_V52083_SHA256) {
  console.error('[v52.08.4] 현재 Messenger.jsx가 검증된 v52.08.3 파일과 일치하지 않습니다. 기존 기능 보호를 위해 자동 덮어쓰기를 중단합니다.');
  console.error(`- 현재 SHA256: ${currentHash}`);
  console.error(`- 예상 SHA256: ${EXPECTED_V52083_SHA256}`);
  process.exit(1);
}

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const backupRoot = path.join(projectRoot, `backup_v52.08.4_${stamp}`);
const backupFile = path.join(backupRoot, 'src', 'page', 'Messenger.jsx');

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(targetFile, backupFile);
fs.copyFileSync(sourceFile, targetFile);

console.log('[v52.08.4] 적용 완료');
console.log(`- 변경: ${path.relative(projectRoot, targetFile)}`);
console.log(`- 백업: ${path.relative(projectRoot, backupFile)}`);
console.log('- Supabase SQL: release_v52.08.4\\Supabase에서_실행\\00_v52.08.4_1인그룹_나가기수정.sql');
console.log('- 다음 단계: npm run build');
