const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.4';
const projectRoot = process.cwd();
const payloadRoot = path.join(__dirname, 'files');

const files = [
  {
    relativePath: 'src/page/AttendanceWorkerPortal.jsx',
    baseHash: '81f3866ce19b08efdfde46b89ca3336ceefb67e6',
    targetHash: '71a8391cc9389cab1454bf5d35f728691edd1b66',
  },
  {
    relativePath: 'src/components/AttendanceMobileAdminQr.jsx',
    baseHash: '2c0dc136bc8000b86df0a7677ee080d455a71439',
    targetHash: '591e238a002cbd9c58faf97c9611db630f555963',
  },
  {
    relativePath: 'src/utils/attendance.js',
    baseHash: '382cb1fc383098366877a706f7792b0340a3e348',
    targetHash: '45de5578feb610f33aa8b908cd08f958c084bfa9',
  },
  {
    relativePath: 'src/utils/attendanceI18n.js',
    baseHash: null,
    targetHash: 'bd1c4e79db7fd043e991ad1318f9c33cef2cf913',
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

  const payloadHash = gitBlobHash(payloadPath);
  if (payloadHash !== entry.targetHash) {
    fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
}

const current = files.map((entry) => {
  const destinationPath = path.join(projectRoot, entry.relativePath);
  return {
    ...entry,
    destinationPath,
    exists: fs.existsSync(destinationPath),
    hash: fs.existsSync(destinationPath) ? gitBlobHash(destinationPath) : null,
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
      `${entry.relativePath} 내용이 예상 버전(v52.48.5.3)과 다릅니다. ` +
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
  const destinationPath = path.join(projectRoot, entry.relativePath);
  if (gitBlobHash(destinationPath) !== entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
}

console.log(`\n${VERSION} 적용 완료`);
console.log('- 관리자 모드 화면을 로그인 화면과 같은 90% 비율로 확대');
console.log('- 로그인 화면 우측 상단에 Language 선택 추가');
console.log('- 한국어, 영어, 중국어, 베트남어, 러시아어, 몽골어 지원');
console.log('- 선택 언어를 브라우저에 저장해 다음 실행에도 유지');
console.log('- 근태 앱의 화면 문구, 안내, 오류 메시지를 선택 언어로 표시');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- SQL 실행 불필요');

