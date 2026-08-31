const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.81';
const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'utils', 'systemGuidePopup.js');
const replacements = [{"label": "상단 공개 가이드 문구 제거", "oldText": "<div class=\"status\">공개 가이드</div>", "newText": ""}, {"label": "사용 순서 한눈에 보기 안내문 제거", "oldText": "<div class=\"overview-sub\">각 화면의 대표 흐름만 빠르게 확인하고, 상세한 표시는 아래 이용가이드에서 확인하세요.</div>", "newText": ""}];

if (!fs.existsSync(targetPath)) {
  console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

let source = fs.readFileSync(targetPath, 'utf8');
let changed = false;

for (const replacement of replacements) {
  if (!replacement.newText && !source.includes(replacement.oldText)) {
    console.log(`[이미 적용됨] ${replacement.label}`);
    continue;
  }
  if (replacement.newText && source.includes(replacement.newText)) {
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

const versionComment = `// ${VERSION} 시스템 가이드 인쇄 여백 정리 - 공개 문구/한눈에 보기 안내문 제거\n`;
if (!source.startsWith(versionComment)) source = versionComment + source;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`\n[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('모든 시스템 가이드에서 공개 가이드 문구와 한눈에 보기 하단 안내문을 제거했습니다.');
console.log('가이드 전체 안내(선택) 내용과 상세 이용가이드 내용은 그대로 유지합니다.');
