const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.80';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'page',
  'HouseholdQuantityManagement.jsx',
);
const replacements = [{"label": "골구도 공정 탭 선택 밑줄 좌표 보정", "oldText": "            <Tabs\n              value={gridProcess?.processName || false}\n              onChange={(_, value) => setGridProcessName(value)}\n              variant=\"scrollable\"\n              scrollButtons=\"auto\"\n              aria-label=\"골구도 표시 공정 선택\"\n              sx={{\n                flex: 1,\n                minWidth: 0,\n                minHeight: 38,\n                '& .MuiTab-root': {\n                  minHeight: 38,\n                  py: 0.5,\n                  px: 1.7,\n                  fontSize: '0.72rem',\n                  fontWeight: 800,\n                },\n              }}\n            >", "newText": "            <Tabs\n              value={gridProcess?.processName || false}\n              onChange={(_, value) => setGridProcessName(value)}\n              variant=\"scrollable\"\n              scrollButtons=\"auto\"\n              aria-label=\"골구도 표시 공정 선택\"\n              sx={{\n                flex: 1,\n                minWidth: 0,\n                minHeight: 38,\n                /*\n                  화면 90% CSS zoom에서는 MUI Tabs 기본 indicator의\n                  left/width 계산값이 탭 실제 위치와 어긋날 수 있다.\n                  기본 indicator 대신 선택된 Tab 자체에 밑줄을 붙여\n                  배율과 관계없이 글자/탭 위치를 정확히 따라가게 한다.\n                */\n                '& .MuiTabs-indicator': {\n                  display: 'none',\n                },\n                '& .MuiTab-root': {\n                  minHeight: 38,\n                  py: 0.5,\n                  px: 1.7,\n                  position: 'relative',\n                  overflow: 'visible',\n                  fontSize: '0.72rem',\n                  fontWeight: 800,\n                },\n                '& .MuiTab-root.Mui-selected::after': {\n                  content: '\"\"',\n                  position: 'absolute',\n                  left: 0,\n                  right: 0,\n                  bottom: 0,\n                  height: 2,\n                  bgcolor: '#2563eb',\n                  borderRadius: '2px 2px 0 0',\n                  pointerEvents: 'none',\n                },\n              }}\n            >"}];

if (!fs.existsSync(targetPath)) {
  console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

let source = fs.readFileSync(targetPath, 'utf8');
let changed = false;

for (const replacement of replacements) {
  if (source.includes(replacement.newText)) {
    console.log(`[이미 적용됨] ${replacement.label}`);
    continue;
  }

  if (!source.includes(replacement.oldText)) {
    console.error(`[적용 중단] ${replacement.label} 위치가 현재 파일과 다릅니다.`);
    console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
    process.exit(1);
  }

  source = source.replace(replacement.oldText, replacement.newText);
  changed = true;
  console.log(`[적용] ${replacement.label}`);
}

if (!changed) {
  console.log('\n전체 변경이 이미 적용되어 있습니다.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`\n[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('공정별 세대물량 골구도 팝업의 선택 탭 밑줄 위치를 보정했습니다.');
