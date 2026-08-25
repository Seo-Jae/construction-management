const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'),
    previousHash: '4b7606cb9a02f51af7ba20e05ca40b42c03498c56bc0d913fe40a7d2dd985363',
    text: true,
  },
  {
    relativePath: 'index.html',
    previousHash: '577c718d39049d78b5b253d47278e05ab9e43cac90a70e1828dd7b74396b904f',
    text: true,
  },
  {
    relativePath: path.join('public', 'attendance.webmanifest'),
    previousHash: 'f109521d9d509847065aa504b3358cec4495b07a46da332313b87ce38aa91101',
    text: true,
  },
  {
    relativePath: path.join('public', 'attendance-icon.svg'),
    previousHash: 'e387553435e157c3eccf0c1cda9098533b5e48cf561781b4d36ca1135e389715',
    text: true,
  },
  { relativePath: path.join('public', 'attendance-icon-maskable.svg'), previousHash: null, text: true },
  { relativePath: path.join('public', 'attendance-icon-192.png'), previousHash: null, text: false },
  { relativePath: path.join('public', 'attendance-icon-512.png'), previousHash: null, text: false },
  { relativePath: path.join('public', 'attendance-icon-512-maskable.png'), previousHash: null, text: false },
  { relativePath: path.join('public', 'attendance-apple-touch-icon.png'), previousHash: null, text: false },
];

function digest(filePath, normalizeText) {
  let content = fs.readFileSync(filePath);
  if (normalizeText) {
    content = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }
  return crypto.createHash('sha256').update(content).digest('hex');
}

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('오류: 프로젝트 최상위 폴더에서 실행해주세요. package.json을 찾지 못했습니다.');
  process.exit(1);
}

for (const file of files) {
  file.sourcePath = path.join(releaseRoot, file.relativePath);
  file.targetPath = path.join(projectRoot, file.relativePath);
  if (!fs.existsSync(file.sourcePath)) {
    console.error(`오류: 배포 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }
  file.nextHash = digest(file.sourcePath, file.text);
}

const alreadyApplied = files.every(
  (file) => fs.existsSync(file.targetPath) && digest(file.targetPath, file.text) === file.nextHash,
);

if (alreadyApplied) {
  console.log('v52.14.4가 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

for (const file of files) {
  if (!fs.existsSync(file.targetPath)) {
    if (file.previousHash) {
      console.error(`오류: 기존 파일이 없습니다: ${file.relativePath}`);
      process.exit(1);
    }
    continue;
  }

  const currentHash = digest(file.targetPath, file.text);
  if (currentHash === file.nextHash) continue;

  if (!file.previousHash || currentHash !== file.previousHash) {
    console.error(`오류: ${file.relativePath}이 예상한 v52.14.3 상태와 다릅니다.`);
    console.error('다른 버전 위에 덮어쓰지 않았습니다. 최신 적용 상태를 먼저 확인해주세요.');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.4_${stamp}`);

for (const file of files) {
  if (!fs.existsSync(file.targetPath)) continue;
  if (digest(file.targetPath, file.text) === file.nextHash) continue;
  const backupPath = path.join(backupRoot, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.targetPath, backupPath);
}

for (const file of files) {
  fs.mkdirSync(path.dirname(file.targetPath), { recursive: true });
  fs.copyFileSync(file.sourcePath, file.targetPath);
  if (digest(file.targetPath, file.text) !== file.nextHash) {
    console.error(`오류: 파일 복사 검증에 실패했습니다: ${file.relativePath}`);
    process.exit(1);
  }
}

console.log('v52.14.4 근태 앱 이름·아이콘·설치형 UI 적용이 완료되었습니다.');
console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
console.log('Supabase SQL 실행과 npm 패키지 추가 설치는 필요 없습니다.');
console.log('아이콘과 앱 이름 확인을 위해 기존 홈 화면 앱을 삭제한 뒤 다시 설치해주세요.');
