const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.85';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'components',
  'Sidebar.jsx',
);
const replacements = [{"label": "건의오류 사이드 아이콘 크기/정렬 통일", "oldText": "            <ListItemIcon\n              sx={{\n                minWidth: 34,\n                color: 'inherit',\n              }}\n            >\n              <FeedbackOutlinedIcon\n                sx={{ fontSize: 19 }}\n              />\n            </ListItemIcon>", "newText": "            <ListItemIcon\n              sx={{\n                minWidth: 34,\n                color: 'inherit',\n                justifyContent: 'center',\n              }}\n            >\n              <FeedbackOutlinedIcon fontSize=\"small\" />\n            </ListItemIcon>"}];

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
console.log('건의·오류 제보 아이콘의 크기와 정렬을 다른 사이드 메뉴 아이콘과 동일하게 맞췄습니다.');
