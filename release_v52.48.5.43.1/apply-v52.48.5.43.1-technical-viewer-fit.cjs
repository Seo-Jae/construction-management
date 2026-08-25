const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = 'v52.48.5.43.1';
const target = path.join(process.cwd(), 'src', 'utils', 'technicalImageSheetEditor.js');

function fail(message) {
  console.error(`\n[${VERSION}] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail(`대상 파일을 찾을 수 없습니다: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('// v52.48.5.43.1 VIEW 화면맞춤 가용영역 최대화')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!source.includes('// v52.48.5.38 VIEW 마우스 이동/줌 기능')) {
  fail('예상 기준 버전(v52.48.5.38 VIEW)을 찾지 못했습니다. 기존 변경을 보호하기 위해 적용을 중단합니다.');
}

const replacements = [
  {
    name: '버전 마커',
    from: `// v52.48.5.38 VIEW 마우스 이동/줌 기능\nconst viewerHtml =`,
    to: `// v52.48.5.38 VIEW 마우스 이동/줌 기능\n// v52.48.5.43.1 VIEW 화면맞춤 가용영역 최대화\nconst viewerHtml =`,
  },
  {
    name: 'VIEW 기본 시트 폭 제한 제거',
    from: `.sheet.fit { width: min(780px, calc(100vw - 390px)); }`,
    to: `.sheet.fit { width: calc(100% - 20px); max-width: none; }`,
  },
  {
    name: '소형 화면 시트 폭 제한 제거',
    from: `.sheet.fit { width: min(720px, calc(100vw - 350px)); }`,
    to: `.sheet.fit { width: calc(100% - 16px); max-width: none; }`,
  },
  {
    name: '화면맞춤 동적 시트 크기 계산',
    from: `        imageStage.style.removeProperty('height');\n        imageStage.style.removeProperty('aspect-ratio');\n\n        var stageRect = imageStage.getBoundingClientRect();`,
    to: `        imageStage.style.removeProperty('height');\n        imageStage.style.removeProperty('aspect-ratio');\n\n        // v52.48.5.43.1\n        // VIEW 창과 우측 부속자재 패널 크기는 일정하게 유지하고,\n        // 기술자료 시트만 좌측 가용영역의 약 96%까지 자동 확대/축소합니다.\n        // 3:2 도면 영역 + 고정 하단 부재명 영역이 세로로도 잘리지 않도록\n        // 가로/세로 제한 중 더 작은 값을 최종 시트 폭으로 사용합니다.\n        var viewerUsableWidth = Math.max(1, viewer.clientWidth - 20);\n        var viewerUsableHeight = Math.max(1, viewer.clientHeight - 20);\n        var targetFillRatio = 0.96;\n        var availableSheetWidth = viewerUsableWidth * targetFillRatio;\n        var availableSheetHeight = viewerUsableHeight * targetFillRatio;\n        var fixedFooterHeight = Math.max(0, Number(layout.footerHeight) || 0);\n        var widthByHeight = Math.max(1, (availableSheetHeight - fixedFooterHeight) * 1.5);\n        var fittedSheetWidth = Math.max(1, Math.min(availableSheetWidth, widthByHeight));\n\n        sheet.style.width = Math.floor(fittedSheetWidth) + 'px';\n\n        var stageRect = imageStage.getBoundingClientRect();`,
  },
  {
    name: 'VIEW 팝업 크기 확대',
    from: `    getFixedPopupGeometry(1125, 1021),`,
    to: `    getFixedPopupGeometry(1480, 1000),`,
  },
];

for (const item of replacements) {
  const count = source.split(item.from).length - 1;
  if (count !== 1) {
    fail(`${item.name} 적용 기준이 ${count}개 발견되었습니다. 예상값은 1개입니다. 기존 변경을 보호하기 위해 중단합니다.`);
  }
  source = source.replace(item.from, item.to);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(process.cwd(), `backup_${VERSION}_${stamp}`);
const backupTarget = path.join(backupDir, 'src', 'utils', 'technicalImageSheetEditor.js');
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(target, backupTarget);

fs.writeFileSync(target, source, 'utf8');

try {
  execFileSync(process.execPath, ['--check', target], { stdio: 'inherit' });
} catch (error) {
  fs.copyFileSync(backupTarget, target);
  fail('문법 검사에 실패하여 원본 파일로 자동 복구했습니다.');
}

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log(`- 수정 파일: ${path.relative(process.cwd(), target)}`);
console.log('- VIEW 팝업: 최대 1480 x 1000 고정 기준(작은 화면에서는 자동 축소)');
console.log('- 좌측 기술자료 시트: 가용영역 약 96% 자동 화면맞춤');
console.log('- 이미지 비율: 3:2 고정 박스 안 contain 유지');
console.log('- 지시선/번호/하단 부재명: 시트와 함께 동일 비율 확대/축소');
console.log('- 기존 휠 줌/드래그/더블클릭/원본크기/부속자재 기능 유지');
console.log(`- 백업: ${path.relative(process.cwd(), backupDir)}`);
