const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.5';
const projectRoot = process.cwd();
const payloadRoot = path.join(__dirname, 'files');

const files = [
  {
    relativePath: 'src/page/AttendanceWorkerPortal.jsx',
    baseHash: '71a8391cc9389cab1454bf5d35f728691edd1b66',
    targetHash: '29fb02cba49a6eee23c6cbf559d0906ae8a3796b',
  },
  {
    relativePath: 'src/components/AttendanceWorkAssignmentDialog.jsx',
    baseHash: null,
    targetHash: '88cc5a94e95ab3df707aa312de2fce63c0d53ac0',
  },
  {
    relativePath: 'src/utils/attendance.js',
    baseHash: '45de5578feb610f33aa8b908cd08f958c084bfa9',
    targetHash: '33ea3176db9c61b2ca71a7657bf8e7156b814057',
  },
  {
    relativePath: 'src/utils/attendanceI18n.js',
    baseHash: 'bd1c4e79db7fd043e991ad1318f9c33cef2cf913',
    targetHash: '9c68ab0145015a1874545c5d6974b74c519d53df',
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
  if (entry.baseHash === null) {
    if (entry.exists) {
      fail(
        `${entry.relativePath} 파일이 예상과 다르게 이미 존재합니다. ` +
          '기존 작업을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
      );
    }
    continue;
  }

  if (!entry.exists) {
    fail(`기준 파일이 없습니다: ${entry.relativePath}`);
  }
  if (entry.hash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 예상 버전(v52.48.5.4)과 다릅니다. ` +
        '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }
}

const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp()}`);

for (const entry of current) {
  if (!entry.exists) continue;
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
console.log('- 회원가입 공정을 기존 표준 공정 선택형으로 변경');
console.log('- 출근 QR 후 작업 동·층·공정 입력 화면 추가');
console.log('- 기타 작업위치 한 줄 입력 지원');
console.log('- 한국어·영어·중국어·베트남어·러시아어·몽골어 고정 번역');
console.log('- 작업정보 완료 전에는 출근 미처리');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- 주의: Supabase SQL을 먼저 실행해야 합니다.');

