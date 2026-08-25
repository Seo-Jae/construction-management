const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const files = [
  {
    relative: path.join('src', 'App.jsx'),
    expected: 'a1ff5e88efc481a3ef66be07b7147ebbf17d05d7175c9e886f14e9d8109c0437',
  },
  {
    relative: path.join('src', 'Dashboard.jsx'),
    expected: '28b2b1f325a932132b4e22cb606437fce79e4ed72d566e7241ab10370716e439',
  },
  {
    relative: path.join('src', 'components', 'MessengerButton.jsx'),
    expected: 'ce8750cd42ed98c0e1bfe400c5661cc437fabbafbc717f8b244ad62dfdf71cd3',
  },
  {
    relative: path.join('src', 'page', 'Messenger.jsx'),
    expected: '0a8316d1d33ae042eca1fea569b2419f6e84f845b84ebf52a6164cf3b5be67dc',
  },
  {
    relative: path.join('src', 'utils', 'messengerFiles.js'),
    expected: '4fa15380e1ce21a081076826939802aa9c91ad7d70e31d08352d0e0358c1a1bf',
  },
];

const newFiles = [
  path.join('src', 'page', 'MessengerWindow.jsx'),
];

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.09] package.json을 찾을 수 없습니다. release_v52.09 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

for (const item of files) {
  const target = path.join(projectRoot, item.relative);
  const source = path.join(releaseDir, item.relative);

  if (!fs.existsSync(source) || !fs.existsSync(target)) {
    console.error(`[v52.09] 파일을 찾을 수 없습니다: ${item.relative}`);
    process.exit(1);
  }

  const currentHash = sha256(target);
  if (currentHash !== item.expected) {
    console.error(`[v52.09] 현재 ${item.relative} 파일이 검증된 v52.08.4 기준과 일치하지 않습니다.`);
    console.error('기존 기능 보호를 위해 자동 덮어쓰기를 중단합니다.');
    console.error(`- 현재 SHA256: ${currentHash}`);
    console.error(`- 예상 SHA256: ${item.expected}`);
    process.exit(1);
  }
}

for (const relative of newFiles) {
  const source = path.join(releaseDir, relative);
  if (!fs.existsSync(source)) {
    console.error(`[v52.09] 신규 파일을 찾을 수 없습니다: ${relative}`);
    process.exit(1);
  }
}

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const backupRoot = path.join(projectRoot, `backup_v52.09_${stamp}`);

for (const item of files) {
  const target = path.join(projectRoot, item.relative);
  const backup = path.join(backupRoot, item.relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

for (const relative of newFiles) {
  const target = path.join(projectRoot, relative);
  if (fs.existsSync(target)) {
    const backup = path.join(backupRoot, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }
}

const allFiles = [...files.map((item) => item.relative), ...newFiles];
for (const relative of allFiles) {
  const source = path.join(releaseDir, relative);
  const target = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log('[v52.09] 메신저 사용성 개선 적용 완료');
allFiles.forEach((relative) => console.log(`- 변경: ${relative}`));
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- Supabase SQL: release_v52.09\\Supabase에서_실행\\00_v52.09_메신저_사용성_알림_방장권한.sql');
console.log('- 다음 단계: npm run build');
