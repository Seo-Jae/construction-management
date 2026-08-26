const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.32';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.32');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHashes: [
      '7e3df65c965d0804145eea3c4ea7aad3b418c1184a69a83212a3b5bd9fd6f903',
      '9a1267273aee6ba6c4e7a7ae3cd08b17193526dd23581ba2dfa9cf376ff02d8b',
    ],
    releaseHash: '9e535821b65dd3a2435192a9dd2151145d652ed3d7ede83dc60777eed61d89cd',
    required: true,
  },
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '28f4d3448ded48a6f9be3c9dfc4faa614083eaebedcf081f82d73f8fbe102ed1',
      'f005c1c37dd052bc179c1bb8176cb221b59c0f7882c463f57cbd33699f1c85f3',
    ],
    releaseHash: 'dabb28b30f80af8382286cf44a55879f7311af009695481448d8454a707a5329',
    required: false,
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      '40bca5b884f07d17d7143276a372422b4d19cf7d99a26bed190af302358049e0',
    ],
    releaseHash: '3488adfd24eecd73541c85d4f16da481264fc458f7c69e7bac0c4028d97b057f',
    required: false,
  },
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHashes: [
      '26f40c03db79a4c863a7dff76eb178016943e679d09997d6c9151366e353f0bb',
    ],
    releaseHash: '76772545570e31a57dbb018230fe9f534451f9406ac2b64250bac0c626fde98a',
    required: true,
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

const resolvedFiles = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));

resolvedFiles.forEach((file) => {
  if (!fs.existsSync(file.source)) fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  if (sha256(file.source) !== file.releaseHash) fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  if (!fs.existsSync(file.target)) {
    if (file.required) fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
    return;
  }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) return;
  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.32_${timestamp}`, file.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file.target, backupPath);
  }
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolvedFiles.forEach((file) => {
  if (!fs.existsSync(file.target) || sha256(file.target) !== file.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 세대물량 기본 공정 6개 정리');
console.log('- 좌측 목록 하단 공정 추가하기');
console.log('- 추가 공정 갑지·Excel·저장 유지');
console.log('- 옵션별 비교 선택옵션 전용 전환');
console.log('- 새 Supabase SQL 없음');
