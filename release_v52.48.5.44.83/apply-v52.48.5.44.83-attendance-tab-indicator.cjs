const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.83';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'page',
  'AttendanceManagement.jsx',
);
const replacements = [{"label": "근태관리 상단 탭 기본 indicator 제거", "oldText": "        <Tabs value={tab} onChange={handleTabChange} variant=\"scrollable\" scrollButtons=\"auto\">", "newText": "        <Tabs\n          value={tab}\n          onChange={handleTabChange}\n          variant=\"scrollable\"\n          scrollButtons=\"auto\"\n          sx={{\n            '& .MuiTabs-indicator': {\n              display: 'none',\n            },\n          }}\n        >"}, {"label": "근태관리 선택 탭 자체 밑줄 적용", "oldText": "              sx={{ minHeight: 52, fontWeight: 800 }}", "newText": "              sx={{\n                minHeight: 52,\n                fontWeight: 800,\n                position: 'relative',\n                overflow: 'visible',\n                '&.Mui-selected::after': {\n                  content: '\"\"',\n                  position: 'absolute',\n                  left: 0,\n                  right: 0,\n                  bottom: 0,\n                  height: 2,\n                  bgcolor: '#2563eb',\n                  borderRadius: '2px 2px 0 0',\n                  pointerEvents: 'none',\n                },\n              }}"}];

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

const versionComment =
  `// ${VERSION} 근태관리 상단 탭 선택 밑줄 화면배율 위치 보정\n`;

if (!source.startsWith(versionComment)) {
  source = versionComment + source;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`\n[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('근태관리 상단 탭의 선택 밑줄이 화면 90% 배율에서도 선택 탭 바로 아래에 표시됩니다.');
