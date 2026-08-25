const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44';
const root = process.cwd();
const packageDir = __dirname;
const dashboardPath = path.join(root, 'src', 'Dashboard.jsx');
const sidebarPath = path.join(root, 'src', 'components', 'Sidebar.jsx');
const pagePath = path.join(root, 'src', 'page', 'ProjectManagement.jsx');
const sqlPath = path.join(root, 'supabase', 'v52.48.5.44_project_management.sql');

function fail(message) {
  console.error(`\n[${VERSION}] ${message}`);
  process.exit(1);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) fail(`파일을 찾을 수 없습니다: ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function replaceOnce(text, oldText, newText, label) {
  if (text.includes(newText)) return text;
  const count = countOccurrences(text, oldText);
  if (count !== 1) {
    fail(`${label} 적용 기준을 찾지 못했거나 ${count}개 발견했습니다. 기존 변경을 보호하기 위해 중단합니다.`);
  }
  return text.replace(oldText, newText);
}

function backupFiles(files) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, `backup_v52.48.5.44_${stamp}`);
  files.forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;
    const rel = path.relative(root, filePath);
    const dest = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(filePath, dest);
  });
  return backupRoot;
}

console.log(`\n=== ${VERSION} 최고관리자 현장관리 적용 ===`);

let dashboard = readRequired(dashboardPath);
let sidebar = readRequired(sidebarPath);

if (
  dashboard.includes("import ProjectManagement from './page/ProjectManagement.jsx';") &&
  sidebar.includes("primary=\"현장관리\"") &&
  fs.existsSync(pagePath) &&
  fs.existsSync(sqlPath)
) {
  console.log('이미 v52.48.5.44 현장관리 코드가 적용되어 있습니다.');
  process.exit(0);
}

const backupRoot = backupFiles([dashboardPath, sidebarPath, pagePath, sqlPath]);
console.log(`백업: ${path.relative(root, backupRoot)}`);

// Dashboard import
dashboard = replaceOnce(
  dashboard,
  "import UserManagementWithAccessHistory from './page/UserManagementWithAccessHistory.jsx';\nimport OrganizationChart from './page/OrganizationChart.jsx';",
  "import UserManagementWithAccessHistory from './page/UserManagementWithAccessHistory.jsx';\nimport ProjectManagement from './page/ProjectManagement.jsx';\nimport OrganizationChart from './page/OrganizationChart.jsx';",
  'Dashboard 현장관리 import',
);

// 현장 선택 없이 열 수 있는 최고관리자 전역 메뉴
dashboard = replaceOnce(
  dashboard,
  "  'admin-dashboard',\n  'user-management',\n  'organization-chart',",
  "  'admin-dashboard',\n  'user-management',\n  'project-management',\n  'organization-chart',",
  'Dashboard PROJECT_FREE_VIEWS',
);

// 제목 등록
dashboard = replaceOnce(
  dashboard,
  "  'user-management': '회원관리',\n  'organization-chart': '조직도',",
  "  'user-management': '회원관리',\n  'project-management': '현장관리',\n  'organization-chart': '조직도',",
  'Dashboard viewTitles',
);

// 구형 권한 fallback에서도 최고관리자 전용
dashboard = replaceOnce(
  dashboard,
  "  const legacyCanAccessView = (view) => {\n    if (view === 'user-management') return isSuperAdmin;",
  "  const legacyCanAccessView = (view) => {\n    if (view === 'user-management' || view === 'project-management') return isSuperAdmin;",
  'Dashboard legacyCanAccessView',
);

// 실제 권한 판정
dashboard = replaceOnce(
  dashboard,
  "    if (view === 'messenger') return true;\n    if (view === 'user-management') return isSuperAdmin;",
  "    if (view === 'messenger') return true;\n    if (view === 'user-management' || view === 'project-management') return isSuperAdmin;",
  'Dashboard canAccessView',
);

// 사이드 메뉴 직접 접근 차단
dashboard = replaceOnce(
  dashboard,
  "    if (\n      nextView === 'user-management' &&\n      !isSuperAdmin\n    ) {\n      return;\n    }",
  "    if (\n      ['user-management', 'project-management'].includes(nextView) &&\n      !isSuperAdmin\n    ) {\n      return;\n    }",
  'Dashboard handleSidebarViewChange',
);

// 현장 추가 후 같은 탭에서 상단 현장목록 즉시 재조회
dashboard = replaceOnce(
  dashboard,
  "    window.addEventListener('focus', handleFocus);\n\n    return () => {\n      active = false;\n      window.removeEventListener('focus', handleFocus);\n    };\n  }, [\n    accessibleProjectNames.join('\\u0001'),\n    hasAllProjectAccess,\n    isManagementRole,\n    runtimeAccessReady,\n    runtimeProjectKey,\n  ]);",
  "    window.addEventListener('focus', handleFocus);\n    window.addEventListener('project-registry-changed', handleFocus);\n\n    return () => {\n      active = false;\n      window.removeEventListener('focus', handleFocus);\n      window.removeEventListener('project-registry-changed', handleFocus);\n    };\n  }, [\n    accessibleProjectNames.join('\\u0001'),\n    hasAllProjectAccess,\n    isManagementRole,\n    runtimeAccessReady,\n    runtimeProjectKey,\n  ]);",
  'Dashboard 현장목록 즉시 갱신',
);

// 화면 렌더링
dashboard = replaceOnce(
  dashboard,
  "          {currentView === 'user-management' && isSuperAdmin && (\n            <UserManagementWithAccessHistory currentUserId={user?.id || ''} />\n          )}\n\n          {currentView === 'attendance' && activeProjectName &&",
  "          {currentView === 'user-management' && isSuperAdmin && (\n            <UserManagementWithAccessHistory currentUserId={user?.id || ''} />\n          )}\n\n          {currentView === 'project-management' && isSuperAdmin && (\n            <ProjectManagement />\n          )}\n\n          {currentView === 'attendance' && activeProjectName &&",
  'Dashboard 현장관리 화면',
);

// Sidebar icon import
sidebar = replaceOnce(
  sidebar,
  "import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';\nimport PunchClockRoundedIcon from '@mui/icons-material/PunchClockRounded';",
  "import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';\nimport DomainAddRoundedIcon from '@mui/icons-material/DomainAddRounded';\nimport PunchClockRoundedIcon from '@mui/icons-material/PunchClockRounded';",
  'Sidebar 현장관리 아이콘 import',
);

const memberAnchor = `      {isSuperAdmin && (\n        <Tooltip\n          title={\n            drawerOpen\n              ? ''\n              : \`회원관리\${`;
const memberIndex = sidebar.indexOf(memberAnchor);
if (memberIndex === -1) {
  fail('Sidebar 회원관리 메뉴 기준을 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}

if (!sidebar.includes('primary="현장관리"')) {
  const projectMenu = `      {isSuperAdmin && (\n        <Tooltip\n          title={drawerOpen ? '' : '현장관리'}\n          placement="right"\n          arrow\n        >\n          <ListItemButton\n            selected={currentView === 'project-management'}\n            onClick={() => handleViewChange('project-management')}\n            sx={topMenuSx(currentView === 'project-management')}\n          >\n            <ListItemIcon\n              sx={{\n                minWidth: 34,\n                color: 'inherit',\n                justifyContent: 'center',\n              }}\n            >\n              <DomainAddRoundedIcon fontSize="small" />\n            </ListItemIcon>\n            <ListItemText\n              primary="현장관리"\n              primaryTypographyProps={{\n                noWrap: true,\n                fontSize: '0.8rem',\n                fontWeight: currentView === 'project-management' ? 700 : 500,\n              }}\n            />\n          </ListItemButton>\n        </Tooltip>\n      )}\n\n`;
  sidebar = sidebar.slice(0, memberIndex) + projectMenu + sidebar.slice(memberIndex);
}

fs.mkdirSync(path.dirname(pagePath), { recursive: true });
fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
fs.copyFileSync(path.join(packageDir, 'src', 'page', 'ProjectManagement.jsx'), pagePath);
fs.copyFileSync(path.join(packageDir, 'supabase', 'v52.48.5.44_project_management.sql'), sqlPath);
fs.writeFileSync(dashboardPath, dashboard, 'utf8');
fs.writeFileSync(sidebarPath, sidebar, 'utf8');

console.log('수정 완료:');
console.log(' - src/Dashboard.jsx');
console.log(' - src/components/Sidebar.jsx');
console.log(' - src/page/ProjectManagement.jsx');
console.log(' - supabase/v52.48.5.44_project_management.sql');
console.log('\n※ Supabase SQL Editor에서 v52.48.5.44_project_management.sql 전체를 1회 실행해야 합니다.');
