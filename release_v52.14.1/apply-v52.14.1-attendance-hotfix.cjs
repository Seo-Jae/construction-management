const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const files = [
  {
    relativePath: path.join('src', 'App.jsx'),
    acceptedHashes: ['d0e4851c9ae8b0c69c168c59446da893a6a301fbba17526ff6b500ce2f2cbd9c'],
  },
  {
    relativePath: path.join('src', 'Dashboard.jsx'),
    acceptedHashes: ['4c2baa70a1c7d2cbbdda35e24d08761fd23c2a0670b5aef3d096e473ebb7459b'],
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceManagement.jsx'),
    acceptedHashes: ['b6b34efe5d610c2513c89ccc34003c83afa3143fa43cffd56d3c8a748755891d'],
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'),
    acceptedHashes: ['1756230b3ee67b166d65d7f7c2ec25be973e4644cd9d187310e5a20f186c5574'],
  },
  {
    relativePath: path.join('src', 'utils', 'attendance.js'),
    acceptedHashes: ['64bddcb1d7c08049f87aab7719fd6c9c8ca7dc16b031f8b90f0b140afbec8d72'],
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceQrDisplay.jsx'),
    isNew: true,
  },
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.14.1] package.json을 찾을 수 없습니다. release_v52.14.1 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

for (const file of files) {
  const sourcePath = path.join(releaseDir, file.relativePath);
  const targetPath = path.join(projectRoot, file.relativePath);

  if (!fs.existsSync(sourcePath)) {
    console.error(`[v52.14.1] 배포 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(targetPath)) {
    if (file.isNew) continue;
    console.error(`[v52.14.1] 프로젝트 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  const releaseHash = sha256(sourcePath);
  const currentHash = sha256(targetPath);
  if (currentHash === releaseHash) continue;

  if (file.isNew || !file.acceptedHashes.includes(currentHash)) {
    console.error(`[v52.14.1] 현재 ${file.relativePath} 파일이 검증된 v52.14 기준과 다릅니다.`);
    console.error(`- 현재 SHA256: ${currentHash}`);
    console.error('기존 변경 보호를 위해 자동 적용을 중단합니다.');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.1_${stamp}`);

for (const file of files) {
  const sourcePath = path.join(releaseDir, file.relativePath);
  const targetPath = path.join(projectRoot, file.relativePath);

  if (fs.existsSync(targetPath) && sha256(targetPath) !== sha256(sourcePath)) {
    const backupPath = path.join(backupRoot, file.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(targetPath, backupPath);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

console.log('[v52.14.1] 근태관리 긴급보완 파일 적용 완료');
files.forEach((file) => console.log(`- 반영: ${file.relativePath}`));
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- 다음 단계: npm run build');
