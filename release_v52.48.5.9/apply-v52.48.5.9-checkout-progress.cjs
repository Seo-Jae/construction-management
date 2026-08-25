const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.9';
const projectRoot = process.cwd();
const entries = [
  {
    relativePath: 'src/page/AttendanceWorkerPortal.jsx',
    baseHash: 'b7dcbf10f74611b3eed7f4f3c0938f9dec3236cd',
    targetHash: '9222210129383c904551351248393d8bd9f14e6d',
  },
  {
    relativePath: 'src/page/AttendanceManagement.jsx',
    baseHash: '5ebf800f39c5e6907d2d9a00693811faf0e8c7a2',
    targetHash: '0d5d1f449f5158f5f2022a486ee84b7e19ea14e9',
  },
  {
    relativePath: 'src/utils/attendanceI18n.js',
    baseHash: '9c68ab0145015a1874545c5d6974b74c519d53df',
    targetHash: '937448f9e489f0116985c9aa3bc49ada4dc086a5',
  },
  {
    relativePath: 'src/components/AttendanceCheckoutProgressDialog.jsx',
    baseHash: null,
    targetHash: '617815ef4c0f0d1f9dfd01da714529677e66b4cf',
  },
  {
    relativePath: 'src/components/AttendanceProgressFloorGrid.jsx',
    baseHash: null,
    targetHash: 'f5f8d30f328740671409afa57ad1fd2ded5905ca',
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

  if (fs.existsSync(destinationPath)) {
    const currentHash = gitBlobHash(destinationPath);
    if (currentHash === entry.targetHash) {
      return { ...entry, payloadPath, destinationPath, action: 'unchanged' };
    }
    if (!entry.baseHash || currentHash !== entry.baseHash) {
      fail(
        `${entry.relativePath} 내용이 예상 기준 버전과 다릅니다. ` +
          '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
      );
    }
    return { ...entry, payloadPath, destinationPath, action: 'replace' };
  }

  if (entry.baseHash) {
    fail(`기준 파일이 없습니다: ${entry.relativePath}`);
  }
  return { ...entry, payloadPath, destinationPath, action: 'create' };
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
console.log('- 퇴근 QR 후 오전 작업위치·공정 확인');
console.log('- 골구도에서 완료 세대 선택 및 진척 승인 요청');
console.log('- 통합관리시스템 근태관리에 진척 승인·반려 탭 추가');
console.log('- 담당자 승인 후에만 기존 진척관리에 작업완료 반영');
console.log('- 작업자 퇴근 화면 6개 언어 고정 번역 적용');
if (actions.some((entry) => entry.action === 'replace')) {
  console.log(`- 원본 백업: ${backupRoot}`);
}
console.log('- 코드 적용 전 Supabase SQL을 먼저 실행해야 합니다.');
