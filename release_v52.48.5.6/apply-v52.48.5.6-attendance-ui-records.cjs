const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.6';
const projectRoot = process.cwd();
const payloadRoot = path.join(__dirname, 'files');

const files = [
  {
    relativePath: 'src/page/AttendanceWorkerPortal.jsx',
    baseHash: '29fb02cba49a6eee23c6cbf559d0906ae8a3796b',
    targetHash: 'ca6ad7978dc6de60c98893cf508bb5d75e49b3bd',
  },
  {
    relativePath: 'src/components/AttendanceWorkAssignmentDialog.jsx',
    baseHash: '88cc5a94e95ab3df707aa312de2fce63c0d53ac0',
    targetHash: 'af4468fb14a6814069b0f2f739aa29752556173a',
  },
  {
    relativePath: 'src/page/AttendanceManagement.jsx',
    baseHash: '27d4295ca454c30f6bbd36ea2aa09abbbbbeca20',
    targetHash: '5ebf800f39c5e6907d2d9a00693811faf0e8c7a2',
  },
];

function gitBlobHash(filePath) {
  const contents = fs.readFileSync(filePath);
  const header = Buffer.from(`blob ${contents.length}\0`);
  return crypto.createHash('sha1').update(header).update(contents).digest('hex');
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

for (const entry of files) {
  const payloadPath = path.join(payloadRoot, entry.relativePath);
  if (!fs.existsSync(payloadPath)) {
    fail(`패키지 안의 교체 파일이 없습니다: ${entry.relativePath}`);
  }
  if (gitBlobHash(payloadPath) !== entry.targetHash) {
    fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
}

const current = files.map((entry) => {
  const destinationPath = path.join(projectRoot, entry.relativePath);
  const exists = fs.existsSync(destinationPath);
  return {
    ...entry,
    destinationPath,
    exists,
    hash: exists ? gitBlobHash(destinationPath) : null,
  };
});

if (current.every((entry) => entry.hash === entry.targetHash)) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}

for (const entry of current) {
  if (!entry.exists) {
    fail(`기준 파일이 없습니다: ${entry.relativePath}`);
  }
  if (entry.hash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 예상 버전(v52.48.5.5)과 다릅니다. ` +
        '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }
}

const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp()}`);

for (const entry of current) {
  const backupPath = path.join(backupRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(entry.destinationPath, backupPath);
}

for (const entry of files) {
  const payloadPath = path.join(payloadRoot, entry.relativePath);
  const destinationPath = path.join(projectRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(payloadPath, destinationPath);
}

for (const entry of files) {
  if (gitBlobHash(path.join(projectRoot, entry.relativePath)) !== entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 회원가입 화면을 로그인과 같은 90% 폭·대형 입력 UI로 변경');
console.log('- 로그인 후 작업자 홈 카드·달력·출퇴근 버튼 확대');
console.log('- 출근 작업위치·공정 입력 화면 확대');
console.log('- 통합관리시스템 근태 기록에 작업위치·당일 공정 표시');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- 주의: Supabase SQL을 먼저 실행해야 합니다.');
