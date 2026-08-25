const fs = require('fs');
const path = require('path');

const VERSION = 'v52.05';
const projectRoot = process.cwd();
const releaseRoot = __dirname;
const relativePath = path.join('src', 'page', 'MainDashboard.jsx');
const sourcePath = path.join(releaseRoot, relativePath);
const targetPath = path.join(projectRoot, relativePath);

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error(
    '\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n',
  );
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(
    `\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${sourcePath}\n`,
  );
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  console.error(
    `\n[중단] 현재 프로젝트에서 교체 대상을 찾을 수 없습니다.\n- ${targetPath}\n`,
  );
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  projectRoot,
  `backup_${VERSION}_${timestamp}`,
  relativePath,
);

try {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(targetPath, backupPath);
  fs.copyFileSync(sourcePath, targetPath);

  console.log('\n============================================');
  console.log('사내시스템 v52.05 Main 캘린더 주요일정 적용 완료');
  console.log('============================================');
  console.log('\n[적용 파일]');
  console.log(`- ${relativePath}`);
  console.log('\n[자동 백업]');
  console.log(`- ${backupPath}`);
  console.log('\n[Supabase SQL]');
  console.log('- 추가 실행 불필요');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. npm run dev');
  console.log('3. 캘린더 좌측 2/3·주요일정 우측 1/3 확인');
  console.log('4. 빨간 점이 있는 날짜 클릭 후 상세 팝업 확인');
  console.log('5. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
