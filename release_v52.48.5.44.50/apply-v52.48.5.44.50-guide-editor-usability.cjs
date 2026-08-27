const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.50';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.50');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/config/guideCatalog.js',
    baseHashes: ['2a7665313a013dbccf33ef7da4647199fab383292be5190ce83c5f37b8659c3d'],
    releaseHash: '71688f6443df24608d8149235ac17c41ae956c292f50b796759512551823ce2a',
  },
  {
    relativePath: 'src/utils/guideAnnotationEditor.js',
    baseHashes: ['baeaf62ae352afc2077b81741942108651f94b3beaf37ac02297f47d69c60282'],
    releaseHash: 'e9dc0b7b65957dbad5525011b2b33791a05c6770c76f920bbf6e50e3f052e425',
  },
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['6b33dea44b335d042bac02f8f966c8ecc1e43b58deb8e38718eee77e29ba8e1d'],
    releaseHash: '3dec17330561c06228d38fa1f6c43f14d3279e3f382256c857c42d3d8f9682be',
  },
  {
    relativePath: 'src/components/GuideAnnotatedImage.jsx',
    baseHashes: ['c6db614a0a106fecdedfd1129838c95ba52f4338ff233080f59061c8bcd4a78b'],
    releaseHash: 'ecdd9321eaf232edbabc337b2fcf127562133d7d58752824e98af92b1626709a',
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
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.50_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 숫자 입력칸 높이/스피너 클릭 영역 확대');
console.log('- 화면 내 설명박스: 글자 길이 기준 자동 폭 + 자동 번호 접두어 제거');
console.log('- 점선박스/동그라미 번호 부착 위치 선택: 기본 우측상단 + 8방향 + 자유');
console.log('- 고정 번호는 도형 이동/크기 변경 시 자동 추적, 자유 선택 시 개별 이동');
console.log('- 점선박스/동그라미: 8개 리사이즈 핸들로 직접 크기 변경');
console.log('- 편집 화면: 빈 화면 드래그 이동 + 마우스 위치 기준 휠 확대/축소 + 맞춤');
console.log('- 번호 연결 화살표: 도착 번호 중심이 아닌 외곽 앞에서 여백을 두고 화살촉 종료');
console.log('- DB 스키마 변경 없음');
