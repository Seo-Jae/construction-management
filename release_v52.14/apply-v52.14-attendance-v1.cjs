const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const files = [
  {
    relativePath: 'package.json',
    acceptedHashes: ['ca9a200b6f981ff8e9953d966a99c4a4283b3475f3893ca081c3a7ddf9d57c51'],
  },
  {
    relativePath: 'package-lock.json',
    acceptedHashes: ['450ad02ca9635c98f39f04cf83271c8cde60f96a5329ca8feed0ba69256eaa4e'],
  },
  {
    relativePath: 'index.html',
    acceptedHashes: ['1cc36ad5e8f34cd9bbdea060dee2f04a23b2b64ba08c85aa69da598f3f3992bc'],
  },
  {
    relativePath: path.join('src', 'App.jsx'),
    acceptedHashes: ['4d1dbf516843b2aa4545aefb2068ed137b398ef4cbd610ccc666280f2364c52d'],
  },
  {
    relativePath: path.join('src', 'Dashboard.jsx'),
    acceptedHashes: ['b393d5b401f8d8e8118f42cffcb8a6d4cee026d8c685a9d33b3f600d61179f8b'],
  },
  {
    relativePath: path.join('src', 'components', 'Sidebar.jsx'),
    acceptedHashes: ['3bdd4a404d2f6155c2ae1199e13966842538f7760eb857d738dbcd460ec1e945'],
  },
  {
    relativePath: path.join('src', 'main.jsx'),
    acceptedHashes: ['31243d20347053e4745c288670ded7d5249a82f87a50900190ff6108b8299f90'],
  },
  { relativePath: path.join('src', 'page', 'AttendanceManagement.jsx'), isNew: true },
  { relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'), isNew: true },
  { relativePath: path.join('src', 'utils', 'attendance.js'), isNew: true },
  { relativePath: path.join('public', 'attendance.webmanifest'), isNew: true },
  { relativePath: path.join('public', 'attendance-icon.svg'), isNew: true },
  { relativePath: path.join('public', 'attendance-sw.js'), isNew: true },
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.14] package.json을 찾을 수 없습니다. release_v52.14 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

for (const file of files) {
  const sourcePath = path.join(releaseDir, file.relativePath);
  const targetPath = path.join(projectRoot, file.relativePath);

  if (!fs.existsSync(sourcePath)) {
    console.error(`[v52.14] 배포 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(targetPath)) {
    if (file.isNew) continue;
    console.error(`[v52.14] 프로젝트 원본 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  const currentHash = sha256(targetPath);
  const releaseHash = sha256(sourcePath);
  if (currentHash === releaseHash) continue;

  if (file.isNew || !file.acceptedHashes.includes(currentHash)) {
    console.error(`[v52.14] 현재 ${file.relativePath} 파일이 검증된 v52.13 기준과 다릅니다.`);
    console.error(`- 현재 SHA256: ${currentHash}`);
    console.error('기존 변경 보호를 위해 자동 적용을 중단합니다.');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14_${stamp}`);

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

console.log('[v52.14] 근태관리 v1 파일 적용 완료');
files.forEach((file) => console.log(`- 반영: ${file.relativePath}`));
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- QR 카메라·생성 라이브러리를 설치합니다.');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const installResult = spawnSync(
  npmCommand,
  [
    'install',
    '--legacy-peer-deps',
    '--cache',
    path.join(projectRoot, '.npm-cache-v52.14'),
  ],
  { cwd: projectRoot, stdio: 'inherit' },
);

if (installResult.status !== 0) {
  console.error('[v52.14] npm 설치가 완료되지 않았습니다.');
  console.error('프로젝트 폴더에서 npm install --legacy-peer-deps 를 직접 실행해주세요.');
  process.exit(1);
}

console.log('[v52.14] 의존성 설치 완료');
console.log('- 다음 단계: npm run build');
