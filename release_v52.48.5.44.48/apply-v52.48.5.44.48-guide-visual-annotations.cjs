const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.48';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.48');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: ['9f1022383a863bb933f0a2925561a11288a678c9f4e631464d18697d84f5a66f'],
    releaseHash: '800d9ef2fcb44ccf742fd4d2a3e761cd9aa506540a6f344575966fe9f70f814b',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/config/guideCatalog.js',
    baseHashes: ['339eaf0b9a95f02f2def2bad871f23fdf5f9dab502023f8d1e626f6c2d98ff6e'],
    releaseHash: 'cc8c1dd1486b9deda6ec90152eff61e1c34d25de7606ab71f0fdfcf87a0e9fb3',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['38505c31396a2d3e2d5e4c50d4ceb5f796b12a503dff89c732edfb253d005b0f'],
    releaseHash: 'e4ccd34c0f01f15cc01ede0e0a5e5bb27556fde74245d32f6b6b563ceb00a767',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/utils/guideAnnotationEditor.js',
    baseHashes: [],
    releaseHash: '3d968b9db3a8b2260f64f9b6d4e25e92173845fc8a7462057de0ab52efbf5d0d',
    allowMissingTarget: true,
  },
  {
    relativePath: 'src/components/GuideAnnotatedImage.jsx',
    baseHashes: [],
    releaseHash: '3a5a2aa8fe468addd189c711840833e414455ef1de3c63b29f7ef50922cc56ed',
    allowMissingTarget: true,
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
  if (!fs.existsSync(file.target)) { if (file.allowMissingTarget) return; fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`); }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
});
resolved.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) return;
  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.48_${timestamp}`, file.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file.target, backupPath);
  }
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});
resolved.forEach((file) => {
  if (!fs.existsSync(file.target) || sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});
console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 설정을 실제 화면 이미지 기반 편집 방식으로 변경');
console.log('- 번호 / 동그라미 / 점선박스 / 화살표 표시 편집기 추가');
console.log('- 각 표시 번호별 안내 제목/상세 설명 연결');
console.log('- 사용자 팝업: 사용 순서 한눈에 보기 + 상세 이용가이드 자동 구성');
console.log('- DB 스키마 변경 없음 (.47 가이드 SQL이 이미 적용되어 있으면 추가 SQL 불필요)');
