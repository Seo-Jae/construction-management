const fs = require('fs');
const path = require('path');

const VERSION = 'v52.08';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const relativePaths = [
  path.join('src', 'Dashboard.jsx'),
  path.join('src', 'components', 'MessengerButton.jsx'),
  path.join('src', 'page', 'Messenger.jsx'),
  path.join('src', 'utils', 'messengerFiles.js'),
];

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error(
    '\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n',
  );
  process.exit(1);
}

for (const relativePath of relativePaths) {
  const sourcePath = path.join(releaseRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    console.error(`\n[중단] 메신저 배포 파일을 찾을 수 없습니다.\n- ${sourcePath}\n`);
    process.exit(1);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${timestamp}`);

try {
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(releaseRoot, relativePath);
    const targetPath = path.join(projectRoot, relativePath);

    if (fs.existsSync(targetPath)) {
      const backupPath = path.join(backupRoot, relativePath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(targetPath, backupPath);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }

  console.log('\n=====================================================');
  console.log('사내시스템 v52.08 메신저 v1.2 적용 완료');
  console.log('기준: v52.07 누적 상태');
  console.log('=====================================================');
  console.log('\n[적용 파일]');
  relativePaths.forEach((relativePath) => console.log(`- ${relativePath}`));
  console.log('\n[자동 백업]');
  console.log(`- ${backupRoot}`);
  console.log('\n[중요] Supabase SQL은 별도로 먼저 실행해야 합니다.');
  console.log('- release_v52.08\\Supabase에서_실행\\00_메신저_v1.2_전체설치.sql');
  console.log('\n다음 순서');
  console.log('1. Supabase SQL 실행 결과 확인');
  console.log('2. npm run build');
  console.log('3. 서로 다른 2개 계정으로 메신저 실제 송수신 테스트');
  console.log('4. 변경 파일만 git add');
  console.log('5. git commit / git push');
  console.log('6. Vercel Production Ready 및 운영 화면 확인\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
