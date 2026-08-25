const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.cwd();
const releaseRoot = __dirname;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_v52.10.2_${stamp}`);

const files = [
  {
    rel: 'src/components/MessengerButton.jsx',
    expected: '2bd709a34d1295ac0b60ec189bee90476b75fe5f3c1a0f17c5e460050919aa31',
  },
  {
    rel: 'src/page/MessengerWindow.jsx',
    expected: '29830e57044664585e32aca74a3621c34815889a0d4b4511ffd03552e5cf03a8',
  },
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const item of files) {
  const current = path.join(projectRoot, item.rel);
  if (!fs.existsSync(current)) {
    throw new Error(`현재 프로젝트 파일을 찾을 수 없습니다: ${item.rel}`);
  }
  const actual = sha256(current);
  if (actual !== item.expected) {
    throw new Error(
      `현재 ${item.rel} 파일이 v52.10 기준본과 다릅니다.\n` +
      `예상 SHA256: ${item.expected}\n현재 SHA256: ${actual}\n` +
      `임의 덮어쓰기를 중단했습니다.`
    );
  }
}

for (const item of files) {
  const current = path.join(projectRoot, item.rel);
  const source = path.join(releaseRoot, item.rel);
  const backup = path.join(backupRoot, item.rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(current, backup);
  fs.mkdirSync(path.dirname(current), { recursive: true });
  fs.copyFileSync(source, current);
  console.log(`적용: ${item.rel}`);
}

console.log(`\n백업 위치: ${backupRoot}`);
console.log('v52.10.2 메신저 시스템 알림 권한 UI 적용 완료');
