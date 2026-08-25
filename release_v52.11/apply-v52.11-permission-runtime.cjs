const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const files = [
  {
    rel: 'src/Dashboard.jsx',
    expected: [
      '74a178b2274a020dee7a54054c1a80750fa27db7f2779de8d4929ef6baedb45e',
      'e15c1f8113ae816b74d1e5f0c7d7588f7e0617608fff1def10f612283d276aa6',
    ],
  },
  {
    rel: 'src/components/Sidebar.jsx',
    expected: [
      '9d3ef762ee3c46670823bc7032e14371b83028a304295621c5293438088189b7',
      '3bdd4a404d2f6155c2ae1199e13966842538f7760eb857d738dbcd460ec1e945',
    ],
  },
  {
    rel: 'src/page/UserManagement.jsx',
    expected: [
      '12f0433c3cb4ece7c1bbf5afe1f0086cef5dd59d45ab5ebc7048434b047d3868',
      'd589bdcd187fb2381af133c920ae45954f27dc3956cd0b0fe22183af37c9a5d0',
    ],
  },
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('ERROR: release_v52.11 폴더를 package.json이 있는 프로젝트 최상위에 풀어주세요.');
  process.exit(1);
}

for (const item of files) {
  const target = path.join(projectRoot, item.rel);
  if (!fs.existsSync(target)) {
    console.error(`ERROR: 현재 파일을 찾을 수 없습니다: ${item.rel}`);
    process.exit(1);
  }
  const hash = sha256(target);
  if (!item.expected.includes(hash)) {
    console.error(`ERROR: ${item.rel} 파일이 v52.10.2 기준과 다릅니다.`);
    console.error(`현재 SHA256: ${hash}`);
    console.error('현재 파일을 보내 확인한 뒤 적용해주세요. 기존 기능 보호를 위해 적용을 중단합니다.');
    process.exit(1);
  }
}

const backupDir = path.join(projectRoot, `backup_v52.11_${stamp()}`);
fs.mkdirSync(backupDir, { recursive: true });

for (const item of files) {
  const source = path.join(releaseDir, item.rel);
  const target = path.join(projectRoot, item.rel);
  const backup = path.join(backupDir, item.rel);

  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`APPLIED: ${item.rel}`);
}

console.log('');
console.log(`백업 위치: ${backupDir}`);
console.log('v52.11 권한 프로세스 및 회원관리 접기 UI 적용 완료');
console.log('다음 명령: npm run build');
