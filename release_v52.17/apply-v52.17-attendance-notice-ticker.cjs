const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const releaseDir = path.resolve(__dirname);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, `backup_v52.17_${stamp}`);

const files = [
  {
    target: 'src/page/AttendanceManagement.jsx',
    source: 'src/page/AttendanceManagement.jsx',
    acceptedBaseSha256: [
      'c38d2a1c97aab9404edda4d4594d64a4df0fc50dc3c5b611eb45b38a2148fa56',
    ],
    newSha256: '4ac46f0b8f550bc4d30e3c27540592085df7ff7378f14ac098e5bc81eb0ef1d7',
  },
  {
    target: 'src/page/AttendanceWorkerPortal.jsx',
    source: 'src/page/AttendanceWorkerPortal.jsx',
    acceptedBaseSha256: [
      'c883800367dbbde6672c5682cb12c1331bcd7994df7c8f0d91fe45050182e2b7',
    ],
    newSha256: 'd98953ac6d6b681a48f934149200a0d2e5fc270a613ab1f03169b81123a59211',
  },
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fail(message) {
  console.error(`\n[v52.17 적용 중단] ${message}\n`);
  process.exit(1);
}

for (const item of files) {
  const targetPath = path.join(root, item.target);
  const sourcePath = path.join(releaseDir, item.source);
  if (!fs.existsSync(sourcePath)) fail(`배포파일이 없습니다: ${item.source}`);
  if (!fs.existsSync(targetPath)) fail(`현재 프로젝트 파일이 없습니다: ${item.target}`);

  const currentHash = sha256(targetPath);
  if (currentHash === item.newSha256) continue;
  if (!item.acceptedBaseSha256.includes(currentHash)) {
    fail(
      `${item.target} 파일이 v52.17 제작 기준과 다릅니다.\n` +
      `현재 SHA256: ${currentHash}\n` +
      '기존 기능 보호를 위해 자동 덮어쓰기를 중단했습니다.'
    );
  }
}

const needsApply = files.filter((item) => sha256(path.join(root, item.target)) !== item.newSha256);
if (needsApply.length === 0) {
  console.log('[v52.17] 이미 프로그램 파일이 적용되어 있습니다.');
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
for (const item of needsApply) {
  const targetPath = path.join(root, item.target);
  const backupPath = path.join(backupDir, item.target);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(targetPath, backupPath);
}

for (const item of needsApply) {
  const sourcePath = path.join(releaseDir, item.source);
  const targetPath = path.join(root, item.target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);

  const appliedHash = sha256(targetPath);
  if (appliedHash !== item.newSha256) {
    fail(`${item.target} 복사 후 해시가 일치하지 않습니다.`);
  }
  console.log(`[적용] ${item.target}`);
}

console.log(`\n[v52.17] 적용 완료`);
console.log(`백업: ${backupDir}`);
console.log('다음 명령: npm run build');
