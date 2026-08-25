const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = 'v51.88';
const PDFJS_VERSION = '5.7.284';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    source: path.join(releaseRoot, 'src', 'page', 'ExpenseResolution.jsx'),
    target: path.join(projectRoot, 'src', 'page', 'ExpenseResolution.jsx'),
    label: 'src/page/ExpenseResolution.jsx',
  },
  {
    source: path.join(releaseRoot, 'src', 'utils', 'expenseResolutionExcel.js'),
    target: path.join(projectRoot, 'src', 'utils', 'expenseResolutionExcel.js'),
    label: 'src/utils/expenseResolutionExcel.js',
  },
  {
    source: path.join(releaseRoot, 'src', 'utils', 'highpassReceiptPdf.js'),
    target: path.join(projectRoot, 'src', 'utils', 'highpassReceiptPdf.js'),
    label: 'src/utils/highpassReceiptPdf.js',
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
let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const hasExcelJs = Boolean(packageJson.dependencies?.exceljs || packageJson.devDependencies?.exceljs);

if (!hasExcelJs) {
  console.error('\n[중단] package.json에 exceljs가 없습니다. v51.87 엑셀 기능을 먼저 적용해주세요.\n');
  process.exit(1);
}

const hasPdfJs = Boolean(packageJson.dependencies?.['pdfjs-dist'] || packageJson.devDependencies?.['pdfjs-dist']);
if (!hasPdfJs) {
  console.log(`\n[필수 패키지 설치] pdfjs-dist@${PDFJS_VERSION}`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const installResult = spawnSync(
    npmCommand,
    ['install', `pdfjs-dist@${PDFJS_VERSION}`],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  if (installResult.status !== 0) {
    console.error('\n[중단] pdfjs-dist 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해주세요.\n');
    process.exit(1);
  }
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson.dependencies?.['pdfjs-dist'] && !packageJson.devDependencies?.['pdfjs-dist']) {
    console.error('\n[중단] pdfjs-dist 설치 결과를 package.json에서 확인하지 못했습니다.\n');
    process.exit(1);
  }
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
  console.log(`지출결의서 작성 ${VERSION} 통행료 PDF 기능 적용 완료`);
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
  console.log('2. 지출결의서 신규 작성 화면에서 통행료 PDF 업로드');
  console.log('3. 출발지 입력 후 목록 반영과 엑셀 다운로드 확인');
  console.log('4. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
