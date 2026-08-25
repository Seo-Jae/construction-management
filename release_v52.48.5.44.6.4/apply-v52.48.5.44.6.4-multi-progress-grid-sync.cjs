const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.4';
const TARGET = path.resolve(process.cwd(), 'src/page/MultiProcessProgress.jsx');
const VERSION_MARKER = '// v52.48.5.44.6.4 다중공종 셀확대·필로티X·하단타입';

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

const requiredAnchors = [
  "const PAGE_SIZE = 1000;\nconst GRID_CELL_HEIGHT = 18;",
  "  buildFloorVisualCells,\n  countUniqueUnits,\n  getCellKey,\n  getProjectCellKeys,",
  "  cellWidth = 34,",
  "function MultiProcessBuildingGrid({",
  "                const cellWidth = 34 * cell.span + 2 * (cell.span - 1);",
  "  const [refreshKey, setRefreshKey] = useState(0);",
  "  const progressMap = useMemo(() => {",
  "                  targetLines={",
];

requiredAnchors.forEach((anchor) => {
  if (!source.includes(anchor)) {
    fail(`현재 MultiProcessProgress.jsx가 예상 기준과 다릅니다: ${anchor.slice(0, 90)}`);
  }
});

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.6.4_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/page/MultiProcessProgress.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = `${VERSION_MARKER}\n${source}`;

source = replaceOnce(
  source,
`  buildFloorVisualCells,
  countUniqueUnits,
  getCellKey,
  getProjectCellKeys,`,
`  buildFloorVisualCells,
  countUniqueUnits,
  getCanonicalUnitNumber,
  getCellKey,
  getProjectCellKeys,
  getUnitType,`,
  'buildingUnits 타입 helper import',
);

source = replaceOnce(
  source,
`const PAGE_SIZE = 1000;
const GRID_CELL_HEIGHT = 18;
const GRID_ROW_GAP = 1;`,
`const PAGE_SIZE = 1000;
const UNIT_TYPE_PAGE_SIZE = 1000;

// 공정별 현황 입력과 동일한 골구도 기본 셀 크기
const GRID_CELL_WIDTH = 41;
const GRID_CELL_HEIGHT = 22;
const GRID_CELL_GAP = 2;
const GRID_ROW_GAP = 1;
const TYPE_ROW_HEIGHT = 17;`,
  '다중공종 셀 크기 상수',
);

