const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.6.2';
const ROOT = process.cwd();
const GRID_FILE = path.resolve(ROOT, 'src/BuildingGrid.jsx');
const PROGRESS_FILE = path.resolve(ROOT, 'src/page/ProgressInput.jsx');

const GRID_BASE_MARKER = '// v52.48.5.44.6.1 예외타입 동일행 압축 + hover 설명 제거';
const GRID_VERSION_MARKER = '// v52.48.5.44.6.2 타입행 높이통일 + 박스제거 + 타입색상';
const PROGRESS_BASE_MARKER = '// v52.48.5.44.5.2 타입현황 공정선택 뒤배치 + 폭 축소';
const PROGRESS_VERSION_MARKER = '// v52.48.5.44.6.2 타입행 공통높이·색상 연동';

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

function backupFile(filePath, backupRoot) {
  const relative = path.relative(ROOT, filePath);
  const target = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

if (!fs.existsSync(GRID_FILE)) {
  fail(`파일을 찾을 수 없습니다: ${GRID_FILE}`);
}

if (!fs.existsSync(PROGRESS_FILE)) {
  fail(`파일을 찾을 수 없습니다: ${PROGRESS_FILE}`);
}

let gridSource = fs.readFileSync(GRID_FILE, 'utf8');
let progressSource = fs.readFileSync(PROGRESS_FILE, 'utf8');

if (
  gridSource.includes(GRID_VERSION_MARKER) &&
  progressSource.includes(PROGRESS_VERSION_MARKER)
) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!gridSource.includes(GRID_BASE_MARKER)) {
  fail('BuildingGrid.jsx가 v52.48.5.44.6.1 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.');
}

if (!progressSource.includes(PROGRESS_BASE_MARKER)) {
  fail('ProgressInput.jsx가 v52.48.5.44.5.2 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.');
}

