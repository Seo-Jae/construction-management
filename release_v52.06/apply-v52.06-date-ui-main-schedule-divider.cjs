const fs = require('fs');
const path = require('path');

const VERSION = 'v52.06';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const relativePaths = [
  path.join('src', 'Dashboard.jsx'),
  path.join('src', 'components', 'KoreanDatePicker.jsx'),
  path.join('src', 'components', 'KoreanMonthSelect.jsx'),
  path.join('src', 'page', 'DailyReport.jsx'),
  path.join('src', 'page', 'ExpenseResolution.jsx'),
  path.join('src', 'page', 'LaborContractManagement.jsx'),
  path.join('src', 'page', 'LaborCostManagement.jsx'),
  path.join('src', 'page', 'MainDashboard.jsx'),
  path.join('src', 'page', 'MaterialInputStatus.jsx'),
  path.join('src', 'page', 'ProgressClaimManagement.jsx'),
  path.join('src', 'page', 'ProgressInput.jsx'),
  path.join('src', 'page', 'ProposalReportEditor.jsx'),
  path.join('src', 'page', 'UserManagement.jsx'),
  path.join('src', 'page', 'WeeklyOverviewArchive.jsx'),
];

const newFiles = new Set([
  path.join('src', 'components', 'KoreanDatePicker.jsx'),
]);

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error('\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n');
  process.exit(1);
}

for (const relativePath of relativePaths) {
  const sourcePath = path.join(releaseRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    console.error(`\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${sourcePath}\n`);
    process.exit(1);
  }

  const targetPath = path.join(projectRoot, relativePath);
  if (!newFiles.has(relativePath) && !fs.existsSync(targetPath)) {
    console.error(`\n[중단] 현재 프로젝트에서 교체 대상을 찾을 수 없습니다.\n- ${targetPath}\n`);
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

  console.log('\n============================================');
  console.log('사내시스템 v52.06 날짜 UI 통일 + Main 경계선 적용 완료');
  console.log('============================================');
  console.log('\n[적용 파일]');
  relativePaths.forEach((relativePath) => console.log(`- ${relativePath}`));
  console.log('\n[자동 백업]');
  console.log(`- ${backupRoot}`);
  console.log('\n[Supabase SQL]');
  console.log('- 추가 실행 불필요');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. npm run dev');
  console.log('3. 날짜 입력칸이 yy-mm-dd로 표시되고 한글 달력이 열리는지 확인');
  console.log('4. 월 선택 기능이 목록이 아니라 한글 월 선택판으로 열리는지 확인');
  console.log('5. Main 캘린더와 주요일정 사이 세로 경계선이 아래까지 이어지는지 확인');
  console.log('6. 문제 없으면 변경 파일만 Git 반영\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
