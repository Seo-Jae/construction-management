const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.78';
const projectRoot = process.cwd();
const targetPath = path.join(
  projectRoot,
  'src',
  'page',
  'MaterialInputStatus.jsx',
);
const replacements = [{"label": "자재투입현황 탭 외곽 라운드 표시 보정", "oldText": "        <Tabs\n          value={tabValue}\n          variant=\"standard\"\n          onChange={(\n            _event,\n            value,\n          ) =>\n            setTabValue(value)\n          }\n          sx={{\n            minHeight: 36,\n            width: 'fit-content',\n            maxWidth: 'calc(100% - 16px)',\n            m: 0.8,\n            mb: 0.65,\n            px: 0.55,\n            py: 0.45,\n            overflow: 'visible',\n            border: '1px solid #cbd5e1',\n            borderRadius: 999,\n            bgcolor: '#f8fafc',\n            '& .MuiTabs-scroller': {\n              overflow: 'visible !important',\n            },\n            '& .MuiTabs-indicator': {\n              display: 'none',\n            },\n            '& .MuiTabs-flexContainer': {\n              gap: 0.45,\n              overflow: 'visible',\n            },", "newText": "        <Tabs\n          value={tabValue}\n          variant=\"standard\"\n          onChange={(\n            _event,\n            value,\n          ) =>\n            setTabValue(value)\n          }\n          sx={{\n            minHeight: 38,\n            width: 'fit-content',\n            maxWidth: 'calc(100% - 16px)',\n            m: 0.8,\n            mb: 0.65,\n            px: 0.75,\n            py: 0.55,\n            overflow: 'visible',\n            border: '1px solid #cbd5e1',\n            borderRadius: 999,\n            bgcolor: '#f8fafc',\n            boxSizing: 'border-box',\n            '& .MuiTabs-scroller': {\n              overflow: 'visible !important',\n            },\n            '& .MuiTabs-indicator': {\n              display: 'none',\n            },\n            '& .MuiTabs-flexContainer': {\n              gap: 0.45,\n              overflow: 'visible',\n              alignItems: 'center',\n            },\n            '& .MuiTab-root': {\n              minHeight: 30,\n              minWidth: 'auto',\n              px: 1.35,\n              py: 0.45,\n              mx: 0.12,\n              my: 0,\n              borderRadius: '999px !important',\n              boxSizing: 'border-box',\n              overflow: 'visible',\n              position: 'relative',\n              zIndex: 1,\n              flexShrink: 0,\n            },\n            '& .MuiTab-root:first-of-type': {\n              ml: 0.1,\n            },\n            '& .MuiTab-root:last-of-type': {\n              mr: 0.1,\n            },\n            '& .MuiTab-root.Mui-selected': {\n              zIndex: 2,\n            },"}];

if (!fs.existsSync(targetPath)) {
  console.error(
    `[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`,
  );
  process.exit(1);
}

let source =
  fs.readFileSync(
    targetPath,
    'utf8',
  );

let changed = false;

for (const replacement of replacements) {
  if (
    source.includes(
      replacement.newText,
    )
  ) {
    console.log(
      `[이미 적용됨] ${replacement.label}`,
    );
    continue;
  }

  if (
    !source.includes(
      replacement.oldText,
    )
  ) {
    console.error(
      `[적용 중단] ${replacement.label} 위치가 현재 파일과 다릅니다.`,
    );
    console.error(
      '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
    process.exit(1);
  }

  source =
    source.replace(
      replacement.oldText,
      replacement.newText,
    );

  changed = true;

  console.log(
    `[적용] ${replacement.label}`,
  );
}

if (!changed) {
  console.log(
    '\n전체 변경이 이미 적용되어 있습니다.',
  );
  process.exit(0);
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupPath =
  `${targetPath}.bak-${VERSION}-${stamp}`;

fs.copyFileSync(
  targetPath,
  backupPath,
);

fs.writeFileSync(
  targetPath,
  source,
  'utf8',
);

console.log(
  `\n[적용 완료] ${path.relative(projectRoot, targetPath)}`,
);
console.log(
  `[백업] ${path.relative(projectRoot, backupPath)}`,
);
console.log(
  '자재투입현황 탭 버튼 외곽 잘림을 추가 보정했습니다.',
);
