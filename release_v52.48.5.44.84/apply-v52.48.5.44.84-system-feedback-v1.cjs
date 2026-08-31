const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.84';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const copies = [
  ['files/src/config/feedbackCatalog.js', 'src/config/feedbackCatalog.js'],
  ['files/src/components/FeedbackSubmitDialog.jsx', 'src/components/FeedbackSubmitDialog.jsx'],
  ['files/src/components/FeedbackButton.jsx', 'src/components/FeedbackButton.jsx'],
  ['files/src/page/FeedbackCenter.jsx', 'src/page/FeedbackCenter.jsx'],
  ['files/supabase/v52.48.5.44.84_system_feedback.sql', 'supabase/v52.48.5.44.84_system_feedback.sql'],
];

const dashboardReplacements = [{"label": "FeedbackButton import", "oldText": "import SystemGuideButton from './components/SystemGuideButton.jsx';", "newText": "import SystemGuideButton from './components/SystemGuideButton.jsx';\nimport FeedbackButton from './components/FeedbackButton.jsx';"}, {"label": "FeedbackCenter import", "oldText": "import Guide from './page/Guide.jsx';", "newText": "import Guide from './page/Guide.jsx';\nimport FeedbackCenter from './page/FeedbackCenter.jsx';"}, {"label": "현장 미선택 허용 화면 등록", "oldText": "  'labor-worker-master',\n  'guide',", "newText": "  'labor-worker-master',\n  'feedback',\n  'guide',"}, {"label": "화면 제목 등록", "oldText": "  attendance: '근태관리',\n  guide: '가이드 설정',", "newText": "  attendance: '근태관리',\n  feedback: '건의·오류',\n  guide: '가이드 설정',"}, {"label": "건의오류 메뉴 기본 접근 허용", "oldText": "    if (view === 'messenger') return true;", "newText": "    if (['messenger', 'feedback'].includes(view)) return true;"}, {"label": "상단 건의오류 버튼 추가", "oldText": "            <SystemGuideButton currentView={currentView} />\n\n            <MessengerButton", "newText": "            <SystemGuideButton currentView={currentView} />\n\n            <FeedbackButton\n              userId={user?.id || userProfile?.auth_user_id || ''}\n              userProfile={activeUserProfile}\n              currentView={currentView}\n              currentViewLabel={viewTitles[currentView] || currentView}\n              dashboardScale={dashboardScale}\n            />\n\n            <MessengerButton"}, {"label": "건의오류 화면 렌더링", "oldText": "          {currentView === 'guide' && isSuperAdmin && (\n            <Guide />\n          )}", "newText": "          {currentView === 'feedback' && (\n            <FeedbackCenter\n              userId={user?.id || userProfile?.auth_user_id || ''}\n              userProfile={activeUserProfile}\n              dashboardScale={dashboardScale}\n            />\n          )}\n\n          {currentView === 'guide' && isSuperAdmin && (\n            <Guide />\n          )}"}];
const sidebarReplacements = [{"label": "건의오류 아이콘 import", "oldText": "import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';", "newText": "import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';\nimport FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';"}, {"label": "건의오류 메뉴 추가", "oldText": "      {isSuperAdmin && (\n        <Tooltip\n          title={drawerOpen ? '' : '가이드 설정'}", "newText": "      {canAccessView('feedback') && (\n        <Tooltip\n          title={\n            drawerOpen\n              ? ''\n              : isSuperAdmin\n                ? '건의·오류 관리'\n                : '건의·오류 제보'\n          }\n          placement=\"right\"\n          arrow\n        >\n          <ListItemButton\n            selected={currentView === 'feedback'}\n            onClick={() => handleViewChange('feedback')}\n            sx={topMenuSx(currentView === 'feedback')}\n          >\n            <ListItemIcon\n              sx={{\n                minWidth: 34,\n                color: 'inherit',\n              }}\n            >\n              <FeedbackOutlinedIcon\n                sx={{ fontSize: 19 }}\n              />\n            </ListItemIcon>\n\n            <ListItemText\n              primary={\n                isSuperAdmin\n                  ? '건의·오류 관리'\n                  : '건의·오류 제보'\n              }\n              primaryTypographyProps={{\n                noWrap: true,\n                fontSize: '0.8rem',\n                fontWeight:\n                  currentView === 'feedback'\n                    ? 700\n                    : 500,\n              }}\n              sx={{\n                opacity:\n                  drawerOpen\n                    ? 1\n                    : 0,\n              }}\n            />\n          </ListItemButton>\n        </Tooltip>\n      )}\n\n      {isSuperAdmin && (\n        <Tooltip\n          title={drawerOpen ? '' : '가이드 설정'}"}];

const backupFile = (targetPath) => {
  if (!fs.existsSync(targetPath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;
  fs.copyFileSync(targetPath, backupPath);
  console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
};

const applyReplacements = (relativePath, replacements) => {
  const targetPath = path.join(projectRoot, relativePath);

  if (!fs.existsSync(targetPath)) {
    console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${relativePath}`);
    process.exit(1);
  }

  let source = fs.readFileSync(targetPath, 'utf8');
  let changed = false;

  for (const replacement of replacements) {
    if (source.includes(replacement.newText)) {
      console.log(`[이미 적용됨] ${relativePath} · ${replacement.label}`);
      continue;
    }

    if (!source.includes(replacement.oldText)) {
      console.error(`[적용 중단] ${relativePath} · ${replacement.label} 위치가 현재 파일과 다릅니다.`);
      console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
      process.exit(1);
    }

    source = source.replace(replacement.oldText, replacement.newText);
    changed = true;
    console.log(`[적용] ${relativePath} · ${replacement.label}`);
  }

  if (changed) {
    backupFile(targetPath);
    fs.writeFileSync(targetPath, source, 'utf8');
  }
};

applyReplacements('src/Dashboard.jsx', dashboardReplacements);
applyReplacements('src/components/Sidebar.jsx', sidebarReplacements);

for (const [sourceRelative, targetRelative] of copies) {
  const sourcePath = path.join(releaseRoot, sourceRelative);
  const targetPath = path.join(projectRoot, targetRelative);

  if (!fs.existsSync(sourcePath)) {
    console.error(`[적용 중단] 패키지 파일을 찾을 수 없습니다: ${sourceRelative}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (fs.existsSync(targetPath)) {
    const before = fs.readFileSync(targetPath);
    const after = fs.readFileSync(sourcePath);

    if (Buffer.compare(before, after) === 0) {
      console.log(`[이미 적용됨] ${targetRelative}`);
      continue;
    }

    backupFile(targetPath);
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`[적용] ${targetRelative}`);
}

console.log('\n[적용 완료] 건의·오류 제보 V1');
console.log('다음 단계: Supabase SQL Editor에서 아래 파일 전체를 실행하세요.');
console.log('supabase/v52.48.5.44.84_system_feedback.sql');
