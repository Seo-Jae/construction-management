const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    relativePath: path.join('src', 'page', 'AttendanceManagement.jsx'),
    previousHash: 'd0e57dc643b73ad0ad9c8ffdde15410e02ca681839f0ff5be7b37131b9723eb4',
  },
  {
    relativePath: path.join('src', 'page', 'AttendanceWorkerPortal.jsx'),
    previousHash: '37ff7fa5665857561a8c11f285781f4174916cb97b38e6aa9d3d8e55d771ddd3',
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
  if (!fs.existsSync(targetPath)) {
    console.error(`오류: 기존 파일이 없습니다: ${entry.relativePath}`);
    process.exit(1);
  }

  const nextHash = digest(sourcePath);
  const currentHash = digest(targetPath);
  if (currentHash !== entry.previousHash && currentHash !== nextHash) {
    console.error(`오류: ${entry.relativePath}가 예상한 v52.14.7 상태와 다릅니다.`);
    console.error('다른 버전이나 사용자 수정 파일 위에 덮어쓰지 않았습니다. 최신 적용 상태를 확인해주세요.');
    process.exit(1);
  }

  return { ...entry, sourcePath, targetPath, nextHash, currentHash };
});

const pending = states.filter((entry) => entry.currentHash !== entry.nextHash);
if (pending.length === 0) {
  console.log('v52.14.8이 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.8_${stamp}`);

for (const entry of pending) {
  const backupPath = path.join(backupRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(entry.targetPath, backupPath);
}

for (const entry of pending) {
  fs.copyFileSync(entry.sourcePath, entry.targetPath);
  if (digest(entry.targetPath) !== entry.nextHash) {
    console.error(`오류: 파일 복사 검증에 실패했습니다: ${entry.relativePath}`);
    process.exit(1);
  }
}

console.log('v52.14.8 근태 알림 토스트 통일·시간 전용 수정창 적용이 완료되었습니다.');
console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
console.log('Supabase SQL 실행과 추가 npm 패키지 설치는 필요 없습니다.');
