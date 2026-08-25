const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.5.2';
const TARGET = path.resolve(process.cwd(), 'src/page/ProgressInput.jsx');
const BASE_MARKER = '// v52.48.5.44.5.1 타입현황 위치·최소화·닫기 동작 보정';
const VERSION_MARKER = '// v52.48.5.44.5.2 타입현황 공정선택 뒤배치 + 폭 축소';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }

  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!source.includes(BASE_MARKER)) {
  fail('v52.48.5.44.5.1 기준 파일이 아닙니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.5.2_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/page/ProgressInput.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);

source = replaceOnce(
  source,
`const TYPE_SUMMARY_PANEL_WIDTH = 328;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = TYPE_SUMMARY_PANEL_WIDTH;`,
`// 328px에서 약 23% 축소합니다. 기존 가운데 여백은 약 1/3 수준만 남깁니다.
const TYPE_SUMMARY_PANEL_WIDTH = 252;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = TYPE_SUMMARY_PANEL_WIDTH;`,
  '타입현황 폭 축소',
);

source = replaceOnce(
  source,
  '  )}:type-summary-panel-v2`;',
  '  )}:type-summary-panel-v3`;',
  '폭 변경에 따른 기본 우측 위치 초기화',
);

source = replaceOnce(
  source,
`            zIndex: 1350,`,
`            /*
              MUI Autocomplete/Menu 팝업(기본 modal 계층)보다 아래에 둡니다.
              위치가 겹쳐도 공정 선택 드롭다운이 항상 타입현황 위로 표시됩니다.
            */
            zIndex: 1200,`,
  '공정선택 드롭다운 우선 z-index',
);

source = replaceOnce(
  source,
`                px: 1,
                py: 0.8,`,
`                px: 0.75,
                py: 0.8,`,
  '타입현황 본문 좌우 여백 축소',
);

source = replaceOnce(
  source,
`                          gridTemplateColumns:
                            '12px minmax(58px, 0.8fr) minmax(118px, 1.4fr)',
                          alignItems:
                            'center',
                          columnGap:
                            0.55,`,
`                          gridTemplateColumns:
                            '12px minmax(46px, auto) minmax(108px, 1fr)',
                          alignItems:
                            'center',
                          columnGap:
                            0.35,`,
  '타입행 내부 여백 축소',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressInput.jsx');
console.log('- 공정선택 Autocomplete/Menu가 타입현황보다 항상 앞에 표시');
console.log('- 타입현황 폭: 328px -> 252px');
console.log('- 최소화 폭도 252px로 동일 고정');
console.log('- 타입명/세대수 사이 내부 여백 추가 축소');
console.log('- 새 폭에 맞춰 우측 기본 위치를 한 번 재정렬(localStorage v3)');
console.log('- 닫기/F5/메뉴 재진입 규칙은 v52.48.5.44.5.1 그대로 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
