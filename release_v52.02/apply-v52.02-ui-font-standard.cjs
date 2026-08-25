const fs = require('fs');
const path = require('path');

const VERSION = 'v52.02';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const relativeFiles = [
  ['src', 'Dashboard.jsx'],
  ['src', 'main.jsx'],
  ['src', 'theme.js'],
  ['src', 'page', 'DrawingQuantityAnalysis.jsx'],
  ['src', 'page', 'LaborContractManagement.jsx'],
  ['src', 'page', 'OrganizationChart.jsx'],
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
  console.log('사내시스템 v52.02 일반 화면 글꼴 통일 완료');
  console.log('============================================');
  console.log('\n[적용 파일]');
  files.forEach((file) => console.log(`- ${file.relativePath}`));

  if (backupFiles.length > 0) {
    console.log('\n[자동 백업]');
    backupFiles.forEach((backupPath) => console.log(`- ${backupPath}`));
  }

  console.log('\nSupabase SQL 실행은 필요하지 않습니다.');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. npm run dev');
  console.log('3. 일반 화면·조직도·도면분석·작업자 코드 글꼴 확인');
  console.log('4. 출력 양식과 담당자 서명 글꼴 유지 확인');
  console.log('5. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
