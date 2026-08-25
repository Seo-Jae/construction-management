const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');
const relativePath = path.join('src', 'page', 'AttendanceWorkerPortal.jsx');
const acceptedHashes = [
  'de3e15078dc415a21951d91a4f95d0d00a195f82dbb96f80388d3433c66f051c',
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.14.2] package.json을 찾을 수 없습니다. release_v52.14.2 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

const sourcePath = path.join(releaseDir, relativePath);
const targetPath = path.join(projectRoot, relativePath);

if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
  console.error(`[v52.14.2] 적용 파일을 찾을 수 없습니다: ${relativePath}`);
  process.exit(1);
}

const releaseHash = sha256(sourcePath);
const currentHash = sha256(targetPath);

if (currentHash === releaseHash) {
  console.log('[v52.14.2] 카메라 보완이 이미 적용되어 있습니다.');
  console.log('- 다음 단계: npm run build');
  process.exit(0);
}

if (!acceptedHashes.includes(currentHash)) {
  console.error(`[v52.14.2] 현재 ${relativePath} 파일이 검증된 v52.14.1 기준과 다릅니다.`);
  console.error(`- 현재 SHA256: ${currentHash}`);
  console.error('기존 변경 보호를 위해 자동 적용을 중단합니다.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(projectRoot, `backup_v52.14.2_${stamp}`, relativePath);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.copyFileSync(sourcePath, targetPath);

console.log('[v52.14.2] 근태 QR 카메라 보완 적용 완료');
console.log(`- 반영: ${relativePath}`);
console.log(`- 백업: ${path.relative(projectRoot, backupPath)}`);
console.log('- 다음 단계: npm run build');
