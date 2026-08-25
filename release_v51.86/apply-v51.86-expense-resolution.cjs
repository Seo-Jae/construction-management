const fs = require('fs');
const path = require('path');

const VERSION = 'v51.86';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const targetPagePath = path.join(projectRoot, 'src', 'page', 'ExpenseResolution.jsx');
const bundledPagePath = path.join(releaseRoot, 'src', 'page', 'ExpenseResolution.jsx');

if (!fs.existsSync(bundledPagePath)) {
  console.error(`\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${bundledPagePath}\n`);
  process.exit(1);
}

if (!fs.existsSync(path.join(projectRoot, 'src'))) {
  console.error('\n[중단] 현재 프로젝트 최상위 폴더에서 실행해주세요. src 폴더를 찾지 못했습니다.\n');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupSuffix = `.bak-${VERSION}-${timestamp}`;

try {
  fs.mkdirSync(path.dirname(targetPagePath), { recursive: true });

  let backupPath = '';
  if (fs.existsSync(targetPagePath)) {
    backupPath = `${targetPagePath}${backupSuffix}`;
    fs.copyFileSync(targetPagePath, backupPath);
  }

  fs.copyFileSync(bundledPagePath, targetPagePath);

  console.log('\n============================================');
  console.log(`지출결의서 작성 ${VERSION} 화면 수정 적용 완료`);
  console.log('============================================');
  console.log('\n[교체 파일]');
  console.log('- src/page/ExpenseResolution.jsx');
  if (backupPath) {
    console.log('\n[자동 백업]');
    console.log(`- ${backupPath}`);
  }
  console.log('\n이번 버전은 DB 변경이 없어 Supabase SQL 실행이 필요하지 않습니다.');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. 화면 확인 후 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
