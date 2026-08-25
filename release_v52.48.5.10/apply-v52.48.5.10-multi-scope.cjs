const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.10';
const projectRoot = process.cwd();
const entries = [
  {
    relativePath: 'src/page/AttendanceWorkerPortal.jsx',
    baseHash: '9222210129383c904551351248393d8bd9f14e6d',
    targetHash: '3ecc67c2e6d4fceafe6c26027aff7a669a2e80b7',
  },
  {
    relativePath: 'src/page/AttendanceManagement.jsx',
    baseHash: '0d5d1f449f5158f5f2022a486ee84b7e19ea14e9',
    targetHash: '50dc1d987acf47bd23375eb266550e65c271ea78',
  },
  {
    relativePath: 'src/utils/attendanceI18n.js',
    baseHash: '937448f9e489f0116985c9aa3bc49ada4dc086a5',
    targetHash: '00e2fff771db09ee6593ba4334fc0faf1c4be4e2',
  },
  {
    relativePath: 'src/components/AttendanceWorkAssignmentDialog.jsx',
    baseHash: '384e31accf8ae76f845e3a1a9f4a783002102c76',
    targetHash: 'c9df2fdd7221fe48cb6e129e37cf041710c1b7fc',
  },
  {
    relativePath: 'src/components/AttendanceCheckoutProgressDialog.jsx',
    baseHash: '617815ef4c0f0d1f9dfd01da714529677e66b4cf',
    targetHash: 'dd03a4ce82676d898600a58788855108c97313b8',
  },
  {
    relativePath: 'src/components/AttendanceProgressFloorGrid.jsx',
    baseHash: 'f5f8d30f328740671409afa57ad1fd2ded5905ca',
    targetHash: '808d0fabcc3c91d65f86f3f332109a8606e38404',
  },
];

function gitBlobHash(filePath) {
  const contents = fs.readFileSync(filePath);
  const header = Buffer.from(`blob ${contents.length}\0`);
  return crypto.createHash('sha1').update(header).update(contents).digest('hex');
}

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

const actions = entries.map((entry) => {
  const payloadPath = path.join(__dirname, 'files', entry.relativePath);
  const destinationPath = path.join(projectRoot, entry.relativePath);

  if (!fs.existsSync(payloadPath)) {
    fail(`패키지 안의 교체 파일이 없습니다: ${entry.relativePath}`);
  }
  if (gitBlobHash(payloadPath) !== entry.targetHash) {
    fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
  if (!fs.existsSync(destinationPath)) {
    fail(`기준 파일이 없습니다: ${entry.relativePath}`);
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { ...entry, payloadPath, destinationPath, action: 'unchanged' };
  }
  if (currentHash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 예상 기준 버전과 다릅니다. ` +
        '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }
  return { ...entry, payloadPath, destinationPath, action: 'replace' };
});

if (actions.every((entry) => entry.action === 'unchanged')) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp}`);

actions.forEach((entry) => {
  if (entry.action !== 'replace') return;
  const backupPath = path.join(backupRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(entry.destinationPath, backupPath);
});

actions.forEach((entry) => {
  if (entry.action === 'unchanged') return;
  fs.mkdirSync(path.dirname(entry.destinationPath), { recursive: true });
  fs.copyFileSync(entry.payloadPath, entry.destinationPath);
  if (gitBlobHash(entry.destinationPath) !== entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
});

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 출근 시 1개 동의 시작층~마지막층을 작업범위로 등록');
console.log('- 출근 시 전체 층 또는 작업예정 세대를 골구도에서 선택');
console.log('- 퇴근 시 출근 범위 전체와 다른 동·층 추가 작업범위를 함께 표시');
console.log('- 동·층별 전체 완료 또는 개별 완료세대 선택');
console.log('- 담당자 승인 후에만 기존 진척관리에 작업완료 반영');
console.log('- 작업자 화면 6개 언어 고정 번역 적용');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- 코드 적용 전 Supabase SQL을 먼저 실행해야 합니다.');
