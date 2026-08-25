const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.1';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const BASE_MARKER = '// v52.48.5.44.6 층별 예외타입 하단 다단표시';
const VERSION_MARKER = '// v52.48.5.44.6.1 예외타입 동일행 압축 + hover 설명 제거';

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
  fail('BuildingGrid.jsx가 v52.48.5.44.6 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6.1_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/BuildingGrid.jsx');
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
`        exceptionRows.push({
          floor,
          segments:
            mergedSegments,
        });
      });

    return {`,
`        exceptionRows.push({
          floor,
          segments:
            mergedSegments,
        });
      });

    /*
      서로 다른 층의 예외타입이라도 표시 호 범위가 겹치지 않으면
      같은 한 줄에 배치합니다.

      예:
      150PC = 1~2호
      150PA = 3~4호
      => [ 150PC ][ 150PA ] 한 줄

      반대로 표시 범위가 겹치면 별도 줄을 사용합니다.
      이렇게 하면 기존 현장 타입표처럼 불필요한 세로 공간을 만들지 않습니다.
    */
    const packedExceptionRows = [];

    exceptionRows.forEach((sourceRow) => {
      const segments =
        (sourceRow.segments || [])
          .map((segment) => ({
            ...segment,
            floor: sourceRow.floor,
          }))
          .sort(
            (first, second) =>
              first.start - second.start ||
              first.end - second.end,
          );

      let targetRow = null;

      for (
        let rowIndex = 0;
        rowIndex < packedExceptionRows.length;
        rowIndex += 1
      ) {
        const candidate =
          packedExceptionRows[rowIndex];

        const overlaps = segments.some(
          (segment) =>
            candidate.segments.some(
              (existing) =>
                !(
                  segment.end < existing.start ||
                  segment.start > existing.end
                ),
            ),
        );

        if (!overlaps) {
          targetRow = candidate;
          break;
        }
      }

      if (!targetRow) {
        targetRow = {
          floors: [],
          segments: [],
        };
        packedExceptionRows.push(
          targetRow,
        );
      }

      targetRow.floors.push(
        sourceRow.floor,
      );
      targetRow.segments.push(
        ...segments,
      );
      targetRow.segments.sort(
        (first, second) =>
          first.start - second.start ||
          first.end - second.end,
      );
    });

    return {`,
  '예외타입 동일행 압축 계산',
);

source = replaceOnce(
  source,
`      exceptionRows,
      hasLabels:
        baseLabels.some(Boolean) ||
        exceptionRows.length > 0,`,
`      exceptionRows:
        packedExceptionRows,
      hasLabels:
        baseLabels.some(Boolean) ||
        packedExceptionRows.length > 0,`,
  '압축된 예외타입 행 반환',
);

source = replaceOnce(
  source,
`          {unitTypeSummary.exceptionRows.map(
            (row, rowIndex) => (
              <Box
                key={\`\${buildingName}-unit-type-exception-\${row.floor}-\${rowIndex}\`}
                sx={{`,
`          {unitTypeSummary.exceptionRows.map(
            (row, rowIndex) => (
              <Box
                key={\`\${buildingName}-unit-type-exception-row-\${rowIndex}\`}
                sx={{`,
  '예외타입 행 key 보정',
);

source = replaceOnce(
  source,
`                {row.segments.map(
                  (segment, segmentIndex) => (
                    <Tooltip
                      key={\`\${buildingName}-unit-type-exception-\${row.floor}-\${segment.start}-\${segmentIndex}\`}
                      arrow
                      title={\`\${row.floor}층 \${segment.start}~\${segment.end}호 타입 예외\`}
                    >
                      <Typography
                        component="div"
                        sx={{
                          gridColumn:
                            \`\${segment.start + 1} / span \${segment.end - segment.start + 1}\`,
                          height: 17,
                          display:
                            'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          border:
                            '1px solid #94a3b8',
                          bgcolor:
                            '#f1f5f9',
                          boxSizing:
                            'border-box',
                          color:
                            '#334155',
                          fontSize:
                            '0.54rem',
                          fontWeight: 900,
                          lineHeight: 1,
                          whiteSpace:
                            'nowrap',
                          overflow:
                            'hidden',
                          textOverflow:
                            'ellipsis',
                        }}
                      >
                        {segment.typeName}
                      </Typography>
                    </Tooltip>
                  ),
                )}`,
`                {row.segments.map(
                  (segment, segmentIndex) => (
                    <Typography
                      key={\`\${buildingName}-unit-type-exception-\${segment.floor}-\${segment.start}-\${segmentIndex}\`}
                      component="div"
                      sx={{
                        gridColumn:
                          \`\${segment.start + 1} / span \${segment.end - segment.start + 1}\`,
                        height: 17,
                        display:
                          'flex',
                        alignItems:
                          'center',
                        justifyContent:
                          'center',
                        border:
                          '1px solid #94a3b8',
                        bgcolor:
                          '#f1f5f9',
                        boxSizing:
                          'border-box',
                        color:
                          '#334155',
                        fontSize:
                          '0.54rem',
                        fontWeight: 900,
                        lineHeight: 1,
                        whiteSpace:
                          'nowrap',
                        overflow:
                          'hidden',
                        textOverflow:
                          'ellipsis',
                      }}
                    >
                      {segment.typeName}
                    </Typography>
                  ),
                )}`,
  '예외타입 Tooltip 제거',
);

source = replaceOnce(
  source,
`                  component="div"
                  title={unitType || ''}
                  sx={{`,
`                  component="div"
                  sx={{`,
  '기본 타입 native title 제거',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 150PC/150PA처럼 서로 겹치지 않는 예외타입은 같은 한 줄에 배치');
console.log('- 표시 호 범위가 겹치는 예외타입만 다음 줄로 분리');
console.log('- 예외타입 hover Tooltip 제거');
console.log('- 기본 타입 title hover 설명도 제거');
console.log('- 일반 세대의 기존 작업자 Tooltip은 그대로 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