source = replaceOnce(
  source,
`const getProcessColor = (processName, processOptions) => {`,
`const normalizeUnitTypeBuildingName = (value) => {
  const text = String(value || '').trim();

  if (!text) return '';

  if (/^\\d+$/.test(text)) {
    return \`\${text}동\`;
  }

  return text;
};

const normalizeUnitTypeUnitCode = (value) => {
  const text = String(value || '').trim();

  if (!text) return '';

  if (/^\\d+$/.test(text)) {
    return String(Number(text));
  }

  return text;
};

const fetchAllProjectUnitTypes = async (projectName) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('project_unit_types')
      .select('building, unit, unit_type')
      .eq('project_name', projectName)
      .order('building', { ascending: true })
      .order('unit', { ascending: true })
      .range(offset, offset + UNIT_TYPE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < UNIT_TYPE_PAGE_SIZE) {
      break;
    }

    offset += UNIT_TYPE_PAGE_SIZE;
  }

  return rows;
};

/*
  공정별 현황 입력의 하단 타입 규칙과 동일한 형태로 정리합니다.
  - 기본 타입: 각 호 라인의 기본 타입
  - 층별 예외 타입: 기본 타입 위 별도 행
  - 같은 층의 인접 동일 타입은 하나의 셀로 병합
  - 서로 호 범위가 겹치지 않는 예외타입은 같은 행에 압축
*/
const getBuildingTypeSummary = ({
  buildingName,
  config,
  unitTypeData,
}) => {
  const floors = Number(config?.floors) || 0;
  const configuredColumnCount = Math.max(
    0,
    Number(config?.unitsPerFloor) || 0,
  );
  const buildingPrefix = \`\${String(buildingName || '').trim()}-\`;
  const typeCountsByLine = new Map();
  let detectedMaxLine = 0;

  const addTypeCount = (lineNumber, rawUnitType) => {
    const normalizedLineNumber = Number(lineNumber);
    const unitType = String(rawUnitType || '').trim();

    if (!normalizedLineNumber || !unitType) return;

    detectedMaxLine = Math.max(
      detectedMaxLine,
      normalizedLineNumber,
    );

    if (!typeCountsByLine.has(normalizedLineNumber)) {
      typeCountsByLine.set(
        normalizedLineNumber,
        new Map(),
      );
    }

    const typeCounts =
      typeCountsByLine.get(normalizedLineNumber);

    typeCounts.set(
      unitType,
      (typeCounts.get(unitType) || 0) + 1,
    );
  };

  const hasConfigUnitTypes =
    Object.values(config?.unitTypes || {}).some(
      (value) => Boolean(String(value || '').trim()),
    ) ||
    Object.values(config?.floorUnitTypes || {}).some(
      (floorMap) =>
        floorMap &&
        typeof floorMap === 'object' &&
        Object.values(floorMap).some(
          (value) => Boolean(String(value || '').trim()),
        ),
    );

  if (hasConfigUnitTypes) {
    for (let floor = 1; floor <= floors; floor += 1) {
      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell?.type !== 'valid') return;

        const canonicalUnitNumber =
          getCanonicalUnitNumber(
            config,
            floor,
            cell.visualStart,
          );

        const baseTypes = config?.unitTypes || {};

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

        if (!unitType) return;

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
          !normalizedCellKey.startsWith(buildingPrefix)
        ) {
          return;
        }

        const unitCode = normalizedCellKey
          .slice(buildingPrefix.length)
          .trim();

        const lineMatched =
          unitCode.match(/(\\d{1,2})$/);

        addTypeCount(
          Number(lineMatched?.[1] || 0),
          rawUnitType,
        );
      },
    );
  }

  const columnCount =
    configuredColumnCount || detectedMaxLine;

  const baseLabels = Array.from(
    { length: columnCount },
    (_, index) => {
      const lineNumber = index + 1;
      const typeCounts =
        typeCountsByLine.get(lineNumber);

      if (!typeCounts || typeCounts.size === 0) {
        return '';
      }

      return [...typeCounts.entries()].sort(
        (left, right) =>
          right[1] - left[1] ||
          left[0].localeCompare(right[0], 'ko'),
      )[0][0];
    },
  );

  const exceptionRows = [];
  const seenExceptionSignatures = new Set();

  Object.entries(config?.floorUnitTypes || {})
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

      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell?.type !== 'valid') return;

        const canonicalUnitNumber =
          getCanonicalUnitNumber(
            config,
            floor,
            cell.visualStart,
          );

        const overrideType =
          floorMap?.[canonicalUnitNumber] ??
          floorMap?.[String(canonicalUnitNumber)] ??
          floorMap?.[cell.visualStart] ??
          floorMap?.[String(cell.visualStart)];

        const normalizedOverrideType =
          String(overrideType || '').trim();

        if (!normalizedOverrideType) return;

        const baseType =
          String(
            baseLabels[cell.visualStart - 1] || '',
          ).trim();

        if (normalizedOverrideType === baseType) {
          return;
        }

        rawSegments.push({
          start: cell.visualStart,
          end: cell.visualEnd,
          typeName: normalizedOverrideType,
          floor,
        });
      });

      if (rawSegments.length === 0) return;

      rawSegments.sort(
        (first, second) =>
          first.start - second.start,
      );

      const mergedSegments = [];

      rawSegments.forEach((segment) => {
        const previous =
          mergedSegments[mergedSegments.length - 1];

        if (
          previous &&
          previous.typeName === segment.typeName &&
          previous.end + 1 === segment.start
        ) {
          previous.end = segment.end;
          return;
        }

        mergedSegments.push({ ...segment });
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
        seenExceptionSignatures.has(signature)
      ) {
        return;
      }

      seenExceptionSignatures.add(signature);

      exceptionRows.push({
        floor,
        segments: mergedSegments,
      });
    });

  const packedExceptionRows = [];

  exceptionRows.forEach((sourceRow) => {
    let targetRow = null;

    for (
      let rowIndex = 0;
      rowIndex < packedExceptionRows.length;
      rowIndex += 1
    ) {
      const candidate =
        packedExceptionRows[rowIndex];

      const overlaps =
        sourceRow.segments.some(
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
        segments: [],
      };
      packedExceptionRows.push(targetRow);
    }

    targetRow.segments.push(
      ...sourceRow.segments,
    );

    targetRow.segments.sort(
      (first, second) =>
        first.start - second.start ||
        first.end - second.end,
    );
  });

  return {
    columnCount,
    baseLabels,
    exceptionRows: packedExceptionRows,
  };
};

const getProcessColor = (processName, processOptions) => {`,
  '세대 타입 helper 추가',
);

source = replaceOnce(
  source,
`  cellWidth = 34,`,
`  cellWidth = GRID_CELL_WIDTH,`,
  '다중상태 셀 기본 폭',
);

