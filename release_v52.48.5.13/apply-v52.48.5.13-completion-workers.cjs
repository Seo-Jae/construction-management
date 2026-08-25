const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.13';
const projectRoot = process.cwd();
const entries = [
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHash: '975015a060e8b3478a5621f0c7ef48ceb23c9e5b',
    targetHash: '4035cc7c10dce368bad431395d7a883235719140',
  },
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: '7b42a633fa84452824d9b1464d157e1dfd6fafe3',
    targetHash: '08c77ce4d6926099a53807d4407a67a83dddedaa',
  },
  {
    relativePath: 'src/page/AttendanceManagement.jsx',
    baseHash: 'bdba6868f52fc5b6fd6c13a7f82d2a35ab77714a',
    targetHash: '848ba1b489b9f942ef8c2ded823519ae96ecc2f4',
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
    fail(`기준 파일이 없습니다: ${entry.relativePath}`);
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { entry, payloadPath, destinationPath, status: 'unchanged' };
  }
  if (currentHash !== entry.baseHash) {
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

  const backupPath = path.join(backupRoot, state.entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(state.destinationPath, backupPath);

  fs.copyFileSync(state.payloadPath, state.destinationPath);
  if (gitBlobHash(state.destinationPath) !== state.entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${state.entry.relativePath}`);
  }
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 공정별 현황 입력의 완료 세대에 작업자 툴팁 표시');
console.log('- 해당 동·층·호 세대에 커서를 올렸을 때만 작업자명 표시');
console.log('- 공동작업 세대는 해당 세대에 참여한 작업자를 함께 표시');
console.log('- 휴대폰·태블릿에서는 완료 세대 터치로 확인 가능');
console.log('- 관리자 직접입력 시 이전 근태 작업자 연결정보 제거');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- 코드 적용 전 Supabase SQL을 먼저 실행해야 합니다.');
