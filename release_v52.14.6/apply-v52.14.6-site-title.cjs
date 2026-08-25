const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;
const relativePath = 'index.html';
const sourcePath = path.join(releaseRoot, relativePath);
const targetPath = path.join(projectRoot, relativePath);
const previousHash = 'a308b255a08b7d0c72a8fa8b0443aa3396ec6bd6a9be74cb6cb059372ab80d37';

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
  console.log('v52.14.6가 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

if (currentHash !== previousHash) {
  console.error('오류: index.html이 예상한 v52.14.5 상태와 다릅니다.');
  console.error('다른 버전 위에 덮어쓰지 않았습니다. 최신 적용 상태를 먼저 확인해주세요.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.14.6_${stamp}`);
const backupPath = path.join(backupRoot, relativePath);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.copyFileSync(sourcePath, targetPath);

if (digest(targetPath) !== nextHash) {
  console.error(`오류: 파일 복사 검증에 실패했습니다: ${relativePath}`);
  process.exit(1);
}

console.log('v52.14.6 전체 사이트 제목 분리 적용이 완료되었습니다.');
console.log(`기존 파일 백업: ${path.basename(backupRoot)}`);
console.log('웹사이트 제목: 욱림건설 통합관리시스템');
console.log('근태 설치 앱 이름: 욱림건설 근태시스템 (변경 없음)');
console.log('Supabase SQL 실행과 앱 재설치는 필요 없습니다.');