source = replaceOnce(
  source,
`  progressMap,
  targetLines = [],
}) {`,
`  progressMap,
  unitTypeData = {},
  typeFooterRowSlots = 1,
  targetLines = [],
}) {`,
  '다중 동그리드 타입 props',
);

source = replaceOnce(
  source,
`  const buildingTotalUnits = countUniqueUnits(config);

  const floorNumbers = Array.from(`,
`  const buildingTotalUnits = countUniqueUnits(config);

  const unitTypeSummary = useMemo(
    () =>
      getBuildingTypeSummary({
        buildingName,
        config,
        unitTypeData,
      }),
    [
      buildingName,
      config,
      unitTypeData,
    ],
  );

  const floorNumbers = Array.from(`,
  '동별 타입 요약',
);

source = replaceOnce(
  source,
`                const cellWidth = 34 * cell.span + 2 * (cell.span - 1);`,
`                const cellWidth =
                  GRID_CELL_WIDTH * cell.span +
                  GRID_CELL_GAP * (cell.span - 1);`,
  '셀 span 폭 1.2배 반영',
);

const oldPiloti = `                if (cell.type === 'piloti') {
                  return (
                    <Box
                      key={visualKey}
                      title={\`\${buildingName} \${floor}층 제외호\`}
                      sx={{
                        position: 'relative',
                        width: cellWidth,
                        height: GRID_CELL_HEIGHT,
                        flex: \`0 0 \${cellWidth}px\`,
                        border: '1px solid #cbd5e1',
                        bgcolor: '#f8fafc',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        userSelect: 'none',
                        '&::before, &::after': {
                          content: '""',
                          position: 'absolute',
                          left: '50%',
                          top: '-8px',
                          width: '1px',
                          height: '39px',
                          bgcolor: '#94a3b8',
                          transformOrigin: 'center',
                        },
                        '&::before': {
                          transform: 'translateX(-50%) rotate(56deg)',
                        },
                        '&::after': {
                          transform: 'translateX(-50%) rotate(-56deg)',
                        },
                      }}
                    />
                  );
                }`;

