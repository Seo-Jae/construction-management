const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.12';
const projectRoot = process.cwd();
const entries = [
  {
    relativePath: 'src/page/AttendanceManagement.jsx',
    baseHash: 'a62f9058470f2d60641dae82abfceed76a39474f',
    targetHash: 'bdba6868f52fc5b6fd6c13a7f82d2a35ab77714a',
  },
  {
    relativePath: 'src/components/AttendanceProgressBuildingOverview.jsx',
    baseHash: null,
    targetHash: '415ec8c312cbbbee0b999b9f747435f5d4c8181e',
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

const states = entries.map((entry) => {
  const payloadPath = path.join(__dirname, 'files', entry.relativePath);
  const destinationPath = path.join(projectRoot, entry.relativePath);

  if (!fs.existsSync(payloadPath)) {
    fail(`패키지 안의 교체 파일이 없습니다: ${entry.relativePath}`);
  }
  if (gitBlobHash(payloadPath) !== entry.targetHash) {
    fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }

  if (!fs.existsSync(destinationPath)) {
    if (entry.baseHash !== null) {
      fail(`기준 파일이 없습니다: ${entry.relativePath}`);
    }
    return { entry, payloadPath, destinationPath, status: 'create' };
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { entry, payloadPath, destinationPath, status: 'unchanged' };
  }
  if (entry.baseHash === null || currentHash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 예상 기준 버전과 다릅니다. ` +
        '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }
  return { entry, payloadPath, destinationPath, status: 'replace' };
});

if (states.every((state) => state.status === 'unchanged')) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp}`);

for (const state of states) {
  if (state.status === 'unchanged') continue;

  if (state.status === 'replace') {
    const backupPath = path.join(backupRoot, state.entry.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(state.destinationPath, backupPath);
  }

  fs.mkdirSync(path.dirname(state.destinationPath), { recursive: true });
  fs.copyFileSync(state.payloadPath, state.destinationPath);
  if (gitBlobHash(state.destinationPath) !== state.entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${state.entry.relativePath}`);
  }
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 같은 날짜·같은 공정의 공동작업 제출을 하나의 승인 묶음으로 통합');
console.log('- 중복 세대는 진척도에 한 번만 반영하고 작업자 이력은 모두 보존');
console.log('- 승인 검토 화면을 해당 동 전체 골구도로 변경');
console.log('- 기존 완료 세대는 회색, 금일 제출 세대는 초록색으로 표시');
console.log('- 공동 작업 세대에는 제출 인원 수 배지 표시');
console.log('- 테스트계정 초기화 시 공동작업자의 진척은 안전하게 보존');
if (states.some((state) => state.status === 'replace')) {
  console.log(`- 원본 백업: ${backupRoot}`);
}
console.log('- 코드 적용 전 Supabase SQL을 먼저 실행해야 합니다.');
