const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = 'v51.92';
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
  console.error('\n[중단] package.json에 exceljs가 없습니다. 지출결의서 엑셀 기능을 먼저 적용해주세요.\n');
  process.exit(1);
}

const hasPdfJs = Boolean(packageJson.dependencies?.['pdfjs-dist'] || packageJson.devDependencies?.['pdfjs-dist']);
if (!hasPdfJs) {
  console.log(`\n[필수 패키지 설치] pdfjs-dist@${PDFJS_VERSION}`);
  console.log('[안내] 기존 패키지의 peer dependency 충돌을 피하도록 legacy-peer-deps 옵션을 사용합니다.');

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const installArgs = [
    'install',
    `pdfjs-dist@${PDFJS_VERSION}`,
    '--save',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
  ];
  const installResult = spawnSync(npmCommand, installArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (installResult.error) {
    console.error(`\n[npm 실행 오류] ${installResult.error.message}`);
  }

  if (installResult.status !== 0) {
    console.error('\n[중단] pdfjs-dist 설치 명령이 실패했습니다.');
    console.error('위쪽에 표시된 npm ERR! 내용을 확인해주세요.');
    console.error('\n프로젝트 최상위 폴더에서 아래 명령을 직접 실행할 수 있습니다.');
    console.error(`npm install pdfjs-dist@${PDFJS_VERSION} --save --legacy-peer-deps --no-audit --no-fund`);
    console.error('\n레지스트리 관련 오류(404, ETARGET, EAI_AGAIN)가 표시되면 아래 명령을 실행하세요.');
    console.error('npm config set registry https://registry.npmjs.org/');
    console.error(`npm install pdfjs-dist@${PDFJS_VERSION} --save --legacy-peer-deps --no-audit --no-fund`);
    console.error('');
    process.exit(1);
  }

  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson.dependencies?.['pdfjs-dist'] && !packageJson.devDependencies?.['pdfjs-dist']) {
    console.error('\n[중단] npm 명령은 끝났지만 package.json에 pdfjs-dist가 기록되지 않았습니다.\n');
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
  console.log(`지출결의서 작성 ${VERSION} 도착시간·유류비·셀 직접수정 적용 완료`);
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
  console.log('2. 통행료 PDF 업로드 후 km와 유류비 일괄입력 확인');
  console.log('3. 갑지 통행료 내용칸의 도착지·시간 표시 확인');
  console.log('4. 사용내역 표의 셀 직접수정 확인');
  console.log('5. 엑셀 갑지의 유류비·통행료 금액 분리 확인');
  console.log('6. 엑셀 날짜 형식과 상세내역 색상 유지 확인');
  console.log('7. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
