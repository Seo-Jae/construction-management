const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.3.2';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const BASE_MARKER = '// v52.48.5.44.6.3 타입윤곽선 복원 + 골구도 셀 1.2배';
const VERSION_MARKER = '// v52.48.5.44.6.3.2 필로티 X 모서리 정합';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
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
    'BuildingGrid.jsx가 v52.48.5.44.6.3 기준과 다릅니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.',
  );
}

/*
  이전 v52.48.5.44.6.3.1은 PilotiCell 전체 문자열을 완전일치로 찾다가
  CSS content 따옴표 표현 차이 때문에 안전 중단되었습니다.

  이번 버전은 함수 시작/다음 export 위치를 기준으로 범위를 찾아
  PilotiCell 함수만 통째로 교체합니다.
*/
const functionStartAnchor = 'function PilotiCell({ span = 1 }) {';
const functionEndAnchor = '\n\nexport default function BuildingGrid({';

const functionStart = source.indexOf(functionStartAnchor);
const functionEnd = source.indexOf(functionEndAnchor, functionStart);

if (functionStart === -1) {
  fail('PilotiCell 함수 시작점을 찾지 못했습니다.');
}

if (functionEnd === -1) {
  fail('PilotiCell 함수 종료점을 찾지 못했습니다.');
}

const duplicateStart = source.indexOf(
  functionStartAnchor,
  functionStart + functionStartAnchor.length,
);

if (duplicateStart !== -1) {
  fail('PilotiCell 함수가 2개 이상 발견되어 안전을 위해 적용을 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6.3.2_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);

const backupPath = path.join(
  backupDir,
  'src/BuildingGrid.jsx',
);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

const newPilotiCell = `function PilotiCell({ span = 1 }) {
  const width = CELL_WIDTH * span + CELL_GAP * (span - 1);

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        height: CELL_HEIGHT,
        flex: \`0 0 \${width}px\`,
        border: '1px solid #cbd5e1',
        bgcolor: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      >
        <line
          x1="0"
          y1="0"
          x2="100"
          y2="100"
          stroke="#94a3b8"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="100"
          y1="0"
          x2="0"
          y2="100"
          stroke="#94a3b8"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </Box>
    </Box>
  );
}`;

source =
  source.slice(0, functionStart) +
  newPilotiCell +
  source.slice(functionEnd);

source = source.replace(
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- PilotiCell의 CSS rotate 방식 제거');
console.log('- SVG 대각선으로 네 모서리 정확히 연결');
console.log('- 폭이 넓은 span 필로티도 박스 크기에 자동 맞춤');
console.log('- 기존 41x22 셀 크기 유지');
console.log('- 타입윤곽선/타입색상/1층 정렬 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
