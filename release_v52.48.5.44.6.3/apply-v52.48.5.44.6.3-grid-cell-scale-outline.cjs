const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.3';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const BASE_MARKER = '// v52.48.5.44.6.2 타입행 높이통일 + 박스제거 + 타입색상';
const VERSION_MARKER = '// v52.48.5.44.6.3 타입윤곽선 복원 + 골구도 셀 1.2배';

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

  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + anchor.length)
  );
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
  fail(
    'BuildingGrid.jsx가 v52.48.5.44.6.2 기준과 다릅니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6.3_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(
  backupDir,
  'src/BuildingGrid.jsx',
);

fs.mkdirSync(
  path.dirname(backupPath),
  { recursive: true },
);
fs.copyFileSync(TARGET, backupPath);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);

/*
  기존 골구도 셀 34 x 18px
  1.2배 = 40.8 x 21.6px
  1px border의 선명도를 위해 41 x 22px 정수 픽셀로 반올림합니다.
*/
source = replaceOnce(
  source,
`const CELL_WIDTH = 34;
const CELL_HEIGHT = 18;`,
`const CELL_WIDTH = 41;
const CELL_HEIGHT = 22;`,
  '골구도 셀 크기 1.2배',
);

/*
  PilotiCell의 X 표시도 늘어난 셀 높이에 맞춰 함께 조정합니다.
*/
source = replaceOnce(
  source,
`          top: '-12px',
          width: '1px',
          height: 48,`,
`          top: '-15px',
          width: '1px',
          height: 58,`,
  '필로티 X 표시 비율',
);

/*
  예외타입: 글자색은 우측 타입현황 색상 연동을 유지하고
  테두리만 다시 살립니다. 배경색은 넣지 않습니다.
*/
source = replaceOnce(
  source,
`                      boxSizing:
                        'border-box',
                      color:
                        typeColorMap?.[
                          segment.typeName
                        ] ||
                        '#475569',`,
`                      border:
                        '1px solid #cbd5e1',
                      bgcolor:
                        'transparent',
                      boxSizing:
                        'border-box',
                      color:
                        typeColorMap?.[
                          segment.typeName
                        ] ||
                        '#475569',`,
  '예외타입 윤곽선 복원',
);

/*
  기본타입도 동일하게 윤곽선만 복원합니다.
*/
source = replaceOnce(
  source,
`                  boxSizing:
                    'border-box',
                  color:
                    typeColorMap?.[
                      unitType
                    ] ||
                    '#475569',`,
`                  border:
                    unitType
                      ? '1px solid #cbd5e1'
                      : '1px solid transparent',
                  bgcolor:
                    'transparent',
                  boxSizing:
                    'border-box',
                  color:
                    typeColorMap?.[
                      unitType
                    ] ||
                    '#475569',`,
  '기본타입 윤곽선 복원',
);

fs.writeFileSync(
  TARGET,
  source,
  'utf8',
);

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 골구도 세대 셀: 34x18px -> 41x22px (약 1.2배)');
console.log('- 필로티 X 표시도 커진 셀 높이에 맞춰 보정');
console.log('- 기본타입/예외타입 윤곽선 복원');
console.log('- 타입 배경색은 투명 유지');
console.log('- 타입 글자색은 우측 타입별 세대현황 색상과 계속 연동');
console.log('- 공통 타입행 높이/1층 수평정렬 규칙 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
