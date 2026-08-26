const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.27';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.27');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: 'a10a71aa01ab8f37f6d55714ed6c2ddac500944e800ae111d83d1b963ce8f240',
    releaseHash: '40933ad84df16dd4d770843f9ec10ae778936ab2ebd4c4c09c36e5e267a1e78b',
  },
  {
    relativePath: 'src/index.css',
    baseHash: '867655feb48429a8ac556575c7eb75f592c1db66d637a40333f827b289d9c411',
    releaseHash: '2c6162f22f6ae0dd874587c4e75765b9294b5f72ca2e1d4f2bd49b016adfddab',
  },
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHash: 'f52ca94a08175279d04bb6072405a51d81296af9375faecfcc555b33e70c3785',
    releaseHash: '28c43d1b9d42bc3c7fb775710938a7efc98b468a1e2afb13f06590bf9a1ff318',
  },
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash: 'a14518c394bd2d8394ed7218d6c6f8deeb8a0a88646aba96eda0c8c6bfb4b6c2',
    releaseHash: '251dbde18493e85da3b7b737badb1cb90c4dc989b96ce57b54c150175934334c',
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
  if (!fs.existsSync(file.target) || !fs.existsSync(file.source)) {
    fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }

  if (sha256(file.source) !== file.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  }

  const targetHash = sha256(file.target);

  if (targetHash !== file.baseHash && targetHash !== file.releaseHash) {
    fail(`v52.48.5.44.26 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.27_${timestamp}`,
    file.relativePath,
  );

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.copyFileSync(file.source, file.target);
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 표시 옵션 목록 선택박스 하단 고정');
console.log('- 목록 최대 10행·이후 내부 스크롤');
console.log('- 90% 골구도 셀테두리·층간격 물리 1px 보정');
console.log('- 새 Supabase SQL 실행 없음');
