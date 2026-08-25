const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = __dirname;
const projectRoot = path.resolve(releaseDir, '..');

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const fileRules = [
  {
    relative: path.join('src', 'App.jsx'),
    accepted: [
      'a1ff5e88efc481a3ef66be07b7147ebbf17d05d7175c9e886f14e9d8109c0437', // v52.08.4
      '4d1dbf516843b2aa4545aefb2068ed137b398ef4cbd610ccc666280f2364c52d', // v52.09/v52.10
    ],
  },
  {
    relative: path.join('src', 'Dashboard.jsx'),
    accepted: [
      '28b2b1f325a932132b4e22cb606437fce79e4ed72d566e7241ab10370716e439', // v52.08.4
      '795e65c7dc1ef8e95f8de5defc4a3d7e673aef7fcc2e2f1e518a9b8f5e0c1cdc', // v52.09
      '74a178b2274a020dee7a54054c1a80750fa27db7f2779de8d4929ef6baedb45e', // v52.10
    ],
  },
  {
    relative: path.join('src', 'components', 'MessengerButton.jsx'),
    accepted: [
      'ce8750cd42ed98c0e1bfe400c5661cc437fabbafbc717f8b244ad62dfdf71cd3', // v52.08.4
      '3789b9bd4e2f7f50b8cccad3826c46b9a185e67939476b04c8b76475c063d4e2', // v52.09
      '2bd709a34d1295ac0b60ec189bee90476b75fe5f3c1a0f17c5e460050919aa31', // v52.10
    ],
  },
  {
    relative: path.join('src', 'page', 'Messenger.jsx'),
    accepted: [
      '0a8316d1d33ae042eca1fea569b2419f6e84f845b84ebf52a6164cf3b5be67dc', // v52.08.4
      '690b881b3b8a5f3fdda35d8581bd2587908cc0bcb45d8edf054575db135126c7', // v52.09
      '4cc7dcba1f2f3fc11a94255de331a868dc7204b219d4a72912aa5b52520c5610', // v52.10
    ],
  },
  {
    relative: path.join('src', 'utils', 'messengerFiles.js'),
    accepted: [
      '4fa15380e1ce21a081076826939802aa9c91ad7d70e31d08352d0e0358c1a1bf', // v52.08.4
      '7b0fdd4c7168ce5442b4cfb9e19ebf8825363f453d5e8e739e728a0649ec22af', // v52.09/v52.10
    ],
  },
];

const optionalExistingRules = [
  {
    relative: path.join('src', 'page', 'MessengerWindow.jsx'),
    accepted: [
      '29830e57044664585e32aca74a3621c34815889a0d4b4511ffd03552e5cf03a8', // v52.09/v52.10
    ],
  },
];

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  console.error('[v52.10] package.json을 찾을 수 없습니다. release_v52.10 폴더를 프로젝트 최상위에 두고 실행해주세요.');
  process.exit(1);
}

for (const item of fileRules) {
  const target = path.join(projectRoot, item.relative);
  const source = path.join(releaseDir, item.relative);

  if (!fs.existsSync(source) || !fs.existsSync(target)) {
    console.error(`[v52.10] 파일을 찾을 수 없습니다: ${item.relative}`);
    process.exit(1);
  }

  const currentHash = sha256(target);
  if (!item.accepted.includes(currentHash)) {
    console.error(`[v52.10] 현재 ${item.relative} 파일이 검증된 v52.08.4/v52.09 기준과 일치하지 않습니다.`);
    console.error('기존 기능 보호를 위해 자동 덮어쓰기를 중단합니다.');
    console.error(`- 현재 SHA256: ${currentHash}`);
    process.exit(1);
  }
}

for (const item of optionalExistingRules) {
  const target = path.join(projectRoot, item.relative);
  const source = path.join(releaseDir, item.relative);
  if (!fs.existsSync(source)) {
    console.error(`[v52.10] 신규 파일을 찾을 수 없습니다: ${item.relative}`);
    process.exit(1);
  }
  if (fs.existsSync(target)) {
    const currentHash = sha256(target);
    if (!item.accepted.includes(currentHash)) {
      console.error(`[v52.10] 현재 ${item.relative} 파일이 검증된 v52.09 기준과 일치하지 않습니다.`);
      console.error('기존 기능 보호를 위해 자동 덮어쓰기를 중단합니다.');
      console.error(`- 현재 SHA256: ${currentHash}`);
      process.exit(1);
    }
  }
}

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const backupRoot = path.join(projectRoot, `backup_v52.10_${stamp}`);

const allFiles = [
  ...fileRules.map((item) => item.relative),
  ...optionalExistingRules.map((item) => item.relative),
];

for (const relative of allFiles) {
  const target = path.join(projectRoot, relative);
  if (!fs.existsSync(target)) continue;
  const backup = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

for (const relative of allFiles) {
  const source = path.join(releaseDir, relative);
  const target = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log('[v52.10] 메신저 설치없는 웹 별도창/시스템알림/초안유지 적용 완료');
allFiles.forEach((relative) => console.log(`- 변경: ${relative}`));
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('- SQL: release_v52.10\\Supabase에서_실행\\00_v52.10_메신저_사용성_안전적용.sql');
console.log('- 다음 단계: npm run build');
