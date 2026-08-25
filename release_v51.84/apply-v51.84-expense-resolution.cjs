const fs = require('fs');
const path = require('path');

const VERSION = 'v51.84';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const dashboardPath = path.join(projectRoot, 'src', 'Dashboard.jsx');
const sidebarPath = path.join(projectRoot, 'src', 'components', 'Sidebar.jsx');
const targetPagePath = path.join(projectRoot, 'src', 'page', 'ExpenseResolution.jsx');
const bundledPagePath = path.join(releaseRoot, 'src', 'page', 'ExpenseResolution.jsx');

const requiredFiles = [dashboardPath, sidebarPath, bundledPagePath];
for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`\n[중단] 필요한 파일을 찾을 수 없습니다.\n- ${filePath}\n`);
    console.error('현재 프로젝트 최상위 폴더에서 이 스크립트를 실행했는지 확인하세요.');
    process.exit(1);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupSuffix = `.bak-${VERSION}-${timestamp}`;

const writeWithBackup = (filePath, content) => {
  const previous = fs.readFileSync(filePath, 'utf8');
  const backupPath = `${filePath}${backupSuffix}`;
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, content, 'utf8');
  return backupPath;
};

const replaceOnce = (source, oldText, newText, label) => {
  if (source.includes(newText)) {
    console.log(`[건너뜀] ${label}: 이미 반영되어 있습니다.`);
    return source;
  }
  if (!source.includes(oldText)) {
    throw new Error(`${label} 위치를 찾지 못했습니다. v51.83 최신 파일인지 확인하세요.`);
  }
  return source.replace(oldText, newText);
};

try {
  let dashboard = fs.readFileSync(dashboardPath, 'utf8');
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  dashboard = replaceOnce(
    dashboard,
    "import ProposalReport from './page/ProposalReport.jsx';",
    "import ProposalReport from './page/ProposalReport.jsx';\nimport ExpenseResolution from './page/ExpenseResolution.jsx';",
    'Dashboard 지출결의서 import',
  );

  dashboard = replaceOnce(
    dashboard,
    "  'report-weekly': '주간 업무 보고',\n  'report-approval': '품의 보고',",
    "  'report-weekly': '주간 업무 보고',\n  'report-expense-resolution': '지출결의서 작성',\n  'report-approval': '품의 보고',",
    'Dashboard 화면 제목',
  );

  dashboard = replaceOnce(
    dashboard,
    "          {currentView === 'report-approval' && activeProjectName && (\n            <ProposalReport userProfile={activeUserProfile} />\n          )}",
    "          {currentView === 'report-expense-resolution' && activeProjectName && (\n            <ExpenseResolution userProfile={activeUserProfile} />\n          )}\n\n          {currentView === 'report-approval' && activeProjectName && (\n            <ProposalReport userProfile={activeUserProfile} />\n          )}",
    'Dashboard 지출결의서 화면 연결',
  );

  sidebar = replaceOnce(
    sidebar,
    "  {\n    value: 'report-weekly',\n    label: '주간 업무 보고',\n  },\n  {\n    value: 'report-approval',",
    "  {\n    value: 'report-weekly',\n    label: '주간 업무 보고',\n  },\n  {\n    value: 'report-expense-resolution',\n    label: '지출결의서 작성',\n  },\n  {\n    value: 'report-approval',",
    'Sidebar 지출결의서 메뉴',
  );

  fs.mkdirSync(path.dirname(targetPagePath), { recursive: true });
  let targetPageBackup = '';
  if (fs.existsSync(targetPagePath)) {
    targetPageBackup = `${targetPagePath}${backupSuffix}`;
    fs.copyFileSync(targetPagePath, targetPageBackup);
  }
  fs.copyFileSync(bundledPagePath, targetPagePath);

  const dashboardBackup = writeWithBackup(dashboardPath, dashboard);
  const sidebarBackup = writeWithBackup(sidebarPath, sidebar);

  console.log('\n============================================');
  console.log(`지출결의서 작성 ${VERSION} 소스 적용 완료`);
  console.log('============================================');
  console.log('\n[적용 파일]');
  console.log('- src/Dashboard.jsx');
  console.log('- src/components/Sidebar.jsx');
  console.log('- src/page/ExpenseResolution.jsx');
  console.log('\n[자동 백업]');
  console.log(`- ${dashboardBackup}`);
  console.log(`- ${sidebarBackup}`);
  if (targetPageBackup) console.log(`- ${targetPageBackup}`);
  console.log('\n이제 Supabase SQL 실행 후 npm run build를 진행하세요.\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  console.error('파일은 강제로 수정하지 않았습니다. 오류 문구와 현재 Dashboard/Sidebar를 전달해주세요.');
  process.exit(1);
}