const backupRoot = path.resolve(
  ROOT,
  `backup_v52.48.5.44.6.2_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
backupFile(GRID_FILE, backupRoot);
backupFile(PROGRESS_FILE, backupRoot);

/* ------------------------------------------------------------------ */
/* ProgressInput.jsx                                                   */
/* ------------------------------------------------------------------ */

if (!progressSource.includes(PROGRESS_VERSION_MARKER)) {
  progressSource = replaceOnce(
    progressSource,
    PROGRESS_BASE_MARKER,
    `${PROGRESS_VERSION_MARKER}\n${PROGRESS_BASE_MARKER}`,
    'ProgressInput 버전 마커',
  );

  progressSource = replaceOnce(
    progressSource,
`  buildFloorVisualCells,
  getCellKey,`,
`  buildFloorVisualCells,
  getCanonicalUnitNumber,
  getCellKey,`,
    'ProgressInput getCanonicalUnitNumber import',
  );

  progressSource = replaceOnce(
    progressSource,
`const normalizeUnitTypeBuildingName = (value) => {`,
`/*
  층별 타입 예외가 화면 하단에서 실제 몇 줄을 차지하는지 계산합니다.
  BuildingGrid의 예외타입 압축 규칙과 동일합니다.

  - 같은 층에서 인접한 동일 타입은 하나의 segment
  - 동일 패턴 반복층은 1회만 표시
  - 서로 차지하는 호 범위가 겹치지 않으면 같은 행에 배치
*/
const getPackedTypeExceptionRowCount = (config) => {
  const baseTypes = config?.unitTypes || {};
  const exceptionRows = [];
  const seenSignatures = new Set();

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
            baseTypes?.[canonicalUnitNumber] ??
              baseTypes?.[String(canonicalUnitNumber)] ??
              baseTypes?.[cell.visualStart] ??
              baseTypes?.[String(cell.visualStart)] ??
              '',
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
          previous.end = segment.end;
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
        seenSignatures.has(signature)
      ) {
        return;
      }

      seenSignatures.add(signature);
      exceptionRows.push({
        segments: mergedSegments,
      });
    });

  const packedRows = [];

  exceptionRows.forEach((sourceRow) => {
    let targetRow = null;

    for (
      let rowIndex = 0;
      rowIndex < packedRows.length;
      rowIndex += 1
    ) {
      const candidate =
        packedRows[rowIndex];

      const overlaps =
        sourceRow.segments.some(
          (segment) =>
            candidate.segments.some(
              (existing) =>
                !(
                  segment.end <
                    existing.start ||
                  segment.start >
                    existing.end
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
      packedRows.push(targetRow);
    }

    targetRow.segments.push(
      ...sourceRow.segments,
    );
  });

  return packedRows.length;
};

const normalizeUnitTypeBuildingName = (value) => {`,
    'ProgressInput 예외타입 행수 helper',
  );

  progressSource = replaceOnce(
    progressSource,
`  const loadProjectUnitTypes =
    useCallback(async () => {`,
`  /*
    우측 타입별 세대현황의 색상을 하단 타입 글자색에도 동일하게 사용합니다.
    색상은 배경/박스가 아니라 글자에만 적용합니다.
  */
  const typeColorMap = useMemo(
    () =>
      Object.fromEntries(
        typeHouseholdSummary.rows.map(
          (row) => [
            row.typeName,
            row.color,
          ],
        ),
      ),
    [typeHouseholdSummary.rows],
  );

  /*
    동별 타입표의 실제 표시행 수를 현장 전체에서 동일하게 맞춥니다.
    기본 타입 1행 + 가장 많은 예외타입 행수를 공통 슬롯으로 사용하므로
    어느 동이든 1층의 수직 위치가 동일하게 유지됩니다.
  */
  const typeFooterRowSlots = useMemo(() => {
    let maxRows = 1;

    Object.values(
      buildingConfigs || {},
    ).forEach((config) => {
      const rowCount =
        1 +
        getPackedTypeExceptionRowCount(
          config,
        );

      maxRows = Math.max(
        maxRows,
        rowCount,
      );
    });

    return maxRows;
  }, [buildingConfigs]);

  const loadProjectUnitTypes =
    useCallback(async () => {`,
    'ProgressInput 타입색상/공통행수 계산',
  );

  progressSource = replaceOnce(
    progressSource,
`                  unitTypeData={unitTypeData}
                  onFloorClick={` ,
`                  unitTypeData={unitTypeData}
                  typeColorMap={typeColorMap}
                  typeFooterRowSlots={
                    typeFooterRowSlots
                  }
                  onFloorClick={` ,
    'BuildingGrid 타입색상/행수 props',
  );
}

/* ------------------------------------------------------------------ */
/* BuildingGrid.jsx                                                    */
/* ------------------------------------------------------------------ */

if (!gridSource.includes(GRID_VERSION_MARKER)) {
  gridSource = replaceOnce(
    gridSource,
    GRID_BASE_MARKER,
    `${GRID_VERSION_MARKER}\n${GRID_BASE_MARKER}`,
    'BuildingGrid 버전 마커',
  );

  gridSource = replaceOnce(
    gridSource,
`  unitData = {},
  unitTypeData = {},
  onFloorClick,`,
`  unitData = {},
  unitTypeData = {},
  typeColorMap = {},
  typeFooterRowSlots = 1,
  onFloorClick,`,
    'BuildingGrid 신규 props',
  );

  gridSource = replaceOnce(
    gridSource,
`      lineLabels: Array.from(
        { length: columnCount },
        (_, index) =>
          \`\${index + 1}호\`,
      ),
      baseLabels,`,
`      baseLabels,`,
    '1호/2호/3호/4호 라벨 데이터 제거',
  );

  const oldRenderStart = `      {unitTypeSummary.hasLabels && (
        <Box
          sx={{
            mt: 0.35,
            display: 'grid',
            gap: \`\${ROW_GAP}px\`,
          }}
        >
          {/* 호 라인 */}`;

  const oldRenderEnd = `        </Box>
      )}

      <Typography
        sx={{
          mt: unitTypeSummary.hasLabels ? 0.35 : 0.45,`;

  const startIndex = gridSource.indexOf(oldRenderStart);
  const endIndex = gridSource.indexOf(oldRenderEnd, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    fail('BuildingGrid 하단 타입 표시영역을 찾지 못했습니다.');
  }

  const newRender = `      <Box
        sx={{
          mt: 0.35,
          display: 'grid',
          gap: \`\${ROW_GAP}px\`,
        }}
      >
        {/*
          현장 전체의 최대 타입행 수만큼 동일한 높이를 확보합니다.
          예외타입이 없는 동은 위쪽에 빈 행을 두므로
          모든 동의 1층 위치가 동일하게 정렬됩니다.
        */}
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
            key={\`\${buildingName}-unit-type-blank-\${blankIndex}\`}
            aria-hidden="true"
            sx={{
              height: 17,
            }}
          />
        ))}

        {/* 층별 특수/예외 타입 */}
        {unitTypeSummary.exceptionRows.map(
          (row, rowIndex) => (
            <Box
              key={\`\${buildingName}-unit-type-exception-row-\${rowIndex}\`}
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  \`21px repeat(\${unitTypeSummary.columnCount}, \${CELL_WIDTH}px)\`,
                columnGap:
                  \`\${CELL_GAP}px\`,
                alignItems:
                  'center',
                minHeight: 17,
              }}
            >
              <Box aria-hidden="true" />

              {row.segments.map(
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
                      boxSizing:
                        'border-box',
                      color:
                        typeColorMap?.[
                          segment.typeName
                        ] ||
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
                    {segment.typeName}
                  </Typography>
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
            minHeight: 17,
          }}
        >
          <Box aria-hidden="true" />

          {unitTypeSummary.baseLabels.map(
            (unitType, index) => (
              <Typography
                key={\`\${buildingName}-unit-type-\${index + 1}\`}
                component="div"
                sx={{
                  height: 17,
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                  boxSizing:
                    'border-box',
                  color:
                    typeColorMap?.[
                      unitType
                    ] ||
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

      <Typography
        sx={{
          mt: unitTypeSummary.hasLabels ? 0.35 : 0.45,`;

  gridSource =
    gridSource.slice(0, startIndex) +
    newRender +
    gridSource.slice(
      endIndex +
        oldRenderEnd.length,
    );
}

fs.writeFileSync(PROGRESS_FILE, progressSource, 'utf8');
fs.writeFileSync(GRID_FILE, gridSource, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressInput.jsx');
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 1호/2호/3호/4호 표시행 제거');
console.log('- 현장 전체에서 타입 footer 행수를 통일하여 모든 동 1층 높이 정렬');
console.log('- 예외타입 없는 동은 필요한 만큼 빈 공간을 자동 확보');
console.log('- 타입 박스(border/background) 제거');
console.log('- 타입 글자색을 우측 타입별 세대현황 색상과 동일하게 연동');
console.log('- 기존 완료/작업중 세대 색상에는 영향 없음');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
