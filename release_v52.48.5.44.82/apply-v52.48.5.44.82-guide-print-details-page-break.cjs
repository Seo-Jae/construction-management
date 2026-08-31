const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.82';
const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'utils', 'systemGuidePopup.js');
const replacements = [{"label": "상세 이용가이드 인쇄 시작페이지 고정", "oldText": "@media print{body,.app{background:#fff}.toolbar,.toc{display:none}.main{width:100%;margin:0}.guide-layout{display:block}.hero,.overview,.section{box-shadow:none;break-inside:avoid}.overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}", "newText": "@media print{body,.app{background:#fff}.toolbar,.toc{display:none}.main{width:100%;margin:0}.guide-layout{display:block}.hero,.overview,.section{box-shadow:none;break-inside:avoid}.overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.details{display:block;margin-top:0;break-before:page;page-break-before:always}.detail-title{margin:0 0 18px;break-after:avoid-page;page-break-after:avoid}.section{margin-bottom:18px}.section:last-child{margin-bottom:0}}"}];

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
  `// ${VERSION} 시스템 가이드 인쇄 - 상세 이용가이드 2페이지 시작 고정\n`;

if (!source.startsWith(versionComment)) {
  source = versionComment + source;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`\n[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('인쇄 시 상세 이용가이드는 항상 새 페이지 상단에서 시작합니다.');
