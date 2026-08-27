const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.47';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.47');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHashes: [
      '670c784e9fee31b6d91fc1682916e6901c2efd423eb98923a0cf8ede3d5f6606',
      '7e1f28db00411bb29bb2141ba698dafc5833b14dfc18878bb80a8c278c3acd03',
    ],
    releaseHash: '0c059f46bc47a1925158bc020d3823db7bc65ba1d8626900ecc5402e8049fb76',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/components/Sidebar.jsx',
    baseHashes: [
      'c75637cc9feff40f45074297455fb568fd7cbead12ef7c51ea26c7d182da80bb',
      '36a53dd3443e279ffb5fc5ad81b74ebc42cf63846dd50f93a38d016b48237265',
    ],
    releaseHash: '24a087a53da0670bf4bfdcff298c5b5f4e54dad760a09f0c59e4ea2afb2a2447',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: ['7fc71b53d0600a4e155f4ba487f356dcdc7b6d43ee73ab20bca5244e5ee64802'],
    releaseHash: '9f1022383a863bb933f0a2925561a11288a678c9f4e631464d18697d84f5a66f',
    allowMissingTarget: true,
  },
  {
    relativePath: 'src/components/SystemGuideButton.jsx',
    baseHashes: [],
    releaseHash: '2c2070e0573fa021d81f3cfe6053f89d7df8303319bf7facea99766e8ba167e3',
    allowMissingTarget: true,
  },
  {
    relativePath: 'src/config/guideCatalog.js',
    baseHashes: [],
    releaseHash: '339eaf0b9a95f02f2def2bad871f23fdf5f9dab502023f8d1e626f6c2d98ff6e',
    allowMissingTarget: true,
  },
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: [],
    releaseHash: '38505c31396a2d3e2d5e4c50d4ceb5f796b12a503dff89c732edfb253d005b0f',
    allowMissingTarget: true,
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}
function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const resolved = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));

resolved.forEach((file) => {
  if (!fs.existsSync(file.source)) fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  if (sha256(file.source) !== file.releaseHash) fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  if (!fs.existsSync(file.target)) {
    if (file.allowMissingTarget) return;
    fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolved.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) return;
  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.47_${timestamp}`, file.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file.target, backupPath);
  }
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (!fs.existsSync(file.target) || sha256(file.target) !== file.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 설정 메뉴를 최고관리자 전용으로 변경');
console.log('- 각 실제 메뉴 상단 공통 영역에 가이드 버튼 추가');
console.log('- 가이드 버튼은 일위대가 기술자료와 유사한 별도 팝업 창으로 표시');
console.log('- 최고관리자 가이드 설정에서 단계별 설명/이미지/주의사항 작성 및 공개 지원');
console.log('- Supabase SQL 실행 필요: supabase_v52.48.5.44.47_system_guides.sql');
