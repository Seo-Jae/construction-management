const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const BASE_MARKER = '// v52.48.5.44.3 현장관리 호별타입 공정진척 연동';
const VERSION_MARKER = '// v52.48.5.44.6 층별 예외타입 하단 다단표시';

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
  fail('BuildingGrid.jsx가 v52.48.5.44.3 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6_${new Date().toISOString().replace(/[:.]/g, '-')}`,
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
`  countUniqueUnits,
  getCellKey,
  getUnitType,`,
`  countUniqueUnits,
  getCanonicalUnitNumber,
  getCellKey,
  getUnitType,`,
  'getCanonicalUnitNumber import',
);

const oldSummaryStart = `  const unitTypeSummary = useMemo(() => {`;
const oldSummaryEnd = `  }, [
    buildingName,
    config,
    floors,
    unitTypeData,
  ]);

  return (`;

const startIndex = source.indexOf(oldSummaryStart);
const endIndex = source.indexOf(oldSummaryEnd, startIndex);

if (startIndex === -1 || endIndex === -1) {
  fail('unitTypeSummary 계산 블록을 찾지 못했습니다.');
}

const newSummary = `  const unitTypeSummary = useMemo(() => {
    const buildingPrefix = \`\${String(buildingName || '').trim()}-\`;
    const configuredColumnCount = Math.max(
      0,
      Number(config?.unitsPerFloor) || 0,
    );
    const typeCountsByLine = new Map();
    let detectedMaxLine = 0;

    const addTypeCount = (lineNumber, rawUnitType) => {
      const normalizedLineNumber = Number(lineNumber);
      const unitType = String(rawUnitType || '').trim();

      if (!normalizedLineNumber || !unitType) {
        return;
      }

      detectedMaxLine = Math.max(
        detectedMaxLine,
        normalizedLineNumber,
      );

      if (!typeCountsByLine.has(normalizedLineNumber)) {
        typeCountsByLine.set(normalizedLineNumber, new Map());
      }

      const typeCounts = typeCountsByLine.get(normalizedLineNumber);
      typeCounts.set(
        unitType,
        (typeCounts.get(unitType) || 0) + 1,
      );
    };

    const hasBaseConfigTypes = Object.values(
      config?.unitTypes || {},
    ).some((value) =>
      Boolean(String(value || '').trim()),
    );

    const hasFloorConfigTypes = Object.values(
      config?.floorUnitTypes || {},
    ).some(
      (floorMap) =>
        floorMap &&
        typeof floorMap === 'object' &&
        Object.values(floorMap).some((value) =>
          Boolean(String(value || '').trim()),
        ),
    );

    const hasConfigUnitTypes =
      hasBaseConfigTypes ||
      hasFloorConfigTypes;

    /*
      기본 타입행은 기존 방식과 동일하게 각 호 라인의 대표 타입을 구합니다.
      다만 층별 예외타입은 별도 행으로 표시하므로, base unitTypes가 있으면
      하단 기본행은 unitTypes를 우선 사용합니다.
    */
    if (hasConfigUnitTypes) {
      for (let floor = 1; floor <= floors; floor += 1) {
        buildFloorVisualCells(config, floor).forEach((cell) => {
          if (cell.type !== 'valid') {
            return;
          }

          const canonicalUnitNumber =
            getCanonicalUnitNumber(
              config,
              floor,
              cell.visualStart,
            );

          const baseTypes =
            config?.unitTypes || {};

          const configuredBaseType =
            baseTypes?.[canonicalUnitNumber] ??
            baseTypes?.[String(canonicalUnitNumber)] ??
            baseTypes?.[cell.visualStart] ??
            baseTypes?.[String(cell.visualStart)];

          const unitType =
            String(configuredBaseType || '').trim() ||
            getUnitType(
              config,
              floor,
              cell.visualStart,
            );

          if (!unitType) {
            return;
          }

          for (
            let lineNumber = cell.visualStart;
            lineNumber <= cell.visualEnd;
            lineNumber += 1
          ) {
            addTypeCount(lineNumber, unitType);
          }
        });
      }
    } else {
      Object.entries(unitTypeData || {}).forEach(
        ([cellKey, rawUnitType]) => {
          const normalizedCellKey =
            String(cellKey || '').trim();

          if (
            !buildingPrefix ||
            !normalizedCellKey.startsWith(
              buildingPrefix,
            )
          ) {
            return;
          }

          const unitCode = normalizedCellKey
            .slice(buildingPrefix.length)
            .trim();
          const lineMatched =
            unitCode.match(/(\\d{1,2})$/);
          const lineNumber =
            Number(lineMatched?.[1] || 0);

          addTypeCount(
            lineNumber,
            rawUnitType,
          );
        },
      );
    }

    const columnCount =
      configuredColumnCount ||
      detectedMaxLine;

    const baseLabels = Array.from(
      { length: columnCount },
      (_, index) => {
        const lineNumber = index + 1;
        const typeCounts =
          typeCountsByLine.get(
            lineNumber,
          );

        if (
          !typeCounts ||
          typeCounts.size === 0
        ) {
          return '';
        }

        return [...typeCounts.entries()].sort(
          (left, right) =>
            right[1] - left[1] ||
            left[0].localeCompare(
              right[0],
              'ko',
            ),
        )[0][0];
      },
    );

    /*
      층별 예외타입은 기본 타입을 덮어쓰지 않고 별도 행으로 표시합니다.

      예:
      기본  : 84A | 68A | 68B | 84B
      29층  :     | 120T(2~3호)    |

      같은 층에서 인접한 호가 같은 예외타입이면 하나의 셀로 병합해
      기존 현장의 특수타입 표기방식과 동일하게 보이도록 합니다.
    */
    const exceptionRows = [];
    const seenExceptionSignatures =
      new Set();

    Object.entries(
      config?.floorUnitTypes || {},
    )
      .map(([floorKey, floorMap]) => [
        Number(floorKey),
        floorMap,
      ])
      .filter(
        ([floor, floorMap]) =>
          Number.isInteger(floor) &&
          floor > 0 &&
          floorMap &&
          typeof floorMap === 'object',
      )
      .sort(
        ([firstFloor], [secondFloor]) =>
          secondFloor - firstFloor,
      )
      .forEach(([floor, floorMap]) => {
        const rawSegments = [];

        buildFloorVisualCells(
          config,
          floor,
        ).forEach((cell) => {
          if (cell.type !== 'valid') {
            return;
          }

          const canonicalUnitNumber =
            getCanonicalUnitNumber(
              config,
              floor,
              cell.visualStart,
            );

          const overrideType =
            floorMap?.[canonicalUnitNumber] ??
            floorMap?.[
              String(canonicalUnitNumber)
            ] ??
            floorMap?.[cell.visualStart] ??
            floorMap?.[
              String(cell.visualStart)
            ];

          const normalizedOverrideType =
            String(
              overrideType || '',
            ).trim();

          if (!normalizedOverrideType) {
            return;
          }

          const baseType =
            String(
              baseLabels[
                cell.visualStart - 1
              ] || '',
            ).trim();

          if (
            normalizedOverrideType ===
            baseType
          ) {
            return;
          }

          rawSegments.push({
            start: cell.visualStart,
            end: cell.visualEnd,
            typeName:
              normalizedOverrideType,
          });
        });

        if (rawSegments.length === 0) {
          return;
        }

        rawSegments.sort(
          (first, second) =>
            first.start - second.start,
        );

        const mergedSegments = [];

        rawSegments.forEach((segment) => {
          const previous =
            mergedSegments[
              mergedSegments.length - 1
            ];

          if (
            previous &&
            previous.typeName ===
              segment.typeName &&
            previous.end + 1 ===
              segment.start
          ) {
            previous.end =
              segment.end;
            return;
          }

          mergedSegments.push({
            ...segment,
          });
        });

        const signature =
          mergedSegments
            .map(
              (segment) =>
                \`\${segment.start}-\${segment.end}:\${segment.typeName}\`,
            )
            .join('|');

        if (
          !signature ||
          seenExceptionSignatures.has(
            signature,
          )
        ) {
          return;
        }

        seenExceptionSignatures.add(
          signature,
        );

        exceptionRows.push({
          floor,
          segments:
            mergedSegments,
        });
      });

    return {
      columnCount,
      lineLabels: Array.from(
        { length: columnCount },
        (_, index) =>
          \`\${index + 1}호\`,
      ),
      baseLabels,
      exceptionRows,
      hasLabels:
        baseLabels.some(Boolean) ||
        exceptionRows.length > 0,
    };
  }, [
    buildingName,
    config,
    floors,
    unitTypeData,
  ]);

  return (`;

