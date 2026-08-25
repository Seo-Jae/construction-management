const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.3.1';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const BASE_MARKER = '// v52.48.5.44.6.3 타입윤곽선 복원 + 골구도 셀 1.2배';
const VERSION_MARKER = '// v52.48.5.44.6.3.1 필로티 X 모서리 정합';

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
    'BuildingGrid.jsx가 v52.48.5.44.6.3 기준과 다릅니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6.3.1_${new Date()
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

fs.copyFileSync(
  TARGET,
  backupPath,
);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);

const oldPilotiCell = `function PilotiCell({ span = 1 }) {
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
        '&::before, &::after': {
          content: '"',
          position: 'absolute',
          left: '50%',
          top: '-15px',
          width: '1px',
          height: 58,
          bgcolor: '#94a3b8',
          transformOrigin: 'center',
        },
        '&::before': {
          transform: 'translateX(-50%) rotate(62deg)',
        },
        '&::after': {
          transform: 'translateX(-50%) rotate(-62deg)',
        },
      }}
    />
  );
}`;

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
      {/*
        v52.48.5.44.6.3.1
        회전된 고정 길이 선 대신 SVG 대각선을 사용합니다.
        셀의 폭/높이 또는 span이 바뀌어도 항상 네 모서리에 정확히 맞습니다.
      */}
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

source = replaceOnce(
  source,
  oldPilotiCell,
  newPilotiCell,
  'PilotiCell X 표시',
);

fs.writeFileSync(
  TARGET,
  source,
  'utf8',
);

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 필로티 X를 CSS 회전선 -> SVG 대각선으로 변경');
console.log('- 좌상↔우하 / 우상↔좌하 모서리에 정확히 맞춤');
console.log('- CELL_WIDTH/CELL_HEIGHT/span 변경에도 자동 정합');
console.log('- 기존 셀 41x22px, 타입표, 색상, 정렬 기능은 그대로 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
