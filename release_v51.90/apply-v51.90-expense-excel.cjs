const fs = require('fs');
const path = require('path');

const VERSION = 'v51.90';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    source: path.join(releaseRoot, 'src', 'utils', 'expenseResolutionExcel.js'),
    target: path.join(projectRoot, 'src', 'utils', 'expenseResolutionExcel.js'),
    label: 'src/utils/expenseResolutionExcel.js',
  },
];

if (!fs.existsSync(path.join(projectRoot, 'package.json')) || !fs.existsSync(path.join(projectRoot, 'src'))) {
  console.error('\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n');
  process.exit(1);
}

for (const file of files) {
  if (!fs.existsSync(file.source)) {
    console.error(`\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${file.source}\n`);
    process.exit(1);
  }
}

const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const hasExcelJs = Boolean(packageJson.dependencies?.exceljs || packageJson.devDependencies?.exceljs);

if (!hasExcelJs) {
  console.error('\n[중단] package.json에 exceljs가 없습니다. v51.89까지 먼저 적용해주세요.\n');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupSuffix = `.bak-${VERSION}-${timestamp}`;
const backups = [];

try {
  files.forEach((file) => {
    fs.mkdirSync(path.dirname(file.target), { recursive: true });
    if (fs.existsSync(file.target)) {
      const backupPath = `${file.target}${backupSuffix}`;
      fs.copyFileSync(file.target, backupPath);
      backups.push(backupPath);
    }
    fs.copyFileSync(file.source, file.target);
  });

  console.log('\n============================================');
  console.log(`지출결의서 작성 ${VERSION} 엑셀 날짜·상세내역 색상 적용 완료`);
  console.log('============================================');
  console.log('\n[적용 파일]');
  files.forEach((file) => console.log(`- ${file.label}`));

  if (backups.length > 0) {
    console.log('\n[자동 백업]');
    backups.forEach((backupPath) => console.log(`- ${backupPath}`));
  }

  console.log('\n이번 버전은 DB 변경이 없어 Supabase SQL 실행이 필요하지 않습니다.');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. 지출결의서에서 엑셀 다운로드');
  console.log('3. 날짜 형식과 상세내역 색상 확인');
  console.log('4. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
