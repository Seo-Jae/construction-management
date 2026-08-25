const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;
const relativePath = path.join('src', 'page', 'AttendanceWorkerPortal.jsx');
const sourcePath = path.join(releaseRoot, relativePath);
const targetPath = path.join(projectRoot, relativePath);
const previousHash = '62104bb46722ea82db1b49a7dce6b2086bb655339e448073d6b6ad5af80800eb';

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

if (!fs.existsSync(sourcePath)) {
  console.error(`오류: 배포 파일이 없습니다: ${relativePath}`);
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  console.error(`오류: 기존 파일이 없습니다: ${relativePath}`);
  process.exit(1);
}

const nextHash = digest(sourcePath);
const currentHash = digest(targetPath);

if (currentHash === nextHash) {
  console.log('v52.14.7이 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

if (currentHash !== previousHash) {
  console.error('오류: AttendanceWorkerPortal.jsx가 예상한 v52.14.6 상태와 다릅니다.');
  console.error('다른 버전이나 사용자 수정 파일 위에 덮어쓰지 않았습니다. 최신 적용 상태를 확인해주세요.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.7_${stamp}`);
const backupPath = path.join(backupRoot, relativePath);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.copyFileSync(sourcePath, targetPath);

if (digest(targetPath) !== nextHash) {
  console.error(`오류: 파일 복사 검증에 실패했습니다: ${relativePath}`);
  process.exit(1);
}

console.log('v52.14.7 근태 앱 캘린더·중점위험요인 자리·이전형 카드 UI 적용이 완료되었습니다.');
console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
console.log('Supabase SQL Editor에서 00_v52.14.7_근태앱_금월출결캘린더.sql을 먼저 실행해야 합니다.');
console.log('앱 삭제·재설치와 추가 npm 패키지 설치는 필요 없습니다.');
