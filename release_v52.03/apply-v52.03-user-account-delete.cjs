const fs = require('fs');
const path = require('path');

const VERSION = 'v52.03';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const relativeFiles = [
  ['src', 'Dashboard.jsx'],
  ['src', 'main.jsx'],
  ['src', 'theme.js'],
  ['src', 'page', 'DrawingQuantityAnalysis.jsx'],
  ['src', 'page', 'LaborContractManagement.jsx'],
  ['src', 'page', 'OrganizationChart.jsx'],
  ['src', 'page', 'UserManagement.jsx'],
];

const files = relativeFiles.map((parts) => {
  const relativePath = path.join(...parts);

  return {
    source: path.join(releaseRoot, relativePath),
    target: path.join(projectRoot, relativePath),
    relativePath,
  };
});

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error(
    '\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n',
  );
  process.exit(1);
}

for (const file of files) {
  if (!fs.existsSync(file.source)) {
    console.error(
      `\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${file.source}\n`,
    );
    process.exit(1);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(
  projectRoot,
  `backup_${VERSION}_${timestamp}`,
);
const backupFiles = [];

try {
  files.forEach((file) => {
    fs.mkdirSync(path.dirname(file.target), { recursive: true });

    if (fs.existsSync(file.target)) {
      const backupPath = path.join(backupRoot, file.relativePath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(file.target, backupPath);
      backupFiles.push(backupPath);
    }

    fs.copyFileSync(file.source, file.target);
  });

  console.log('\n============================================');
  console.log('사내시스템 v52.03 회원 계정 영구삭제 기능 적용 완료');
  console.log('============================================');
  console.log('\n[적용 파일]');
  files.forEach((file) => console.log(`- ${file.relativePath}`));

  if (backupFiles.length > 0) {
    console.log('\n[자동 백업]');
    backupFiles.forEach((backupPath) => console.log(`- ${backupPath}`));
  }

  console.log('\n[중요] Supabase SQL 실행이 필요합니다.');
  console.log('- release_v52.03/Supabase에서_실행_회원계정_영구삭제_v52.03.sql');
  console.log('\n다음 순서');
  console.log('1. Supabase SQL Editor에서 위 SQL 전체 실행');
  console.log('2. npm run build');
  console.log('3. npm run dev');
  console.log('4. 최고관리자 계정으로 회원관리 삭제 보호 확인');
  console.log('5. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}

