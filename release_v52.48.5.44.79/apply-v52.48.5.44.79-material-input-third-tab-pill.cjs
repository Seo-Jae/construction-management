const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.79';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'page',
  'MaterialInputStatus.jsx',
);
const replacements = [{"label": "중복 MuiTab-root 제거 및 3번 탭 우측 여백 보정", "oldText": "            '& .MuiTab-root': {\n              minHeight: 30,\n              minWidth: 'auto',\n              px: 1.35,\n              py: 0.45,\n              mx: 0.12,\n              my: 0,\n              borderRadius: '999px !important',\n              boxSizing: 'border-box',\n              overflow: 'visible',\n              position: 'relative',\n              zIndex: 1,\n              flexShrink: 0,\n            },\n            '& .MuiTab-root:first-of-type': {\n              ml: 0.1,\n            },\n            '& .MuiTab-root:last-of-type': {\n              mr: 0.1,\n            },\n            '& .MuiTab-root.Mui-selected': {\n              zIndex: 2,\n            },\n            '& .MuiTab-root': {\n              minHeight: 29,\n              minWidth: 0,\n              px: 1.35,\n              py: 0.35,\n              borderRadius: 999,\n              fontSize: '0.72rem',\n              fontWeight: 900,\n              textTransform: 'none',\n              transition: 'all 160ms ease',\n            },", "newText": "            '& .MuiTab-root': {\n              minHeight: 30,\n              minWidth: 'auto',\n              px: 1.35,\n              py: 0.45,\n              mx: 0.12,\n              my: 0,\n              borderRadius: '999px !important',\n              boxSizing: 'border-box',\n              overflow: 'visible',\n              position: 'relative',\n              zIndex: 1,\n              flexShrink: 0,\n              fontSize: '0.72rem',\n              fontWeight: 900,\n              textTransform: 'none',\n              transition: 'all 160ms ease',\n            },\n            '& .MuiTab-root:first-of-type': {\n              ml: 0.1,\n            },\n            '& .MuiTab-root:last-of-type': {\n              mr: 0.45,\n            },\n            '& .MuiTab-root.Mui-selected': {\n              zIndex: 2,\n            },"}];

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
console.log('중복 MuiTab-root 스타일을 하나로 합치고 3번 탭 우측 표시영역을 확보했습니다.');