const newPiloti = `                if (cell.type === 'piloti') {
                  return (
                    <Box
                      key={visualKey}
                      sx={{
                        position: 'relative',
                        width: cellWidth,
                        height: GRID_CELL_HEIGHT,
                        flex: \`0 0 \${cellWidth}px\`,
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

source = replaceOnce(
  source,
  oldPiloti,
  newPiloti,
  '다중공종 필로티 SVG X',
);

source = replaceOnce(
  source,
`      </Box>

      <Typography
        sx={{
          mt: 0.45,`,
`      </Box>

      <Box
        sx={{
          mt: 0.35,
          display: 'grid',
          gap: \`\${GRID_ROW_GAP}px\`,
        }}
      >
        {Array.from({
          length: Math.max(
            0,
            Number(typeFooterRowSlots || 1) -
              (
                unitTypeSummary.exceptionRows.length +
                1
              ),
          ),
        }).map((_, blankIndex) => (
          <Box
            key={\`\${buildingName}-multi-unit-type-blank-\${blankIndex}\`}
            aria-hidden="true"
            sx={{
              height: TYPE_ROW_HEIGHT,
            }}
          />
        ))}

        {unitTypeSummary.exceptionRows.map(
          (row, rowIndex) => (
            <Box
              key={\`\${buildingName}-multi-unit-type-exception-row-\${rowIndex}\`}
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  \`21px repeat(\${unitTypeSummary.columnCount}, \${GRID_CELL_WIDTH}px)\`,
                columnGap:
                  \`\${GRID_CELL_GAP}px\`,
                alignItems: 'center',
                minHeight: TYPE_ROW_HEIGHT,
              }}
            >
              <Box aria-hidden="true" />

              {row.segments.map(
                (segment, segmentIndex) => (
                  <Typography
                    key={\`\${buildingName}-multi-unit-type-exception-\${segment.floor}-\${segment.start}-\${segmentIndex}\`}
                    component="div"
                    sx={{
                      gridColumn:
                        \`\${segment.start + 1} / span \${segment.end - segment.start + 1}\`,
                      height: TYPE_ROW_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #cbd5e1',
                      bgcolor: '#ffffff',
                      boxSizing: 'border-box',
                      color: '#475569',
                      fontSize: '0.54rem',
                      fontWeight: 900,
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {segment.typeName}
                  </Typography>
                ),
              )}
            </Box>
          ),
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              \`21px repeat(\${unitTypeSummary.columnCount}, \${GRID_CELL_WIDTH}px)\`,
            columnGap:
              \`\${GRID_CELL_GAP}px\`,
            alignItems: 'center',
            minHeight: TYPE_ROW_HEIGHT,
          }}
        >
          <Box aria-hidden="true" />

          {unitTypeSummary.baseLabels.map(
            (unitType, index) => (
              <Typography
                key={\`\${buildingName}-multi-unit-type-\${index + 1}\`}
                component="div"
                sx={{
                  height: TYPE_ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border:
                    unitType
                      ? '1px solid #cbd5e1'
                      : '1px solid transparent',
                  bgcolor:
                    unitType
                      ? '#ffffff'
                      : 'transparent',
                  boxSizing: 'border-box',
                  color: '#475569',
                  fontSize: '0.54rem',
                  fontWeight: 900,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {unitType}
              </Typography>
            ),
          )}
        </Box>
      </Box>

      <Typography
        sx={{
          mt: 0.45,`,
  '다중공종 하단 타입 표시',
);

source = replaceOnce(
  source,
`  const [refreshKey, setRefreshKey] = useState(0);`,
`  const [refreshKey, setRefreshKey] = useState(0);
  const [unitTypeData, setUnitTypeData] = useState({});`,
  '세대 타입 state',
);

source = replaceOnce(
  source,
`  useEffect(() => {
    let isMounted = true;

    const fetchProgressRows = async () => {`,
`  useEffect(() => {
    let isMounted = true;

    const fetchUnitTypes = async () => {
      if (!projectName) {
        if (isMounted) {
          setUnitTypeData({});
        }
        return;
      }

      try {
        const rows =
          await fetchAllProjectUnitTypes(
            projectName,
          );

        const mapped = {};

        rows.forEach((row) => {
          const buildingName =
            normalizeUnitTypeBuildingName(
              row?.building,
            );
          const unitCode =
            normalizeUnitTypeUnitCode(
              row?.unit,
            );
          const unitType =
            String(
              row?.unit_type || '',
            ).trim();

          if (
            !buildingName ||
            !unitCode ||
            !unitType
          ) {
            return;
          }

          mapped[
            \`\${buildingName}-\${unitCode}\`
          ] = unitType;
        });

        if (isMounted) {
          setUnitTypeData(mapped);
        }
      } catch (error) {
        console.error(
          '다중 공종 세대 타입 조회 오류:',
          error,
        );

        if (isMounted) {
          setUnitTypeData({});
        }
      }
    };

    fetchUnitTypes();

    return () => {
      isMounted = false;
    };
  }, [
    projectName,
    refreshKey,
  ]);

  useEffect(() => {
    let isMounted = true;

    const fetchProgressRows = async () => {`,
  '세대 타입 조회 effect',
);

source = replaceOnce(
  source,
`  const progressMap = useMemo(() => {`,
`  const buildingTypeSummaries = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(
          safeBuildingConfigs,
        ).map(
          ([
            buildingName,
            config,
          ]) => [
            buildingName,
            getBuildingTypeSummary({
              buildingName,
              config,
              unitTypeData,
            }),
          ],
        ),
      ),
    [
      safeBuildingConfigs,
      unitTypeData,
    ],
  );

  const typeFooterRowSlots = useMemo(() => {
    let maxRows = 1;

    Object.values(
      buildingTypeSummaries,
    ).forEach((summary) => {
      maxRows = Math.max(
        maxRows,
        1 +
          Number(
            summary?.exceptionRows?.length ||
              0,
          ),
      );
    });

    return maxRows;
  }, [buildingTypeSummaries]);

  const progressMap = useMemo(() => {`,
  '현장 전체 타입행 높이 통일',
);

source = replaceOnce(
  source,
`                  progressMap={progressMap}
                  targetLines={` ,
`                  progressMap={progressMap}
                  unitTypeData={unitTypeData}
                  typeFooterRowSlots={
                    typeFooterRowSlots
                  }
                  targetLines={` ,
  '다중 동그리드 타입 props 전달',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/MultiProcessProgress.jsx');
console.log('- 골구도 셀 34x18 -> 41x22px (약 1.2배)');
console.log('- 필로티 구간 X를 SVG로 변경하여 네 모서리에 정확히 정합');
console.log('- 하단 기본 호별 타입 표시');
console.log('- 층별 예외타입도 기본 타입 위에 동일 규칙으로 표시');
console.log('- 예외타입이 적은 동은 빈 타입행을 확보해 모든 동 1층 위치 통일');
console.log('- 타입 윤곽선 유지 / 타입별 색상은 적용하지 않음');
console.log('- 우측 타입별 세대현황 플로팅 팝업은 추가하지 않음');
console.log('- 신규 현장 config unitTypes/floorUnitTypes + 기존 project_unit_types 모두 지원');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
