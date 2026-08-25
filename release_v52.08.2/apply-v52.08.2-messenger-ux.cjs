const fs = require('fs');
const path = require('path');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');
const sourceFile = path.join(releaseDir, 'src', 'page', 'Messenger.jsx');
const targetFile = path.join(projectRoot, 'src', 'page', 'Messenger.jsx');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.08.2] package.json을 찾을 수 없습니다. release_v52.08.2 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

if (!fs.existsSync(sourceFile)) {
  console.error('[v52.08.2] 배포본 Messenger.jsx를 찾을 수 없습니다.');
  process.exit(1);
}

if (!fs.existsSync(targetFile)) {
  console.error('[v52.08.2] 현재 프로젝트의 src/page/Messenger.jsx를 찾을 수 없습니다. v52.08/v52.08.1 적용 여부를 확인해주세요.');
  process.exit(1);
}

const currentSource = fs.readFileSync(targetFile, 'utf8');
if (!currentSource.includes('v52.08.1 안정화')) {
  console.error('[v52.08.2] 현재 Messenger.jsx가 v52.08.1 안정화본으로 확인되지 않습니다. 임의 덮어쓰기를 중단합니다.');
  process.exit(1);
}

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const backupRoot = path.join(projectRoot, `backup_v52.08.2_${stamp}`);
const backupFile = path.join(backupRoot, 'src', 'page', 'Messenger.jsx');

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(targetFile, backupFile);
fs.copyFileSync(sourceFile, targetFile);

console.log('[v52.08.2] 적용 완료');
console.log(`- 변경: ${path.relative(projectRoot, targetFile)}`);
console.log(`- 백업: ${path.relative(projectRoot, backupFile)}`);
console.log('- 다음 단계: npm run build');
