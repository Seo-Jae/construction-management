const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'),
    previousHash: '64022b39d80b53a99f9799b1734bcc87918cea9d3ff64416eb8ef3d6dea5966a',
    text: true,
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceQrDisplay.jsx'),
    previousHash: '92cb1ab18ab4001998c59a6675289b5e0a0db02bc9530ccf85d487ebf602daa0',
    text: true,
  },
  {
    relativePath: path.join('public', 'attendance-icon.svg'),
    previousHash: 'f2927f5956f1b436b538eeafed55c81dc8393f36ab2c1557f04d04c164835770',
    text: true,
  },
  {
    relativePath: path.join('public', 'attendance-icon-maskable.svg'),
    previousHash: '47f488dcf58404351d41bc04986061286ea4ba1a431a9ee5813a2be43959f224',
    text: true,
  },
  {
    relativePath: path.join('public', 'attendance-icon-192.png'),
    previousHash: 'a38a3495f48e83c15b649c77c1b7288b4a3c78a2663b9a368b2cd43ed89c3cdd',
    text: false,
  },
  {
    relativePath: path.join('public', 'attendance-icon-512.png'),
    previousHash: '1ee74a1621ce0b275bf48ca1761798876ef47b0777ac654536e0b99a75cff638',
    text: false,
  },
  {
    relativePath: path.join('public', 'attendance-icon-512-maskable.png'),
    previousHash: 'f3222fbee61b0d2c776d9fda5813c802f05d402bee546f94426de78bb094b8ff',
    text: false,
  },
  {
    relativePath: path.join('public', 'attendance-apple-touch-icon.png'),
    previousHash: 'ef6da037099689174eb0a6d6cd35dfbe1007263c3c84be83c5c12dae4250f421',
    text: false,
  },
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
  console.log('v52.14.5가 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

for (const file of files) {
  if (!fs.existsSync(file.targetPath)) {
    console.error(`오류: 기존 파일이 없습니다: ${file.relativePath}`);
    process.exit(1);
  }

  const currentHash = digest(file.targetPath, file.text);
  if (currentHash === file.nextHash) continue;

  if (currentHash !== file.previousHash) {
    console.error(`오류: ${file.relativePath}이 예상한 v52.14.4 상태와 다릅니다.`);
    console.error('다른 버전이나 사용자 수정 파일 위에 덮어쓰지 않았습니다. 최신 적용 상태를 확인해주세요.');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.5_${stamp}`);

for (const file of files) {
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

console.log('v52.14.5 근태 앱 꽉 찬 UI·축소 W 아이콘·QR 전용창 탭 적용이 완료되었습니다.');
console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
console.log('Supabase SQL 실행과 npm 패키지 추가 설치는 필요 없습니다.');
console.log('아이콘 확인을 위해 기존 홈 화면 앱을 삭제한 뒤 다시 설치해주세요.');