source =
  source.slice(0, startIndex) +
  newSummary +
  source.slice(
    endIndex +
      oldSummaryEnd.length,
  );

const oldRender = `      {unitTypeSummary.hasLabels && (
        <Box
          sx={{
            mt: 0.35,
            display: 'flex',
            alignItems: 'center',
            gap: \`\${CELL_GAP}px\`,
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              width: 21,
              flex: '0 0 21px',
            }}
          />

          {unitTypeSummary.labels.map((unitType, index) => (
            <Typography
              key={\`\${buildingName}-unit-type-\${index + 1}\`}
              component="div"
              sx={{
                width: CELL_WIDTH,
                flex: \`0 0 \${CELL_WIDTH}px\`,
                textAlign: 'center',
                fontSize: '0.56rem',
                fontWeight: 800,
                lineHeight: 1.1,
                color: '#475569',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {unitType}
            </Typography>
          ))}
        </Box>
      )}`;

const newRender = `      {unitTypeSummary.hasLabels && (
        <Box
          sx={{
            mt: 0.35,
            display: 'grid',
            gap: \`\${ROW_GAP}px\`,
          }}
        >
          {/* 호 라인 */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns:
                \`21px repeat(\${unitTypeSummary.columnCount}, \${CELL_WIDTH}px)\`,
              columnGap:
                \`\${CELL_GAP}px\`,
              alignItems: 'center',
            }}
          >
            <Box aria-hidden="true" />

            {unitTypeSummary.lineLabels.map(
              (lineLabel, index) => (
                <Typography
                  key={\`\${buildingName}-unit-line-\${index + 1}\`}
                  component="div"
                  sx={{
                    height: 16,
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    border:
                      '1px solid #cbd5e1',
                    bgcolor:
                      '#f8fafc',
                    boxSizing:
                      'border-box',
                    color:
                      '#475569',
                    fontSize:
                      '0.52rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  {lineLabel}
                </Typography>
              ),
            )}
          </Box>

          {/* 층별 특수/예외 타입: 기본 타입행 위에 추가 */}
          {unitTypeSummary.exceptionRows.map(
            (row, rowIndex) => (
              <Box
                key={\`\${buildingName}-unit-type-exception-\${row.floor}-\${rowIndex}\`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns:
                    \`21px repeat(\${unitTypeSummary.columnCount}, \${CELL_WIDTH}px)\`,
                  columnGap:
                    \`\${CELL_GAP}px\`,
                  alignItems:
                    'center',
                }}
              >
                <Box aria-hidden="true" />

                {row.segments.map(
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
                )}
              </Box>
            ),
          )}

          {/* 기본 호별 타입 */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns:
                \`21px repeat(\${unitTypeSummary.columnCount}, \${CELL_WIDTH}px)\`,
              columnGap:
                \`\${CELL_GAP}px\`,
              alignItems: 'center',
            }}
          >
            <Box aria-hidden="true" />

            {unitTypeSummary.baseLabels.map(
              (unitType, index) => (
                <Typography
                  key={\`\${buildingName}-unit-type-\${index + 1}\`}
                  component="div"
                  title={unitType || ''}
                  sx={{
                    height: 17,
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    border:
                      unitType
                        ? '1px solid #cbd5e1'
                        : '1px solid transparent',
                    bgcolor:
                      unitType
                        ? '#ffffff'
                        : 'transparent',
                    boxSizing:
                      'border-box',
                    color:
                      '#475569',
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
                  {unitType}
                </Typography>
              ),
            )}
          </Box>
        </Box>
      )}`;

source = replaceOnce(
  source,
  oldRender,
  newRender,
  '하단 호별 타입 표시영역',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 하단 1호/2호/... 라인행 추가');
console.log('- 기본 호별 타입행 유지');
console.log('- 층별 예외타입은 기본타입 위 별도 행으로 표시');
console.log('- 같은 층의 인접 호가 같은 예외타입이면 셀 병합');
console.log('- 같은 예외패턴이 여러 층 반복되면 중복표시하지 않음');
console.log('- 타입 색상은 추가하지 않음(기존 요청대로 색상은 타입현황 팝업에만 사용)');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
