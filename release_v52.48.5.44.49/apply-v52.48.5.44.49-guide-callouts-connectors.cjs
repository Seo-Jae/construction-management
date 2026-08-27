const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.49';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.49');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: ['800d9ef2fcb44ccf742fd4d2a3e761cd9aa506540a6f344575966fe9f70f814b'],
    releaseHash: '76c8564a0ca857db007e8eb0793a18534273efdc2ab2c7c5b69a6d712e22d854',
  },
  {
    relativePath: 'src/config/guideCatalog.js',
    baseHashes: ['cc8c1dd1486b9deda6ec90152eff61e1c34d25de7606ab71f0fdfcf87a0e9fb3'],
    releaseHash: '2a7665313a013dbccf33ef7da4647199fab383292be5190ce83c5f37b8659c3d',
  },
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['e4ccd34c0f01f15cc01ede0e0a5e5bb27556fde74245d32f6b6b563ceb00a767'],
    releaseHash: '6b33dea44b335d042bac02f8f966c8ecc1e43b58deb8e38718eee77e29ba8e1d',
  },
  {
    relativePath: 'src/utils/guideAnnotationEditor.js',
    baseHashes: ['3d968b9db3a8b2260f64f9b6d4e25e92173845fc8a7462057de0ab52efbf5d0d'],
    releaseHash: 'baeaf62ae352afc2077b81741942108651f94b3beaf37ac02297f47d69c60282',
  },
  {
    relativePath: 'src/components/GuideAnnotatedImage.jsx',
    baseHashes: ['3a5a2aa8fe468addd189c711840833e414455ef1de3c63b29f7ef50922cc56ed'],
    releaseHash: 'c6db614a0a106fecdedfd1129838c95ba52f4338ff233080f59061c8bcd4a78b',
  },
];
function fail(message) { console.error(`[${VERSION}] ${message}`); process.exit(1); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
const resolved = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));
resolved.forEach((file) => {
  if (!fs.existsSync(file.source)) fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  if (sha256(file.source) !== file.releaseHash) fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  if (!fs.existsSync(file.target)) fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
});
resolved.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.49_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});
resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});
console.log(`[${VERSION}] 적용 완료`);
console.log('- 세부 1·2·3 설명을 이미지 하단 목록이 아닌 화면 내부 설명박스로 표시');
console.log('- 번호 원과 설명박스를 도형과 별도로 자유 이동');
console.log('- 번호 연결 화살표 추가: 시작 번호/도착 번호를 클릭해 자동 연결');
console.log('- 번호 원을 이동하면 연결 화살표도 자동 추적');
console.log('- 동그라미/점선박스/화살표 선 두께 1~10 조절');
console.log('- 하단은 화면 전체를 대표하는 안내 문구만 표시');
console.log('- DB 스키마 변경 없음');
