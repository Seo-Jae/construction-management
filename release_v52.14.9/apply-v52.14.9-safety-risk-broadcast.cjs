const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    relativePath: path.join('src', 'Dashboard.jsx'),
    previousHash: '59097cb130162be84274accdb14ca2c10d536ab8d68660fdef692116acb6f486',
  },
  {
    relativePath: path.join('src', 'page', 'UserManagement.jsx'),
    previousHash: 'e32bb1e6ce31aae9d330d76f4ab9b48fe3ce219dceb3cb7f512ae296afd3bffa',
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceManagement.jsx'),
    previousHash: '11f22c0313a016e7d6efc38d0b31bca9cc9815166e18b917fcf14d0dcec1e933',
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'),
    previousHash: '885ed52f89ecc154d41bc2fc93048b70b4972fa5f9af2b6422cb241a371b6131',
  },
  {
    relativePath: path.join('src', 'page', 'RiskBroadcastManagement.jsx'),
    previousHash: null,
    allowCreate: true,
  },
];

function digest(filePath) {
  const content = Buffer.from(
    fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'),
    'utf8',
  );
  return crypto.createHash('sha256').update(content).digest('hex');
}

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('오류: 프로젝트 최상위 폴더에서 실행해주세요. package.json을 찾지 못했습니다.');
  process.exit(1);
}

const states = files.map((entry) => {
  const sourcePath = path.join(releaseRoot, entry.relativePath);
  const targetPath = path.join(projectRoot, entry.relativePath);

  if (!fs.existsSync(sourcePath)) {
    console.error(`오류: 배포 파일이 없습니다: ${entry.relativePath}`);
    process.exit(1);
  }

  const targetExists = fs.existsSync(targetPath);
  if (!targetExists && !entry.allowCreate) {
    console.error(`오류: 기존 파일이 없습니다: ${entry.relativePath}`);
    process.exit(1);
  }

  const nextHash = digest(sourcePath);
  const currentHash = targetExists ? digest(targetPath) : null;
  const matchesPrevious = entry.allowCreate
    ? currentHash === null
    : currentHash === entry.previousHash;

  if (!matchesPrevious && currentHash !== nextHash) {
    console.error(`오류: ${entry.relativePath}가 예상한 v52.14.8 상태와 다릅니다.`);
    console.error('다른 버전이나 사용자 수정 파일 위에 덮어쓰지 않았습니다. 최신 적용 상태를 확인해주세요.');
    process.exit(1);
  }

  return {
    ...entry,
    sourcePath,
    targetPath,
    targetExists,
    nextHash,
    currentHash,
  };
});

const pending = states.filter((entry) => entry.currentHash !== entry.nextHash);
if (pending.length === 0) {
  console.log('v52.14.9가 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.9_${stamp}`);

for (const entry of pending.filter((item) => item.targetExists)) {
  const backupPath = path.join(backupRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(entry.targetPath, backupPath);
}

for (const entry of pending) {
  fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
  fs.copyFileSync(entry.sourcePath, entry.targetPath);
  if (digest(entry.targetPath) !== entry.nextHash) {
    console.error(`오류: 파일 복사 검증에 실패했습니다: ${entry.relativePath}`);
    process.exit(1);
  }
}

console.log('v52.14.9 안전관리자 권한·중점위험요인 전파 기능 적용이 완료되었습니다.');
if (pending.some((entry) => entry.targetExists)) {
  console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
}
console.log('Supabase SQL 1개를 먼저 실행해야 하며 추가 npm 패키지 설치는 필요 없습니다.');
