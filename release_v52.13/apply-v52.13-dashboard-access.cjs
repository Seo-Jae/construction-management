const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const files = [
  {
    relativePath: path.join('src', 'Dashboard.jsx'),
    acceptedHashes: [
      'e15c1f8113ae816b74d1e5f0c7d7588f7e0617608fff1def10f612283d276aa6',
    ],
  },
  {
    relativePath: path.join('src', 'page', 'UserManagement.jsx'),
    acceptedHashes: [
      'd589bdcd187fb2381af133c920ae45954f27dc3956cd0b0fe22183af37c9a5d0',
    ],
  },
  {
    relativePath: path.join('src', 'page', 'AdminDashboard.jsx'),
    acceptedHashes: [
      'f129785e16f203208ba57543fa230beaa954c12e48e90eb35d3bc569f76dcb3c',
    ],
  },
  {
    relativePath: path.join('src', 'page', 'AdminDashboardScheduleBoard.jsx'),
    acceptedHashes: [
      'baff76eb5c8781a987a84531dc37bf5ef4e704265547c4eaf70a3728dc9531dd',
    ],
  },
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error(
    '[v52.13] package.json을 찾을 수 없습니다. release_v52.13 폴더를 프로젝트 최상위에 두고 실행해주세요.',
  );
  process.exit(1);
}

for (const file of files) {
  const sourcePath = path.join(releaseDir, file.relativePath);
  const targetPath = path.join(projectRoot, file.relativePath);

  if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
    console.error(`[v52.13] 파일을 찾을 수 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  const currentHash = sha256(targetPath);
  if (!file.acceptedHashes.includes(currentHash)) {
    console.error(`[v52.13] 현재 ${file.relativePath} 파일이 검증된 v52.12 기준과 다릅니다.`);
    console.error(`- 현재 SHA256: ${currentHash}`);
    console.error('기존 변경 보호를 위해 자동 덮어쓰기를 중단합니다.');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.13_${stamp}`);

for (const file of files) {
  const sourcePath = path.join(releaseDir, file.relativePath);
  const targetPath = path.join(projectRoot, file.relativePath);
  const backupPath = path.join(backupRoot, file.relativePath);

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(targetPath, backupPath);
  fs.copyFileSync(sourcePath, targetPath);
}

console.log('[v52.13] Dashboard 조회/수정/차단 권한 적용 완료');
files.forEach((file) => console.log(`- 변경: ${file.relativePath}`));
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- SQL: release_v52.13\\Supabase에서_실행\\00_v52.13_Dashboard_조회수정차단.sql');
console.log('- 다음 단계: npm run build');
