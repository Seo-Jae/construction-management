const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.55';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.55');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/guideAnnotationEditor.js',
    baseHashes: ['e9dc0b7b65957dbad5525011b2b33791a05c6770c76f920bbf6e50e3f052e425'],
    releaseHash: '797aab4f58d832c9d67527a773ad0504f505fa4269f88741db0bd67f9eca9d43',
  },
  {
    relativePath: 'src/config/guideCatalog.js',
    baseHashes: ['71688f6443df24608d8149235ac17c41ae956c292f50b796759512551823ce2a'],
    releaseHash: '47c64cba127af29fe18d69e950e53cf335d0b3a785fd63e0d58e24d3465a1ca0',
  },
  {
    relativePath: 'src/components/GuideAnnotatedImage.jsx',
    baseHashes: ['ecdd9321eaf232edbabc337b2fcf127562133d7d58752824e98af92b1626709a'],
    releaseHash: '53952c8dc95e1e0683dd580d37cdcdf17bdd27485c4fdfbf448828fcdb75970d',
  },
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['695b9242906e773388c5716145160d49e0a01c8e94341e7f25e8a26403932a6a'],
    releaseHash: 'c333de0060794531e3c3020a95ef8966e3eb8d7735e9939d79cc127cca86571b',
  },
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: ['667a5ea7b6c0b819a380741263a328a47ba2fa817fb47298e88b29a53c633903'],
    releaseHash: 'b007fae4c548eb6a563b1d9252f1b0066e6d9d31032a25a36d9dd63e2f7f52b2',
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
  if (!fs.existsSync(file.target)) fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolved.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.55_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 표시 편집기에 “지점 연결 화살표” 버튼 추가');
console.log('- 시작 지점 1회 클릭 → 도착 지점 1회 클릭으로 화살표 생성');
console.log('- 번호/도형과 관계없는 임의 위치끼리 연결 가능');
console.log('- 생성된 지점 연결 화살표는 번호 및 설명박스를 만들지 않음');
console.log('- 우측 패널에서 색상/선 두께/시작·도착 좌표 미세 조정 가능');
console.log('- 상세 가이드/작성 미리보기/공개 가이드에서도 동일하게 표시');
console.log('- 추가 Supabase SQL 없음');
